"""Pack the MDG trait layers + token metadata into compact data for the 3D viewer.

Each 1200x1200 layer PNG is sampled onto a CELL-pixel grid (majority colour per cell),
cropped to its bounding box and stored as palette indices. The browser turns these
2D cell grids into voxel parts (head / torso / legs / item) at runtime.

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

CELL = 10  # source pixels per voxel (1200 / 10 = 120 grid)
N = 1200 // CELL
LAYERS = ["Skin", "Pants", "Shirt", "Neck", "Face", "Headwear", "Hand", "Emotion"]
FOLDER = {"Emotion": "emotion"}  # trait_type -> asset folder (default: lowercase)
SKIP = {"headwear/Frame 99.png", "neck/none.png"}
GROUND_Y = 1125  # the black ground line in the skin layer starts here

src = sys.argv[1] if len(sys.argv) > 1 else "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"
out_dir = os.path.join(os.path.dirname(__file__), "..", "web", "data")
os.makedirs(out_dir, exist_ok=True)

palette = {}  # rgb int -> index (0 = empty)


def pal(rgb):
    key = (int(rgb[0]) << 16) | (int(rgb[1]) << 8) | int(rgb[2])
    if key not in palette:
        palette[key] = len(palette) + 1
    return palette[key]


def to_cells(rgba, min_cover=0.5):
    """Majority opaque colour per CELL x CELL block -> (N, N) palette index grid."""
    a = rgba.reshape(N, CELL, N, CELL, 4).transpose(0, 2, 1, 3, 4).reshape(N, N, CELL * CELL, 4)
    grid = np.zeros((N, N), np.uint16)
    opaque = a[..., 3] >= 128
    cover = opaque.mean(axis=2)
    for y, x in zip(*np.nonzero(cover >= min_cover)):
        px = a[y, x][opaque[y, x]][:, :3]
        # quantise lightly so anti-aliased edges don't win the vote
        q = (px // 8).astype(np.int32)
        keys = (q[:, 0] << 10) | (q[:, 1] << 5) | q[:, 2]
        vals, counts = np.unique(keys, return_counts=True)
        win = vals[np.argmax(counts)]
        grid[y, x] = pal(px[keys == win].mean(axis=0).round())
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
    folder = FOLDER.get(t, t.lower())
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

# Legendaries are flat painted 1-of-1s: cut the character out with the standard skin silhouette.
skin_mask = np.zeros((1200, 1200), bool)
for f in glob.glob(os.path.join(assets, "skin", "*.png")):
    skin_mask |= np.array(Image.open(f).convert("RGBA"))[..., 3] >= 128
skin_mask[GROUND_Y:] = False
legend_names = sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(assets, "legendary", "*.png")))
for name in legend_names:
    rgba = np.array(Image.open(os.path.join(assets, "legendary", name + ".png")).convert("RGBA"))
    rgba[..., 3] = np.where(skin_mask, 255, 0)
    layers[f"Legendary/{name}"] = pack(to_cells(rgba))

backgrounds = {}
for f in sorted(glob.glob(os.path.join(assets, "background", "*.png"))):
    r, g, b = Image.open(f).convert("RGB").getpixel((600, 600))
    backgrounds[os.path.basename(f)[:-4]] = "#%02x%02x%02x" % (r, g, b)

# Tokens: id -> {trait: value}
md = json.load(open(os.path.join(src, "metadata", "_metadata.json")))
tokens = {}
legend_ids = []
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

# Copy the original token images for the picker / side-by-side check (small thumbnails).
thumbs = os.path.join(out_dir, "thumbs")
os.makedirs(thumbs, exist_ok=True)
for tid in tokens:
    dst = os.path.join(thumbs, f"{tid}.webp")
    if not os.path.exists(dst):
        Image.open(os.path.join(src, "images", f"{tid}.png")).convert("RGB").resize((160, 160), Image.NEAREST).save(dst, quality=85)
print("thumbs done")
