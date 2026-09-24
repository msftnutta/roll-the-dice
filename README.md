# Roll the Dice

A multiplayer dice game for up to four players per room, with 100 virtual coins per player. Share a room code, choose an exact number, high/low, or even/odd prediction, and place a whole-coin bet during the shared 10-second countdown. The server rolls one die for everyone at round end and privately updates each player's balance. The light/dark theme selection is saved in this browser.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Vite also serves the game API and Socket.IO during development. To run the production version:

```bash
npm run build
npm start
```

The Node.js production server listens on port `3000` by default. Set `PORT` to use another port.

## Multiplayer rooms

Enter the same room code in up to four browser tabs or devices and select **Join room**. Codes contain 1–32 letters, numbers, or hyphens and are case-insensitive. A fifth player is rejected without affecting the room. Each connected tab is a separate player.

- The first player starts the room's countdown. Joining later does not restart it.
- Each player may place one bet per round; players who skip betting still see the roll and keep their balance.
- The server rejects stale round IDs and bets received at or after the deadline. Players cannot trigger a roll early.
- The next 10-second round begins automatically after settlement.
- Joining and leaving are announced to the room. **Leave room** is unavailable while a bet is pending. Disconnects immediately free a seat; empty rooms and their timers are removed.
- Credits and history belong to the connection and survive leaving/rejoining rooms on that connection. Refreshing, disconnecting, or restarting the server discards that player's state, including pending bets. Reconnect and join again to start with 100 coins.
- This is an in-memory, single-server game with virtual credits, not authenticated accounts, persistent storage, or multi-server room synchronization.

### Socket.IO protocol

Socket.IO uses the same origin and HTTP server as the app, at the default `/socket.io` path. The server identifies players by their socket connection, never by a client-supplied player ID.

Client events accept a payload and an acknowledgement callback. Success returns `{ ok: true, ... }`; rejection returns `{ ok: false, error }`.

| Client event | Payload | Success response |
| --- | --- | --- |
| `join_room` | `{ roomId }` | `{ room, balanceCents, activeBet, history }` |
| `leave_room` | `{}` | No additional fields |
| `place_bet` | `{ roundId, betType, prediction, betAmount }` | `{ balanceCents, activeBet, history }` |

| Server event | Audience and payload |
| --- | --- |
| `room_state` | Room members: `{ roomId, players: [{ id }], roundId, endsAt, serverNow }`, on membership changes and each countdown tick |
| `player_joined` / `player_left` | Room members: `{ roomId, playerId }` |
| `dice_rolled` | Room members: `{ roomId, roundId, outcome }`, once per round |
| `balance_update` | Only the respective player: `{ balanceCents, activeBet, history }`; settlement also includes `roundId` and, for bettors, `outcome`, `won`, `payoutCents`, `netCents`, and `historyEntry` |

Timestamps are server epoch milliseconds; clients use `endsAt - serverNow` for the countdown without relying on matching system clocks. Balances, bets, and personal history are never broadcast to other players.

## Legacy single-player Game API

- `GET /api/balance` returns the current balance in cents, active bet, and the five most recent rolls.
- `POST /api/bet` accepts JSON with `betType` (`exact`, `highLow`, or `parity`), `prediction`, and whole-coin `betAmount`.
- `POST /api/roll` rolls the server-side die, settles the active bet, updates the balance, and returns the result.

These endpoints retain the original shared single-player engine for compatibility. They do not access multiplayer players or rooms, and `/api/roll` cannot settle a room early. This separate state resets when the server restarts.

## Game rules

- Each new multiplayer connection starts with 100 virtual coins.
- Exact-number predictions pay 5× the bet when correct.
- High/low (1–3 / 4–6) and even/odd predictions pay 1.8×.
- A winning payout includes the original bet; a losing bet is deducted.
- Bets must be whole coins and cannot exceed the current balance.
- Category payouts are tracked to the nearest hundredth of a coin so 1.8× returns remain exact.
- Credits have no cash value.

## Test

```bash
npm test
```