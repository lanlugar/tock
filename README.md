# Tock Online

A local, server-authoritative Tock game for 2–4 friends: 72-space board, private cards, heaven, optional card effects, opposite-seat partnerships, reconnects and rematches. Original responsive SVG artwork; no accounts required.

## Run locally

Install Node.js 24 with Corepack. From this directory:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open **http://localhost:5173**. Use a second browser profile/private window for another independent player. Pick different suits, join with the room code, mark everyone ready, then let the host start. Two ordinary tabs share the saved identity intentionally.

No .env is needed for localhost development. The server generates an ephemeral signing secret when unset; restarting loses rooms and reconnect sessions. To keep the signing secret stable, copy .env.example to your private .env and fill SESSION_SECRET with a locally generated value:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Never put the generated value in tracked files or messages.

## Play on a second device

Both devices must reach the host computer on the same network. Add its frontend origin, for example http://192.168.1.20:5173, to CLIENT_ORIGIN in .env, then restart development and visit that address from the second device. Keep VITE_SERVER_URL blank so each browser uses the same origin and Vite proxies the connection. Allow the Node process through your local firewall when prompted by your operating system. Room-code entry works on LAN HTTP; copying invites and cryptographic browser APIs may require HTTPS.

## Validate

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

The browser suite builds the production app, starts an isolated in-process server on port 3101 and exercises independent browser contexts. Test fixture access is not exposed over the production network. See tests/RULE-TRACEABILITY.md for coverage and honest verification limits.

## Production build and local preview

```powershell
corepack pnpm build
corepack pnpm start
```

Open http://localhost:3001. For production, set NODE_ENV=production, a random SESSION_SECRET of at least 32 characters, and the exact comma-separated CLIENT_ORIGIN values. The Node server serves the built frontend and WebSocket transport from one origin.

Docker alternative: configure a private .env, then run docker compose up --build. See docs/09-DEPLOYMENT.md. Docker and physical-device/public-network smoke checks must be performed on the deployment host.

## Design and limits

Every player can use **Reset table** to request a fresh game. Active players can confirm or reject; any rejection cancels and identifies the voter to the requester. Without a rejection, everyone confirming or the 30-second deadline clears the game and returns the same players to the lobby. Silence permits reset at the deadline. Room code, seats and rule settings stay; everyone must ready up again. **Copy invite** copies the room code and provides a manual-copy field if browser clipboard access fails.

- Pure rules: packages/game-engine. Runtime schemas and filtered wire contracts: packages/shared. UI: apps/web. Authoritative room service: apps/server.
- Deck and hands stay on the server; only the recipient receives their hand and legal actions. Public snapshots contain card counts and public discards.
- Signed 24-hour reconnect credentials are stored in the browser. Reconnect within that window using the same browser profile. Requests use versions and action IDs; accepted duplicates cannot replay a move.
- Disconnects pause the match; after 90 seconds the connected host may end without a winner. Empty rooms expire after 30 minutes.
- Rooms are in memory. Server restart loses matches. Deploy one persistent Node instance; horizontal scaling needs an authoritative shared room store, not just a Socket.IO adapter.
- Public hosting and physical-device release verification are deferred. No live public URL is claimed.

Approved rules: docs/00-DECISIONS.md. Board map: docs/03-BOARD.md. The in-game rules dialog explains the active mechanics.
