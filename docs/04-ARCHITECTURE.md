# System architecture

## Monorepo
`apps/web` React/Vite UI; `apps/server` Node/Socket.IO authoritative rooms; `packages/game-engine` deterministic rules/state transitions; `packages/shared` versioned message schemas; `infra` deployment; `tests/e2e` multi-browser flows.

## Runtime
Browser -> HTTPS/WebSocket -> Node room server -> pure rules engine -> room state -> per-player filtered snapshots. PostgreSQL/Prisma for optional durable matches, player profiles and audit events; MVP can use in-memory room state with explicit warning that server restarts lose games. If scaling beyond one instance, add shared session/room store and Socket.IO adapter; do not pretend a Redis adapter alone makes authoritative room state distributed.

## Commands
`createRoom`, `joinRoom`, `setReady`, `startGame`, `playCard` (cardId, action, marbleId, target, expectedVersion, clientActionId), `requestSnapshot`, `leaveRoom`.

## Events
`roomSnapshot` (public), `privateHand` (recipient only), `turnChanged`, `moveRejected` (actor only), `matchEnded`, `playerConnectionChanged`. Validate payloads using Zod. Authenticate socket-to-player with signed token. Rate-limit and cap message sizes.

## Transactionality
Single-threaded serialized room action queue or mutex; reject stale version and duplicate action ID; increment version on successful state transition; broadcast state after commit. Deterministic game-engine `applyAction(state,action) -> result` with no side effects. Separate RNG/shuffle from deterministic rule evaluation.

## Security
Do not trust claimed seat or hand from client; use server session binding. Restrict CORS origins. Keep deck and opponents' hands out of snapshots and telemetry. Do not log secrets or tokens. Sanitize display names. Handle room-code brute forcing.

## Persistence
Schema candidates: Room, Match, PlayerSession, GameEvent, MatchResult; use Prisma migrations when database introduced. TTL for expired rooms. Never require persistence for core legal-move calculation.
