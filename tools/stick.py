import numpy as np, cv2
from scipy import ndimage as ndi

def wood_mask(im):
    f = im.astype(int); R, G, B = f[..., 0], f[..., 1], f[..., 2]
    w = (R - B > 32) & (R > 100) & (R - G > 6)
    lab, n = ndi.label(w, structure=np.ones((3, 3)))
    if n == 0: return w & False, None
    sizes = ndi.sum(w, lab, range(1, n + 1))
    k = np.argmax(sizes) + 1
    m = lab == k
    ys, xs = np.nonzero(m)
    pts = np.stack([xs, ys], 1).astype(float); c = pts.mean(0)
    _, s, vt = np.linalg.svd(pts - c, full_matrices=False)
    d = vt[0]
    if s[0] < 4 * s[1]: return w & False, None  # not elongated
    if d[0] < 0: d = -d
    t = (pts - c) @ d
    # thin wood segments only (exclude anything far from the line)
    perp = np.abs((pts - c) @ np.array([-d[1], d[0]]))
    good = perp < 14
    m2 = np.zeros_like(m); m2[ys[good], xs[good]] = True
    return m2, dict(c=c, d=d, tmin=t[good].min(), tmax=t[good].max())

def fur_light(im):
    f = im.astype(int); R, G, B = f[..., 0], f[..., 1], f[..., 2]
    L = (R + G + B) / 3
    return (B - R > 25) & (L > 105)
