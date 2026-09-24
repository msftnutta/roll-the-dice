---
name: dice-game-engine
description: Use when changing the Roll the Dice Node.js game rules, balance, bets, dice generation, in-memory state, or HTTP API.
---

# Dice Game Engine

## Project structure

- `src/game.js` contains shared, deterministic rules: bet types, input validation, and payout settlement.
- `src/server/game-engine.js` owns the in-memory balance, one active bet, recent history, and server-side die generation.
- `src/server/http-server.js` serves the JSON API and production `dist/` files. Its API middleware is also mounted by Vite for development.
- `index.js` starts the production Node.js server.
- `tests/game.test.js`, `tests/game-engine.test.js`, and `tests/api.test.js` cover rules, state, and HTTP behavior.

## Invariants

- Store money as integer cents. Bet amounts from clients are whole coins; do not use floating-point values for balance arithmetic.
- A fresh server process starts with `INITIAL_BALANCE_CENTS` (100 coins). The balance, active bet, and history are in memory and reset on process restart.
- This is one shared single-player game state per server process. It is not yet isolated by user, persisted, or multiplayer.
- Validate bet type, prediction, integer amount, available balance, and die outcome on the server. Never accept a client-supplied dice result.
- `GameEngine` uses Node's `crypto.randomInt(1, 7)` by default. Keep the injectable roll function for deterministic tests.
- A player can have only one active bet. A bet is validated and reserved as pending; the balance changes when the roll settles.
- Exact-number wins return 5× the stake; high/low and even/odd wins return 1.8×. The returned payout includes the original stake. Losses deduct the stake.
- Keep history bounded in memory; the balance snapshot exposes the five most recent entries.

## API contract

- `GET /api/balance` returns `{ balanceCents, activeBet, history }`.
- `POST /api/bet` accepts a JSON object with `betType` (`exact`, `highLow`, or `parity`), `prediction`, and integer `betAmount`; success is HTTP 201.
- `POST /api/roll` settles the pending bet and returns the outcome, balance snapshot, win flag, payout/net cents, and history entry.
- Invalid input returns HTTP 400, unsupported content type returns 415, missing/duplicate active-bet operations return 409, and unknown API routes return 404. Preserve these behaviors and response shapes unless the API change is intentional.
- Continue bounding request bodies and returning explicit JSON errors. Use `GameError` for expected client errors; do not turn unexpected server faults into success-shaped responses.

## Change workflow

1. Put rule calculations in `src/game.js` and state transitions in `GameEngine`; keep HTTP parsing/response code in `http-server.js`.
2. If payout, bet types, response shapes, or history semantics change, update the corresponding tests and README.
3. Use an injected roll function in tests; never make game-rule tests depend on random outcomes.
4. Run `npm test` and `npm run build`.

Do not add persistence, accounts, multiplayer, or client-side settlement as part of an engine-only change unless explicitly requested.
