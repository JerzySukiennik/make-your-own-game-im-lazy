# Make Your Own Game, I'm Lazy

Players draw the assets (vector or pixel art, optional rig and sound), describe the game together in one shared box, and Claude Haiku 5.5 writes a playable Canvas 2D game around the drawings. Up to 6 players per room, public gallery, Gzowo 90s look.

## How it works
- `src/art/art.js` drawing engine (strokes, flood fill to vector, resolution-independent sprites, mesh rig, slicing) shared by the editor and the game.
- `src/game/sdk.js` the `G` SDK that generated games are written against. It runs in a sandboxed iframe (no network, no storage, CSP) and talks to the room through `postMessage`.
- `worker/` Cloudflare Worker that holds the Anthropic key, the prompts and the limits ($3/day global, 3 new games per IP per day).
- `src/flow.js` host logic: ask, evaluate, build (generate, headless test, repair, escalate to Sonnet 5.5), publish.
- Realtime layer: Firebase RTDB `myog-gzowo` (own project), rules in `rules/database.rules.json`.

## Run locally
```
echo "ANTHROPIC_API_KEY=your-key" > .env   # no .env = mock AI
node tools/dev-server.mjs 5190
```
Open http://localhost:5190 . Single player works offline; multiplayer and gallery use Firebase.

## Deploy the Worker (once)
```
cd worker
npx wrangler login
npx wrangler kv namespace create LIMITS     # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```
Then set `CFG.api` in `src/config.js` to the Worker URL and push the site (GitHub Pages).

## Tests
`tests/` has Playwright scripts (real API end-to-end: `node tests/e2e.mjs fruit|craft`, sandbox escape checks, UI screenshots).
