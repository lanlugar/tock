# Deployment setup (public deployment deferred)

Build with Node 24 and corepack pnpm install --frozen-lockfile, then corepack pnpm build. Run node apps/server/dist/index.js from the workspace root. Dockerfile and compose.yaml provide an equivalent single-container service with a health check.

## Environment

- NODE_ENV=production
- PORT=3001 (or the hosting platform's assigned port)
- SESSION_SECRET: at least 32 random characters, supplied privately by the host
- CLIENT_ORIGIN: exact comma-separated browser origins, including protocol and port
- VITE_SERVER_URL: leave blank for the supplied same-origin setup; set only at build time for a separate backend
- WEB_ROOT: optional workspace-relative built frontend directory (default apps/web/dist)

The production server refuses a missing/short signing secret. Restrict CORS and WebSocket handshake origins. Never publish .env or session tokens. No database is required for this release.

## Runtime

Use one persistent Node process with WebSocket upgrades, HTTPS at the reverse proxy, proxy idle timeouts longer than Socket.IO heartbeats, and /health for readiness. All room mutation is synchronous and serialized per event loop. A multi-process deployment is unsupported until authoritative state and identity/membership are moved into a coordinated store.

Server restarts lose all rooms and matches. Signed reconnect tokens expire after 24 hours; they cannot recover lost in-memory state. Empty rooms expire after 30 minutes. No private cards, deck order, request bodies or tokens are logged.

## Manual smoke checklist

1. Confirm /health and the frontend return successfully over the deployed HTTPS origin.
2. Join one room from two separate devices/networks; verify WebSocket upgrades and turn synchronization.
3. Confirm each device receives only its own privateHand and no snapshot contains hands or deck order.
4. Play legal turns through a completed match and see the same winner; try rematch.
5. Refresh one device and verify identity, private hand and pause/resume.
6. Disconnect the host, verify host transfer and the 90-second end-without-winner option.
7. Check keyboard, 375px portrait layout and reduced motion.

These checks are not marked passed by repository tests. Public deployment, Docker execution and physical-device QA require their actual target environment.
