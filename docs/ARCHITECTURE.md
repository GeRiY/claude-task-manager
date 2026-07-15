# Architecture

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md)

This document covers how `claude-task-manager` is put together: the pieces, the
single-writer invariant that holds the whole thing together, the directory layout, and the
`.env` settings. It's aimed at contributors and anyone adapting the tool, not at day-to-day
users — for that, start with the [README](https://github.com/GeRiY/claude-task-manager/blob/main/README.md).

## The single-writer invariant

Every mutation to a project's task data — whether it comes from an agent's Bash tool call or
from a human clicking a button on the browser board — goes through exactly one program:
**`engine/task.sh`**. There is no second path.

- `engine/task.sh` takes an atomic **mkdir-based lock** around every write, maintains
  `updatedAt`/history/notes itself, and writes a pre-write backup before touching
  `tasks.json`. Two callers racing on the same task (two agents, or an agent and the board)
  can never both win — one gets the lock, the other waits or is rejected (e.g. `claim` on an
  already-claimed task).
- **The browser never writes JSON directly.** The board's write endpoint, `api/index.php`,
  runs an explicit **command allowlist** (`status`, `note`, `priority`, `module`, `tag`,
  `assign`, `dep`, `status-many`, `reopen`, `add`, `checklist`) through `task.sh` with the
  selected project's `TM_DIR` — destructive commands (`rm`, `restore`, `raw`, `archive`) are
  never exposed to it. See [SECURITY.md](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.md)
  for the full write-endpoint security posture.
- **Agents don't get a shortcut either.** The installed `SKILL.md` and every teammate agent
  template state the same hard rule: never edit `tasks.json`/`context.json` with
  `Read`/`Write`/`Edit` — only `task.sh` commands.

The practical effect: `tasks.json` and `context.json` are never read-modify-written by two
callers at once, and there is exactly one code path that has to get locking, history, and
event emission right.

### task.sh needs no docker; the board does

`task.sh` calls (all agent work) run as **plain host-bash scripts** — no docker, no
container, no network. Only the browser **board** and its **write API** (`api/index.php`)
are containerized (PHP's built-in server via docker compose). This split is why a teammate
agent can update tasks in a session where docker isn't even running.

## Components

- **`engine/task.sh`** — the actual Kanban engine (jq-based, atomic writes, locking,
  `events.jsonl`-based inbox notifications). Points at any project's own data directory via
  the `TM_DIR` environment variable. Prints a stderr reminder on every run if the project's
  preferred language (set from the board) isn't English — see
  [Language / i18n](https://github.com/GeRiY/claude-task-manager/blob/main/README.md#language--i18n)
  in the README.
- **`engine/projects.sh`** — the project-registration admin CLI: for every registered
  project it creates a `data/<id>/` data directory and a `wrappers/<id>.sh` wrapper that
  already has `TM_DIR` and the engine's absolute path **baked in**.
- **`engine/agent-tools.sh`** — resolves the `tools:` allow-list baked into a teammate
  agent's frontmatter at `ctm init`/`ctm agent add` time. See
  [AGENTS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md).
- **`engine/check-update.sh`** — sourced by the admin-facing scripts (`ctm`, `install.sh`,
  `add-agent.sh`, `projects.sh`) to print a yellow "update available" notice, and by
  `task.sh` itself for its own throttled, non-blocking notice — see
  [Staying up to date](https://github.com/GeRiY/claude-task-manager/blob/main/README.md#staying-up-to-date)
  in the README.
- **`data/<id>/`** — the projects' actual tables (`tasks.json`, `context.json`,
  `events.jsonl`, `.cursors/`, `.board-lang`) — they live HERE, in claude-task-manager's own
  repo, not in the target project.
- **`index.html` + `js/*` + `style.css`** — the browser board. Served by a PHP built-in
  server via docker compose; the Source selector switches between the projects registered
  in `data/projects.json`. See [BOARD.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.md).
- **`api/index.php`** — the board's WRITE endpoint: runs the allowlisted `task.sh` commands
  above with the selected project's `TM_DIR` baked in.
- **`install.sh`** / **`bin/ctm`** — installs `.claude/skills/task-manager/` (wrapper
  `task.sh` + `SKILL.md`), the base teammate agents, and the `allow-task-sh.sh` /
  `notify-inbox.sh` hooks into an arbitrary target project, and extends its Bash allowlist.
- **`bin/add-agent.sh`** (`ctm agent add`) — creates a custom, `tm-*`-named teammate
  definition in an already-installed project.

## Directory structure

```
claude-task-manager/
  engine/task.sh, projects.sh, check-update.sh, agent-tools.sh  # engine + project-admin CLI + update-check + tool resolution
  bin/ctm, add-agent.sh                          # the "ctm" command-line entry point
  install.sh                                     # a target project's installer (ctm init calls it)
  templates/                                     # SKILL.md / agents/*.md.tmpl / tm-custom / hooks templates (with __PLACEHOLDER__s)
  api/index.php                                  # the board's write endpoint
  index.html, js/, style.css                     # the browser board
  favicon.svg, favicon.ico                       # board favicon
  data/<id>/                                     # per-project table (gitignored)
  wrappers/<id>.sh                               # generated, per-project task.sh wrappers (gitignored)
  docker-compose.yml, Dockerfile                 # containerizes the board+API (CTM_PORT, CTM_RESTART)
```

## Environment variables (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `CTM_PORT` | `3333` | The board's port (host loopback: `127.0.0.1:<port>`). Set by `ctm up <port>`. |
| `CTM_RESTART` | `no` | Docker restart-policy. `ctm autostart on` → `unless-stopped`. |
| `CTM_UID` / `CTM_GID` | host user's | Written by `ctm up`/`ctm autostart` so the container runs as the host user, keeping `data/` files host-owned instead of root-owned. |

See `.env.example` (the real `.env` is gitignored, since `ctm` writes/updates it).
