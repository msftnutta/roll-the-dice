import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, GameError } from '../src/server/game-engine.js';

test('a new game starts with 100 coins and empty in-memory state', () => {
  const game = new GameEngine();
  assert.deepEqual(game.getSnapshot(), {
    balanceCents: 10_000,
    activeBet: null,
    history: [],
  });
});

test('a bet is validated and recorded as active until the roll', () => {
  const game = new GameEngine();
  const snapshot = game.placeBet({ betType: 'exact', betAmount: 10, prediction: 4 });

  assert.equal(snapshot.balanceCents, 10_000);
  assert.deepEqual(snapshot.activeBet, {
    betType: 'exact',
    prediction: 4,
    betAmount: 10,
    betCents: 1_000,
  });
});

test('only one active bet is allowed', () => {
  const game = new GameEngine();
  game.placeBet({ betType: 'exact', betAmount: 10, prediction: 4 });

  assert.throws(
    () => game.placeBet({ betType: 'exact', betAmount: 5, prediction: 2 }),
    (error) => error instanceof GameError && error.statusCode === 409,
  );
});

test('a server-side exact win updates balance and appends history', () => {
  const game = new GameEngine({ roll: () => 4 });
  game.placeBet({ betType: 'exact', betAmount: 10, prediction: 4 });
  const result = game.roll();

  assert.equal(result.outcome, 4);
  assert.equal(result.won, true);
  assert.equal(result.balanceCents, 14_000);
  assert.equal(result.payoutCents, 5_000);
  assert.equal(result.netCents, 4_000);
  assert.equal(result.activeBet, null);
  assert.equal(result.history[0].outcome, 4);
});

test('a losing category bet deducts its stake and clears the active bet', () => {
  const game = new GameEngine({ roll: () => 6 });
  game.placeBet({ betType: 'parity', betAmount: 10, prediction: 'Odd' });
  const result = game.roll();

  assert.equal(result.won, false);
  assert.equal(result.balanceCents, 9_000);
  assert.equal(result.payoutCents, 0);
  assert.equal(result.historyEntry.netCents, -1_000);
  assert.equal(result.activeBet, null);
});

test('roll is rejected when there is no active bet', () => {
  const game = new GameEngine();
  assert.throws(() => game.roll(), (error) => error.statusCode === 409);
});

test('the random source must return a valid die outcome', () => {
  const game = new GameEngine({ roll: () => 7 });
  game.placeBet({ betType: 'exact', betAmount: 1, prediction: 1 });
  assert.throws(() => game.roll(), /invalid dice outcome/);
  assert.notEqual(game.getSnapshot().activeBet, null);
});

test('game history is retained in memory and snapshots return the five latest rolls', () => {
  let outcome = 1;
  const game = new GameEngine({ roll: () => outcome });
  for (let turn = 0; turn < 7; turn += 1) {
    game.placeBet({ betType: 'exact', betAmount: 1, prediction: outcome });
    game.roll();
    outcome = outcome === 6 ? 1 : outcome + 1;
  }

  assert.equal(game.history.length, 7);
  assert.equal(game.getSnapshot().history.length, 5);
});
