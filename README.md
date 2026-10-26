# Minds3d

3D voxel fighters for the 3,333 MDG (minds.games) NFTs. Every fighter is built from its real trait layers, so it matches the NFT.

## Run locally
```bash
python -m http.server 5173 --directory web
```
Open http://localhost:5173/?a=1&b=3327 (`a` / `b` = token ids).

## Rebuild the data (after layer or metadata changes)
```bash
pip install pillow numpy
python tools/build_data.py "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"
```
Writes `web/data/layers.json` (traits as 10px voxel grids), `tokens.json` (traits per token) and `thumbs/`.

## How it works
- `tools/build_data.py` samples each 1200px layer PNG onto a 120x120 grid.
- `web/src/voxel.js` stacks a token's layers, splits them into head / torso / legs / hand item / emote, and inflates each part into rounded voxels (face + necklace only on the front).
- `web/src/main.js` is the arena: Mind Arena stat table (rarity sets HP/ATK/SPD/crit, crits 1.75x), procedural attack / hit / KO animations, voxel debris, slow-mo crits.

## Deploy
Static site: on Vercel set the root directory to `web` (no build step).

## Known gaps
- Legendaries (#3324-3333) are painted 1-of-1s with no layers; they are cut out with the standard body shape, so extras like ears, halos and tails are lost.
