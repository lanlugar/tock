# System architecture

## Monorepo

`apps/web` React/Vite UI; `apps/server` Node/Socket.IO authoritative rooms; `packages/game-engine` deterministic rules/state transitions; `packages/shared` versioned message schemas; `infra` deployment; `tests/e2e` multi-browser flows.

## Runtime

Browser -> HTTPS/WebSocket -> Node room server -> pure rules engine -> room state -> per-player filtered snapshots. PostgreSQL/Prisma for optional durable matches, player profiles and audit events; MVP can use in-memory room state with explicit warning that server restarts lose games. If scaling beyond one instance, add shared session/room store and Socket.IO adapter; do not pretend a Redis adapter alone makes authoritative room state distributed.

## Commands

`createRoom`, `joinRoom`, `setReady`, `startGame`, `playCard` (cardId, action, marbleId, target, expectedVersion, clientActionId), `requestSnapshot`, `leaveRoom`.

## Table reset workflow

Any room member may send `requestReset` with an action ID and expected version. The server records a unique reset ID, the players connected at that moment, the initiator's confirmation and a deadline 30 seconds later. Clients receive `resetRequest` in their public snapshot. Private hands remain private, and legal-action lists are empty while the vote is pending. Other room mutations and new joins are blocked during the request.

Active voters send `respondReset` with the reset ID, approve/reject, action ID and expected version. Votes remain valid across concurrent votes or reconnect version changes when they name the current request. A rejection cancels immediately, preserves the game and records the rejecting player's ID in `resetOutcome`, so the initiator sees their name and seat. Retrying requires a new request; confirmations never carry over.

Unanimous confirmation resets immediately. Otherwise the server's 30-second timer proceeds with the reset unless someone rejected before the deadline. Silence therefore permits reset at the deadline. Disconnecting does not extend the deadline or remove an already registered voter. Players disconnected before initiation are not required voters; reconnecting them does not add votes to an existing request.

Reset clears the match and all hands, returns everyone to the same lobby and clears readiness. Seats, room code, host and rule options remain. Accepted action receipts remain to prevent old requests from replaying into a new match. Fresh ready confirmations and a host start produce a new shuffled match. The timer and vote are in-memory like the room; server restarts still lose all rooms.

## Events

`roomSnapshot` (public), `privateHand` (recipient only), `turnChanged`, `moveRejected` (actor only), `matchEnded`, `playerConnectionChanged`. Validate payloads using Zod. Authenticate socket-to-player with signed token. Rate-limit and cap message sizes.

## Transactionality

Single-threaded serialized room action queue or mutex; reject stale version and duplicate action ID; increment version on successful state transition; broadcast state after commit. Deterministic game-engine `applyAction(state,action) -> result` with no side effects. Separate RNG/shuffle from deterministic rule evaluation.

## Security

Do not trust claimed seat or hand from client; use server session binding. Restrict CORS origins. Keep deck and opponents' hands out of snapshots and telemetry. Do not log secrets or tokens. Sanitize display names. Handle room-code brute forcing.

## Persistence

Schema candidates: Room, Match, PlayerSession, GameEvent, MatchResult; use Prisma migrations when database introduced. TTL for expired rooms. Never require persistence for core legal-move calculation.
