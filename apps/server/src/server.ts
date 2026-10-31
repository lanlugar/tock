import { createServer, type Server as HttpServer } from 'node:http';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { Server, type Socket } from 'socket.io';
import {
  applyAction,
  createDeck,
  createGame,
  deal,
  DEFAULT_OPTIONS,
  legalActions,
  type Card,
  type Game,
  type Seat,
} from '@marble/engine';
import {
  commandSchema,
  type ClientEvents,
  type Command,
  type PrivateHand,
  type PublicPlayer,
  type Reply,
  type RoomSnapshot,
  type ServerEvents,
  type ResetRequest,
  type ResetOutcome,
} from '@marble/shared';

interface SocketData {
  playerId: string;
}
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
export interface Room {
  code: string;
  joinToken: string;
  hostId: string;
  version: number;
  phase: RoomSnapshot['phase'];
  players: PublicPlayer[];
  options: RoomSnapshot['options'];
  game: Game | null;
  pausedAt: number | null;
  emptyAt: number | null;
  receipts: Map<string, { fingerprint: string; reply: Reply }>;
  resetRequest: ResetRequest | null;
  resetOutcome: ResetOutcome | null;
}
export interface ServerConfig {
  secret?: string;
  origins?: string[];
  webRoot?: string;
  now?: () => number;
  /** Dependency injection for tests; there is no HTTP/socket fixture endpoint. */
  shuffle?: (cards: Card[]) => Card[];
  disconnectGraceMs?: number;
  roomTtlMs?: number;
}
export function shuffle(cards: Card[]): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function chooseDealer(seats: Seat[], mix: (cards: Card[]) => Card[]): Seat {
  let candidates = [...seats];
  while (candidates.length > 1) {
    const deck = mix(createDeck());
    const draws = candidates.map((seat, i) => ({ seat, rank: deck[i]!.rank }));
    const low = Math.min(...draws.map((d) => d.rank));
    candidates = draws.filter((d) => d.rank === low).map((d) => d.seat);
  }
  return candidates[0]!;
}
export function publicSnapshot(r: Room): RoomSnapshot {
  const g = r.game;
  return {
    protocol: 1,
    code: r.code,
    joinToken: r.joinToken,
    version: r.version,
    hostId: r.hostId,
    players: r.players.map((p) => ({ ...p })),
    options: { ...r.options },
    phase: r.phase,
    paused: r.phase === 'playing' && r.pausedAt !== null,
    endAllowedAt: null,
    resetRequest: r.resetRequest ? structuredClone(r.resetRequest) : null,
    resetOutcome: r.resetOutcome ? { ...r.resetOutcome } : null,
    game: g
      ? {
          marbles: structuredClone(g.marbles),
          dealer: g.dealer,
          turn: g.turn,
          dealIndex: g.dealIndex,
          skips: { ...g.skips },
          phase: g.phase,
          pendingDiscard: g.pendingDiscard,
          winner: g.winner,
          lastMove: g.lastMove,
          handCounts: {
            0: g.hands[0].length,
            1: g.hands[1].length,
            2: g.hands[2].length,
            3: g.hands[3].length,
          },
          deckCount: g.deck.length,
          discardCount: g.discard.length,
          topDiscard: g.discard.at(-1) ?? null,
        }
      : null,
  };
}
export function createGameServer(config: ServerConfig = {}) {
  const secret = config.secret ?? randomBytes(48).toString('hex');
  const now = config.now ?? Date.now;
  const mix = config.shuffle ?? shuffle;
  const grace = config.disconnectGraceMs ?? 90_000;
  const ttl = config.roomTtlMs ?? 30 * 60_000;
  const origins = config.origins ?? ['http://localhost:5173'];
  const rooms = new Map<string, Room>();
  const memberships = new Map<string, string>();
  const connections = new Map<string, Set<string>>();
  const limits = new Map<string, { since: number; count: number }>();
  const resetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const resetWindowMs = 30_000;
  function allowed(key: string, max: number): boolean {
    let entry = limits.get(key);
    if (!entry || now() - entry.since >= 60_000) {
      entry = { since: now(), count: 0 };
      limits.set(key, entry);
    }
    return ++entry.count <= max;
  }
  const http: HttpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (!config.webRoot || req.method !== 'GET') {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      const root = resolve(config.webRoot);
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + '\\') && !file.startsWith(root + '/') && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      };
      res.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'same-origin',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(http, {
    cors: { origin: origins },
    maxHttpBufferSize: 16_384,
    allowRequest: (req, done) =>
      done(
        null,
        (!req.headers.origin || origins.includes(req.headers.origin)) &&
          allowed(`connect:${req.socket.remoteAddress ?? 'unknown'}`, 120),
      ),
  });
  function sign(payload: string) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }
  function token(id: string): string {
    const payload = `${id}.${now() + 24 * 60 * 60_000}`;
    return `${payload}.${sign(payload)}`;
  }
  function authenticate(value: unknown): string {
    if (typeof value !== 'string' || value.length > 250) throw new Error('Invalid session');
    const [id, expiry, signature] = value.split('.');
    const payload = `${id}.${expiry}`;
    if (
      !id ||
      !/^[a-f0-9]{32}$/.test(id) ||
      !expiry ||
      !signature ||
      Number(expiry) < now() ||
      !Number.isFinite(Number(expiry))
    )
      throw new Error('Session expired');
    const a = Buffer.from(signature);
    const b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid session');
    return id;
  }
  io.use((socket, next) => {
    try {
      const auth: unknown = socket.handshake.auth.token;
      socket.data.playerId = auth ? authenticate(auth) : randomBytes(16).toString('hex');
      next();
    } catch {
      next(new Error('Session expired. Clear your saved session to start again.'));
    }
  });
  function roomFor(id: string): Room | undefined {
    const code = memberships.get(id);
    return code ? rooms.get(code) : undefined;
  }
  function privateHand(r: Room, p: PublicPlayer): PrivateHand {
    return {
      version: r.version,
      seat: p.seat,
      cards: r.game?.hands[p.seat] ?? [],
      legal:
        r.game && r.phase === 'playing' && r.pausedAt === null && !r.resetRequest
          ? legalActions(r.game, p.seat)
          : [],
    };
  }
  function publish(r: Room) {
    const snapshot = publicSnapshot(r);
    snapshot.endAllowedAt = r.pausedAt === null ? null : r.pausedAt + grace;
    for (const p of r.players)
      for (const sid of connections.get(p.id) ?? []) {
        io.to(sid).emit('roomSnapshot', snapshot);
        io.to(sid).emit('privateHand', privateHand(r, p));
      }
  }
  function updatePresence(r: Room) {
    for (const p of r.players) p.connected = (connections.get(p.id)?.size ?? 0) > 0;
    if (r.players.every((p) => p.connected)) r.pausedAt = null;
    else if (r.phase === 'playing' && r.pausedAt === null) r.pausedAt = now();
    if (!r.players.some((p) => p.connected)) r.emptyAt ??= now();
    else r.emptyAt = null;
    if (!r.players.find((p) => p.id === r.hostId)?.connected)
      r.hostId = r.players.find((p) => p.connected)?.id ?? r.hostId;
  }
  function clearResetTimer(r: Room) {
    const timer = resetTimers.get(r.code);
    if (timer) clearTimeout(timer);
    resetTimers.delete(r.code);
  }
  function completeReset(r: Room) {
    const request = r.resetRequest;
    if (!request) return;
    clearResetTimer(r);
    r.resetOutcome = {
      requestId: request.id,
      initiatorId: request.initiatorId,
      status: 'completed',
    };
    r.resetRequest = null;
    r.game = null;
    r.phase = 'lobby';
    r.pausedAt = null;
    for (const player of r.players) player.ready = false;
  }
  function resolveExpiredReset(r: Room) {
    if (r.resetRequest && now() >= r.resetRequest.expiresAt) {
      completeReset(r);
      r.version++;
      publish(r);
    }
  }
  function settle(g: Game): Game {
    return g.phase === 'dealing'
      ? deal(
          g,
          g.dealIndex >= (g.seats.length === 4 ? 3 : g.seats.length === 3 ? 4 : 6)
            ? mix([...g.deck, ...g.discard])
            : undefined,
        )
      : g;
  }
  function removePlayer(r: Room, id: string) {
    r.players = r.players.filter((p) => p.id !== id);
    memberships.delete(id);
    for (const sid of connections.get(id) ?? []) io.to(sid).emit('roomLeft');
    if (!r.players.length) {
      rooms.delete(r.code);
      return;
    }
    if (r.hostId === id) r.hostId = r.players.find((p) => p.connected)?.id ?? r.players[0]!.id;
    updatePresence(r);
    r.version++;
    publish(r);
  }
  function handle(socket: GameSocket, command: Command): Reply {
    const id = socket.data.playerId;
    if (!allowed(`command:${id}`, 180))
      return { ok: false, error: 'Too many requests. Please wait a minute.' };
    if (command.type === 'createRoom' || command.type === 'joinRoom') {
      if (roomFor(id)) return { ok: false, error: 'Leave your current room first.' };
      if (!allowed(`join:${socket.handshake.address}`, 20))
        return { ok: false, error: 'Too many room attempts. Please wait a minute.' };
      const name = Array.from(command.name)
        .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
        .join('')
        .trim();
      if (!name) return { ok: false, error: 'Enter a display name.' };
      let r: Room;
      if (command.type === 'createRoom') {
        if (rooms.size >= 1000) return { ok: false, error: 'Server room limit reached.' };
        let code: string;
        do {
          code = randomBytes(5).toString('hex').toUpperCase();
        } while (rooms.has(code));
        r = {
          code,
          joinToken: randomBytes(16).toString('hex'),
          hostId: id,
          version: 0,
          phase: 'lobby',
          players: [],
          options: { ...DEFAULT_OPTIONS },
          game: null,
          pausedAt: null,
          emptyAt: null,
          receipts: new Map(),
          resetRequest: null,
          resetOutcome: null,
        };
        rooms.set(code, r);
      } else {
        const found = rooms.get(command.code.toUpperCase());
        if (!found || (command.joinToken && command.joinToken !== found.joinToken))
          return { ok: false, error: 'Room not found or invite expired.' };
        r = found;
        resolveExpiredReset(r);
        if (r.resetRequest)
          return { ok: false, error: 'A table reset is pending. Wait for it to finish.' };
        if (r.phase !== 'lobby') return { ok: false, error: 'This match has already started.' };
        if (r.players.length >= 4) return { ok: false, error: 'Room is full.' };
      }
      if (r.players.some((p) => p.seat === command.seat))
        return { ok: false, error: 'That seat is occupied. Choose another suit.' };
      r.players.push({ id, name, seat: command.seat, ready: false, connected: true });
      memberships.set(id, r.code);
      updatePresence(r);
      r.version++;
      publish(r);
      return { ok: true, version: r.version };
    }
    const r = roomFor(id);
    const player = r?.players.find((p) => p.id === id);
    if (!r || !player) return { ok: false, error: 'Join a room first.' };
    resolveExpiredReset(r);
    if (command.type === 'requestSnapshot') {
      publish(r);
      return { ok: true, version: r.version };
    }
    const receiptKey = `${id}:${command.clientActionId}`;
    const fingerprint = JSON.stringify(command);
    const old = r.receipts.get(receiptKey);
    if (old) {
      publish(r);
      return old.fingerprint === fingerprint
        ? old.reply
        : { ok: false, error: 'Action ID was already used for another request.' };
    }
    // Votes refer to a specific request. Concurrent votes/presence updates may advance
    // the version without invalidating another active player's response.
    const currentVote =
      command.type === 'respondReset' &&
      command.requestId === r.resetRequest?.id &&
      command.expectedVersion <= r.version;
    if (command.expectedVersion !== r.version && !currentVote) {
      publish(r);
      return {
        ok: false,
        error: 'The room changed. Review the refreshed state and try again.',
        version: r.version,
      };
    }
    const reject = (error: string): Reply => ({ ok: false, error, version: r.version });
    if (r.resetRequest && command.type !== 'respondReset')
      return reject('A table reset is pending. Respond or wait for the countdown.');
    if (command.type === 'requestReset') {
      const voters = r.players.filter((player) => player.connected).map((player) => player.id);
      const request: ResetRequest = {
        id: randomBytes(16).toString('hex'),
        initiatorId: id,
        expiresAt: now() + resetWindowMs,
        voterIds: voters,
        approvedIds: [id],
      };
      r.resetRequest = request;
      r.resetOutcome = null;
      if (voters.length === 1) completeReset(r);
      else {
        const timer = setTimeout(() => {
          if (rooms.get(r.code) === r && r.resetRequest?.id === request.id) resolveExpiredReset(r);
        }, resetWindowMs);
        timer.unref();
        resetTimers.set(r.code, timer);
      }
    } else if (command.type === 'respondReset') {
      const request = r.resetRequest;
      if (!request || request.id !== command.requestId)
        return reject('This reset request is no longer active.');
      if (!request.voterIds.includes(id))
        return reject('Only players active when the reset was requested may vote.');
      if (request.approvedIds.includes(id))
        return reject('You have already confirmed this reset request.');
      if (!command.approve) {
        r.resetOutcome = {
          requestId: request.id,
          initiatorId: request.initiatorId,
          status: 'rejected',
          rejectedById: id,
        };
        r.resetRequest = null;
        clearResetTimer(r);
      } else {
        request.approvedIds.push(id);
        if (request.voterIds.every((voter) => request.approvedIds.includes(voter)))
          completeReset(r);
      }
    }
    if (command.type === 'leaveRoom') {
      if (r.phase === 'playing')
        return reject('End the match before leaving; closing the tab allows reconnect.');
      removePlayer(r, id);
      return { ok: true };
    }
    if (command.type === 'configureRoom') {
      if (r.hostId !== id || r.phase !== 'lobby')
        return reject('Only the host can configure the lobby.');
      r.options = command.options;
      for (const p of r.players) p.ready = false;
    } else if (command.type === 'setReady') {
      if (r.phase !== 'lobby') return reject('Readiness is only available in the lobby.');
      player.ready = command.ready;
    } else if (command.type === 'startGame') {
      if (
        r.hostId !== id ||
        r.phase !== 'lobby' ||
        r.players.length < 2 ||
        !r.players.every((p) => p.connected && p.ready)
      )
        return reject('The host can start once 2–4 connected players are ready.');
      if (r.options.teams && r.players.length !== 4)
        return reject('Partnerships require four players.');
      const seats = r.players.map((p) => p.seat);
      r.game = createGame(seats, r.options, mix(createDeck()), chooseDealer(seats, mix));
      r.phase = 'playing';
      r.pausedAt = null;
    } else if (command.type === 'playCard') {
      if (r.phase !== 'playing' || !r.game || r.pausedAt !== null)
        return reject('The match is not active, or is paused for reconnect.');
      const result = applyAction(r.game, player.seat, command.action);
      if (!result.ok) return reject(result.error);
      r.game = settle(result.state);
      if (r.game.phase === 'finished') r.phase = 'ended';
    } else if (command.type === 'endMatch') {
      if (
        r.hostId !== id ||
        r.phase !== 'playing' ||
        r.pausedAt === null ||
        now() < r.pausedAt + grace
      )
        return reject('The host may end a disconnected match after 90 seconds.');
      r.phase = 'ended';
      if (r.game) {
        r.game.phase = 'finished';
        r.game.winner = null;
        r.game.lastMove = 'Match ended after disconnect';
      }
      r.pausedAt = null;
    } else if (command.type === 'rematch') {
      if (r.hostId !== id || r.phase !== 'ended')
        return reject('Only the host can return a finished match to the lobby.');
      r.phase = 'lobby';
      r.game = null;
      for (const p of r.players) p.ready = false;
    }
    r.version++;
    const reply: Reply = { ok: true, version: r.version };
    r.receipts.set(receiptKey, { fingerprint, reply });
    // Bounded by room lifetime; retain accepted gameplay receipts for exact-once semantics.
    publish(r);
    return reply;
  }
  io.on('connection', (socket) => {
    const id = socket.data.playerId;
    const set = connections.get(id) ?? new Set<string>();
    set.add(socket.id);
    connections.set(id, set);
    socket.emit('session', { token: token(id), playerId: id });
    const r = roomFor(id);
    if (r) {
      updatePresence(r);
      r.version++;
      publish(r);
    }
    socket.on('command', (raw, reply) => {
      if (typeof reply !== 'function') return;
      const parsed = commandSchema.safeParse(raw);
      if (!parsed.success) {
        reply({ ok: false, error: 'Invalid command payload.' });
        return;
      }
      // No await inside this handler: each validated mutation commits synchronously.
      try {
        reply(handle(socket, parsed.data));
      } catch {
        reply({ ok: false, error: 'The request could not be completed.' });
      }
    });
    socket.on('disconnect', () => {
      connections.get(id)?.delete(socket.id);
      if (!connections.get(id)?.size) connections.delete(id);
      const room = roomFor(id);
      if (room) {
        updatePresence(room);
        room.version++;
        publish(room);
      }
    });
  });
  function sweep() {
    for (const r of rooms.values()) {
      resolveExpiredReset(r);
      if (r.emptyAt !== null && now() - r.emptyAt >= ttl) {
        clearResetTimer(r);
        for (const p of r.players) memberships.delete(p.id);
        rooms.delete(r.code);
      }
    }
    for (const [key, value] of limits) if (now() - value.since > 120_000) limits.delete(key);
  }
  const timer = setInterval(sweep, 30_000);
  timer.unref();
  return {
    http,
    io,
    rooms,
    sweep,
    publish,
    async close() {
      clearInterval(timer);
      for (const timer of resetTimers.values()) clearTimeout(timer);
      resetTimers.clear();
      await new Promise<void>((resolveClose) => io.close(() => resolveClose()));
    },
  };
}
