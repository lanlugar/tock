# Verification and test plan

## Unit — game engine
Card-to-move mapping; starting on Ace/King; forward wrap; home exactness; capture; protected square blocks passing; legal move enumeration; heaven entry/exit; Jack swap; optional rules; team movement; deterministic win. For every OPEN rule, add a pending test marked with decision ID instead of assuming behavior.

## Property/invariant tests
Exactly 4 marbles per seat; no duplicate marble IDs; no card duplicated across deck/hand/discard; only current player acts; no hidden hand leaks; state version increases exactly once per accepted action; rejected action leaves state unchanged; valid destinations are always within board model.

## Integration
Two Socket.IO clients join room; each receives only own hand; stale version rejected; duplicate action idempotent; reconnect restores same player; simultaneous submissions serialize; disconnect timeout and room expiry.

## End-to-end
Playwright 2–4 isolated browser contexts, join via share code, test turn synchronization, invalid move message, refresh/reconnect, phone viewport, full-game completion using controlled fixtures.

## Release gates
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, production build, public URL opened on two distinct devices/networks, privacy smoke test, health endpoint.
