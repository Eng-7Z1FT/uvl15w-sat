import os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else "svg"
G, O, C, D = "#1e6b2f", "#e8922e", "#f3efe4", "#123d1c"   # green, orange, cream, dark
W, H = 600, 800

def pl(pts): return " ".join(f"{x},{y}" for x, y in pts)

def figure(limbs, torso, head, face_dx=0, eyes="dot", mouth="smile", back=(), front=""):
    hx, hy = head
    s = [back and "".join(back) or ""]
    # outline pass then fill pass -> one merged silhouette like the logo
    for col, add in ((O, 10), (G, 0)):
        s.append(f'<polyline points="{pl(torso)}" fill="none" stroke="{col}" stroke-width="{30+add}" stroke-linecap="round" stroke-linejoin="round"/>')
        for l in limbs:
            s.append(f'<polyline points="{pl(l)}" fill="none" stroke="{col}" stroke-width="{16+add}" stroke-linecap="round" stroke-linejoin="round"/>')
    # hood
    s.append(f'<path d="M{hx-56},{hy+20} Q{hx-62},{hy-58} {hx+2},{hy-66} Q{hx+60},{hy-60} {hx+56},{hy+14} Q{hx+40},{hy+62} {hx},{hy+64} Q{hx-44},{hy+62} {hx-56},{hy+20}Z" fill="{G}" stroke="{O}" stroke-width="6" stroke-linejoin="round"/>')
    fx = hx + face_dx
    s.append(f'<ellipse cx="{fx}" cy="{hy+6}" rx="38" ry="42" fill="{C}"/>')
    ex = fx + face_dx * 0.4
    if eyes == "dot":
        s.append(f'<circle cx="{ex-13}" cy="{hy}" r="5" fill="{D}"/><circle cx="{ex+13}" cy="{hy}" r="5" fill="{D}"/>')
    elif eyes == "up":
        s.append(f'<circle cx="{ex-11}" cy="{hy-6}" r="5" fill="{D}"/><circle cx="{ex+15}" cy="{hy-6}" r="5" fill="{D}"/>')
    elif eyes == "happy":
        s.append(f'<path d="M{ex-20},{hy+2} Q{ex-13},{hy-8} {ex-6},{hy+2} M{ex+6},{hy+2} Q{ex+13},{hy-8} {ex+20},{hy+2}" fill="none" stroke="{D}" stroke-width="4" stroke-linecap="round"/>')
    elif eyes == "focus":
        s.append(f'<path d="M{ex-19},{hy} h12 M{ex+7},{hy} h12" stroke="{D}" stroke-width="5" stroke-linecap="round"/>')
    my = hy + 24
    if mouth == "smile":
        s.append(f'<path d="M{ex-12},{my-2} Q{ex},{my+10} {ex+12},{my-2}" fill="none" stroke="{D}" stroke-width="4" stroke-linecap="round"/>')
    elif mouth == "open":
        s.append(f'<path d="M{ex-14},{my-4} Q{ex},{my+18} {ex+14},{my-4}Z" fill="{D}"/>')
    elif mouth == "o":
        s.append(f'<ellipse cx="{ex}" cy="{my+2}" rx="8" ry="11" fill="{D}"/>')
    elif mouth == "flat":
        s.append(f'<path d="M{ex-8},{my} h16" stroke="{D}" stroke-width="4" stroke-linecap="round"/>')
    elif mouth == "hmm":
        s.append(f'<path d="M{ex-9},{my+2} q9,-6 18,0" fill="none" stroke="{D}" stroke-width="4" stroke-linecap="round"/>')
    s.append(front)
    return "".join(s)

def svg(body, bg=False):
    b = f'<rect width="{W}" height="{H}" fill="#0b0f0c"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{b}{body}</svg>'

def legs_stand(hip=(300,450)):
    x, y = hip
    return [[(x,y),(x-28,y+110),(x-42,y+228),(x-72,y+232)], [(x,y),(x+28,y+110),(x+42,y+228),(x+72,y+232)]]

