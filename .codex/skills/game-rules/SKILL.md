---
name: game-rules
description: Pure game rules engineering
---

# Pure game rules engineering

When implementing board logic, read docs/00-DECISIONS.md and docs/02-RULES.md. Build an explicit legal move generator; each approved rule needs positive, negative and boundary tests. Stop for ambiguous decisions. Never mutate state on rejected action.

## Deliverable
Explain changed files, rule IDs addressed, tests run, and remaining risks.
