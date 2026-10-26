# Mind Arena 3D

A 3v3 card-battle game (Axie-style) for the 3,333 MDG (minds.games) NFTs. Every fighter is built in 3D straight from its NFT layer art, so the front view matches the NFT 1:1, with toon shading and outlines.

## Play locally
```bash
python -m http.server 5173 --directory web
```
Open http://localhost:5173

## Game
- **Team:** pick any 3 MDGs (front / middle / back). The front fighter takes most hits.
- **Energy:** 3 to start, +2 per round (max 10), unused energy carries over.
- **Cards:** each round every fighter draws 2 cards from its deck. Every trait gives a card (Face, Hand item, Headwear, Emote), everyone has Bonk, and legendaries have 2 signature cards. A 2nd card on the same fighter is a +15% combo.
- **Classes** (from skin): Blaze > Bloom > Tide > Blaze (+20% / -15%). Legendaries are Mythic.
- **Stats:** rarity sets HP / ATK / speed / crit (same table as Mind Arena). The shirt gives a small bonus, the necklace a passive.
- **Status:** stun, burn, shield, dodge, taunt, ATK/DEF/speed buffs. Sudden death from round 10.
- **Modes:** Adventure (12 stages over 3 worlds with bosses and stars), Quick Battle. Wins give XP; fighters level to 10 (+4% stats per level).
- **Settings:** music, SFX, battle speed, graphics quality. Progress is saved in the browser.

## Code
- `tools/build_data.py`: samples every layer PNG at 6px into `web/data/layers.json`, cuts the legendaries out of their art, and writes `tokens.json` + thumbnails.
  `python tools/build_data.py "D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4"`
- `web/src/nft.js`: stacks a token's layers and extrudes them into rounded voxel slabs per body part (greedy-meshed, toon material).
- `web/src/render.js`: renderer, toon outline post-process, bloom, particles, camera rig.
- `web/src/env.js`: 3 arenas (Sunny Isles, Neon Night, Frost Peaks).
- `web/src/fighter.js`: fighter animation (punch / kick / slash / smash / cast / skill / hit / KO / win), projectiles, status visuals.
- `web/src/game/data.js`: classes, stats, every card. `web/src/game/battle.js`: battle engine + AI.
- `web/src/audio.js`: synthesized SFX and chiptune music (no audio files).
- `web/src/main.js`: screens, save data, battle presenter.

Trait check: `?gallery=1913,2190,3329&theme=neon` lines up any tokens.

## Deploy
Import the GitHub repo on vercel.com (Add New → Project). `vercel.json` already points Vercel at `web/` with no build step.
