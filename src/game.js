export const INITIAL_BALANCE_CENTS = 10_000;
export const COIN_CENTS = 100;

export const BET_TYPES = {
  exact: {
    label: 'Exact number',
    multiplier: 5,
    values: [1, 2, 3, 4, 5, 6],
  },
  highLow: {
    label: 'High / low',
    multiplier: 1.8,
    values: ['Low', 'High'],
  },
  parity: {
    label: 'Even / odd',
    multiplier: 1.8,
    values: ['Even', 'Odd'],
  },
};

export function rollDie(random = Math.random) {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('The random source must return a number from 0 up to, but not including, 1.');
  }

  return Math.floor(sample * 6) + 1;
}

export function validateBet({ balanceCents, betAmount, betType, prediction }) {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) {
    throw new RangeError('Balance must be a non-negative amount in cents.');
  }

  if (!Number.isSafeInteger(betAmount) || betAmount < 1) {
    throw new RangeError('Enter a whole-number bet of at least 1 coin.');
  }

  const betCents = betAmount * COIN_CENTS;
  if (!Number.isSafeInteger(betCents) || betCents > balanceCents) {
    throw new RangeError('Your bet cannot be higher than your current balance.');
  }

  if (!Object.hasOwn(BET_TYPES, betType) || !BET_TYPES[betType].values.includes(prediction)) {
    throw new RangeError('Choose a valid prediction before rolling.');
  }

  return betCents;
}

export function settleBet({ balanceCents, betAmount, betType, prediction, outcome }) {
  const betCents = validateBet({ balanceCents, betAmount, betType, prediction });
  if (!Number.isInteger(outcome) || outcome < 1 || outcome > 6) {
    throw new RangeError('The dice outcome must be a number from 1 to 6.');
  }

  const won = betType === 'exact'
    ? outcome === prediction
    : betType === 'highLow'
      ? (prediction === 'High' ? outcome >= 4 : outcome <= 3)
      : (prediction === 'Even' ? outcome % 2 === 0 : outcome % 2 === 1);

  const payoutCents = won
    ? betAmount * (betType === 'exact' ? 500 : 180)
    : 0;
  const nextBalanceCents = balanceCents - betCents + payoutCents;
  if (!Number.isSafeInteger(nextBalanceCents)) {
    throw new RangeError('The resulting balance exceeds the supported range.');
  }

  return {
    balanceCents: nextBalanceCents,
    won,
    payoutCents,
    netCents: payoutCents - betCents,
  };
}
