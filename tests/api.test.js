import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server/http-server.js';
import { GameEngine } from '../src/server/game-engine.js';

async function withServer(game, run) {
  const server = createGameServer({ game, serveStatic: false });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function postJson(baseUrl, path, payload) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('GET /api/balance returns the initial balance, active bet, and history', async () => {
  await withServer(new GameEngine(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/balance`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      balanceCents: 10_000,
      activeBet: null,
      history: [],
    });
  });
});

test('POST /api/bet and POST /api/roll settle a bet using a server roll', async () => {
  await withServer(new GameEngine({ roll: () => 5 }), async (baseUrl) => {
    const betResponse = await postJson(baseUrl, '/api/bet', {
      betType: 'highLow',
      prediction: 'High',
      betAmount: 10,
    });
    assert.equal(betResponse.status, 201);
    assert.equal((await betResponse.json()).activeBet.prediction, 'High');

    const rollResponse = await postJson(baseUrl, '/api/roll', {});
    assert.equal(rollResponse.status, 200);
    const result = await rollResponse.json();
    assert.equal(result.outcome, 5);
    assert.equal(result.won, true);
    assert.equal(result.balanceCents, 10_800);
    assert.equal(result.activeBet, null);
    assert.equal(result.history[0].outcome, 5);
  });
});

test('bet endpoint reports validation and active-bet conflicts', async () => {
  await withServer(new GameEngine(), async (baseUrl) => {
    const invalidBet = await postJson(baseUrl, '/api/bet', {
      betType: 'exact',
      prediction: 1,
      betAmount: 101,
    });
    assert.equal(invalidBet.status, 400);
    assert.match((await invalidBet.json()).error, /higher than your current balance/);

    const validBet = await postJson(baseUrl, '/api/bet', {
      betType: 'exact',
      prediction: 1,
      betAmount: 1,
    });
    assert.equal(validBet.status, 201);

    const duplicateBet = await postJson(baseUrl, '/api/bet', {
      betType: 'exact',
      prediction: 2,
      betAmount: 1,
    });
    assert.equal(duplicateBet.status, 409);
  });
});

test('roll and request payload errors are returned as JSON errors', async () => {
  await withServer(new GameEngine(), async (baseUrl) => {
    const emptyRoll = await postJson(baseUrl, '/api/roll', {});
    assert.equal(emptyRoll.status, 409);

    const malformedBet = await fetch(`${baseUrl}/api/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformedBet.status, 400);

    const wrongType = await fetch(`${baseUrl}/api/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'bet',
    });
    assert.equal(wrongType.status, 415);

    const wrongMethod = await fetch(`${baseUrl}/api/balance`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
  });
});
