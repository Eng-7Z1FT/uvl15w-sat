"""Build the 16:9 scene background from the logo: remove the seated man,
extend the green disk to a full frame, paint the ground, upscale to 1920x1080."""
import sys, cv2, numpy as np
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src).astype(np.float32)
H, W = im.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
CX, CY, R = 720, 713, 578                 # green disk of the logo (measured)
GROUND = 862                              # where the scene's ground starts
person = np.array([[1032,468],[1078,422],[1152,424],[1206,478],[1272,556],[1296,700],[1300,875],[915,875],[915,858],[1013,708],[1034,700],[1000,694],[998,626],[1034,616]], np.int32)
pm = np.zeros((H, W), np.uint8); cv2.fillPoly(pm, [person], 255)
pm = cv2.dilate(pm, np.ones((21, 21), np.uint8))
inside = ((xx-CX)**2 + (yy-CY)**2 < R*R) & (yy < GROUND)
valid = (inside & (pm == 0)).astype(np.float32)
b, gch, r = im[..., 0], im[..., 1], im[..., 2]
bg = ((gch > 55) & (gch - r > 18) & (gch - b > 8) & inside & (pm == 0)).astype(np.float32)  # clean green only

# normalized convolution, coarse-to-fine, to grow the green background into holes
fill = np.zeros_like(im) + (im * bg[..., None]).sum((0, 1)) / bg.sum()   # base: average logo green
for k in (801, 401, 201, 101, 51, 25):
    num = cv2.GaussianBlur(im * bg[..., None], (k, k), 0)
    den = cv2.GaussianBlur(bg, (k, k), 0)[..., None]
    est = num / np.maximum(den, 1e-4)
    w = np.clip(den[..., 0] * 3, 0, 1)
    fill = fill * (1 - w[..., None]) + est * w[..., None]
soft = cv2.GaussianBlur(valid, (11, 11), 0)[..., None] * valid[..., None]
res = im * soft + fill * (1 - soft)
# grain like the logo print
rng = np.random.default_rng(3)
grain = cv2.GaussianBlur(rng.normal(0, 6, (H, W)).astype(np.float32), (3, 3), 0)[..., None]
res = res + grain * (1 - soft)
# feather the person patch edge
# ground: dark band like the logo, below GROUND
g = np.clip((yy - GROUND) / 14.0, 0, 1)[..., None]
dark = np.zeros_like(res); dark[..., 0] = 10; dark[..., 1] = 22; dark[..., 2] = 13
shade = 1 - np.clip((yy - GROUND) / 260.0, 0, .55)[..., None]
res = res * (1 - g) + dark * shade * g
res = np.clip(res, 0, 255).astype(np.uint8)
frame = res[130:940, 0:1440]                          # 1440x810 = 16:9
frame = cv2.resize(frame, (1920, 1080), interpolation=cv2.INTER_LANCZOS4)
cv2.imwrite(out, frame, [cv2.IMWRITE_JPEG_QUALITY, 93])
print('ok', frame.shape)
