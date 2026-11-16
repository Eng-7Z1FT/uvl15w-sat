---
name: 7z1ft-stickman
description: The 7Z1FT stickman character (green hooded stickman with orange outline, from the Eng_7Z1FT logo) for the user's reels and videos about TYT radios and cars. Use whenever the user mentions الستكمان، الشخصية، شخصيتي، ستكمان 7Z1FT، or asks to put/add/ركّب the character into a design, reel, slide, HTML animation or video, or asks for a new pose or expression for it.
---

# 7Z1FT stickman

The user's own mascot. `poses.png` shows the approved look; `engine.js` is the drawing code — always use it, never redraw the character from scratch.

## Approved look (don't change unless asked)
- Body: thick stick limbs, green `#1e6b2f` with orange `#e8922e` outline (one merged silhouette).
- Head: hood shape, fully green with orange outline. **No white/cream face fill.** Features drawn directly on the green in cream `#f3efe4`, enlarged.
- Background it was designed on: very dark green/black `#0b0f0c`.

## Poses (`POSES` in engine.js)
| pose | use for | props drawn automatically |
|---|---|---|
| `wave` | greeting / goodbye | motion lines |
| `point` | explaining, "شوفوا" | pointing lines |
| `talk` | general talking, hand gestures | — |
| `typing` | programming, computer | stool, table, laptop |
| `thinking` | questions, "ليش" | ? marks |
| `key` | car keys, remotes | car key + sparkles |
| `shocked` | warning, problem | ! mark |
| `celebrate` | success, "تمت" | falling confetti |

## Putting it in an HTML design / reel
1. Paste the whole of `engine.js` inline in a `<script>` (artifacts can't load sibling files).
2. Have an `<svg>` with a `<g id="char">`, then every animation frame:
   ```js
   document.getElementById('char').innerHTML =
     stickmanSVG('point', t, {x: 540, y: 1700, scale: 1.5, flip: false, mouth: m, blink: stickmanBlink(t)});
   ```
   `x,y` = where the feet stand; `scale` 1 ≈ 590px tall; `flip:true` faces left; `mouth` 0..1 opens the mouth (lip sync); `t` = seconds.
3. Lip sync: Web Audio `AnalyserNode` RMS → `mouth` (see `reel_template.html`). Without audio use the fake talk pattern there.
4. Pose changes: blend with `lerpPose(A,B,k)` over ~0.45s and a small hop, as in the template.
5. Start from `reel_template.html` (1080×1920 reel with a TIMELINE of `{t, pose, text}`) for any reel — edit TIMELINE, captions, colours of the background only.

## Choosing poses from a script / transcript
Match words (Gulf Arabic): السلام/هلا/حياكم → wave · نجح/تمت/الحمد لله/اشتغل → celebrate · انتبه/احذر/مشكلة/غلط → shocked · مفتاح/ريموت/سيارة → key · برمجة/برنامج/كمبيوتر/كيبل → typing · ليش/كيف/سؤال/؟ → thinking · شوفوا/لاحظوا/هنا/جهاز/تردد/TYT → point · else alternate talk/point. Keep each pose at least 2 seconds.

## Full video pipeline
For burning the character onto a real video file (lip sync from the audio track, transparent ProRes export), the code lives in the user's GitHub repo `Eng-7Z1FT/uvl15w-sat`, folder `stickman/auto/` — that needs Claude Code with the repo. In chat, build the reel as HTML with the template instead.
