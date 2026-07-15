# Security Policy

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.hu.md)

## Reporting a vulnerability

This is a single-maintainer project (repo owner: **GeRiY**, npm scope `@mgeri1993`). If you
find a security issue, please **email the maintainer** rather than opening a public issue —
use the address on the maintainer's GitHub profile, or open a
[private security advisory](https://github.com/GeRiY/claude-task-manager/security/advisories/new)
on GitHub. Include enough detail to reproduce the issue; you should get a response within a
few days.

## Security posture

`claude-task-manager` is designed to run on a developer's own machine, not as a
multi-tenant or internet-facing service. The relevant boundaries:

- **The board is bound to `127.0.0.1` only, never `0.0.0.0`.** `docker-compose.yml` publishes
  the port as `127.0.0.1:<port>:<port>`, so the container is unreachable from the LAN — only
  from the host itself.
- **The write endpoint (`api/index.php`) runs an explicit command allowlist.** Only
  `status`, `note`, `priority`, `module`, `tag`, `assign`, `dep`, `status-many`, `reopen`,
  `add`, and `checklist` are reachable from the browser; destructive commands (`rm`,
  `restore`, `raw`, `archive`) are never exposed to it, regardless of what a client sends.
- **The `project` id in every write request is validated** against `data/projects.json`'s
  registered list before it's used to pick a `TM_DIR` — a client can never point the API at
  an arbitrary directory on disk.
- All writes to `tasks.json`/`context.json`, from either the board or an agent, go through
  the single writer `engine/task.sh` (atomic lock, backup-before-write) — see
  [docs/ARCHITECTURE.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md#the-single-writer-invariant).

If you're deploying this somewhere more exposed than a local dev machine, treat the above as
the starting point, not the finish line — this project has not been hardened for that use
case.
