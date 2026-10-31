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
Select card -> legal marbles highlighted -> select marble -> legal destinations preview -> confirm action. For a single unambiguous destination, support one-click move with undo-free confirmation setting. Jack swap and heaven exits require explicit destination. Split 7 requires step allocation UI and one atomic submit.

## Mobile
Portrait layout: board above horizontally scrollable hand; minimum 44px touch targets; pinch/zoom optional; no hover-only features. Desktop: board left, player panels and cards right.

## Accessibility
WCAG AA contrast targets, keyboard controls, visible focus, screen-reader turn announcements, reduced-motion mode, suit markers and labels beyond color.