T_STAND = [(300,250),(300,450)]
SH = (300,268)
def lines(*segs, col=O, w=6):
    return "".join(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>' for d in segs)

def key(x, y):
    return (f'<g transform="translate({x},{y}) rotate(-25)">'
            f'<rect x="-22" y="-62" width="44" height="66" rx="16" fill="{D}" stroke="{O}" stroke-width="5"/>'
            f'<circle cx="0" cy="-42" r="7" fill="{O}"/><circle cx="0" cy="-22" r="6" fill="{C}"/>'
            f'<path d="M-7,-62 v-58 h14 v14 h-8 v8 h8 v10 h-8 v26" fill="#cfd4d6" stroke="{O}" stroke-width="3"/></g>')

def sparkle(x, y, r=14, col=C):
    return f'<path d="M{x},{y-r} Q{x+2},{y-2} {x+r},{y} Q{x+2},{y+2} {x},{y+r} Q{x-2},{y+2} {x-r},{y} Q{x-2},{y-2} {x},{y-r}Z" fill="{col}"/>'

P = {}
# 1 wave
P["01_wave_salam"] = figure(
    [[SH,(250,350),(238,432)], [SH,(388,226),(404,132)]] + legs_stand(), T_STAND, (300,180), 0, "dot", "smile",
    front=lines("M430,110 q16,22 4,48", "M452,96 q24,34 6,72"))
# 2 point / explain
P["02_point_explain"] = figure(
    [[SH,(392,252),(478,212)], [SH,(236,336),(290,404)]] + legs_stand(), T_STAND, (300,180), 10, "dot", "open",
    front=lines("M506,186 l26,-14", "M510,212 l30,0", "M506,238 l26,14"))
# 3 typing on laptop (seated)
stool = (f'<path d="M232,560 h136" stroke="{O}" stroke-width="22" stroke-linecap="round"/>'
         f'<path d="M232,560 h136" stroke="{G}" stroke-width="14" stroke-linecap="round"/>'
         f'<path d="M250,568 l-12,150 M350,568 l12,150 M244,650 h112" stroke="{O}" stroke-width="8" stroke-linecap="round"/>')
table = (f'<path d="M404,478 h170 M420,484 v236 M560,484 v236" stroke="{O}" stroke-width="10" stroke-linecap="round"/>')
laptop = (f'<polygon points="402,476 540,476 548,466 410,466" fill="{G}" stroke="{O}" stroke-width="5" stroke-linejoin="round"/>'
          f'<polygon points="528,470 548,470 588,352 568,352" fill="{G}" stroke="{O}" stroke-width="5" stroke-linejoin="round"/>'
          f'<circle cx="560" cy="412" r="6" fill="{C}"/>'
          + lines("M430,440 l-6,-12", "M462,436 l0,-14", "M494,440 l6,-12", w=5))
P["03_typing_laptop"] = figure(
    [[(328,368),(372,438),(452,462)], [(328,368),(386,452),(486,462)],
     [(296,548),(392,552),(398,682),(428,688)], [(296,548),(382,566),(372,692),(402,698)]],
    [(330,340),(296,548)], (348,272), 12, "focus", "flat", back=(stool, table), front=laptop)
# 4 thinking
P["04_thinking"] = figure(
    [[SH,(246,340),(338,346)], [SH,(356,326),(318,228)]] + legs_stand(), T_STAND, (300,180), 6, "up", "hmm",
    front=f'<text x="408" y="128" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="110" fill="{O}">?</text>'
          + f'<text x="372" y="92" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="54" fill="{C}" opacity=".8">?</text>')
# 5 holding car key
P["05_car_key"] = figure(
    [[SH,(386,246),(424,170)], [SH,(250,352),(240,434)]] + legs_stand(), T_STAND, (300,180), 8, "happy", "smile",
    front=key(430, 172) + sparkle(500, 60) + sparkle(380, 70, 10, O) + sparkle(520, 170, 9))
# 6 celebrate
confetti = "".join(f'<rect x="{x}" y="{y}" width="14" height="8" rx="2" fill="{c}" transform="rotate({r} {x} {y})"/>'
                   for x, y, r, c in [(120,90,30,O),(180,40,-20,C),(450,50,45,O),(500,130,-35,C),(90,220,60,C),(520,250,20,O),(250,30,10,O),(380,20,-50,C)])
P["06_celebrate"] = figure(
    [[SH,(236,196),(212,112)], [SH,(364,196),(388,112)],
     [(300,440),(240,520),(270,610),(240,628)], [(300,440),(360,520),(330,610),(360,628)]],
    [(300,250),(300,440)], (300,180), 0, "happy", "open", front=confetti)
# 7 shocked / problem (car fault)
P["07_shocked"] = figure(
    [[SH,(232,236),(226,162)], [SH,(368,236),(374,162)]] + legs_stand(), T_STAND, (300,180), 0, "dot", "o",
    front=f'<text x="410" y="120" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="100" fill="{O}">!</text>'
          + lines("M206,128 l-24,-20", "M394,128 l24,-20", "M300,96 l0,-24", col=C, w=5))

os.makedirs(OUT, exist_ok=True)
for name, body in P.items():
    open(f"{OUT}/{name}.svg", "w").write(svg(body))
    open(f"{OUT}/.preview_{name}.svg", "w").write(svg(body, bg=True))
print("\n".join(P))
