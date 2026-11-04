# Makes web/assets/og_share.jpg: the 1200x630 picture X / Discord / Telegram show under a shared invite link.
# python -I tools/og_card.py  (run from the repo root; uses the hero art, the crown and the Pixelify Sans font)
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
W, H = 1200, 630
hero = Image.open(root / 'web/assets/site_hero.webp').convert('RGB')
s = max(W / hero.width, H / hero.height)
hero = hero.resize((round(hero.width * s), round(hero.height * s)), Image.LANCZOS)
x0 = (hero.width - W) // 2
img = hero.crop((x0, 0, x0 + W, H))

# dark band on the left so the words read on any part of the art
shade = Image.new('L', (W, H))
d = ImageDraw.Draw(shade)
for x in range(W):
    d.line([(x, 0), (x, H)], fill=int(238 * min(1, max(0, 1.25 - x / 720)) ** 1.1))
img = Image.composite(Image.new('RGB', (W, H), (14, 10, 30)), img, shade)
d = ImageDraw.Draw(img)

font = lambda n: ImageFont.truetype(str(root / 'tools/video/fonts/PixelifySans.ttf'), n)
crown = Image.open(root / 'web/assets/crown.png').convert('RGBA')
crown = crown.resize((96, round(crown.height * 96 / crown.width)), Image.NEAREST)
img.paste(crown, (64, 70), crown)

def text(xy, s, f, fill, shadow=(0, 0, 0)):
    d.text((xy[0] + 4, xy[1] + 5), s, font=f, fill=shadow)
    d.text(xy, s, font=f, fill=fill)

text((64, 180), 'MINDS', font(118), (255, 255, 255))
text((64, 292), 'CLASH', font(118), (198, 244, 50))
for i, line in enumerate(['Crown duels. Your own sky island.', 'An AI Mind that plays for you.']):
    text((68, 432 + i * 46), line, font(38), (243, 236, 255))
# call to action chip
d.rectangle([64, 540, 452, 596], fill=(0, 0, 0))
d.rectangle([60, 536, 448, 592], fill=(198, 244, 50))
d.polygon([(82, 550), (82, 578), (104, 564)], fill=(23, 18, 42))   # play arrow (the pixel font has no ▶)
d.text((118, 546), 'JOIN ME · FREE', font=font(34), fill=(23, 18, 42))

out = root / 'web/assets/og_share.jpg'
img.save(out, 'JPEG', quality=86, optimize=True, progressive=True)
print(out, img.size, out.stat().st_size)
