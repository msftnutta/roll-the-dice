# Roll the Dice

A single-player dice game with 100 virtual coins to start. Choose an exact number, high/low, or even/odd prediction; place a whole-coin bet; and roll the animated 3D die. Your balance is saved in this browser.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To run the production version:

```bash
npm run build
npm start
```

The Node.js server listens on port `3000` by default. Set `PORT` to use another port.

## Game rules

- Each new browser profile starts with 100 virtual coins.
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