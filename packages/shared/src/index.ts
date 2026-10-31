import { z } from 'zod';
import type { Action, Card, Game, LegalAction, Options, Seat } from '@marble/engine';
const id = z.string().min(1).max(80);
const cardId = z.string().min(1).max(16);
export const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const optionsSchema = z
  .object({
    backward4: z.boolean(),
    opponent5: z.boolean(),
    split7: z.boolean(),
    skip10: z.boolean(),
    sweepKing: z.boolean(),
    teams: z.boolean(),
  })
  .strict();
export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('discardHand') }).strict(),
  z.object({ kind: z.literal('chooseDiscard'), cardId }).strict(),
  ...(['start', 'move', 'heavenEnter'] as const).map((kind) =>
    z.object({ kind: z.literal(kind), cardId, marbleId: id }).strict(),
  ),
  z
    .object({
      kind: z.literal('heavenExit'),
      cardId,
      marbleId: id,
      target: z.number().int().min(0).max(71),
    })
    .strict(),
  z.object({ kind: z.literal('swap'), cardId, marbleId: id, targetId: id }).strict(),
  z
    .object({
      kind: z.literal('split'),
      cardId,
      steps: z
        .array(z.object({ marbleId: id, count: z.number().int().min(1).max(7) }).strict())
        .min(1)
        .max(7),
    })
    .strict(),
  z.object({ kind: z.literal('skip'), cardId }).strict(),
]);
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('createRoom'),
      name: z.string().trim().min(1).max(24),
      seat: seatSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('joinRoom'),
      name: z.string().trim().min(1).max(24),
      code: z.string().min(6).max(12),
      joinToken: z.string().max(64).optional(),
      seat: seatSchema,
    })
    .strict(),
  z.object({ type: z.literal('requestSnapshot') }).strict(),
  z
    .object({
      type: z.literal('setReady'),
      ready: z.boolean(),
      expectedVersion: z.number().int().nonnegative(),
      clientActionId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal('configureRoom'),
      options: optionsSchema,
      expectedVersion: z.number().int().nonnegative(),
      clientActionId: id,
    })
    .strict(),
  ...(['startGame', 'rematch', 'endMatch', 'leaveRoom'] as const).map((type) =>
    z
      .object({
        type: z.literal(type),
        expectedVersion: z.number().int().nonnegative(),
        clientActionId: id,
      })
      .strict(),
  ),
  z
    .object({
      type: z.literal('playCard'),
      action: actionSchema,
      expectedVersion: z.number().int().nonnegative(),
      clientActionId: id,
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type PublicGame = Pick<
  Game,
  | 'marbles'
  | 'dealer'
  | 'turn'
  | 'dealIndex'
  | 'skips'
  | 'phase'
  | 'pendingDiscard'
  | 'winner'
  | 'lastMove'
> & {
  handCounts: Record<Seat, number>;
  deckCount: number;
  discardCount: number;
  topDiscard: Card | null;
};
export interface PublicPlayer {
  id: string;
  name: string;
  seat: Seat;
  ready: boolean;
  connected: boolean;
}
export interface RoomSnapshot {
  protocol: 1;
  code: string;
  joinToken: string;
  version: number;
  hostId: string;
  players: PublicPlayer[];
  options: Options;
  phase: 'lobby' | 'playing' | 'ended';
  paused: boolean;
  endAllowedAt: number | null;
  game: PublicGame | null;
}
export interface PrivateHand {
  version: number;
  seat: Seat;
  cards: Card[];
  legal: LegalAction[];
}
export interface Reply {
  ok: boolean;
  error?: string;
  version?: number;
}
export interface ServerEvents {
  session: (value: { token: string; playerId: string }) => void;
  roomSnapshot: (room: RoomSnapshot) => void;
  privateHand: (hand: PrivateHand) => void;
  roomLeft: () => void;
  serverError: (message: string) => void;
}
export interface ClientEvents {
  command: (command: Command, reply: (result: Reply) => void) => void;
}
export type { Action };
