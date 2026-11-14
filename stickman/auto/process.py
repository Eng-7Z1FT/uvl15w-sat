#!/usr/bin/env python3
"""
7Z1FT auto-character: analyse a video, choose the stickman's poses from what is
said, lip-sync its mouth to the voice, and burn it into the video.

  python3 process.py my_video.mp4                     # -> my_video_7z1ft.mp4
  python3 process.py my_video.mp4 --srt captions.srt  # use your own captions
  python3 process.py my_video.mp4 --side right --size 0.45 --alpha

Steps: probe -> audio -> transcript (SRT, or faster-whisper if installed)
-> pose plan (keywords) -> mouth envelope -> render frames -> ffmpeg overlay.
The plan is saved as <name>_plan.json / <name>_plan.txt; edit the json and
re-run with --plan to change any pose.
"""
import argparse, json, math, os, random, re, shutil, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 16000
MIN_HOLD = 2.0  # seconds a pose stays before it may change

# ---------------------------------------------------------------- keywords
# (pose, words). Checked in this order; first match wins. Words are matched
# after normalisation; "=" prefix means whole word only.
RULES = [
    ("wave",      ["السلام عليكم", "=هلا", "اهلا", "مرحبا", "حياكم", "مع السلامه", "نشوفكم", "=باي", "في امان الله"]),
    ("celebrate", ["نجحت", "نجح", "مبروك", "رهيب", "ممتاز", "الحمد لله", "اشتغل", "زبطت", "=زبط", "=تم", "تمت", "=خلاص"]),
    ("shocked",   ["انتبه", "احذر", "تحذير", "خطر", "مشكله", "غلط", "=خطا", "لا تفصل", "لا تسوي", "يخرب", "ينحرق", "عطل"]),
    ("key",       ["مفتاح", "مفاتيح", "ريموت", "سياره", "سيارات", "ايموبلايزر", "تويوتا", "=الشريحه", "شريحه المفتاح"]),
    ("typing",    ["برمجه", "نبرمج", "برمج", "برنامج", "كمبيوتر", "لابتوب", "كيبل", "درايفر", "تعريف", "سوفتوير", "chirp", "cps"]),
    ("thinking",  ["ليش", "=كيف", "سؤال", "تتوقعون", "يا تري", "وش السبب", "تدرون"]),
    ("point",     ["شوفوا", "=شوف", "لاحظوا", "لاحظ", "=هنا", "جهاز", "تردد", "ترددات", "قناه", "قنوات", "اعدادات", "tyt", "الشاشه"]),
]
DEFAULT_CYCLE = ["talk", "point", "talk", "talk"]


def norm(s):
    s = re.sub(r"[ً-ْـ]", "", s.lower())  # tashkeel + tatweel
    s = re.sub("[أإآ]", "ا", s).replace("ة", "ه").replace("ى", "ي")
    return " " + re.sub(r"[^\w\s]", " ", s) + " "


def pose_for(text):
    t = norm(text)
    for pose, words in RULES:
        for w in words:
            if w.startswith("="):
                if re.search(r"(?<![\w])(و|ف)?" + re.escape(norm(w[1:]).strip()) + r"(?![\w])", t):
                    return pose, w[1:]
            elif norm(w).strip() in t:
                return pose, w
    if "؟" in text or "?" in text:
        return "thinking", "؟"
    return None, None


