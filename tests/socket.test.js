import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../src/server/http-server.js';
import { MAX_PLAYERS, ROUND_DURATION_MS } from '../src/server/socket-server.js';

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 3000);
    function listener(data) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(event, listener);
  });
}

function request(socket, event, payload = {}) {
  return socket.timeout(3000).emitWithAck(event, payload);
}

async function setup(t, roomOptions = {}) {
  const server = createGameServer({ serveStatic: false, roomOptions });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    await new Promise((resolve) => server.close(resolve));
  });
  return async () => {
    const socket = io(`http://127.0.0.1:${server.address().port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(socket);
    await nextEvent(socket, 'connect');
    return socket;
  };
}

const bet = { betType: 'exact', prediction: 6, betAmount: 10 };

test('rooms cap membership at four and broadcast joins, leaves, and shared deadlines', async (t) => {
  const connect = await setup(t);
  const players = await Promise.all(Array.from({ length: 5 }, connect));
  const first = await request(players[0], 'join_room', { roomId: 'Friends' });
  assert.equal(first.room.endsAt - first.room.serverNow <= ROUND_DURATION_MS, true);
  assert.equal(first.room.endsAt - first.room.serverNow > 9000, true);
  for (let i = 1; i < MAX_PLAYERS; i++) {
    const joined = nextEvent(players[0], 'player_joined');
    const result = await request(players[i], 'join_room', { roomId: 'friends' });
    assert.equal(result.ok, true);
    assert.equal(result.room.endsAt, first.room.endsAt);
    assert.equal(result.room.roundId, first.room.roundId);
    assert.equal(result.room.players.length, i + 1);
    assert.equal((await joined).playerId, players[i].id);
    assert.deepEqual(Object.keys(result.room.players[0]), ['id']);
  }
  assert.match((await request(players[4], 'join_room', { roomId: 'friends' })).error, /full/);
  const duplicate = await request(players[0], 'join_room', { roomId: 'friends' });
  assert.equal(duplicate.room.players.length, 4);
  const left = nextEvent(players[0], 'player_left');
  const leavingId = players[1].id;
  players[1].disconnect();
  assert.equal((await left).playerId, leavingId);
  assert.equal((await request(players[4], 'join_room', { roomId: 'friends' })).ok, true);
});

test('one server roll settles four independent balances and starts the next round', async (t) => {
  let rolls = 0;
  const connect = await setup(t, { roundDurationMs: 500, roll: () => { rolls++; return 6; } });
  const players = await Promise.all(Array.from({ length: 4 }, connect));
  let room;
  for (const player of players) {
    ({ room } = await request(player, 'join_room', { roomId: 'table' }));
  }
  for (let i = 0; i < 3; i++) {
    const choices = [
      bet,
      { betType: 'parity', prediction: 'Even', betAmount: 1 },
      { ...bet, prediction: 1 },
    ];
    assert.equal((await request(players[i], 'place_bet', { ...choices[i], roundId: room.roundId })).ok, true);
  }
  const results = players.map((player) => nextEvent(player, 'dice_rolled'));
  const balances = players.map((player) => nextEvent(player, 'balance_update'));
  const nextRound = nextEvent(players[0], 'room_state');
  const outcomes = await Promise.all(results);
  assert.equal(rolls, 1);
  for (const result of outcomes) {
    assert.deepEqual(result, { roomId: 'table', roundId: room.roundId, outcome: 6 });
  }
  const states = await Promise.all(balances);
  assert.deepEqual(states.map((state) => state.balanceCents), [14_000, 10_080, 9000, 10_000]);
  assert.deepEqual(states.map((state) => state.history.length), [1, 1, 1, 0]);
  assert.equal(states.every((state) => state.activeBet === null), true);
  const next = await nextRound;
  assert.notEqual(next.roundId, room.roundId);
  assert.equal((await request(players[0], 'place_bet', { ...bet, roundId: room.roundId })).ok, false);
  assert.equal((await request(players[0], 'place_bet', { ...bet, roundId: next.roundId })).ok, true);
});

test('room validation rejects malformed, duplicate, unaffordable, and late bets', async (t) => {
  let clock = 1000;
  const connect = await setup(t, { now: () => clock });
  const player = await connect();
  assert.equal((await request(player, 'place_bet', bet)).ok, false);
  for (const payload of [null, {}, { roomId: '../room' }, { roomId: 'a'.repeat(33) }, { roomId: 42 }]) {
    assert.equal((await request(player, 'join_room', payload)).ok, false);
  }
  const { room } = await request(player, 'join_room', { roomId: 'valid' });
  assert.equal((await request(player, 'join_room', { roomId: 'other' })).ok, false);
  for (const payload of [null, [], {}, { ...bet, betAmount: 101 }, { ...bet, prediction: 7 }, { ...bet, betAmount: 1.5 }]) {
    const data = payload && !Array.isArray(payload) ? { roundId: room.roundId, ...payload } : payload;
    assert.equal((await request(player, 'place_bet', data)).ok, false);
  }
  clock = room.endsAt;
  assert.match((await request(player, 'place_bet', { ...bet, roundId: room.roundId })).error, /closed/);
  clock = room.endsAt - 1;
  assert.equal((await request(player, 'place_bet', { ...bet, roundId: room.roundId })).ok, true);
  assert.equal((await request(player, 'place_bet', { ...bet, roundId: room.roundId })).ok, false);
  assert.match((await request(player, 'leave_room')).error, /settle/);
});

test('rooms isolate events, protect private bets, and clean up empty rooms', async (t) => {
  const connect = await setup(t, { roundDurationMs: 300, roll: () => 6 });
  const [player, peer, outsider] = await Promise.all([connect(), connect(), connect()]);
  const { room } = await request(player, 'join_room', { roomId: 'one' });
  await request(peer, 'join_room', { roomId: 'one' });
  await request(outsider, 'join_room', { roomId: 'two' });
  const privateUpdates = [];
  const outsideEvents = [];
  peer.on('balance_update', (data) => privateUpdates.push(data));
  for (const event of ['room_state', 'dice_rolled', 'player_joined', 'player_left']) {
    outsider.on(event, (data) => outsideEvents.push(data));
  }
  await request(player, 'place_bet', { ...bet, roundId: room.roundId });
  const updated = nextEvent(player, 'balance_update');
  await nextEvent(peer, 'dice_rolled');
  const settled = await updated;
  assert.equal(settled.balanceCents, 14_000);
  assert.equal(privateUpdates.every((state) => state.balanceCents === 10_000 && !state.activeBet && !state.history.length), true);
  const left = nextEvent(peer, 'player_left');
  assert.equal((await request(player, 'leave_room')).ok, true);
  assert.equal((await left).playerId, player.id);
  await request(peer, 'leave_room');
  const rejoined = await request(player, 'join_room', { roomId: 'one' });
  assert.notEqual(rejoined.room.roundId, room.roundId);
  assert.equal(rejoined.balanceCents, 14_000);
  assert.equal(rejoined.room.players.length, 1);
  assert.equal(outsideEvents.every((event) => event.roomId === 'two'), true);
});

test('rejecting a payout outside the safe integer range leaves the next bet available', async (t) => {
  const connect = await setup(t, { roundDurationMs: 80, roll: () => 6 });
  const player = await connect();
  let { room, balanceCents } = await request(player, 'join_room', { roomId: 'limits' });
  while (Number.isSafeInteger(balanceCents * 5)) {
    const result = await request(player, 'place_bet', { ...bet, betAmount: balanceCents / 100, roundId: room.roundId });
    assert.equal(result.ok, true);
    const settled = nextEvent(player, 'balance_update');
    const started = nextEvent(player, 'room_state');
    ({ balanceCents } = await settled);
    room = await started;
  }
  const rejected = await request(player, 'place_bet', { ...bet, betAmount: balanceCents / 100, roundId: room.roundId });
  assert.match(rejected.error, /supported range/);
  assert.equal((await request(player, 'place_bet', { ...bet, betAmount: 1, roundId: room.roundId })).ok, true);
});
