import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createGame,
  deal,
  DEFAULT_OPTIONS,
  legalActions,
  schedule,
  STARTS,
  type Action,
  type Game,
  type Options,
  type Seat,
} from './index';

function fixture(rank = 2, options: Partial<Options> = {}, seats: Seat[] = [0, 2]): Game {
  const g = createGame(seats, { ...DEFAULT_OPTIONS, ...options }, createDeck(), 2);
  g.turn = 0;
  g.hands = {
    0: [{ id: `0-${rank}`, rank, suit: 0 }],
    1: [],
    2: [{ id: '2-2', rank: 2, suit: 2 }],
    3: [],
  };
  if (seats.includes(1)) g.hands[1] = [{ id: '1-2', rank: 2, suit: 1 }];
  if (seats.includes(3)) g.hands[3] = [{ id: '3-2', rank: 2, suit: 3 }];
  const used = Object.values(g.hands)
    .flat()
    .map((c) => c.id);
  g.deck = createDeck().filter((c) => !used.includes(c.id));
  g.discard = [];
  return g;
}
function track(g: Game, id: string, index: number, progress = 0) {
  const m = g.marbles.find((m) => m.id === id)!;
  m.location = { kind: 'track', index };
  m.progress = progress;
  m.eligible = progress >= 72;
  return m;
}
function act(g: Game, action: Action, seat: Seat = 0): Game {
  const result = applyAction(g, seat, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const movement = (rank: number, id = '0:0'): Action => ({
  kind: 'move',
  cardId: `0-${rank}`,
  marbleId: id,
});
function assertConserved(g: Game) {
  const cards = [...g.deck, ...g.discard, ...Object.values(g.hands).flat()];
  expect(cards).toHaveLength(52);
  expect(new Set(cards.map((c) => c.id)).size).toBe(52);
  const occupied = g.marbles
    .filter((m) => m.location.kind !== 'break')
    .map((m) => JSON.stringify(m.location) + (m.location.kind === 'home' ? m.owner : ''));
  expect(new Set(occupied).size).toBe(occupied.length);
  for (const s of g.seats) expect(g.marbles.filter((m) => m.owner === s)).toHaveLength(4);
}
describe('D01–D03 · board, progress and home', () => {
  it('uses 72 spaces and wraps while earning circuit eligibility', () => {
    const g = fixture();
    track(g, '0:0', 71, 71);
    const n = act(g, movement(2));
    expect(n.marbles[0]!.location).toEqual({ kind: 'home', slot: 0 });
    expect(n.marbles[0]!.eligible).toBe(true);
    expect(g.marbles[0]!.location).toEqual({ kind: 'track', index: 71 });
  });
  it('does not grant home before a full circuit', () => {
    const g = fixture();
    track(g, '0:0', 0, 0);
    expect(act(g, movement(2)).marbles[0]!.location).toEqual({ kind: 'track', index: 2 });
  });
  it('enters home from outer hole 4 and cannot pass occupied home', () => {
    const g = fixture(3);
    track(g, '0:0', 0, 72);
    expect(act(g, movement(3)).marbles[0]!.location).toEqual({ kind: 'home', slot: 2 });
    g.marbles[1]!.location = { kind: 'home', slot: 1 };
    expect(act(g, movement(3)).marbles[0]!.location).toEqual({ kind: 'track', index: 3 });
  });
  it('continues around the track on home overshoot', () => {
    const g = fixture(5);
    track(g, '0:0', 0, 72);
    expect(act(g, movement(5)).marbles[0]!.location).toEqual({ kind: 'track', index: 5 });
  });
  it('never exits or jumps a home marble', () => {
    const g = fixture(3);
    g.marbles[0]!.location = { kind: 'home', slot: 2 };
    expect(applyAction(g, 0, movement(3)).ok).toBe(false);
  });
  it('subtracts backward steps and keeps previously earned eligibility', () => {
    const g = fixture(4, { backward4: true });
    track(g, '0:0', 1, 72);
    const m = act(g, movement(4)).marbles[0]!;
    expect(m.location).toEqual({ kind: 'track', index: 69 });
    expect(m.progress).toBe(68);
    expect(m.eligible).toBe(true);
  });
  it('does not move backward within home', () => {
    const g = fixture(4, { backward4: true });
    g.marbles[0]!.location = { kind: 'home', slot: 2 };
    expect(applyAction(g, 0, movement(4)).ok).toBe(false);
  });
});
describe('D04–D09 · hands, dealing, captures and protection', () => {
  it('requires a legal card, otherwise offers whole-hand discard', () => {
    const g = fixture(2);
    expect(legalActions(g, 0).map((a) => a.action)).toEqual([{ kind: 'discardHand' }]);
    expect(act(g, { kind: 'discardHand' }).hands[0]).toHaveLength(0);
    track(g, '0:0', 4);
    expect(applyAction(g, 0, { kind: 'discardHand' }).ok).toBe(false);
  });
  it.each([1, 13])('starts with rank %i and blocks own landing', (rank) => {
    const g = fixture(rank);
    const a: Action = { kind: 'start', cardId: `0-${rank}`, marbleId: '0:0' };
    const n = act(g, a);
    expect(n.marbles[0]!.location).toEqual({ kind: 'track', index: 0 });
    g.marbles[1]!.location = { kind: 'track', index: 0 };
    expect(applyAction(g, 0, a).ok).toBe(false);
  });
  it('captures and resets progress', () => {
    const g = fixture();
    track(g, '0:0', 3);
    track(g, '2:0', 5, 80);
    const n = act(g, movement(2));
    const victim = n.marbles.find((m) => m.id === '2:0')!;
    expect(victim.location.kind).toBe('break');
    expect(victim.eligible).toBe(false);
    expect(victim.progress).toBe(0);
  });
  it('blocks passing and landing on protected opponents', () => {
    const g = fixture(3);
    track(g, '0:0', 34);
    track(g, '2:0', 36);
    expect(applyAction(g, 0, movement(3)).ok).toBe(false);
  });
  it('allows own passing but no own landing and restores start protection', () => {
    const g = fixture(3);
    track(g, '0:0', 71);
    track(g, '0:1', 0, 80);
    expect(act(g, movement(3)).marbles[0]!.location).toEqual({ kind: 'track', index: 2 });
    g.marbles[1]!.location = { kind: 'track', index: 2 };
    expect(applyAction(g, 0, movement(3)).ok).toBe(false);
  });
  it('uses unoccupied starts as ordinary spaces', () => {
    const g = fixture(3);
    track(g, '0:0', 17);
    expect(act(g, movement(3)).marbles[0]!.location).toEqual({ kind: 'track', index: 20 });
  });
  it.each([2, 3, 4])(
    'deals all scheduled hands for %i players and rotates without losing cards',
    (count) => {
      const seats = ([0, 1, 2, 3] as Seat[]).slice(0, count);
      let g = createGame(seats, DEFAULT_OPTIONS, createDeck(), 0);
      for (let n = 0; n < schedule(count).length; n++) {
        expect(g.hands[0]).toHaveLength(schedule(count)[n]!);
        assertConserved(g);
        for (const s of seats) {
          g.discard.push(...g.hands[s]);
          g.hands[s] = [];
        }
        g.phase = 'dealing';
        if (n < schedule(count).length - 1) g = deal(g);
      }
      expect(g.deck.length).toBe(count === 3 ? 1 : 0);
      g = deal(g, [...g.deck, ...g.discard].reverse());
      expect(g.dealer).toBe(count === 2 ? 1 : count === 3 ? 2 : 3);
      assertConserved(g);
    },
  );
  it('rejects a reserve containing current hands or duplicated cards', () => {
    const g = fixture();
    g.phase = 'dealing';
    g.dealIndex = 6;
    expect(() => deal(g, createDeck())).toThrow('Invalid reserve');
  });
});
describe('D10–D16 · heaven, Jack and optional cards', () => {
  it.each([1, 10, 13])('uses rank %i for heaven and preserves circuit progress', (rank) => {
    const g = fixture(rank);
    track(g, '0:0', 10, 20);
    const n = act(g, { kind: 'heavenEnter', cardId: `0-${rank}`, marbleId: '0:0' });
    expect(n.marbles[0]!.location.kind).toBe('heaven');
    expect(n.marbles[0]!.progress).toBe(20);
    n.turn = 0;
    n.hands[0] = [{ id: `0-${rank}`, rank, suit: 0 }];
    const out = act(n, { kind: 'heavenExit', cardId: `0-${rank}`, marbleId: '0:0', target: 46 });
    expect(out.marbles[0]!.location).toEqual({ kind: 'track', index: 46 });
    expect(out.marbles[0]!.progress).toBe(20);
  });
  it('captures heaven but excludes own occupancy and non-eight entry', () => {
    const g = fixture(10);
    track(g, '0:0', 10);
    g.marbles.find((m) => m.id === '2:0')!.location = { kind: 'heaven' };
    expect(
      act(g, { kind: 'heavenEnter', cardId: '0-10', marbleId: '0:0' }).marbles.find(
        (m) => m.id === '2:0',
      )!.location.kind,
    ).toBe('break');
    g.marbles[1]!.location = { kind: 'heaven' };
    expect(applyAction(g, 0, { kind: 'heavenEnter', cardId: '0-10', marbleId: '0:0' }).ok).toBe(
      false,
    );
    track(g, '0:0', 9);
    expect(legalActions(g, 0).some((a) => a.action.kind === 'heavenEnter')).toBe(false);
  });
  it('swaps tracks without granting progress and excludes protected targets', () => {
    const g = fixture(11);
    track(g, '0:0', 4, 10);
    track(g, '2:0', 20, 50);
    const a: Action = { kind: 'swap', cardId: '0-11', marbleId: '0:0', targetId: '2:0' };
    const n = act(g, a);
    expect(n.marbles[0]!.location).toEqual({ kind: 'track', index: 20 });
    expect(n.marbles[0]!.progress).toBe(10);
    track(g, '2:0', 36);
    expect(applyAction(g, 0, a).ok).toBe(false);
  });
  it('optional 5 moves an opponent and may capture the actor', () => {
    const g = fixture(5, { opponent5: true });
    track(g, '2:0', 10);
    track(g, '0:0', 15);
    const n = act(g, movement(5, '2:0'));
    expect(n.marbles[0]!.location.kind).toBe('break');
    expect(n.marbles.find((m) => m.id === '2:0')!.progress).toBe(5);
    expect(applyAction(g, 0, movement(5)).ok).toBe(false);
    track(g, '2:0', 36);
    expect(applyAction(g, 0, movement(5, '2:0')).ok).toBe(false);
  });
  it('split 7 captures at landings only and rejects partial/duplicate allocations atomically', () => {
    const g = fixture(7, { split7: true });
    track(g, '0:0', 1);
    track(g, '0:1', 20);
    track(g, '2:0', 2);
    track(g, '2:1', 4);
    const a: Action = {
      kind: 'split',
      cardId: '0-7',
      steps: [
        { marbleId: '0:0', count: 3 },
        { marbleId: '0:1', count: 4 },
      ],
    };
    const n = act(g, a);
    expect(n.marbles.find((m) => m.id === '2:0')!.location.kind).toBe('track');
    expect(n.marbles.find((m) => m.id === '2:1')!.location.kind).toBe('break');
    const before = JSON.stringify(g);
    expect(
      applyAction(g, 0, {
        ...a,
        steps: [
          { marbleId: '0:0', count: 3 },
          { marbleId: '0:0', count: 4 },
        ],
      }).ok,
    ).toBe(false);
    expect(JSON.stringify(g)).toBe(before);
    expect(applyAction(g, 0, { ...a, steps: [{ marbleId: '0:0', count: 6 }] }).ok).toBe(false);
  });
  it('King captures own and opposing traversed marbles', () => {
    const g = fixture(13, { sweepKing: true });
    track(g, '0:0', 1);
    track(g, '0:1', 3);
    track(g, '2:0', 6);
    const n = act(g, movement(13));
    expect(n.marbles[1]!.location.kind).toBe('break');
    expect(n.marbles.find((m) => m.id === '2:0')!.location.kind).toBe('break');
    expect(n.marbles[0]!.location).toEqual({ kind: 'track', index: 14 });
  });
  it('King sweep blocks even own protected starts; starting does not sweep', () => {
    const g = fixture(13, { sweepKing: true });
    track(g, '0:0', 71);
    track(g, '0:1', 0);
    expect(applyAction(g, 0, movement(13)).ok).toBe(false);
    g.marbles[0]!.location = { kind: 'break' };
    g.marbles[1]!.location = { kind: 'track', index: 3 };
    expect(
      act(g, { kind: 'start', cardId: '0-13', marbleId: '0:0' }).marbles[1]!.location.kind,
    ).toBe('track');
  });
  it('10 waits for a private discard and skips the target', () => {
    const g = fixture(10, { skip10: true });
    g.hands[0].push({ id: '0-3', rank: 3, suit: 0 });
    g.deck = g.deck.filter((c) => c.id !== '0-3');
    let n = act(g, { kind: 'skip', cardId: '0-10' });
    expect(n.phase).toBe('discardChoice');
    expect(legalActions(n, 0)).toHaveLength(0);
    expect(legalActions(n, 2)[0]!.action.kind).toBe('chooseDiscard');
    n = act(n, { kind: 'chooseDiscard', cardId: '2-2' }, 2);
    expect(n.turn).toBe(0);
    expect(n.skips[2]).toBe(1);
    assertConserved(n);
  });
  it('10 skip survives an empty target and the next deal', () => {
    const g = fixture(10, { skip10: true });
    g.discard.push(...g.hands[2]);
    g.hands[2] = [];
    const n = act(g, { kind: 'skip', cardId: '0-10' });
    expect(n.phase).toBe('dealing');
    expect(n.skips[2]).toBe(1);
    const next = deal(n);
    expect(next.skips[2]).toBe(1);
    expect(next.turn).toBe(0);
    const after = act(next, legalActions(next, 0)[0]!.action);
    expect(after.skips[2]).toBe(0);
    expect(after.turn).toBe(0);
  });
});
describe('D18 · partnerships and wins', () => {
  it('allows capture of a partner before finishing', () => {
    const g = fixture(2, { teams: true }, [0, 1, 2, 3]);
    track(g, '0:0', 1);
    track(g, '2:0', 3);
    expect(act(g, movement(2)).marbles.find((m) => m.id === '2:0')!.location.kind).toBe('break');
  });
  it('switches to partner mid-seven and requires all eight home', () => {
    const g = fixture(7, { teams: true, split7: true }, [0, 1, 2, 3]);
    for (let i = 0; i < 3; i++) g.marbles[i]!.location = { kind: 'home', slot: 3 - i };
    track(g, '0:3', 0, 72);
    track(g, '2:0', 40);
    const n = act(g, {
      kind: 'split',
      cardId: '0-7',
      steps: [
        { marbleId: '0:3', count: 1 },
        { marbleId: '2:0', count: 6 },
      ],
    });
    expect(n.marbles.find((m) => m.id === '2:0')!.location).toEqual({ kind: 'track', index: 46 });
    expect(n.winner).toBeNull();
  });
  it('finishes an individual match and a partnership match', () => {
    for (const teams of [false, true]) {
      const g = fixture(1, { teams }, teams ? [0, 1, 2, 3] : [0, 2]);
      for (let i = 0; i < 3; i++) g.marbles[i]!.location = { kind: 'home', slot: 3 - i };
      track(g, '0:3', 0, 72);
      if (teams)
        for (let i = 0; i < 4; i++)
          g.marbles.find((m) => m.id === `2:${i}`)!.location = { kind: 'home', slot: i };
      const n = act(g, movement(1, '0:3'));
      expect(n.phase).toBe('finished');
      expect(n.winner).toEqual(teams ? [0, 2] : [0]);
    }
  });
});
describe('invariants and legal-action contract', () => {
  it.each([false, true])('plays from break through a complete match (teams=%s)', (teams) => {
    let seed = 9173;
    const mix = (cards: ReturnType<typeof createDeck>) => {
      const result = [...cards];
      for (let i = result.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    };
    let g = createGame(
      teams ? [0, 1, 2, 3] : [0, 2],
      { ...DEFAULT_OPTIONS, teams },
      mix(createDeck()),
      0,
    );
    for (let turn = 0; turn < 5000 && g.phase !== 'finished'; turn++) {
      assertConserved(g);
      if (g.phase === 'dealing') {
        g = deal(g, mix([...g.deck, ...g.discard]));
        continue;
      }
      const actor = g.turn;
      const owner =
        teams && g.marbles.filter((m) => m.owner === actor).every((m) => m.location.kind === 'home')
          ? (actor + 2) % 4
          : actor;
      const score = (choice: ReturnType<typeof legalActions>[number]) =>
        choice.destinations.reduce((sum, d) => {
          const m = g.marbles.find((m) => m.id === d.marbleId)!;
          if (m.owner !== owner) return sum;
          if (d.location.kind === 'home') return sum + 1000 + d.location.slot * 100;
          if (m.location.kind === 'break') return sum + 100;
          if (choice.action.kind === 'move') {
            const cardId = choice.action.cardId;
            return (
              sum +
              g.hands[actor].find((c) => c.id === cardId)!.rank +
              m.progress / 100
            );
          }
          return sum - 10;
        }, 0);
      const choices = legalActions(g, actor).sort((a, b) => score(b) - score(a));
      g = act(g, choices[0]!.action, actor);
    }
    expect(g.phase).toBe('finished');
    expect(g.winner).toHaveLength(teams ? 2 : 1);
    assertConserved(g);
  });
  it('optional five stays on track even when the moved opponent has earned home', () => {
    const g = fixture(5, { opponent5: true });
    track(g, '2:0', 35, 80);
    const n = act(g, movement(5, '2:0'));
    expect(n.marbles.find((m) => m.id === '2:0')!.location).toEqual({ kind: 'track', index: 40 });
  });
  it('rejects out-of-turn and card theft without mutation', () => {
    const g = fixture(1);
    const before = JSON.stringify(g);
    expect(applyAction(g, 2, { kind: 'start', cardId: '0-1', marbleId: '2:0' }).ok).toBe(false);
    expect(JSON.stringify(g)).toBe(before);
  });
  it('accepts equivalent object key order', () => {
    const g = fixture(1);
    expect(applyAction(g, 0, { marbleId: '0:0', cardId: '0-1', kind: 'start' }).ok).toBe(true);
  });
  it('keeps cards and marbles conserved through 200 deterministic legal turns', () => {
    let g = createGame([0, 1, 2, 3], DEFAULT_OPTIONS, createDeck(), 0);
    for (let i = 0; i < 200 && g.phase !== 'finished'; i++) {
      assertConserved(g);
      if (g.phase === 'dealing') {
        g = deal(g, [...g.deck, ...g.discard]);
        continue;
      }
      const actor = g.pendingDiscard ?? g.turn;
      const actions = legalActions(g, actor);
      expect(actions.length).toBeGreaterThan(0);
      const a = actions.find((a) => a.action.kind === 'move') ?? actions[0]!;
      const r = applyAction(g, actor, a.action);
      expect(r.ok).toBe(true);
      if (r.ok) g = r.state;
    }
    assertConserved(g);
  });
  it('has the approved start indices', () => expect(STARTS).toEqual([0, 18, 36, 54]));
});
