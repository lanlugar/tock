# Approved rules → executable checks

All decisions below were approved in the implementation conversation. The board has **72**, not 76, shared track holes.

| Decision | Engine coverage (`packages/game-engine/src/engine.test.ts`)                                                        | Online/browser coverage                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| D01–D02  | Approved starts; 72-space wrap; unused starts                                                                      | SVG mapping, legal move synchronization                                                           |
| D03      | Full circuit; signed backward progress; persistent eligibility; home entry; blocked home; overshoot; no exit       | Individual and team winning home moves                                                            |
| D04–D05  | Whole-hand discard; must use legal card; immutable rejection                                                       | Out-of-turn/stale rejection                                                                       |
| D06–D07  | All 2/3/4-player schedules; dealer rotation; leftover card; invalid reserve; card conservation                     | 2/3/4-player rooms; Ace-low dealer and tied redraw                                                |
| D08–D09  | Protected passing/landing; owner passing; own collision; capture resets progress                                   | Legal actions and capture interactions                                                            |
| D10–D12  | Heaven cards, progress, capture, own occupancy and invalid entry                                                   | Heaven entry/capture/exit choices                                                                 |
| D13–D14  | Backward 4; opponent 5; atomic split 7; skip 10; King captures own marbles and blocks protected starts; King start | Optional-card interactions and split allocation                                                   |
| D15–D16  | Unused starts; Jack swaps; protected exclusion; preserved progress                                                 | Jack interaction and seat validation                                                              |
| D17      | Not in pure engine (time and connection state are server responsibilities)                                         | Disconnect pause; reconnect identity/privacy; duplicate tabs; 90-second grace; host transfer; TTL |
| D18      | Partner capture before finishing; mid-seven assistance; all-eight victory                                          | Four-browser team victory; rematch                                                                |

Invariant tests assert card conservation, four stable marble IDs per player, unique occupied positions, deterministic legal transitions and unchanged rejected state. Network tests assert filtered snapshots, recipient-only hands, membership enforcement, action receipts, stale versions and serialized concurrent submissions.

Browser fixtures are set directly through the in-process test server. No fixture route, debug endpoint, client-declared hand or client-declared seat exists in the production protocol. Winning browser scenarios begin from controlled late-match positions; the engine additionally exercises 200 continuous legal turns with conservation checks.

The engine also plays complete individual and partnership matches from break through a winner with conservation checks throughout. Manual release gates remain: two physical devices/networks and public deployment smoke test. Automated browser contexts do not substitute for those checks.
