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
cv2.imwrite('assets/logo_cutout.png', out)
