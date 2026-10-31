# Product requirements document

## Vision
A polished, accessible online adaptation of a four-color card-driven marble racing board game for friends on separate devices.

## Users
Host creates room and shares short code; guest joins via link or code; 2–4 human players; no mandatory account for MVP.

## Core user journey
Landing -> Create/Join -> Lobby (names, seats, readiness) -> Rules & options -> Start -> Private hand + board -> Select card -> Preview legal marble destinations -> Submit move -> Synchronized state -> Win screen -> Rematch.

## MVP functional requirements
- Unique non-guessable room join token; human-readable code with expiry and rate limiting.
- 2–4 players, host controls start; duplicate names allowed with disambiguating badges.
- Deal 52 standard cards, no jokers; only owner sees hand.
- 4 marbles per player in break area; start using Ace or King.
- Turn-based live synchronized movement; legal moves enforced server-side.
- Track capture, protected starting position, home lane exact entry and win state.
- Card rounds per player count, dealer rotation and shuffle/reshuffle per approved rules.
- Rules accessible from lobby and during game; clear reason for illegal move.
- Responsive desktop/mobile, touch and keyboard support.
- Reconnect using short-lived signed session token, with no other-player impersonation.

## Post-MVP
Heaven mechanic if deferred, Jack swap if deferred, optional 4/5/7/10/King effects, 2v2 teams, animations, spectator mode, matchmaking, saved history.

## Nonfunctional requirements
- Target smooth visual updates on ordinary mobile networks; no hard realtime physics.
- Server authoritative; no hidden info leaks.
- Structured logs with redaction, health endpoint, error reporting.
- Unit/integration/e2e tests, deploy smoke test, backup/restore strategy.

## Acceptance criteria
Two remote devices join same public room, see matching game state, have different private hands, complete a full legal match and see the same winner. Illegal moves rejected without state mutation. Rules are readable without developer explanation.
