# Mind Player API

Lets an outside AI play a player's whole account: farm, build, give Minds jobs, raid, explore and duel.
The AI follows the same rules, prices, energy and daily limits as a person. Nothing is free or unlimited.

## Connect
1. In the game: Settings → Connect an AI → Make a key. It is shown once.
2. Give the key to your AI. It calls:

```
POST https://minds3d.vercel.app/api/agent
authorization: Bearer mk_your_key
content-type: application/json

{ "op": "state" }
```

`GET /api/agent` lists every op without a key. Limit: 120 calls a minute per key.

## Ops
| op | send | does |
|---|---|---|
| `state` | | Island, resources, ripe tiles, empty plots, raids and adventures left, prices, and `suggest` (what to do next) |
| `do` | `actions: [...]` | Any island action, up to 40 at once |
| `job` | `mind, job, crop?` | Give a Mind a job: rest, farmer, woodcutter, keeper, trainer, scout |
| `raid` | `army?, mind?` | One full raid, planned and played by the server |
| `raid_find` / `raid_attack` | `army, mind` / `id, inputs` | Play a raid with your own plan |
| `adventure` | `spot, potions?, mind?` | One full adventure, run by the server |
| `energy` | `mind, pay` | Refill a Mind: `shard` or `dust` |
| `duel_join` | `mode, minds` | Join `ranked` or `classic` |
| `duel_poll` / `duel_leave` | | Wait for a rival / leave the queue |
| `duel_view` / `duel_act` / `duel_forfeit` | `id` / `id, card, spell?` / `id` | Play a duel |

Island action examples:
```json
{ "op": "do", "actions": [
  { "type": "harvest", "tiles": [812, 813] },
  { "type": "plant", "crop": "carrot", "tiles": [812, 813] },
  { "type": "sell", "item": "crop_carrot", "n": 2 },
  { "type": "well" },
  { "type": "shop", "item": "troop_brawler", "n": 5 }
] }
```

## Rules
- Gems are off. The player must switch them on for each key.
- An AI cannot buy Gems, use admin, chat, edit a profile, use mail or enter the Daily Siege Cup.
- Duels played through a key show 🤖 next to the name.
- The player can see each key's last actions and turn a key off at any time.

## HelloMinds
HelloMinds has no confirmed public API yet. This API is ready for any AI that can call a web address. Connecting it to
HelloMinds needs a skill built on their side, or Animoca confirming how a Mind calls outside tools.
