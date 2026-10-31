import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { createGameServer, publicSnapshot, shuffle, chooseDealer } from './server';
import { createDeck, type Seat } from '@marble/engine';
import type {
  ClientEvents,
  Command,
  PrivateHand,
  Reply,
  RoomSnapshot,
  ServerEvents,
} from '@marble/shared';
type Client = Socket<ServerEvents, ClientEvents>;
interface Peer {
  socket: Client;
  room: RoomSnapshot | null;
  hand: PrivateHand | null;
  token: string;
  id: string;
}
let service: ReturnType<typeof createGameServer>;
let url: string;
let now: number;
const peers: Peer[] = [];
async function peer(token = ''): Promise<Peer> {
  const socket: Client = io(url, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  const p: Peer = { socket, room: null, hand: null, token: '', id: '' };
  peers.push(p);
  socket.on('roomSnapshot', (r) => {
    p.room = r;
  });
  socket.on('privateHand', (h) => {
    p.hand = h;
  });
  await new Promise<void>((resolve, reject) => {
    socket.on('session', (s) => {
      p.token = s.token;
      p.id = s.playerId;
      resolve();
    });
    socket.on('connect_error', reject);
    socket.connect();
  });
  return p;
}
async function send(p: Peer, c: Command): Promise<Reply> {
  return p.socket.timeout(5000).emitWithAck('command', c);
}
function meta(p: Peer) {
  return { expectedVersion: p.room!.version, clientActionId: randomUUID() };
}
async function refresh(p: Peer) {
  await send(p, { type: 'requestSnapshot' });
}
async function table(count = 2) {
  const a = await peer();
  expect((await send(a, { type: 'createRoom', name: 'Alex', seat: 0 })).ok).toBe(true);
  const all = [a];
  for (let i = 1; i < count; i++) {
    const p = await peer();
    expect(
      (
        await send(p, {
          type: 'joinRoom',
          name: 'Alex',
          seat: (count === 2 ? 2 : i) as Seat,
          code: a.room!.code,
        })
      ).ok,
    ).toBe(true);
    all.push(p);
  }
  for (const p of all) {
    await refresh(p);
    expect((await send(p, { type: 'setReady', ready: true, ...meta(p) })).ok).toBe(true);
  }
  await refresh(a);
  expect((await send(a, { type: 'startGame', ...meta(a) })).ok).toBe(true);
  for (const p of all) await refresh(p);
  return all;
}
beforeEach(async () => {
  now = 1_000_000;
  service = createGameServer({
    now: () => now,
    shuffle: (cards) => cards,
    disconnectGraceMs: 90_000,
    roomTtlMs: 1800_000,
  });
  await new Promise<void>((resolve) => service.http.listen(0, '127.0.0.1', resolve));
  const address = service.http.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  url = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  for (const p of peers.splice(0)) p.socket.disconnect();
  await service.close();
});
describe('server authority, privacy and room lifecycle', () => {
  it.each([2, 3, 4])('starts a %i-player room with distinct private hands', async (count) => {
    const all = await table(count);
    const g = service.rooms.values().next().value!.game!;
    expect(all[0]!.room!.phase).toBe('playing');
    for (const p of all) {
      expect(p.hand!.cards).toHaveLength(5);
      const serialized = JSON.stringify(p.room);
      expect(serialized).not.toContain('"hands"');
      expect(serialized).not.toContain('"deck":');
      for (const other of all.filter((x) => x !== p))
        for (const c of other.hand!.cards)
          expect(p.hand!.cards.map((c) => c.id)).not.toContain(c.id);
    }
    expect(g.deck.length).toBe(52 - 5 * count);
  });
  it('validates memberships, seats, host permissions and strict payloads', async () => {
    const a = await peer(),
      b = await peer();
    expect(
      (await send(b, { type: 'startGame', expectedVersion: 0, clientActionId: randomUUID() })).ok,
    ).toBe(false);
    await send(a, { type: 'createRoom', name: 'Alex', seat: 0 });
    expect((await send(b, { type: 'joinRoom', name: 'B', seat: 0, code: a.room!.code })).ok).toBe(
      false,
    );
    await send(b, { type: 'joinRoom', name: 'B', seat: 2, code: a.room!.code });
    expect(
      (await send(b, { type: 'configureRoom', options: b.room!.options, ...meta(b) })).ok,
    ).toBe(false);
    const malformed = {
      type: 'playCard',
      seat: 0,
      action: { kind: 'discardHand' },
      ...meta(b),
    } as unknown as Command;
    expect((await send(b, malformed)).error).toBe('Invalid command payload.');
  });
  it('rejects stale and out-of-turn actions and deduplicates accepted actions', async () => {
    const all = await table();
    const actor = all.find((p) => p.hand!.legal.length)!;
    const other = all.find((p) => p !== actor)!;
    const r = service.rooms.values().next().value!;
    const before = JSON.stringify(r.game);
    const action = actor.hand!.legal[0]!.action;
    expect((await send(other, { type: 'playCard', action, ...meta(other) })).ok).toBe(false);
    expect(JSON.stringify(r.game)).toBe(before);
    expect(
      (await send(actor, { type: 'playCard', action, ...meta(actor), expectedVersion: 0 })).ok,
    ).toBe(false);
    const command: Command = { type: 'playCard', action, ...meta(actor) };
    const first = await send(actor, command);
    expect(first.ok).toBe(true);
    const version = r.version;
    const state = JSON.stringify(r.game);
    expect(await send(actor, command)).toEqual(first);
    expect(r.version).toBe(version);
    expect(JSON.stringify(r.game)).toBe(state);
    expect((await send(actor, { ...command, action: { kind: 'discardHand' } })).ok).toBe(false);
  });
  it('serializes concurrent actions and increments state once', async () => {
    const all = await table();
    const p = all.find((p) => p.hand!.legal.length)!;
    const command: Command = { type: 'playCard', action: p.hand!.legal[0]!.action, ...meta(p) };
    const version = p.room!.version;
    const results = await Promise.all([
      send(p, command),
      send(p, { ...command, clientActionId: randomUUID() }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(service.rooms.values().next().value!.version).toBe(version + 1);
  });
  it('pauses, restores identity and delivers only the reconnecting hand', async () => {
    const [a, b] = await table();
    const cards = b!.hand!.cards;
    const token = b!.token;
    const id = b!.id;
    b!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await refresh(a!);
    expect(a!.room!.paused).toBe(true);
    expect(
      (await send(a!, { type: 'playCard', action: { kind: 'discardHand' }, ...meta(a!) })).ok,
    ).toBe(false);
    const back = await peer(token);
    await refresh(back);
    expect(back.id).toBe(id);
    expect(back.hand!.cards).toEqual(cards);
    expect(back.room!.paused).toBe(false);
    expect(back.room!.players).toHaveLength(2);
  });
  it('keeps the match active while another tab of the identity stays connected', async () => {
    const [a] = await table();
    const second = await peer(a!.token);
    a!.socket.disconnect();
    await refresh(second);
    expect(second.room!.paused).toBe(false);
  });
  it('transfers host, enforces grace, and supports rematch', async () => {
    const [a, b] = await table();
    a!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await refresh(b!);
    expect(b!.room!.hostId).toBe(b!.id);
    expect((await send(b!, { type: 'endMatch', ...meta(b!) })).ok).toBe(false);
    now += 90_001;
    expect((await send(b!, { type: 'endMatch', ...meta(b!) })).ok).toBe(true);
    expect(b!.room!.game!.winner).toBeNull();
    expect((await send(b!, { type: 'rematch', ...meta(b!) })).ok).toBe(true);
    expect(b!.room!.phase).toBe('lobby');
    expect(b!.hand!.cards).toEqual([]);
  });
  it('expires empty rooms and rejects tampered sessions', async () => {
    const [a, b] = await table();
    a!.socket.disconnect();
    b!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    now += 1800_001;
    service.sweep();
    expect(service.rooms.size).toBe(0);
    await expect(peer(a!.token.slice(0, -1) + 'x')).rejects.toThrow('Session expired');
  });
  it('projects only public game fields', async () => {
    await table();
    const room = service.rooms.values().next().value!;
    const snapshot = publicSnapshot(room);
    expect(Object.keys(snapshot.game!)).not.toContain('hands');
    expect(Object.keys(snapshot.game!)).not.toContain('deck');
    expect(snapshot.game!.topDiscard).toBeNull();
  });
  it('provides a health check', async () =>
    expect(await (await fetch(url + '/health')).json()).toEqual({ ok: true }));
});
describe('secure setup', () => {
  it('shuffles without losing cards or mutating its input', () => {
    const cards = createDeck();
    expect(
      shuffle(cards)
        .map((c) => c.id)
        .sort(),
    ).toEqual(cards.map((c) => c.id).sort());
    expect(cards).toEqual(createDeck());
  });
  it('draws Ace low and redraws only tied players', () => {
    let draw = 0;
    const mixed = (cards: ReturnType<typeof createDeck>) => {
      draw++;
      const ids = draw === 1 ? ['0-2', '1-2', '2-9'] : ['0-5', '1-1'];
      return [
        ...ids.map((id) => cards.find((c) => c.id === id)!),
        ...cards.filter((c) => !ids.includes(c.id)),
      ];
    };
    expect(chooseDealer([0, 1, 2], mixed)).toBe(1);
    expect(draw).toBe(2);
  });
});

describe('table reset consensus', () => {
  async function request(p: Peer) {
    await refresh(p);
    expect((await send(p, { type: 'requestReset', ...meta(p) })).ok).toBe(true);
    return p.room!.resetRequest!;
  }
  async function vote(p: Peer, approve: boolean, requestId: string) {
    await refresh(p);
    return send(p, { type: 'respondReset', requestId, approve, ...meta(p) });
  }
  it('blocks joins, readiness, rules changes and leaving a lobby while reset is pending', async () => {
    const a = await peer(),
      b = await peer(),
      outsider = await peer();
    await send(a, { type: 'createRoom', name: 'A', seat: 0 });
    await send(b, { type: 'joinRoom', name: 'B', seat: 2, code: a.room!.code });
    await request(a);
    await refresh(b);
    expect(
      (await send(outsider, { type: 'joinRoom', name: 'C', seat: 1, code: a.room!.code })).ok,
    ).toBe(false);
    expect((await send(b, { type: 'setReady', ready: true, ...meta(b) })).ok).toBe(false);
    expect(
      (await send(a, { type: 'configureRoom', options: a.room!.options, ...meta(a) })).ok,
    ).toBe(false);
    expect((await send(b, { type: 'leaveRoom', ...meta(b) })).ok).toBe(false);
    expect(service.rooms.values().next().value!.players).toHaveLength(2);
  });
  it('an accepted request receipt cannot reset a subsequent match when replayed', async () => {
    const [a, b] = await table();
    await refresh(a!);
    const command: Command = { type: 'requestReset', ...meta(a!) };
    const accepted = await send(a!, command);
    const reset = a!.room!.resetRequest!;
    await vote(b!, true, reset.id);
    for (const player of [a!, b!]) {
      await refresh(player);
      await send(player, { type: 'setReady', ready: true, ...meta(player) });
    }
    await refresh(a!);
    await send(a!, { type: 'startGame', ...meta(a!) });
    const room = service.rooms.values().next().value!;
    const game = JSON.stringify(room.game);
    const version = room.version;
    expect(await send(a!, command)).toEqual(accepted);
    expect(room.resetRequest).toBeNull();
    expect(room.phase).toBe('playing');
    expect(JSON.stringify(room.game)).toBe(game);
    expect(room.version).toBe(version);
  });
  it('lets any member initiate, notifies all active players, and freezes gameplay without clearing hands', async () => {
    const [host, guest] = await table();
    const room = service.rooms.values().next().value!;
    const game = JSON.stringify(room.game);
    const reset = await request(guest!);
    await refresh(host!);
    expect(reset.initiatorId).toBe(guest!.id);
    expect([...reset.voterIds].sort()).toEqual([host!.id, guest!.id].sort());
    expect(reset.approvedIds).toEqual([guest!.id]);
    expect(reset.expiresAt).toBe(now + 30_000);
    expect(host!.room!.resetRequest).toEqual(guest!.room!.resetRequest);
    expect(host!.hand!.cards).toHaveLength(5);
    expect(host!.hand!.legal).toEqual([]);
    expect(
      (await send(host!, { type: 'playCard', action: { kind: 'discardHand' }, ...meta(host!) })).ok,
    ).toBe(false);
    expect(JSON.stringify(room.game)).toBe(game);
  });
  it('resets on unanimous approval, retaining seats, code and options and clearing private hands', async () => {
    const [a, b] = await table();
    const room = service.rooms.values().next().value!;
    const before = {
      code: room.code,
      players: room.players.map((p) => p.id),
      options: { ...room.options },
    };
    const reset = await request(a!);
    expect((await vote(b!, true, reset.id)).ok).toBe(true);
    await refresh(a!);
    expect(room.phase).toBe('lobby');
    expect(room.game).toBeNull();
    expect(room.resetRequest).toBeNull();
    expect(room.code).toBe(before.code);
    expect(room.options).toEqual(before.options);
    expect(room.players.map((p) => p.id)).toEqual(before.players);
    expect(room.players.every((p) => !p.ready)).toBe(true);
    expect(a!.hand!.cards).toEqual([]);
    expect(b!.hand!.cards).toEqual([]);
    expect(a!.room!.resetOutcome?.status).toBe('completed');
  });
  it('a rejection cancels and names its voter to the initiator; retry requires a new request', async () => {
    const [a, b] = await table();
    const room = service.rooms.values().next().value!;
    const game = JSON.stringify(room.game);
    const reset = await request(a!);
    expect((await vote(b!, false, reset.id)).ok).toBe(true);
    await refresh(a!);
    expect(a!.room!.resetOutcome).toEqual({
      requestId: reset.id,
      initiatorId: a!.id,
      status: 'rejected',
      rejectedById: b!.id,
    });
    expect(room.resetRequest).toBeNull();
    expect(JSON.stringify(room.game)).toBe(game);
    now += 31_000;
    service.sweep();
    expect(room.phase).toBe('playing');
    const retry = await request(a!);
    expect(retry.id).not.toBe(reset.id);
    expect(retry.approvedIds).toEqual([a!.id]);
    expect(room.resetOutcome).toBeNull();
    expect((await vote(b!, true, reset.id)).ok).toBe(false);
    expect(room.resetRequest?.id).toBe(retry.id);
  });
  it('resets only at the 30-second deadline when another player does not respond', async () => {
    const [a, b] = await table();
    await request(a!);
    const room = service.rooms.values().next().value!;
    now += 29_999;
    service.sweep();
    expect(room.game).not.toBeNull();
    now++;
    service.sweep();
    expect(room.game).toBeNull();
    expect(room.phase).toBe('lobby');
    await refresh(b!);
    expect(b!.hand!.cards).toEqual([]);
    expect(b!.room!.resetOutcome?.status).toBe('completed');
    const version = room.version;
    service.sweep();
    expect(room.version).toBe(version);
  });
  it('handles concurrent approvals from the same snapshot without stale-vote failures', async () => {
    const [a, b, c] = await table(3);
    const reset = await request(a!);
    await refresh(b!);
    await refresh(c!);
    const commands: Command[] = [b!, c!].map((p) => ({
      type: 'respondReset',
      requestId: reset.id,
      approve: true,
      ...meta(p),
    }));
    const results = await Promise.all([send(b!, commands[0]!), send(c!, commands[1]!)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(service.rooms.values().next().value!.phase).toBe('lobby');
  });
  it('keeps reset requests idempotent and prevents duplicate requests or duplicate player votes', async () => {
    const [a, b, c] = await table(3);
    await refresh(a!);
    const command: Command = { type: 'requestReset', ...meta(a!) };
    const first = await send(a!, command);
    const reset = a!.room!.resetRequest!;
    expect(await send(a!, command)).toEqual(first);
    await refresh(c!);
    expect((await send(c!, { type: 'requestReset', ...meta(c!) })).ok).toBe(false);
    expect((await vote(b!, true, reset.id)).ok).toBe(true);
    expect((await vote(b!, true, reset.id)).ok).toBe(false);
    expect(service.rooms.values().next().value!.resetRequest!.approvedIds).toHaveLength(2);
  });
  it('preserves the vote across disconnect and reconnect without extending the deadline', async () => {
    const [a, b] = await table();
    const reset = await request(a!);
    const token = b!.token;
    b!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    now += 10_000;
    const back = await peer(token);
    await refresh(back);
    expect(back.room!.resetRequest?.expiresAt).toBe(reset.expiresAt);
    expect((await vote(back, false, reset.id)).ok).toBe(true);
    await refresh(a!);
    expect(a!.room!.resetOutcome?.rejectedById).toBe(back.id);
    expect(a!.room!.paused).toBe(false);
  });
  it('ignores rejection received after the deadline and does not restore the destroyed game', async () => {
    const [a, b] = await table();
    const reset = await request(a!);
    now += 30_000;
    expect((await vote(b!, false, reset.id)).ok).toBe(false);
    const room = service.rooms.values().next().value!;
    expect(room.game).toBeNull();
    expect(room.resetOutcome?.status).toBe('completed');
  });
  it('does not require already disconnected players and excludes newcomers from voting', async () => {
    const [a, b, c] = await table(3);
    c!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const reset = await request(a!);
    expect(reset.voterIds).not.toContain(c!.id);
    const back = await peer(c!.token);
    await refresh(back);
    expect((await vote(back, false, reset.id)).ok).toBe(false);
    expect((await vote(b!, true, reset.id)).ok).toBe(true);
    await refresh(back);
    expect(back.room!.phase).toBe('lobby');
  });
  it('handles a single remaining active player and cannot be initiated by outsiders', async () => {
    const [a, b] = await table();
    const outsider = await peer();
    expect(
      (
        await send(outsider, {
          type: 'requestReset',
          expectedVersion: 0,
          clientActionId: randomUUID(),
        })
      ).ok,
    ).toBe(false);
    b!.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await request(a!);
    expect(a!.room!.phase).toBe('lobby');
    expect(a!.room!.game).toBeNull();
  });
});
