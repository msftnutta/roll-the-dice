import { randomInt, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { GameEngine, GameError } from './game-engine.js';

export const MAX_PLAYERS = 4;
export const ROUND_DURATION_MS = 10_000;

export function attachRoomServer(httpServer, {
  roundDurationMs = ROUND_DURATION_MS,
  roll = () => randomInt(1, 7),
  now = Date.now,
} = {}) {
  const io = new Server(httpServer, { maxHttpBufferSize: 8 * 1024 });
  const rooms = new Map();

  function snapshot(room) {
    return {
      roomId: room.id,
      players: [...room.players.keys()].map((id) => ({ id })),
      roundId: room.roundId,
      endsAt: room.endsAt,
      serverNow: now(),
    };
  }

  function broadcastState(room) {
    io.to(room.channel).emit('room_state', snapshot(room));
  }

  function startRound(room) {
    room.roundId = randomUUID();
    room.endsAt = now() + roundDurationMs;
    broadcastState(room);
    scheduleTick(room);
  }

  function scheduleTick(room) {
    room.timer = setTimeout(() => {
      if (now() < room.endsAt) {
        broadcastState(room);
        scheduleTick(room);
        return;
      }

      room.outcome = roll();
      if (!Number.isInteger(room.outcome) || room.outcome < 1 || room.outcome > 6) {
        throw new Error('The server random source returned an invalid dice outcome.');
      }
      io.to(room.channel).emit('dice_rolled', {
        roomId: room.id,
        roundId: room.roundId,
        outcome: room.outcome,
      });
      for (const player of room.players.values()) {
        const result = player.game.activeBet ? player.game.roll() : player.game.getSnapshot();
        player.socket.emit('balance_update', { ...result, roundId: room.roundId });
      }
      startRound(room);
    }, Math.min(1000, Math.max(0, room.endsAt - now())));
    room.timer.unref();
  }

  function removePlayer(player) {
    const room = player.room;
    if (!room) return;
    room.players.delete(player.socket.id);
    player.socket.leave(room.channel);
    player.room = null;
    io.to(room.channel).emit('player_left', { playerId: player.socket.id, roomId: room.id });
    if (room.players.size === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.id);
    } else {
      broadcastState(room);
    }
  }

  io.on('connection', (socket) => {
    const player = { socket, room: null };
    player.game = new GameEngine({ roll: () => player.room.outcome });

    function handle(event, action) {
      socket.on(event, (payload, acknowledge) => {
        try {
          const data = action(payload);
          if (typeof acknowledge === 'function') acknowledge({ ok: true, ...data });
        } catch (error) {
          if (!(error instanceof GameError)) {
            console.error('The multiplayer request failed.', error);
          }
          const response = { ok: false, error: error instanceof GameError ? error.message : 'The request could not be completed.' };
          if (typeof acknowledge === 'function') acknowledge(response);
        }
      });
    }

    handle('join_room', (payload) => {
      if (!payload || typeof payload.roomId !== 'string' || !/^[a-zA-Z0-9-]{1,32}$/.test(payload.roomId)) {
        throw new GameError('Use a room code of 1–32 letters, numbers, or hyphens.');
      }
      const id = payload.roomId.toLowerCase();
      if (player.room) {
        if (player.room.id === id) return { room: snapshot(player.room), ...player.game.getSnapshot() };
        throw new GameError('Leave your current room before joining another.');
      }
      let room = rooms.get(id);
      if (room?.players.size >= MAX_PLAYERS) throw new GameError('This room is full (maximum 4 players).');
      if (!room) {
        room = { id, channel: `game:${id}`, players: new Map() };
        rooms.set(id, room);
      }
      player.room = room;
      room.players.set(socket.id, player);
      socket.join(room.channel);
      io.to(room.channel).emit('player_joined', { playerId: socket.id, roomId: id });
      if (room.players.size === 1) startRound(room);
      else broadcastState(room);
      socket.emit('balance_update', player.game.getSnapshot());
      return { room: snapshot(room), ...player.game.getSnapshot() };
    });

    handle('leave_room', () => {
      if (player.game.activeBet) throw new GameError('Wait for your active bet to settle before leaving.');
      removePlayer(player);
      return {};
    });

    handle('place_bet', (payload) => {
      const room = player.room;
      if (!room) throw new GameError('Join a room before placing a bet.');
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new GameError('Provide a valid bet.');
      }
      if (payload.roundId !== room.roundId || now() >= room.endsAt) {
        throw new GameError('Betting for that round has closed.');
      }
      const state = player.game.placeBet(payload);
      const { betAmount, betCents, betType } = state.activeBet;
      const maximumBalance = state.balanceCents - betCents + betAmount * (betType === 'exact' ? 500 : 180);
      if (!Number.isSafeInteger(maximumBalance)) {
        player.game.activeBet = null;
        throw new GameError('The resulting balance exceeds the supported range.');
      }
      socket.emit('balance_update', state);
      return state;
    });

    socket.on('disconnect', () => removePlayer(player));
  });

  httpServer.on('close', () => {
    for (const room of rooms.values()) clearTimeout(room.timer);
    rooms.clear();
  });
  return io;
}
