import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_TYPES, INITIAL_BALANCE_CENTS, rollDie, settleBet } from '../src/game.js';

test('a new player starts with 100 coins', () => {
  assert.equal(INITIAL_BALANCE_CENTS, 10_000);
});

test('rollDie maps the random range to outcomes one through six', () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.5), 4);
  assert.equal(rollDie(() => 0.999999), 6);
});

test('rollDie rejects values outside the random source range', () => {
  assert.throws(() => rollDie(() => 1), RangeError);
  assert.throws(() => rollDie(() => -0.1), RangeError);
});

test('an exact-number win returns five times the bet including the stake', () => {
  const result = settleBet({
    balanceCents: 10_000,
    betAmount: 10,
    betType: 'exact',
    prediction: 4,
    outcome: 4,
  });

  assert.deepEqual(result, {
    balanceCents: 14_000,
    won: true,
    payoutCents: 5_000,
    netCents: 4_000,
  });
});

test('an exact-number loss permanently deducts the bet', () => {
  const result = settleBet({
    balanceCents: 10_000,
    betAmount: 10,
    betType: 'exact',
    prediction: 4,
    outcome: 3,
  });

  assert.deepEqual(result, {
    balanceCents: 9_000,
    won: false,
    payoutCents: 0,
    netCents: -1_000,
  });
});

test('high/low category bets pay 1.8 times the bet', () => {
  const highWin = settleBet({
    balanceCents: 10_000,
    betAmount: 10,
    betType: 'highLow',
    prediction: 'High',
    outcome: 4,
  });
  const lowWin = settleBet({
    balanceCents: 10_000,
    betAmount: 10,
    betType: 'highLow',
    prediction: 'Low',
    outcome: 3,
  });

  assert.equal(highWin.payoutCents, 1_800);
  assert.equal(highWin.balanceCents, 10_800);
  assert.equal(lowWin.won, true);
});

test('even/odd category bets settle the selected parity', () => {
  const evenWin = settleBet({
    balanceCents: 10_000,
    betAmount: 5,
    betType: 'parity',
    prediction: 'Even',
    outcome: 6,
  });
  const oddLoss = settleBet({
    balanceCents: 10_000,
    betAmount: 5,
    betType: 'parity',
    prediction: 'Odd',
    outcome: 2,
  });

  assert.equal(evenWin.balanceCents, 10_400);
  assert.equal(oddLoss.balanceCents, 9_500);
  assert.equal(BET_TYPES.parity.multiplier, 1.8);
});

test('category payouts retain fractional coins precisely in cents', () => {
  const result = settleBet({
    balanceCents: 10_000,
    betAmount: 3,
    betType: 'highLow',
    prediction: 'High',
    outcome: 6,
  });

  assert.equal(result.payoutCents, 540);
  assert.equal(result.balanceCents, 10_240);
  assert.equal(result.netCents, 240);
});

test('bets above the available balance are rejected', () => {
  assert.throws(() => settleBet({
    balanceCents: 999,
    betAmount: 10,
    betType: 'exact',
    prediction: 1,
    outcome: 1,
  }), /higher than your current balance/);
});

test('balances that exceed the supported integer range are rejected', () => {
  assert.throws(() => settleBet({
    balanceCents: Number.MAX_SAFE_INTEGER,
    betAmount: Math.floor(Number.MAX_SAFE_INTEGER / 100),
    betType: 'exact',
    prediction: 1,
    outcome: 1,
  }), /supported range/);
});

test('invalid amounts, bet types, predictions, and outcomes are rejected', () => {
  const baseBet = {
    balanceCents: 10_000,
    betAmount: 1,
    betType: 'exact',
    prediction: 1,
    outcome: 1,
  };

  assert.throws(() => settleBet({ ...baseBet, betAmount: 0 }), /whole-number bet/);
  assert.throws(() => settleBet({ ...baseBet, betAmount: 1.5 }), /whole-number bet/);
  assert.throws(() => settleBet({ ...baseBet, betType: 'unknown' }), /valid prediction/);
  assert.throws(() => settleBet({ ...baseBet, prediction: 7 }), /valid prediction/);
  assert.throws(() => settleBet({ ...baseBet, outcome: 0 }), /outcome/);
});
