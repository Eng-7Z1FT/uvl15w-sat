---
name: 7z1ft-character
description: Add the 7Z1FT green hooded stickman character to a video automatically - analyses what is said (SRT captions or Whisper), picks poses from keywords, lip-syncs the mouth to the voice and composites it onto the video, or exports a transparent overlay. Use whenever the user sends/uploads a video and asks to add the character ("ضيف الشخصية", "ركب الشخصية على الفيديو", "حط الستكمان", "الشخصية"), asks for a transparent character overlay, wants poses changed in a rendered video, or wants new character poses, keywords, slides or transitions.
---

# 7Z1FT character

Everything lives in `stickman/` at the repo root:

| path | what |
|---|---|
| `stickman/engine.js` | the character: poses (`POSES`), idle/talk motion (`animate`), drawing (`figure`, `props`) — single source of truth |
| `stickman/auto/process.py` | the video pipeline (read `stickman/auto/README.md` for all flags) |
| `stickman/auto/overlay.html`, `render_overlay.js` | transparent frame renderer used by the pipeline |
| `stickman/animate.html` | slide presentation with 4 transitions (A walk, B jump, C slide, D pop) |
| `stickman/gen.py`, `render.js` | static SVG/PNG poses (`stickman/png`, `stickman/svg`) |

Character look (user approved, don't change unasked): green `#1e6b2f` body with orange `#e8922e` outline, head fully green with cream `#f3efe4` features (no white face fill), features enlarged ~1.45x.

## Adding the character to a video

1. Find the user's uploaded video and any `.srt` (uploads are under `/root/.claude/uploads/` or in the working directory). Copy them into a scratch directory; never commit the user's videos.
2. Check deps: `ffmpeg`, `python3 -c "import numpy"`, `node -e "require('playwright')"`. Install numpy with pip if missing; do not reinstall playwright.
3. Run:
   ```bash
   python3 stickman/auto/process.py <scratch>/video.mp4 --srt <scratch>/captions.srt
   ```
   Defaults: `--side left --size 0.42`. Add `--alpha` for a transparent `_character.mov` (ProRes 4444) when the user edits in Premiere/DaVinci/CapCut themselves. Without `--srt` it tries `faster-whisper` (`pip install faster-whisper`; needs huggingface.co reachable), else falls back to speech rhythm only — tell the user which happened.
4. Read `<name>_plan.txt` and sanity-check the poses against what was said. Fix obvious misfires by editing `<name>_plan.json` (`segments[].pose`) and re-running with `--plan <name>_plan.json`.
5. Grab 4-6 stills with ffmpeg (`-ss T -frames:v 1`) and look at them: character visible, not cut off, not covering important content. Adjust `--side/--size` if needed.
6. Send the final mp4 (and `.mov` if made) plus the plan summary with SendUserFile. Reply in Gulf Arabic, short, with a table of time → pose → reason.

Rendering runs at roughly real time (≈1s per second of video at 25-30fps). For videos over ~10 min, tell the user the expected wait first.

## Changing behaviour

- **Keywords → poses:** `RULES` in `process.py` (ordered, first match wins; `=` prefix = whole word). Arabic is normalised (no tashkeel, أإآ→ا, ة→ه, ى→ي), so write keywords normalised.
- **Hold time:** `MIN_HOLD` (seconds before a pose may change).
- **New pose:** add to `POSES` in `engine.js` (2 arms × 3 points, 2 legs × 4 points, torso, head, `dx`, `eyes`, `mouth`, `props`), motion in `animate()`, props in `props()`; add a rule in `RULES`; add it to `gen.py` too if a static PNG is wanted, then re-run `python3 stickman/gen.py stickman/svg && node stickman/render.js stickman` from the repo root (render.js takes the stickman dir).
- After changes, test on a short clip before the real video. Commit code changes (not user media) and push.

## Working rules with the user (approved)
- Reply in Gulf Arabic only — every message, including progress notes.
- Before any video/long render: send ONE sample still, review it yourself zoomed in, then wait for approval.
- If the user hands you a finished image/file, use it as-is; don't rebuild it.
- Reels are transparent: no background, only the scene elements + the dark ground band.

## Logo desk scene (approved)
- `stickman/scene.js` + `stickman/scene.html` (modes `radio`, `car`); layer order: `assets/logo_cutout.png` (built from the user's approved image by `stickman/make_user_cutout.py`), ground band `#081207`, `assets/tyre_patch.png`, furniture/laptop/radios, character, `assets/handle.png` (handle cut from the logo — never retype it).
- Approved still: `stickman/sample_transparent.png` (`sceneFrame('radio',1,0,0)`).
- Transparent export: screenshot with `omitBackground` and `html,body{background:transparent}`, then ProRes 4444 (`yuva444p10le`) or VP9 WebM (`yuva420p`).
- The claude.ai skill package is rebuilt with `python3 stickman/build_skill.py` (from `stickman/`).
