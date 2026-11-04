# Sample personal invite cards (1200x630, what X shows under a player's invite post).
# python -I tools/share_card.py <repo> <background> <mind id> <name> <rating> <wins> <rank> <out.jpg>
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root, bg, mind, name, rating, wins, rank, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7], sys.argv[8]
W, H = 1200, 630
img = Image.open(bg).convert('RGB')
s = max(W / img.width, H / img.height)
img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
img = img.crop(((img.width - W) // 2, (img.height - H) // 2, (img.width - W) // 2 + W, (img.height - H) // 2 + H))
shade = Image.new('L', (W, H)); d = ImageDraw.Draw(shade)
for x in range(W): d.line([(x, 0), (x, H)], fill=int(225 * min(1, max(0, 1.2 - x / 820))))
img = Image.composite(Image.new('RGB', (W, H), (14, 10, 30)), img, shade)
d = ImageDraw.Draw(img)
font = lambda n: ImageFont.truetype(str(root / 'tools/video/fonts/PixelifySans.ttf'), n)
def text(xy, t, f, fill): d.text((xy[0] + 3, xy[1] + 4), t, font=f, fill=(0, 0, 0)); d.text(xy, t, font=f, fill=fill)

# the player's Mind in a gold pixel frame
pf = Image.open(root / f'web/data/thumbs/{mind}.webp').convert('RGBA').resize((250, 250), Image.NEAREST)
x, y = 60, 70
d.rectangle([x - 14, y - 14, x + 264, y + 264], fill=(0, 0, 0)); d.rectangle([x - 10, y - 10, x + 260, y + 260], fill=(255, 201, 60)); d.rectangle([x - 4, y - 4, x + 254, y + 254], fill=(255, 248, 228))
img.paste(pf, (x, y), pf)
d.rectangle([x + 70, y + 236, x + 180, y + 270], fill=(0, 0, 0)); d.text((x + 82, y + 238), f'#{mind}', font=font(26), fill=(198, 244, 50))

# who, and the invite
crown = Image.open(root / 'web/assets/crown.png').convert('RGBA'); crown = crown.resize((60, round(crown.height * 60 / crown.width)), Image.NEAREST)
img.paste(crown, (370, 66), crown)
text((444, 70), 'MINDS CLASH', font(44), (198, 244, 50))
text((370, 140), name[:16], font(82), (255, 255, 255))
text((372, 236), 'invites you to the arena', font(36), (243, 236, 255))
# stats chips
cx = 372
for label, val in [('RANK', f'#{rank}'), ('RATING', rating), ('WINS', wins)]:
    w = max(130, 26 + d.textlength(val, font=font(36)))
    d.rectangle([cx + 4, 304, cx + w + 4, 384], fill=(0, 0, 0)); d.rectangle([cx, 300, cx + w, 380], fill=(43, 35, 64))
    d.text((cx + 14, 306), label, font=font(20), fill=(185, 176, 208)); d.text((cx + 14, 330), val, font=font(36), fill=(255, 201, 60))
    cx += w + 16
text((64, 420), 'Crown duels. A sky island to build. An AI Mind that plays for you.', font(30), (243, 236, 255))
d.rectangle([64, 500, 650, 566], fill=(0, 0, 0)); d.rectangle([60, 496, 646, 562], fill=(198, 244, 50))
d.polygon([(82, 512), (82, 546), (108, 529)], fill=(23, 18, 42))
d.text((124, 506), 'JOIN FREE · mindsclash.games', font=font(34), fill=(23, 18, 42))
img.save(out, 'JPEG', quality=86, optimize=True)
print(out)
