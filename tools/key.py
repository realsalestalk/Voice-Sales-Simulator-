import numpy as np, cv2
from scipy import ndimage as ndi

def bg_fit(im):
    h, w, _ = im.shape
    f = im.astype(np.float32)
    R, G, B = f[..., 0], f[..., 1], f[..., 2]
    br = B - R
    conf = (br < -3) & (br > -30) & (np.abs(G - (R + B) / 2) < 10) & (R - B < 28)
    # also exclude centre-ish regions densely? keep as is; subsample
    ys, xs = np.nonzero(conf[::6, ::6]); ys = ys * 6; xs = xs * 6
    X = xs / w; Y = ys / h
    def basis(X, Y):
        return np.stack([np.ones_like(X), X, Y, X*X, X*Y, Y*Y, X**3, X*X*Y, X*Y*Y, Y**3], -1)
    A = basis(X, Y)
    bg = np.zeros_like(f)
    gy, gx = np.mgrid[0:h, 0:w]
    Ag = basis(gx / w, gy / h)
    for c in range(3):
        v = f[ys, xs, c]
        coef, *_ = np.linalg.lstsq(A, v, rcond=None)
        # one robust re-fit
        res = np.abs(A @ coef - v); keep = res < np.percentile(res, 85)
        coef, *_ = np.linalg.lstsq(A[keep], v[keep], rcond=None)
        bg[..., c] = Ag @ coef
    return bg

def key(im, bg=None, lo=10, hi=30):
    f = im.astype(np.float32)
    if bg is None: bg = bg_fit(im)
    d = f - bg
    luma_d = d.mean(-1)
    chroma = d - luma_d[..., None]
    cd = np.linalg.norm(chroma, axis=-1)
    # shadows: darker with little chroma change -> background
    score = cd * 1.6 + np.maximum(luma_d, 0) * 0.9 + np.maximum(-luma_d - 70, 0) * 0.5
    hard = score > (lo + hi) / 2
    hard = cv2.morphologyEx(hard.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    hard = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    lab, n = ndi.label(hard)
    if n == 0: return np.zeros(im.shape[:2], np.float32), bg
    sizes = ndi.sum(hard, lab, range(1, n + 1))
    keep = np.argmax(sizes) + 1
    main = lab == keep
    main = ndi.binary_fill_holes(main)
    soft = np.clip((score - lo) / (hi - lo), 0, 1)
    band = cv2.dilate(main.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    inner = cv2.erode(main.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    alpha = np.where(inner, 1.0, np.where(band, soft, 0.0)).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0) * band
    alpha[inner] = 1.0
    return alpha, bg

def unmix(im, alpha, bg):
    f = im.astype(np.float32); a = np.clip(alpha, 1e-3, 1)[..., None]
    F = (f - (1 - a) * bg) / a
    F = np.where(alpha[..., None] > 0.02, F, f)
    return np.clip(F, 0, 255).astype(np.uint8)

def rgba(im, alpha, bg):
    F = unmix(im, alpha, bg)
    return np.dstack([F, (alpha * 255).astype(np.uint8)])
