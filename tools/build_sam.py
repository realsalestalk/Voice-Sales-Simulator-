# Builds Sam's sprite atlas from the approved reference video frames.
# Usage:
#   ffmpeg -i <approved-reference.mp4> -vf fps=30 <frames>/%03d.png
#   python3 tools/build_sam.py tools <frames> <out>
# Output: <out>/sam-atlas.webp + sam-atlas.json (convert the JSON into js/sam-data.js).
# Frames used (30 fps source): idle 1-45, walk loop 61-89, lift 124-156,
# teaching hold + real tap cycle 156-186 (baked stick removed, fist layer kept), lower 182-228.
import sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, sys.argv[1]); import key, stick
FR = sys.argv[2]; OUT = sys.argv[3]
K = 0.30           # atlas pixels per normalized source pixel
NORM_H = 900       # normalized standing height (beanie top -> feet)

def load(i): return np.array(Image.open(f'{FR}/{i:03d}.png').convert('RGB'))

# ---- per-frame measurements (all frames, half-res for speed) ----
meas = {}
for i in range(1, 301):
    im = load(i)[::2, ::2]
    a, _ = key.key(im); wm, _ = stick.wood_mask(im)
    m = (a > 0.5) & ~wm
    ys, xs = np.nonzero(m); top, bot = ys.min(), ys.max()
    fx = np.nonzero(m[bot - 30:bot + 1])[1].mean()
    meas[i] = dict(top=top * 2, bot=bot * 2, fx=fx * 2)
idx = np.arange(1, 301)
def smooth(key_, w):
    v = np.array([meas[i][key_] for i in idx], float)
    pad = np.pad(v, w, mode='edge'); k = np.ones(2 * w + 1) / (2 * w + 1)
    return dict(zip(idx, np.convolve(pad, k, 'valid')))
Hs = {i: v for i, v in zip(idx, np.array([meas[i]['bot'] - meas[i]['top'] for i in idx], float))}
Hm = smooth('bot', 6); Tm = smooth('top', 6)
H = {i: Hm[i] - Tm[i] for i in idx}
FX = smooth('fx', 15)
BOT = smooth('bot', 6)

# walk loop drift: register frame 90 against 61 so the loop seam matches
def scale_of(i): return NORM_H / H[i]

SETS = {
    'idle': list(range(1, 46, 2)),
    'walk': list(range(61, 90, 2)),
    'lift': list(range(124, 157, 2)),
    'hold': list(range(156, 187)),
    'lower': [182, 186, 190, 194, 198, 202, 206] + list(range(208, 229, 2)),
}
walk_corr = {}
w0, w1 = SETS['walk'][0], 90
d0 = FX[w0]; d1 = FX[w1]
for i in SETS['walk']:
    t = (i - w0) / (w1 - w0)
    walk_corr[i] = (FX[i] - (d0 + (d1 - d0) * t))  # keep the oscillation around a linear drift
frames = []
REF_FACE = dict(mouth=(850, 385), eyeL=(775, 335), eyeR=(872, 325))
face_tpl = cv2.cvtColor(load(180)[260:460, 700:960], cv2.COLOR_RGB2GRAY).astype(np.float32)