# ---------------------------------------------------------------- media helpers
def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path])
    info = json.loads(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    return int(v["width"]), int(v["height"]), fps, float(info["format"]["duration"]), has_audio


def load_audio(path, has_audio, duration):
    if not has_audio:
        return np.zeros(int(duration * SR), dtype=np.float32)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"])
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def parse_srt(path):
    txt = open(path, encoding="utf-8-sig").read()
    segs = []
    for block in re.split(r"\n\s*\n", txt.strip()):
        m = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", block)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        t0 = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        t1 = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        text = " ".join(block[m.end():].strip().splitlines())
        segs.append({"t0": t0, "t1": t1, "text": text})
    return segs


def whisper_segments(path, model, lang):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    print(f"  transcribing with faster-whisper ({model}) ...")
    wm = WhisperModel(model, device="auto", compute_type="int8")
    segs, _ = wm.transcribe(path, language=lang, vad_filter=True)
    return [{"t0": s.start, "t1": s.end, "text": s.text.strip()} for s in segs]


# ---------------------------------------------------------------- analysis
def mouth_envelope(audio, fps, n):
    hop = SR / fps
    rms = np.zeros(n, dtype=np.float32)
    for i in range(n):
        a, b = int(i * hop), int((i + 1) * hop)
        chunk = audio[a:b]
        rms[i] = float(np.sqrt(np.mean(chunk * chunk))) if len(chunk) else 0.0
    loud = rms[rms > 1e-4]
    ref = np.percentile(loud, 92) if len(loud) else 1.0
    floor = np.percentile(loud, 30) if len(loud) else 0.0
    x = np.clip((rms - floor * 1.2) / max(ref - floor, 1e-4), 0, 1)
    out, m = np.zeros(n, dtype=np.float32), 0.0
    for i, v in enumerate(x):                       # fast attack, slower release
        m += (v - m) * (0.6 if v > m else 0.35)
        out[i] = m
    return out


def speech_chunks(env, fps, gap=0.6, min_len=0.4):
    talking = env > 0.08
    chunks, start, quiet = [], None, 0
    for i, on in enumerate(talking):
        if on:
            start = i if start is None else start
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet > gap * fps:
                end = i - quiet
                if (end - start) / fps >= min_len:
                    chunks.append({"t0": start / fps, "t1": end / fps, "text": ""})
                start, quiet = None, 0
    if start is not None:
        chunks.append({"t0": start / fps, "t1": len(env) / fps, "text": ""})
    return chunks


def build_plan(segs, duration, has_text):
    """Return list of {t0, pose, why, text} covering 0..duration."""
    raw, cyc = [], 0
    for i, s in enumerate(segs):
        pose, why = pose_for(s["text"]) if has_text else (None, None)
        if pose is None:
            if not has_text and i == 0:
                pose, why = "wave", "start"
            else:
                pose, why = DEFAULT_CYCLE[cyc % len(DEFAULT_CYCLE)], "default"
                cyc += 1
        raw.append({"t0": s["t0"], "pose": pose, "why": why, "text": s["text"]})
    if not has_text and len(raw) > 2:
        raw[-1].update(pose="wave", why="end")
    plan = []
    for r in raw:
        if plan and (r["pose"] == plan[-1]["pose"] or r["t0"] - plan[-1]["t0"] < MIN_HOLD):
            # keyword poses may override a default pose that has not had its hold time
            if r["why"] not in ("default",) and plan[-1]["why"] == "default" and r["pose"] != plan[-1]["pose"] \
                    and (len(plan) == 1 or r["t0"] - plan[-2]["t0"] >= MIN_HOLD):
                plan[-1].update(pose=r["pose"], why=r["why"], text=r["text"])
            continue
        plan.append(dict(r))
    if not plan:
        plan = [{"t0": 0.0, "pose": "talk", "why": "default", "text": ""}]
    plan[0]["t0"] = 0.0
    return [p for p in plan if p["t0"] < duration]


def fmt(t):
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Add the 7Z1FT stickman to a video automatically")
    ap.add_argument("video")
    ap.add_argument("-o", "--out")
    ap.add_argument("--srt", help="captions file (CapCut/Premiere export) to read what is said")
    ap.add_argument("--plan", help="re-use an edited *_plan.json")
    ap.add_argument("--side", choices=["left", "right"], default="left")
    ap.add_argument("--size", type=float, default=0.42, help="character height as fraction of video height")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--model", default="small", help="faster-whisper model if installed")
    ap.add_argument("--lang", default="ar")
    ap.add_argument("--alpha", action="store_true", help="also export a transparent .mov of the character")
    ap.add_argument("--no-burn", action="store_true", help="skip the composited mp4 (use with --alpha)")
    ap.add_argument("--keep-frames", action="store_true")
    a = ap.parse_args()

    base = os.path.splitext(a.video)[0]
    out = a.out or base + "_7z1ft.mp4"
    W, H, vfps, duration, has_audio = probe(a.video)
    fps = min(a.fps, round(vfps) or 30)
    n = int(math.ceil(duration * fps))
    print(f"video {W}x{H} {vfps:.2f}fps {duration:.1f}s  -> rendering {n} frames at {fps}fps")

    audio = load_audio(a.video, has_audio, duration)
    env = mouth_envelope(audio, fps, n)

    if a.plan:
        plan = json.load(open(a.plan, encoding="utf-8"))
        segments = plan["segments"]
    else:
        segs = parse_srt(a.srt) if a.srt else whisper_segments(a.video, a.model, a.lang)
        has_text = bool(segs)
        if not has_text:
            print("  no transcript (no --srt, faster-whisper not installed) -> poses from speech rhythm only")
            segs = speech_chunks(env, fps) or [{"t0": 0, "t1": duration, "text": ""}]
        segments = build_plan(segs, duration, has_text)

    h_px = a.size * H
    scale = h_px / 820.0
    rnd = random.Random(7)
    blinks, t = [], 1.0
    while t < duration:
        blinks.append(round(t, 3))
        t += 2 + rnd.random() * 3
    plan = {"fps": fps, "duration": duration, "scale": scale, "facing": 1 if a.side == "left" else -1,
            "popIn": True, "popOut": True, "segments": segments, "blinks": blinks,
            "mouth": [round(float(v), 3) for v in env]}

    json.dump({k: v for k, v in plan.items() if k != "mouth"} | {"note": "edit 'pose' values then run with --plan"},
              open(base + "_plan.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(base + "_plan.txt", "w", encoding="utf-8") as f:
        for s in segments:
            f.write(f"{fmt(s['t0'])}  {s['pose']:<10} [{s['why']}]  {s['text'][:70]}\n")
    print("  pose plan:")
    for s in segments:
        print(f"    {fmt(s['t0'])}  {s['pose']:<10} [{s['why']}]  {s['text'][:50]}")

    work = tempfile.mkdtemp(prefix="7z1ft_")
    try:
        pf = os.path.join(work, "plan.json")
        json.dump(plan, open(pf, "w"))
        frames = os.path.join(work, "frames")
        run(["node", os.path.join(HERE, "render_overlay.js"), pf, frames])
        bw = round(640 * scale)
        bh = round(820 * scale)
        margin = round(W * 0.02)
        x = margin if a.side == "left" else W - bw - margin
        y = H - bh + round(bh * 0.04)
        seq = ["-framerate", str(fps), "-i", os.path.join(frames, "%06d.png")]
        if not a.no_burn:
            run(["ffmpeg", "-v", "error", "-y", "-i", a.video, *seq, "-filter_complex",
                 f"[0:v][1:v]overlay={x}:{y}:eof_action=pass:format=auto,format=yuv420p[v]",
                 "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-c:a", "copy", "-movflags", "+faststart", out])
            print(f"done -> {out}")
        if a.alpha:
            mov = base + "_character.mov"
            run(["ffmpeg", "-v", "error", "-y", *seq, "-c:v", "prores_ks", "-profile:v", "4444",
                 "-pix_fmt", "yuva444p10le", mov])
            print(f"transparent character -> {mov}  (place it at x={x}, y={y} on a {W}x{H} timeline)")
        if a.keep_frames:
            shutil.copytree(frames, base + "_frames", dirs_exist_ok=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
