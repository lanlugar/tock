# TypeScript domain model (design sketch)

```ts
type Seat = 0 | 1 | 2 | 3;
type Location =
  | { kind: 'break' }
  | { kind: 'track'; index: number }
  | { kind: 'home'; slot: 0 | 1 | 2 | 3 }
  | { kind: 'heaven' };
interface Marble { id: string; owner: Seat; location: Location; /* home eligibility TBD */ }
interface Card { id: string; suit: 'S'|'H'|'D'|'C'; rank: 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K' }
interface Player { seat: Seat; id: string; name: string; marbles: Marble[]; hand: Card[] }
interface GameState { version: number; phase: 'lobby'|'dealing'|'playing'|'finished'; players: Player[]; currentSeat: Seat; dealerSeat: Seat; deck: Card[]; discard: Card[]; /* round schedule, options, winner */ }
```

**Critical:** Never serialize `GameState` directly to clients. Create separate `PublicSnapshot` and `PrivatePlayerSnapshot` with explicit allowlisted fields. Track immutable event IDs and versioned state changes. Treat all schema fields as preliminary until decisions approved.
