# Roll the Dice

A single-player dice game with 100 virtual coins to start. Choose an exact number, high/low, or even/odd prediction; place a whole-coin bet; and roll the animated 3D die. The Node.js game engine owns the balance and active bet in memory for the lifetime of the server process. The light/dark theme selection is saved in this browser.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Vite also serves the game API during development. To run the production version:

```bash
npm run build
npm start
```

The Node.js production server listens on port `3000` by default. Set `PORT` to use another port.

## Game API

- `GET /api/balance` returns the current balance in cents, active bet, and the five most recent rolls.
- `POST /api/bet` accepts JSON with `betType` (`exact`, `highLow`, or `parity`), `prediction`, and whole-coin `betAmount`.
- `POST /api/roll` rolls the server-side die, settles the active bet, updates the balance, and returns the result.

Only one active bet can be pending at a time. The game state resets when the Node.js server restarts; this is intentionally an in-memory Phase 1 engine, not multi-player or persistent storage.

## Game rules

- Each newly started game-server process starts with 100 virtual coins.
- Exact-number predictions pay 5× the bet when correct.
- High/low (1–3 / 4–6) and even/odd predictions pay 1.8×.
- A winning payout includes the original bet; a losing bet is deducted.
- Bets must be whole coins and cannot exceed the current balance.
- Category payouts are tracked to the nearest hundredth of a coin so 1.8× returns remain exact.
- Credits have no cash value. Multiplayer is not part of this single-player version.

## Test

```bash
npm test
```