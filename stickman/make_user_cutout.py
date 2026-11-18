"""Scene layer from the user's approved image (assets/user_scene_ref.png, = stage*0.75 cropped at y=275):
remove the character, stool, handheld and the broken laptop lid (redrawn in scene.js)."""
import cv2, numpy as np
im = cv2.imread('assets/user_scene_ref.png', cv2.IMREAD_UNCHANGED)
a = im[..., 3].copy()
a[:528, 1092:] = 0                     # character + stool
a[222:353, 1040:1092] = 0              # handheld
lid = np.array([[1192,586],[1330,584],[1362,752],[1252,768],[1222,690],[1212,640]], np.float32)
lid = ((lid - [0, 275]) * 0.75).astype(np.int32)                       # stage -> image coords
m = np.zeros(a.shape, np.uint8); cv2.fillPoly(m, [lid], 255); a[m > 0] = 0
r0 = ((np.array([[1330,660],[1400,692]]) - [0, 275]) * 0.75).astype(int); a[r0[0,1]:r0[1,1], r0[0,0]:r0[1,0]] = 0
im[..., 3] = a
big = cv2.resize(im, (1920, 805), interpolation=cv2.INTER_CUBIC)
out = np.zeros((1080, 1920, 4), np.uint8); out[275:1080] = big
out[934:952, 764:788] = (4, 9, 4, 255)   # white speck next to the tyre
cv2.imwrite('assets/logo_cutout.png', out)
# the image ends at the ground line and cuts the tyre: fill that strip (tyre bottom + dark ground) from the logo
logo = cv2.imread('assets/logo_original.png')
strip = logo[846:868, 430:700]
strip = cv2.resize(strip, (round(270 * 4 / 3), round(22 * 4 / 3)), interpolation=cv2.INTER_CUBIC)
y0, x0 = round((846 - 130) * 4 / 3), round(430 * 4 / 3)
# align the logo to the user's image (they differ by a few px): match the car's lower body
tpl = cv2.resize(logo[770:840, 300:900], None, fx=4/3, fy=4/3, interpolation=cv2.INTER_CUBIC)
ty, tx = round((770 - 130) * 4 / 3), round(300 * 4 / 3)
area = out[ty - 30:ty + tpl.shape[0] + 30, tx - 30:tx + tpl.shape[1] + 30, :3]
res = cv2.matchTemplate(area, tpl, cv2.TM_CCOEFF_NORMED); _, sc, _, (mx, my) = cv2.minMaxLoc(res)
dx, dy = mx - 30, my - 30; print('offset', dx, dy, round(sc, 3))
y0, x0 = y0 + dy, x0 + dx
out[y0:y0 + strip.shape[0], x0:x0 + strip.shape[1], :3] = strip
out[y0:y0 + strip.shape[0], x0:x0 + strip.shape[1], 3] = 255
out[934:952, 764:788] = (4, 9, 4, 255)   # white speck next to the tyre
cv2.imwrite('assets/logo_cutout.png', out)
