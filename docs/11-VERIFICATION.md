# Verification — 2026-10-30

Executed in the local Windows workspace with Node 24 and the pinned pnpm 9.15.0 toolchain:

| Check | Actual result |
|---|---|
| `corepack pnpm lint` | Passed, zero warnings |
| `corepack pnpm typecheck` | Passed in strict mode |
| `corepack pnpm test` | 53 passed: 39 engine checks and 14 server checks |
| `corepack pnpm test:e2e` | 9 browser scenarios passed |
| Production build | Passed for React/Vite frontend and bundled Node entry |
| Production entry smoke | Passed: `/health`, built frontend, same-origin connection and room creation |
| Visual inspection | Desktop and 375px screenshots inspected; no page-level horizontal overflow |

The engine suite plays complete individual and partnership matches from all marbles in break through a winner, checking card conservation and marble occupancy along the way. It also checks a separate 200-turn sequence and rule-specific boundaries. Browser scenarios cover isolated 2-, 3- and 4-player contexts, optional effects, keyboard moves, private discard selection, refresh/reconnect, late-match individual and team wins, and rematch.

Tests and production bundling needed execution outside the filesystem sandbox after the bundler was denied workspace resolution inside it. Dependencies and the Chromium test browser were installed with approved commands. No public deployment was performed.

## Remaining manual gates

- Two physical devices/networks completing a real match. Isolated browser contexts are not physical-device verification.
- Docker build/run on a Docker host. Docker configuration is supplied but the container was not executed here.
- Public HTTPS/WebSocket deployment, origin configuration and deployment smoke checklist. Public hosting was deferred by the user.

Operational limits: in-memory rooms are lost on server restart; one authoritative Node instance is supported; browser reconnect credentials expire after 24 hours. No database persistence or horizontal room-store coordination is claimed.
