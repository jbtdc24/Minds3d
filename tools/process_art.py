"""Turn the raw OpenArt renders (art/raw) into web-ready assets (web/assets).
- arenas + mode banners -> webp
- icons on magenta -> transparent png (magenta keyed out, edges de-spilled), pixel-perfect downscale
Usage: python tools/process_art.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW, OUT = os.path.join(ROOT, 'art', 'raw'), os.path.join(ROOT, 'web', 'assets')
os.makedirs(OUT, exist_ok=True)

def key_magenta(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # distance from pure magenta: only near-#FF00FF becomes transparent (purples stay solid)
    d = np.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2)
    m = np.clip(1 - (d - 45) / 70, 0, 1)
    alpha = (1 - m) * 255
    # de-spill: pull the magenta tint out of semi-transparent edge pixels
    spill = np.clip((np.minimum(r, b) - g) * m, 0, 255)
    rgb = a.copy()
    rgb[..., 0] -= spill; rgb[..., 2] -= spill
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    return img.crop(img.getbbox())

def save(img, name, **kw):
    p = os.path.join(OUT, name)
    img.save(p, **kw)
    print(f'{name:22s} {img.size[0]}x{img.size[1]}  {os.path.getsize(p) // 1024} KB')

for n in ['arena_day', 'arena_night', 'arena_crystal']:
    if os.path.exists(os.path.join(RAW, n + '.png')):
        save(Image.open(os.path.join(RAW, n + '.png')).convert('RGB').resize((1920, 1080), Image.LANCZOS), n + '.webp', quality=86, method=6)
for n in ['mode_ranked', 'mode_practice', 'mode_train', 'mode_auto']:
    if os.path.exists(os.path.join(RAW, n + '.png')):
        save(Image.open(os.path.join(RAW, n + '.png')).convert('RGB').resize((896, 504), Image.LANCZOS), n + '.webp', quality=84, method=6)
if os.path.exists(os.path.join(RAW, 'card_back.png')):
    save(Image.open(os.path.join(RAW, 'card_back.png')).convert('RGB').resize((384, 576), Image.LANCZOS), 'card_back.webp', quality=88, method=6)
for n in ['crown', 'spell_boost', 'spell_double', 'spell_trap', 'spell_reverse']:
    if os.path.exists(os.path.join(RAW, n + '.png')):
        img = key_magenta(Image.open(os.path.join(RAW, n + '.png')))
        img.thumbnail((256, 256), Image.LANCZOS)
        save(img, n + '.png', optimize=True)
