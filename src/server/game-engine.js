import { randomInt, randomUUID } from 'node:crypto';
import { INITIAL_BALANCE_CENTS, settleBet, validateBet } from '../game.js';

const HISTORY_LIMIT = 50;

export class GameError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'GameError';
    this.statusCode = statusCode;
  }
}

export class GameEngine {
  constructor({ initialBalanceCents = INITIAL_BALANCE_CENTS, roll = () => randomInt(1, 7) } = {}) {
    if (!Number.isSafeInteger(initialBalanceCents) || initialBalanceCents < 0) {
      throw new RangeError('Initial balance must be a non-negative amount in cents.');
    }
    this.balanceCents = initialBalanceCents;
    this.activeBet = null;
    this.history = [];
    this.rollDie = roll;
  }

  getSnapshot() {
    return {
      balanceCents: this.balanceCents,
      activeBet: this.activeBet ? { ...this.activeBet } : null,
      history: this.history.slice(0, 5).map((entry) => ({ ...entry })),
    };
  }

  placeBet({ betType, prediction, betAmount }) {
    if (this.activeBet) {
      throw new GameError('You already have an active bet. Roll it before placing another.', 409);
    }

    let betCents;
    try {
      betCents = validateBet({
        balanceCents: this.balanceCents,
        betAmount,
        betType,
        prediction,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new GameError(error.message);
      }
      throw error;
    }

    this.activeBet = { betType, prediction, betAmount, betCents };
    return this.getSnapshot();
  }

  roll() {
    if (!this.activeBet) {
      throw new GameError('Place a bet before rolling the dice.', 409);
    }

    const outcome = this.rollDie();
    if (!Number.isInteger(outcome) || outcome < 1 || outcome > 6) {
      throw new Error('The server random source returned an invalid dice outcome.');
    }

    const activeBet = this.activeBet;
    const result = settleBet({
      balanceCents: this.balanceCents,
      betAmount: activeBet.betAmount,
      betType: activeBet.betType,
      prediction: activeBet.prediction,
      outcome,
    });
    this.balanceCents = result.balanceCents;
    this.activeBet = null;

    const historyEntry = {
      id: randomUUID(),
      outcome,
      betAmount: activeBet.betAmount,
      betType: activeBet.betType,
      prediction: activeBet.prediction,
      won: result.won,
      payoutCents: result.payoutCents,
      netCents: result.netCents,
    };
    this.history.unshift(historyEntry);
    this.history.length = Math.min(this.history.length, HISTORY_LIMIT);

    return {
      ...this.getSnapshot(),
      outcome,
      won: result.won,
      payoutCents: result.payoutCents,
      netCents: result.netCents,
      historyEntry: { ...historyEntry },
    };
  }
}
