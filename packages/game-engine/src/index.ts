/** Deterministic rules: deck order and random choices are supplied by the server. */
export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];
export const SUITS = ['♥', '♠', '♦', '♣'] as const;
export const SEAT_NAMES = ['Hearts', 'Spades', 'Diamonds', 'Clubs'] as const;
export const STARTS = [0, 18, 36, 54] as const;
export const EIGHTHS = [10, 28, 46, 64] as const;
export interface Card {
  id: string;
  rank: number;
  suit: Seat;
}
export type Location =
  | { kind: 'break' }
  | { kind: 'track'; index: number }
  | { kind: 'home'; slot: number }
  | { kind: 'heaven' };
export interface Marble {
  id: string;
  owner: Seat;
  location: Location;
  progress: number;
  eligible: boolean;
}
export interface Options {
  backward4: boolean;
  opponent5: boolean;
  split7: boolean;
  skip10: boolean;
  sweepKing: boolean;
  teams: boolean;
}
export const DEFAULT_OPTIONS: Options = {
  backward4: false,
  opponent5: false,
  split7: false,
  skip10: false,
  sweepKing: false,
  teams: false,
};
export interface Game {
  seats: Seat[];
  options: Options;
  marbles: Marble[];
  hands: Record<Seat, Card[]>;
  deck: Card[];
  discard: Card[];
  dealer: Seat;
  turn: Seat;
  dealIndex: number;
  skips: Record<Seat, number>;
  phase: 'playing' | 'discardChoice' | 'dealing' | 'finished';
  pendingDiscard: Seat | null;
  winner: Seat[] | null;
  lastMove: string;
}
export type Action =
  | { kind: 'discardHand' }
  | { kind: 'chooseDiscard'; cardId: string }
  | { kind: 'start' | 'move' | 'heavenEnter'; cardId: string; marbleId: string }
  | { kind: 'heavenExit'; cardId: string; marbleId: string; target: number }
  | { kind: 'swap'; cardId: string; marbleId: string; targetId: string }
  | { kind: 'split'; cardId: string; steps: { marbleId: string; count: number }[] }
  | { kind: 'skip'; cardId: string };
