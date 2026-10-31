# Tock Online rules — approved release

Authority: [approved decision register](00-DECISIONS.md). All earlier OPEN statements are superseded by the user's decisions recorded there. Every decision maps to executable checks in [test traceability](../tests/RULE-TRACEABILITY.md).

## Setup and turns

2–4 players choose distinct suits, each with four marbles in break. Use a 52-card deck without jokers. Lowest drawn rank determines initial dealer, Ace low; redraw tied players, return all drawn cards, and reshuffle. First player sits clockwise after dealer; subsequent turns and dealer rotation are clockwise. Board travel follows printed arrows and is independent of turn direction.

Deal schedules: 4 players 5/4/4; 3 players 5/4/4/4; 2 players 5/5/4/4/4/4. Deal when all hands are empty. After each schedule, rotate dealer and shuffle discards with remaining deck. Never shuffle held cards. A three-player schedule leaves one card.

## Base cards

Ace: start at own 18 or move 1. King: start or move 13. Queen: 12. Jack: 11 or swap an own eligible track marble with an opponent's. Other cards move their number forward.

Play a legal card whenever one exists. If none exists, discard the entire remaining hand on your turn. Starting occupies own 18 and may capture an unprotected opponent there. Own landing is always illegal.

## Movement, protection and home

The shared circuit has 72 spaces. Starts are indices 0/18/36/54, and each segment's printed labels count 18→17→…→1. Landing on a nonprotected opponent captures it to break and resets progress and home eligibility. Pass ordinary track marbles. Any marble at its own start is protected: opponents cannot pass, land or swap it; owner may normally pass it. Home marbles are protected and cannot be passed or moved out/backward. Unused starts are ordinary track spaces.

Home eligibility requires 72 net forward track steps since break. Backward movement subtracts, heaven adds none, and Jack relocation preserves progress. Once earned, eligibility stays until capture. At own 18, branch to printed home hole 4, then 3,2,1. Enter whenever the full remaining move fits a clear path to an empty home hole; otherwise continue around the track if legal. Individual victory requires all four marbles home.

## Heaven and Jack

Heaven is one shared capturable slot. Ace/10/King may replace normal movement with entry from any numbered 8 (indices 10/28/46/64), or exit from heaven to any such 8. Entry and exit require separate cards on separate turns. Own landing is illegal; opponent landing captures. Jack swaps track marbles only, excluding protected starts, home and heaven. It neither traverses a path nor captures.

## Optional rules (independent, off by default)

- 4 replaces forward movement with four backward; no backward movement in home.
- 5 replaces own movement with moving an opponent's track marble five forward. Its owner determines collision/capture rules, so it may capture the actor. Do not move a protected opponent or enter home; add five net track steps.
- 7 splits exactly seven forward steps among distinct controlled marbles in an ordered allocation. Capture at each allocated final landing, not every step. Validate atomically. After homing a fourth marble, remaining steps may help a partner.
- 10 adds discard-and-skip alongside move 10/heaven. Target the next clockwise occupied seat. They privately choose one card to discard before play continues; an empty hand needs no discard. Skip their next scheduled turn, accumulating skips and retaining them across deals. Empty-hand players do not consume pending skips until they next have a scheduled card-playing turn.
- King moving 13 captures all unprotected track marbles along the route, including own and partner marbles. Every protected start blocks the whole action, even your own. Home stays protected. Starting with King does not sweep.

## Partnerships

Four players only, opposite seats. Until your four marbles are home, your partner follows normal opponent capture/swap restrictions. Once finished, keep your private hand and normal turns, controlling your partner's marbles. A split seven may switch control mid-action after your fourth reaches home. Win only when both partners' eight marbles are home.

## Reconnect

Pause immediately when any player disconnects, counting multiple tabs as one identity that remains connected while any tab survives. Reconnect with the saved signed browser session. After 90 seconds, the connected host may end without winner; transfer host when it disconnects. Expire rooms after 30 minutes with nobody connected. Matches live in server memory and are lost on restart.
