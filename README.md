# Minds3d

3D voxel fighters for the 3,333 MDG (minds.games) NFTs. Every fighter is built from its real trait layers, so it matches the NFT.

## Run locally
```bash
python -m http.server 5173 --directory web
```
Open http://localhost:5173/?a=1&b=3327 (`a` / `b` = token ids, `slow=0.2` = slow motion).

Move tester: keys 1-4 = punch / kick / slash / smash (hold Shift for the right fighter).

## Rebuild the data (after layer or metadata changes)
```bash
pip install pillow numpy
python tools/build_data.py "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"
```
Writes `web/data/layers.json` (traits as 10px voxel grids), `tokens.json` (traits per token) and `thumbs/`.

## How it works
- `web/src/model.js` builds every trait as a hand-made voxel model (no outlines): base body coloured by Skin / Shirt / Pants, 12 faces, 8 hats, 7 hand items, 7 emotes, 3 necklaces and the 10 legendaries. Colours are sampled from the original layers.
- `web/src/voxel.js` meshes those models and rigs them (head, torso, arms, legs, held item, emote).
- `web/src/main.js` is the arena: Mind Arena stat table (rarity sets HP/ATK/SPD/crit, crits 1.75x), punch / kick / slash / smash moves, voxel debris, slow-mo crits.
- `tools/build_data.py` only provides `tokens.json` (traits per token) and the NFT thumbnails now.

Trait check: `?gallery=1913,1914,1915` lines up any tokens side by side.

## Deploy
Static site: on Vercel set the root directory to `web` (no build step).