for set_, ids in SETS.items():
    for i in ids:
        im = load(i)
        remove = set_ == 'hold'
        a, bg = key.key(im)
        info = None
        if remove:
            wm, info = stick.wood_mask(im)
            wmd = cv2.dilate(wm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
            # wood over background -> transparent; recompute main component without it
            f = im.astype(np.float32)
            a2 = a.copy(); a2[wmd] = 0
            lab, n = ndi.label(a2 > 0.3)
            sizes = ndi.sum(a2 > 0.3, lab, range(1, n + 1)); main = lab == (np.argmax(sizes) + 1)
            main = ndi.binary_fill_holes(main)
            a = np.where(main, np.maximum(a2, 0), 0).astype(np.float32)
            inside = wmd & main
            a[inside] = 1.0
            im = cv2.inpaint(im, inside.astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)
            # drop anything not connected (button, ripple)
        else:
            lab, n = ndi.label(a > 0.3)
            if n > 1:
                sizes = ndi.sum(a > 0.3, lab, range(1, n + 1)); keepm = lab == (np.argmax(sizes) + 1)
                keepm = cv2.dilate(keepm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
                a = a * keepm
        # remove the demo button + ripple from the source clip, keep wood
        f0 = load(i).astype(int)
        btn = (f0[..., 2] > 225) & (f0[..., 0] < 110) & (f0[..., 1] > 80) & (f0[..., 1] < 200)
        lb, nb = ndi.label(btn)
        if nb:
            sz = ndi.sum(btn, lb, range(1, nb + 1)); kb = np.argmax(sz) + 1
            if 300 < sz[kb - 1] < 20000 and (lambda yx: (np.ptp(yx[1]) < 220 and np.ptp(yx[0]) < 140))(np.nonzero(lb == kb)):
                by, bx = np.nonzero(lb == kb); cx, cy = bx.mean(), by.mean()
                yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                circ = (xx - cx) ** 2 + (yy - cy) ** 2 < 250 ** 2
                wm2, _ = stick.wood_mask(load(i))
                a = np.where(circ & ~cv2.dilate(wm2.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool), 0, a).astype(np.float32)
        # floor shadow: grey, low-chroma pixels near the feet are background
        ys_, xs_ = np.nonzero(a > 0.5)
        if len(ys_):
            yb = ys_.max(); yt = ys_.min(); lim = yb - (yb - yt) * 0.16
            ff = load(i).astype(int); R_, G_, B_ = ff[..., 0], ff[..., 1], ff[..., 2]
            grey = (np.abs(B_ - R_) < 22) & (np.abs(G_ - R_) < 18)
            yy2 = np.arange(a.shape[0])[:, None]
            a = np.where(grey & (yy2 > lim), 0, a).astype(np.float32)
            lab3, n3 = ndi.label(a > 0.3)
            if n3 > 1:
                sz3 = ndi.sum(a > 0.3, lab3, range(1, n3 + 1)); km = lab3 == (np.argmax(sz3) + 1)
                km = cv2.dilate(km.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
                a = a * km
        rgba = key.rgba(im, a, bg)
        s = scale_of(i)
        ax = FX[i] if set_ != 'walk' else FX[i] - walk_corr[i] * 0 + 0  # anchor x
        if set_ == 'walk': ax = d0 + (d1 - d0) * ((i - w0) / (w1 - w0))
        ay = BOT[i]
        ys, xs = np.nonzero(a > 0.02)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = rgba[y0:y1, x0:x1]
        sc = s * K
        w = max(1, round((x1 - x0) * sc)); h = max(1, round((y1 - y0) * sc))
        img = Image.fromarray(crop, 'RGBA').resize((w, h), Image.LANCZOS)
        fr = dict(set=set_, src=i, img=img, ox=(x0 - ax) * sc, oy=(y0 - ay) * sc, w=w, h=h)
        if remove:
            c, d = info['c'], info['d']
            butt = c + d * info['tmin']
            grip = butt - d * 22  # handle sits inside the fist
            ang = float(np.arctan2(d[1], d[0]))
            fr['grip'] = [float((grip[0] - ax) * sc), float((grip[1] - ay) * sc)]
            fr['angle'] = ang
            fr['visLen'] = float((info['tmax'] - info['tmin']) * sc)
            # fist layer: light fur near the grip, drawn above the stick
            fl = stick.fur_light(im) & (a > 0.5)
            yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
            near = (xx - butt[0]) ** 2 + (yy - butt[1]) ** 2 < 95 ** 2
            lab, n = ndi.label(fl & near)
            if n:
                dist = [((np.mean(np.nonzero(lab == k)[1]) - butt[0]) ** 2 + (np.mean(np.nonzero(lab == k)[0]) - butt[1]) ** 2, k) for k in range(1, n + 1) if (lab == k).sum() > 200]
                fist = np.zeros_like(fl)
                for dd, k in sorted(dist)[:2]: fist |= lab == k
                fist = ndi.binary_fill_holes(cv2.morphologyEx(fist.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool))
                fist = cv2.dilate(fist.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & (a > 0.3)
                fa = cv2.GaussianBlur(fist.astype(np.float32), (5, 5), 0) * a
                ys2, xs2 = np.nonzero(fa > 0.02)
                fx0, fx1, fy0, fy1 = xs2.min(), xs2.max() + 1, ys2.min(), ys2.max() + 1
                frgba = rgba[fy0:fy1, fx0:fx1].copy(); frgba[..., 3] = (fa[fy0:fy1, fx0:fx1] * 255).astype(np.uint8)
                fw, fh = max(1, round((fx1 - fx0) * sc)), max(1, round((fy1 - fy0) * sc))
                fr['fist'] = dict(img=Image.fromarray(frgba, 'RGBA').resize((fw, fh), Image.LANCZOS), ox=(fx0 - ax) * sc, oy=(fy0 - ay) * sc, w=fw, h=fh)
            # face tracking for eyelids & mouth
            g = cv2.cvtColor(load(i)[200:520, 640:1020], cv2.COLOR_RGB2GRAY).astype(np.float32)
            r = cv2.matchTemplate(g, face_tpl, cv2.TM_CCOEFF_NORMED); _, _, _, mx = cv2.minMaxLoc(r)
            dx, dy = mx[0] + 640 - 700, mx[1] + 200 - 260
            fr['face'] = {k: [float((v[0] + dx - ax) * sc), float((v[1] + dy - ay) * sc)] for k, v in REF_FACE.items()}
        frames.append(fr)
        print(set_, i, fr['w'], fr['h'], round(fr['ox']), round(fr['oy']), 'grip' in fr and [round(v) for v in fr['grip']], file=sys.stderr)

# ---- pack atlas ----
items = []
for k, fr in enumerate(frames):
    items.append((fr, 'body')); 
    if 'fist' in fr: items.append((fr, 'fist'))
MAXW = 4000
x = y = rowh = 0; places = []
for fr, kind in items:
    im = fr['img'] if kind == 'body' else fr['fist']['img']
    if x + im.width + 2 > MAXW: x = 0; y += rowh + 2; rowh = 0
    places.append((fr, kind, x, y)); x += im.width + 2; rowh = max(rowh, im.height)
atlas = Image.new('RGBA', (MAXW, y + rowh), (0, 0, 0, 0))
meta = dict(k=K, normH=NORM_H, sets={}, frames=[])
fi = {}
for fr, kind, px, py in places:
    im = fr['img'] if kind == 'body' else fr['fist']['img']
    atlas.paste(im, (px, py))
    if kind == 'body':
        e = dict(set=fr['set'], src=fr['src'], x=px, y=py, w=fr['w'], h=fr['h'], ox=round(fr['ox'], 2), oy=round(fr['oy'], 2))
        for kk in ('grip', 'angle', 'visLen', 'face'):
            if kk in fr: e[kk] = fr[kk] if kk != 'grip' else [round(v, 2) for v in fr[kk]]
        fi[id(fr)] = len(meta['frames']); meta['frames'].append(e)
    else:
        f = fr['fist']; meta['frames'][fi[id(fr)]]['fist'] = dict(x=px, y=py, w=f['w'], h=f['h'], ox=round(f['ox'], 2), oy=round(f['oy'], 2))
for n, e in enumerate(meta['frames']): meta['sets'].setdefault(e['set'], []).append(n)
# bbox of the hold rest pose body (for layout)
atlas.save(f'{OUT}/sam-atlas.webp', 'WEBP', quality=80, method=6)
atlas.save(f'{OUT}/sam-atlas.png')
json.dump(meta, open(f'{OUT}/sam-atlas.json', 'w'), separators=(',', ':'))
print('atlas', atlas.size, len(meta['frames']), file=sys.stderr)
