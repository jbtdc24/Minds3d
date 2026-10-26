"""Pack the MDG trait layers + token metadata into compact data for the 3D game.

Each 1200x1200 layer PNG is sampled onto a CELL-pixel grid (majority colour per cell),
cropped to its bounding box and stored as palette indices. The browser stacks a token's
layers and extrudes them into toon-shaded voxel parts, so the front view is the NFT 1:1.
Legendaries (painted 1-of-1s) are cut out of their art: everything not reachable from the
image border without crossing the black outline is the character.

Usage:
  python tools/build_data.py "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"
"""
import base64
import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

CELL = 6  # source pixels per voxel (1200 / 6 = 200 grid)
N = 1200 // CELL
LAYERS = ["Skin", "Pants", "Shirt", "Neck", "Face", "Headwear", "Hand", "Emotion"]
SKIP = {"headwear/Frame 99.png", "neck/none.png"}
GROUND_Y = 1125  # the black ground line in the skin layer starts here

src = sys.argv[1] if len(sys.argv) > 1 else "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"
out_dir = os.path.join(os.path.dirname(__file__), "..", "web", "data")
os.makedirs(out_dir, exist_ok=True)

palette = {}  # rgb int -> index (0 = empty)


def to_cells(rgba, min_cover=0.5):
    """Majority opaque colour per CELL x CELL block (vectorised) -> (N, N) palette index grid."""
    a = rgba.reshape(N, CELL, N, CELL, 4).transpose(0, 2, 1, 3, 4).reshape(N, N, CELL * CELL, 4).astype(np.int32)
    opaque = a[..., 3] >= 128
    q = ((a[..., 0] >> 3) << 10) | ((a[..., 1] >> 3) << 5) | (a[..., 2] >> 3)
    q = np.where(opaque, q + 1, 0)
    counts = (q[..., :, None] == q[..., None, :]).sum(-1)
    counts[q == 0] = 0
    win = counts.argmax(-1)
    rgb = np.take_along_axis(a[..., :3], win[..., None, None].repeat(3, -1), axis=2)[:, :, 0]
    keep = opaque.mean(-1) >= min_cover
    grid = np.zeros((N, N), np.uint16)
    for y, x in zip(*np.nonzero(keep)):
        key = (int(rgb[y, x, 0]) << 16) | (int(rgb[y, x, 1]) << 8) | int(rgb[y, x, 2])
        if key not in palette:
            palette[key] = len(palette) + 1
        grid[y, x] = palette[key]
    return grid


def pack(grid):
    ys, xs = np.nonzero(grid)
    if not len(xs):
        return None
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = np.ascontiguousarray(grid[y0:y1, x0:x1]).astype("<u2")
    return {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0),
            "d": base64.b64encode(crop.tobytes()).decode()}


assets = os.path.join(src, "generator", "assets")
layers = {}
for t in LAYERS:
    folder = t.lower()
    for f in sorted(glob.glob(os.path.join(assets, folder, "*.png"))):
        rel = f"{folder}/{os.path.basename(f)}"
        if rel in SKIP:
            continue
        rgba = np.array(Image.open(f).convert("RGBA"))
        if t == "Skin":
            rgba[GROUND_Y:] = 0
        p = pack(to_cells(rgba))
        if p:
            layers[f"{t}/{os.path.basename(f)[:-4]}"] = p
    print(t, "done")

# Legendaries: flood the background from the border with the black outline as the wall, try a few
# "black" thresholds, keep the tightest mask that still covers the standard body, and always add
# the standard body silhouette (some legendaries have coloured outlines or dark backgrounds).
prior = np.zeros((1200, 1200), bool)
for f in glob.glob(os.path.join(assets, "skin", "*.png")):
    prior |= np.array(Image.open(f).convert("RGBA"))[..., 3] >= 128
prior[GROUND_Y:] = False
legend_names = sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(assets, "legendary", "*.png")))
for name in legend_names:
    rgba = np.array(Image.open(os.path.join(assets, "legendary", name + ".png")).convert("RGBA"))
    best = None
    for th in (12, 25, 40):
        lab, _ = ndimage.label(rgba[..., :3].max(-1) >= th)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        char = ndimage.binary_fill_holes(~np.isin(lab, list(border)))
        char[GROUND_Y + 10:] = False
        area, cover = char.sum(), (char & prior).sum() / prior.sum()
        if cover > 0.9 and area < prior.sum() * 1.7 and (best is None or area < best.sum()):
            best = char
    char = (best if best is not None else np.zeros_like(prior)) | ndimage.binary_dilation(prior, iterations=4)
    rgba[..., 3] = np.where(char, 255, 0)
    layers[f"Legendary/{name}"] = pack(to_cells(rgba))
    print("legendary", name, int(char.sum()))

backgrounds = {}
for f in sorted(glob.glob(os.path.join(assets, "background", "*.png"))):
    r, g, b = Image.open(f).convert("RGB").getpixel((600, 600))
    backgrounds[os.path.basename(f)[:-4]] = "#%02x%02x%02x" % (r, g, b)

md = json.load(open(os.path.join(src, "metadata", "_metadata.json")))
tokens, legend_ids = {}, []
for t in md:
    at = {a["trait_type"]: a["value"] for a in t["attributes"]}
    tokens[t["edition"]] = at
    if at.get("Rarity") == "Legendary":
        legend_ids.append(t["edition"])
# Legendary tokens are in the same order as the sorted legendary images (verified by pixel match).
for tid, name in zip(sorted(legend_ids), legend_names):
    tokens[tid]["Legendary"] = name

pal_list = [0] * (len(palette) + 1)
for rgb, i in palette.items():
    pal_list[i] = rgb
json.dump({"cell": CELL, "n": N, "palette": pal_list, "layers": layers, "backgrounds": backgrounds},
          open(os.path.join(out_dir, "layers.json"), "w"), separators=(",", ":"))
json.dump(tokens, open(os.path.join(out_dir, "tokens.json"), "w"), separators=(",", ":"))
print(f"{len(layers)} layers, {len(pal_list)} colours, {len(tokens)} tokens")

thumbs = os.path.join(out_dir, "thumbs")
os.makedirs(thumbs, exist_ok=True)
for tid in tokens:
    dst = os.path.join(thumbs, f"{tid}.webp")
    if not os.path.exists(dst):
        Image.open(os.path.join(src, "images", f"{tid}.png")).convert("RGB").resize((160, 160), Image.NEAREST).save(dst, quality=85)
