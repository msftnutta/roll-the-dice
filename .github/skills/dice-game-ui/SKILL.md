---
name: dice-game-ui
description: Use when changing the Roll the Dice React/MUI interface, its responsive layout, theme selection, accessibility, or UI-to-game-API integration.
---

# Dice Game Web UI

## Project structure

- `src/main.jsx` contains the React application, MUI theme, dice presentation, bet controls, and API calls.
- `src/styles.css` contains the visual system, light/dark theme overrides, responsive breakpoints, and reduced-motion styles.
- `src/game.js` exports shared bet labels and values for display; authoritative validation and settlement remain server-side.
- `vite.config.js` mounts the in-memory game API middleware for `npm run dev`.
- `tests/` contains the Node.js game-rule, engine, and API tests.

## UI and state rules

- Use the server API as the source of truth for balance, active bet, dice outcome, and history. Load the initial snapshot from `GET /api/balance`; submit bets to `POST /api/bet` and trigger outcomes through `POST /api/roll`.
- Do not generate outcomes, settle wagers, or persist credits in browser storage. Game state is intentionally in memory on the server and resets when that process restarts.
- Keep cents in API state. Convert cents to displayed coins with the existing formatting helper; submit whole-coin wager amounts.
- The `localStorage` theme key (`roll-the-dice:theme:v1`) is only for the user's light/dark preference. Coordinate the MUI palette with the `data-theme` styles in `src/styles.css`.
- Preserve exact-number and high/low/even/odd choices, payout previews, active-bet locking, visible errors, and the recent-roll recap when changing the interface.
- Keep interactive controls labelled, expose roll status and outcomes to assistive technology, retain keyboard-operable MUI controls, and respect `prefers-reduced-motion`.
- Maintain the mobile-first layout and existing responsive breakpoints. Keep styles in `src/styles.css` and follow its existing class naming and MUI selector conventions.

## Change workflow

1. Keep UI presentation separate from game settlement. Update the API client and server contract together if response shapes change.
2. Check both light and dark themes and narrow-screen overflow when modifying layout, controls, or colors.
3. Run `npm test` and `npm run build`; exercise the affected interaction in the browser when practical.
4. Update `README.md` for changed run instructions or user-visible game behavior.

Do not add multiplayer UI, client-side authority, or new state-management dependencies unless explicitly requested.
