# Changelog

## 0.1.1 (2026-10-01)

- Every file that runs now starts with a SECURITY REVIEW header: a checkable claim of what it touches (network, database, files, processes, dynamic code, environment).
- AGENTS.md (and CLAUDE.md) give coding agents and people a procedure to verify those claims, with expected results and red flags.
- scripts/security-check.sh: allowlist-based static checks (grep and find only), and `--dynamic` sandboxed runs under Node's permission model with no network.
- lib/resolve.js can now load only `mongodb` and `js-yaml`.
- New tests: planted secrets in .env and the environment never reach any output; the loader refuses other packages.
- test/fixtures/make-snapshot.js builds the demo snapshot without a database.

## 0.1.0 (2026-09-30)

First release, against Delegation Charter Specification v0.1.1 and LibreChat v0.8.8-rc4.

- Agent Plugin (`plugin.json`, Agent Plugins v1) with observe-only hooks for RunStart, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart and Stop.
- Diagnosis of every agent against the charter header, eight pillars, four minimum escalation triggers and lifecycle rules.
- Deployment conformance against Levels 1 to 3, with config, plugin or core as the way to close each gap.
- Observation summary, opt-in live probes through the Agents API, draft charters per agent, and an anonymous aggregate.
- Admins only: runs require a LibreChat user with the ADMIN role; probe API keys must belong to that admin; snapshots must be exported by an admin.
- mongosh snapshot export for operators who prefer not to connect Node to the database.
- Test harness that runs the plugin through LibreChat's own loader and hook executor.
