# Codex, skills and MCP setup

## Instructions
Codex discovers `AGENTS.md` from repository root; specialized workflows live under `.codex/skills/*/SKILL.md`. Ask Codex to read the relevant skill explicitly if auto-discovery is unavailable in your installed version.

## MCP configuration
Example `.codex/config.toml` is a **mergeable example**, not a complete replacement for your personal `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`). Verify supported scopes/keys using your installed Codex version. The example uses local `npx` stdio MCP servers for Playwright and Context7. `npx` and Node must be on PATH. Review the publisher and pinned package version before running external MCP servers.

- Playwright MCP: browser inspection and UI automation; useful for visual smoke testing, not a substitute for automated Playwright test suite.
- Context7 MCP: current official framework/library docs, if you already use it; avoid blindly trusting snippets and confirm package versions.
- Optional GitHub MCP: only if repo automation/PRs needed; configure separately with least-privilege token stored outside repo.
- Optional PostgreSQL MCP: not required; prefer migrations and direct database tooling, avoid giving an agent production write credentials.

## Security
Never commit access tokens, personal config or production DB credentials. Do not use arbitrary unreviewed MCP packages. MCP tools may access local files/browser sessions; review permissions and run with least privilege.

## Sample prompts
**Start:** “Read AGENTS.md, docs/00-DECISIONS.md through docs/08-CODEX-MCP.md. Identify blockers and propose M0 plan only. No implementation yet.”
**Engine:** “Implement only approved rule decisions in packages/game-engine. Write unit tests before modifying UI.”
**QA:** “Use Playwright to verify two isolated browser contexts join and see synchronized public board but separate private hands. Report reproducible failures.”
**Deploy:** “Create deployment manifests and an operations checklist; do not deploy or create paid resources without approval.”