export interface LegalAction {
  action: Action;
  label: string;
  destinations: { marbleId: string; location: Location }[];
}
export type Result = { ok: true; state: Game } | { ok: false; error: string };
const mod = (n: number) => ((n % 72) + 72) % 72;
const partner = (s: Seat): Seat => ((s + 2) % 4) as Seat;
export function createDeck(): Card[] {
  return SEATS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ id: `${suit}-${i + 1}`, rank: i + 1, suit })),
  );
}
export function cardName(c: Card): string {
  return `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[c.rank] ?? c.rank}${SUITS[c.suit]}`;
}
export function schedule(count: number): number[] {
  return count === 4 ? [5, 4, 4] : count === 3 ? [5, 4, 4, 4] : [5, 5, 4, 4, 4, 4];
}
export function clockwise(seats: Seat[], from: Seat): Seat {
  for (let i = 1; i <= 4; i++) {
    const s = ((from - i + 4) % 4) as Seat;
    if (seats.includes(s)) return s;
  }
  throw new Error('No occupied seats');
}
export function createGame(seats: Seat[], options: Options, deck: Card[], dealer: Seat): Game {
  if (
    seats.length < 2 ||
    seats.length > 4 ||
    new Set(seats).size !== seats.length ||
    !seats.includes(dealer) ||
    (options.teams && seats.length !== 4)
  )
    throw new Error('Invalid seats');
  if (deck.length !== 52 || new Set(deck.map((c) => c.id)).size !== 52)
    throw new Error('Invalid deck');
  const game: Game = {
    seats: [...seats],
    options: { ...options },
    marbles: seats.flatMap((owner) =>
      Array.from({ length: 4 }, (_, n) => ({
        id: `${owner}:${n}`,
        owner,
        location: { kind: 'break' } as Location,
        progress: 0,
        eligible: false,
      })),
    ),
    hands: { 0: [], 1: [], 2: [], 3: [] },
    deck: [...deck],
    discard: [],
    dealer,
    turn: dealer,
    dealIndex: 0,
    skips: { 0: 0, 1: 0, 2: 0, 3: 0 },
    phase: 'dealing',
    pendingDiscard: null,
    winner: null,
    lastMove: 'Match started',
  };
  return deal(game, deck);
}
/** A shuffled reserve is required only at the end of a deal schedule. */
export function deal(input: Game, reserve?: Card[]): Game {
  if (input.phase !== 'dealing') return input;
  const g = structuredClone(input);
  const sizes = schedule(g.seats.length);
  if (g.dealIndex >= sizes.length) {
    if (!reserve) throw new Error('Server must supply shuffled reserve');
    const expected = [...g.deck, ...g.discard]
      .map((c) => c.id)
      .sort()
      .join(',');
    if (
      reserve
        .map((c) => c.id)
        .sort()
        .join(',') !== expected
    )
      throw new Error('Invalid reserve');
    g.deck = [...reserve];
    g.discard = [];
    g.dealIndex = 0;
    g.dealer = clockwise(g.seats, g.dealer);
  }
  const count = sizes[g.dealIndex]!;
  if (g.deck.length < count * g.seats.length) throw new Error('Insufficient deck');
  let s = g.dealer;
  for (let n = 0; n < count; n++)
    for (let p = 0; p < g.seats.length; p++) {
      s = clockwise(g.seats, s);
      g.hands[s].push(g.deck.shift()!);
    }
  g.dealIndex++;
  g.phase = 'playing';
  g.turn = g.dealer;
  advance(g);
  return g;
}
function finished(g: Game, seat: Seat): boolean {
  return g.marbles.filter((m) => m.owner === seat).every((m) => m.location.kind === 'home');
}
export function controlledSeat(g: Game, actor: Seat): Seat {
  return g.options.teams && finished(g, actor) ? partner(actor) : actor;
}
function protectedStart(m: Marble): boolean {
  return m.location.kind === 'track' && m.location.index === STARTS[m.owner];
}
function same(a: Location, b: Location, ownerA: Seat, ownerB: Seat): boolean {
  return (
    a.kind !== 'break' &&
    a.kind === b.kind &&
    (a.kind === 'track'
      ? b.kind === 'track' && a.index === b.index
      : a.kind === 'home'
        ? b.kind === 'home' && ownerA === ownerB && a.slot === b.slot
        : true)
  );
}
function occupant(g: Game, location: Location, mover: Marble): Marble | undefined {
  return g.marbles.find(
    (m) => m.id !== mover.id && same(location, m.location, mover.owner, m.owner),
  );
}
function capture(m: Marble): void {
  m.location = { kind: 'break' };
  m.progress = 0;
  m.eligible = false;
}
function land(g: Game, marble: Marble, location: Location): boolean {
  const other = occupant(g, location, marble);
  if (
    other &&
    (other.owner === marble.owner || protectedStart(other) || other.location.kind === 'home')
  )
    return false;
  if (other) capture(other);
  marble.location = location;
  return true;
}
/** Mutates a disposable clone only. */
function move(g: Game, marble: Marble, count: number, sweep = false, allowHome = true): boolean {
  if (marble.location.kind === 'break' || marble.location.kind === 'heaven') return false;
  const direction = count < 0 ? -1 : 1;
  if (marble.location.kind === 'home' && direction < 0) return false;
  for (let step = 0; step < Math.abs(count); step++) {
    let next: Location;
    if (marble.location.kind === 'home') {
      if (marble.location.slot === 3) return false;
      next = { kind: 'home', slot: marble.location.slot + 1 };
    } else if (marble.location.kind === 'track') {
      const remaining = Math.abs(count) - step;
      const clearHome =
        remaining <= 4 &&
        !g.marbles.some(
          (m) =>
            m.owner === marble.owner && m.location.kind === 'home' && m.location.slot < remaining,
        );
      if (
        allowHome &&
        direction > 0 &&
        marble.eligible &&
        marble.location.index === STARTS[marble.owner] &&
        clearHome
      )
        next = { kind: 'home', slot: 0 };
      else next = { kind: 'track', index: mod(marble.location.index + direction) };
    } else return false;
    const other = occupant(g, next, marble);
    if (
      other &&
      (next.kind === 'home' || (protectedStart(other) && (sweep || other.owner !== marble.owner)))
    )
      return false;
    if (other && sweep && next.kind === 'track') capture(other);
    if (next.kind === 'track') {
      marble.progress += direction;
      if (marble.progress >= 72) marble.eligible = true;
    }
    if (step === Math.abs(count) - 1) {
      if (!land(g, marble, next)) return false;
    } else marble.location = next;
  }
  return true;
}
function advance(g: Game): void {
  if (g.seats.every((s) => g.hands[s].length === 0)) {
    g.phase = 'dealing';
    return;
  }
  for (let n = 0; n < 1000; n++) {
    g.turn = clockwise(g.seats, g.turn);
    if (!g.hands[g.turn].length) continue;
    if (g.skips[g.turn] > 0) {
      g.skips[g.turn]--;
      continue;
    }
    return;
  }
  throw new Error('Invalid skip state');
}
function checkWin(g: Game): void {
  for (const s of g.seats)
    if (finished(g, s) && (!g.options.teams || finished(g, partner(s)))) {
      g.winner = g.options.teams ? [s, partner(s)] : [s];
      g.phase = 'finished';
      return;
    }
}
function execute(input: Game, actor: Seat, action: Action): Game | null {
  const g = structuredClone(input);
  if (action.kind === 'discardHand') {
    g.discard.push(...g.hands[actor]);
    g.hands[actor] = [];
    advance(g);
    g.lastMove = `${SEAT_NAMES[actor]} discarded their hand`;
    return g;
  }
  if (action.kind === 'chooseDiscard') {
    if (g.phase !== 'discardChoice' || g.pendingDiscard !== actor) return null;
    const index = g.hands[actor].findIndex((c) => c.id === action.cardId);
    if (index < 0) return null;
    g.discard.push(...g.hands[actor].splice(index, 1));
    g.pendingDiscard = null;
    g.phase = 'playing';
    advance(g);
    return g;
  }
  const card = g.hands[actor].find((c) => c.id === action.cardId);
  if (!card) return null;
  const owner = controlledSeat(g, actor);
  const marble = 'marbleId' in action ? g.marbles.find((m) => m.id === action.marbleId) : undefined;
  if (action.kind === 'skip') {
    if (card.rank !== 10 || !g.options.skip10) return null;
    const target = clockwise(g.seats, actor);
    g.skips[target]++;
    if (g.hands[target].length) {
      g.pendingDiscard = target;
      g.phase = 'discardChoice';
    }
  } else if (action.kind === 'split') {
    if (
      card.rank !== 7 ||
      !g.options.split7 ||
      action.steps.length === 0 ||
      new Set(action.steps.map((s) => s.marbleId)).size !== action.steps.length ||
      action.steps.reduce((n, s) => n + s.count, 0) !== 7
    )
      return null;
    for (const step of action.steps) {
      const m = g.marbles.find((m) => m.id === step.marbleId);
      if (
        !m ||
        m.owner !== controlledSeat(g, actor) ||
        !Number.isInteger(step.count) ||
        step.count < 1 ||
        !move(g, m, step.count)
      )
        return null;
    }
  } else {
    if (!marble) return null;
    const opponentMove = action.kind === 'move' && card.rank === 5 && g.options.opponent5;
    if (
      opponentMove
        ? marble.owner === owner || protectedStart(marble) || marble.location.kind !== 'track'
        : marble.owner !== owner
    )
      return null;
    if (action.kind === 'start') {
      if (
        ![1, 13].includes(card.rank) ||
        marble.location.kind !== 'break' ||
        !land(g, marble, { kind: 'track', index: STARTS[marble.owner] })
      )
        return null;
    } else if (action.kind === 'move') {
      if (card.rank === 7 && g.options.split7) return null;
      const distance = card.rank === 4 && g.options.backward4 ? -4 : card.rank;
      if (!move(g, marble, distance, card.rank === 13 && g.options.sweepKing, !opponentMove))
        return null;
    } else if (action.kind === 'swap') {
      const target = g.marbles.find((m) => m.id === action.targetId);
      if (
        card.rank !== 11 ||
        !target ||
        target.owner === owner ||
        target.location.kind !== 'track' ||
        marble.location.kind !== 'track' ||
        protectedStart(target) ||
        protectedStart(marble)
      )
        return null;
      [marble.location, target.location] = [target.location, marble.location];
    } else if (action.kind === 'heavenEnter') {
      if (
        ![1, 10, 13].includes(card.rank) ||
        marble.location.kind !== 'track' ||
        !(EIGHTHS as readonly number[]).includes(marble.location.index) ||
        !land(g, marble, { kind: 'heaven' })
      )
        return null;
    } else if (action.kind === 'heavenExit') {
      if (
        ![1, 10, 13].includes(card.rank) ||
        marble.location.kind !== 'heaven' ||
        !(EIGHTHS as readonly number[]).includes(action.target) ||
        !land(g, marble, { kind: 'track', index: action.target })
      )
        return null;
    }
  }
  g.hands[actor] = g.hands[actor].filter((c) => c.id !== card.id);
  g.discard.push(card);
  g.lastMove = `${SEAT_NAMES[actor]} played ${cardName(card)} · ${action.kind}`;
  checkWin(g);
  if (g.phase === 'playing') advance(g);
  return g;
}
export function legalActions(g: Game, actor: Seat): LegalAction[] {
  if (!g.seats.includes(actor) || g.phase === 'finished' || g.phase === 'dealing') return [];
  if (g.phase === 'discardChoice')
    return g.pendingDiscard === actor
      ? g.hands[actor].map((c) => ({
          action: { kind: 'chooseDiscard', cardId: c.id },
          label: `Discard ${cardName(c)}`,
          destinations: [],
        }))
      : [];
  if (g.turn !== actor) return [];
  const result: LegalAction[] = [];
  const add = (action: Action, label: string) => {
    const next = execute(g, actor, action);
    if (!next) return;
    result.push({
      action,
      label,
      destinations: next.marbles
        .filter(
          (m) =>
            JSON.stringify(m.location) !==
            JSON.stringify(g.marbles.find((old) => old.id === m.id)!.location),
        )
        .map((m) => ({ marbleId: m.id, location: m.location })),
    });
  };
  for (const card of g.hands[actor]) {
    const prefix = cardName(card);
    const owner = controlledSeat(g, actor);
    for (const m of g.marbles) {
      const name = `${SEAT_NAMES[m.owner]} ${Number(m.id.split(':')[1]) + 1}`;
      if (m.owner === owner && [1, 13].includes(card.rank) && m.location.kind === 'break')
        add({ kind: 'start', cardId: card.id, marbleId: m.id }, `${prefix}: start ${name}`);
      const moveOwner =
        card.rank === 5 && g.options.opponent5 ? m.owner !== owner : m.owner === owner;
      if (
        moveOwner &&
        (m.location.kind === 'track' || m.location.kind === 'home') &&
        !(card.rank === 7 && g.options.split7)
      )
        add({ kind: 'move', cardId: card.id, marbleId: m.id }, `${prefix}: move ${name}`);
      if (m.owner !== owner) continue;
      if ([1, 10, 13].includes(card.rank)) {
        if (m.location.kind === 'track')
          add(
            { kind: 'heavenEnter', cardId: card.id, marbleId: m.id },
            `${prefix}: ${name} to heaven`,
          );
        if (m.location.kind === 'heaven')
          for (const target of EIGHTHS)
            add(
              { kind: 'heavenExit', cardId: card.id, marbleId: m.id, target },
              `${prefix}: ${name} to track ${target}`,
            );
      }
      if (card.rank === 11 && m.location.kind === 'track')
        for (const target of g.marbles)
          if (target.owner !== owner && target.location.kind === 'track')
            add(
              { kind: 'swap', cardId: card.id, marbleId: m.id, targetId: target.id },
              `${prefix}: swap ${name} with ${SEAT_NAMES[target.owner]} ${Number(target.id.split(':')[1]) + 1}`,
            );
    }
    if (card.rank === 10 && g.options.skip10)
      add({ kind: 'skip', cardId: card.id }, `${prefix}: discard & skip next player`);
    if (card.rank === 7 && g.options.split7) {
      const visit = (
        partial: Game,
        steps: { marbleId: string; count: number }[],
        remaining: number,
      ) => {
        if (remaining === 0) {
          add(
            { kind: 'split', cardId: card.id, steps },
            `${prefix}: ${steps.map((s) => `${s.marbleId} × ${s.count}`).join(' → ')}`,
          );
          return;
        }
        for (const m of partial.marbles)
          if (
            m.owner === controlledSeat(partial, actor) &&
            !steps.some((s) => s.marbleId === m.id)
          ) {
            for (let count = 1; count <= remaining; count++) {
              const next = structuredClone(partial);
              if (move(next, next.marbles.find((x) => x.id === m.id)!, count))
                visit(next, [...steps, { marbleId: m.id, count }], remaining - count);
            }
          }
      };
      visit(g, [], 7);
    }
  }
  if (!result.length && g.hands[actor].length)
    result.push({
      action: { kind: 'discardHand' },
      label: 'No legal moves · discard remaining hand',
      destinations: [],
    });
  return result;
}
export function applyAction(g: Game, actor: Seat, action: Action): Result {
  const keys = ['kind', 'cardId', 'marbleId', 'target', 'targetId', 'steps', 'count'];
  const legal = legalActions(g, actor).find(
    (a) => JSON.stringify(a.action, keys) === JSON.stringify(action, keys),
  );
  if (!legal) return { ok: false, error: 'That action is not legal in the current state.' };
  const next = execute(g, actor, legal.action);
  return next ? { ok: true, state: next } : { ok: false, error: 'Illegal action' };
}
