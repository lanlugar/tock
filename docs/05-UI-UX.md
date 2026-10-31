# UI/UX specification

## Design direction

Original modern tabletop aesthetic, not a pixel-copy of Rustik artwork. Warm ivory background, deep navy panels, emerald/amber/coral/blue player accents, restrained motion. Use card suit + text with color for accessibility.

## Screens

1. Landing: Create game, Join game, How to play.
2. Create room: player name, optional rule toggles, max players.
3. Lobby: share code/link, player seats, ready states, host start.
4. Game: responsive SVG board, private card hand, current turn, dealer, discard count, actions, rules modal, connection status.
5. Result: winner, stats, rematch.

## Interaction

The room header's **Copy invite** button copies the plain room code and shows a success message. If native clipboard access is unavailable or denied, try selection-based copying, then expose a selected read-only code field for manual copy. Never show success when both clipboard methods fail.

**Reset table** is available to every connected member. All active players receive a prominent, focused notification describing the loss of the current game, confirm/reject controls and a 30-second countdown. The requester has already confirmed by initiating. Play and lobby mutations pause during the request. Any rejection names the rejecting player and cancels the request; a new attempt requires new confirmations. Everyone approving, or the countdown ending without a rejection, clears the game and returns the existing players to the lobby with readiness reset.
Select card -> legal marbles highlighted -> select marble -> legal destinations preview -> confirm action. For a single unambiguous destination, support one-click move with undo-free confirmation setting. Jack swap and heaven exits require explicit destination. Split 7 requires step allocation UI and one atomic submit.

## Mobile

Portrait layout: board above horizontally scrollable hand; minimum 44px touch targets; pinch/zoom optional; no hover-only features. Desktop: board left, player panels and cards right.

## Accessibility

WCAG AA contrast targets, keyboard controls, visible focus, screen-reader turn announcements, reduced-motion mode, suit markers and labels beyond color.
