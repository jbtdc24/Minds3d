# Cuts game sprites out of OpenArt sheets drawn on a flat white background.
#   python tools/cut_sprites.py sheet.png out_dir name1 name2 name3 [--height 220]
# The white around the sprites (connected to the image border) becomes transparent; the biggest separate shapes
# are cut out left to right, trimmed, scaled to a fixed height and saved as webp.
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

def cut(sheet, out_dir, names, height=220):
    img = Image.open(sheet).convert('RGBA')
    a = np.asarray(img).astype(np.int16)
    rgb = a[..., :3]
    # "background" = near-white and connected to the border (white inside a sprite stays)
    whiteish = (rgb.min(-1) > 228) & (rgb.max(-1) - rgb.min(-1) < 26)
    lab, _ = ndimage.label(whiteish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # soften the edge: grow the background by one pixel where it touches light anti-aliased pixels
    edge = ndimage.binary_dilation(bg) & ~bg & (rgb.min(-1) > 200)
    bg |= edge
    out = np.asarray(img).copy()
    out[bg, 3] = 0
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=2)
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    # keep the biggest blobs, then merge small bits (sparkles, tails) into the nearest big one
    order = np.argsort(sizes)[::-1]
    big = [i + 1 for i in order[:len(names)]]
    boxes = []
    for b in big:
        ys, xs = np.where(lab == b)
        boxes.append([xs.min(), ys.min(), xs.max(), ys.max()])
    for i in range(1, n + 1):
        if i in big or sizes[i - 1] < 40: continue
        ys, xs = np.where(lab == i)
        cx = xs.mean()
        k = min(range(len(boxes)), key=lambda j: abs((boxes[j][0] + boxes[j][2]) / 2 - cx))
        bx = boxes[k]
        if xs.min() > bx[0] - 120 and xs.max() < bx[2] + 120:
            boxes[k] = [min(bx[0], xs.min()), min(bx[1], ys.min()), max(bx[2], xs.max()), max(bx[3], ys.max())]
    boxes.sort(key=lambda b: b[0])
    os.makedirs(out_dir, exist_ok=True)
    pil = Image.fromarray(out)
    for name, (x0, y0, x1, y1) in zip(names, boxes):
        pad = 6
        crop = pil.crop((max(0, x0 - pad), max(0, y0 - pad), min(pil.width, x1 + pad + 1), min(pil.height, y1 + pad + 1)))
        h = height
        w = round(crop.width * h / crop.height)
        crop = crop.resize((w, h), Image.LANCZOS)
        crop.save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', quality=92, method=6)
        print(name, crop.size)

if __name__ == '__main__':
    args = sys.argv[1:]
    height = 220
    if '--height' in args:
        i = args.index('--height'); height = int(args[i + 1]); del args[i:i + 2]
    cut(args[0], args[1], args[2:], height)
