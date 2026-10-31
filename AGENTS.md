# Codex project instructions — Marble Circuit

## Source of truth
Read `docs/00-DECISIONS.md`, `docs/02-RULES.md`, `docs/03-BOARD.md`, `docs/04-ARCHITECTURE.md` before editing gameplay. Treat unresolved questions as blockers, not permission to invent rules. Maintain a rules traceability table in tests.

## Engineering constraints
- TypeScript strict mode throughout. No `any` without documented justification.
- Authoritative game state and deck stay on server; clients send intents only.
- Never reveal other players' hands or deck order in network payloads or logs.
- Put deterministic, pure rule functions in `packages/game-engine`; no React, Socket.IO, database, time, or randomness inside the rules core.
- Server validates room membership, turn, hand ownership, card, marble ownership, movement and game phase before mutation.
- Use cryptographically secure shuffling on the server; persist seed only if replay privacy is addressed.
- Explicitly handle reconnects, duplicate actions, concurrency, stale state versions, disconnections and room cleanup.
- Make mobile-first, keyboard accessible, color-blind-aware UI; never rely on color alone.
- Do not copy board manufacturer assets or branding.
- Add tests for each rule before marking it implemented.
- Keep secrets in environment variables, never repository files.

## Workflow
1. Explain scope and assumptions.
2. Identify unresolved rule questions; stop on blockers.
3. Implement smallest vertical slice with tests.
4. Run lint, typecheck, unit tests and e2e tests; report actual results.
5. Summarize changes, risks and next milestone.

## Definition of done
Two independent browsers on separate devices can join a public room, play legal turns and finish a match; refresh/reconnect does not expose private cards; deployment smoke test succeeds.
