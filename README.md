# claude-task-manager

[![npm version](https://img.shields.io/npm/v/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![npm downloads](https://img.shields.io/npm/dm/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![license](https://img.shields.io/npm/l/%40mgeri1993%2Fclaude-task-manager.svg)](https://github.com/GeRiY/claude-task-manager/blob/main/LICENSE)

🌐 **English** | [Magyar](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md)

A standalone, dockerized, **multi-project** Kanban task manager for coordinating Claude
Code agents (main agent + teammates). One shared browser board, a token-efficient
`--as <agent>`-based `task.sh` CLI, module filtering, and a bilingual (English/Hungarian)
UI — callable from any registered project, no docker required for the CLI itself.

## Screenshots

![Live update: task.sh drives the board through todo → in_progress → review → done in real time](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-live-update.gif)

![Walkthrough: English board, task detail, Hungarian board, task detail](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-walkthrough.gif)

| Kanban board (English) | Task detail (English) | Projects panel |
|---|---|---|
| ![Kanban board, English](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-board.png) | ![Task detail modal, English](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-modal.png) | ![Projects panel](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-projects.png) |

| Kanban board (Hungarian) | Task detail (Hungarian) | Context panel |
|---|---|---|
| ![Kanban board, Hungarian](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-board.png) | ![Task detail modal, Hungarian](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-modal.png) | ![Context panel, Hungarian](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-context.png) |

## Install

Requirements: `git`, `bash`, `jq`, `docker` (with the `docker compose` plugin) and `php`
are only needed if you plan to run the browser board — the `task.sh` CLI itself only
needs `bash` + `jq`, no docker.

```bash
git clone https://github.com/GeRiY/claude-task-manager.git
cd claude-task-manager
cp .env.example .env        # default: board on port 3333, no autostart
```

Or, if you just want the `ctm` command without cloning:

```bash
npm install -g @mgeri1993/claude-task-manager
```

That's it — there's no build step. Two things you'll typically do next:

1. **Start the board** (optional, only needed for the browser UI):
   ```bash
   ./bin/ctm up               # builds the image on first run, starts on port 3333
   # or without the ctm command yet: docker compose up -d --build
   ```
2. **Register the `ctm` command globally** and **install this tool into a project**, so
   its agents can use `task.sh`:
   ```bash
   ln -s "$(pwd)/bin/ctm" ~/.local/bin/ctm   # make sure ~/.local/bin is on your PATH
   cd /path/to/some/other/project
   ctm init                                  # registers + installs into THAT project
   ```
   (`ctm init` also registers the `ctm` symlink automatically the first time it runs, so
   the manual `ln -s` above is optional — only needed if you want `ctm` available before
   installing into any project.)

See [Quick start](#quick-start) below for the full command reference.

## Architecture in a nutshell

- **`engine/task.sh`** — the actual Kanban engine (jq-based, atomic writes, locking,
  `events.jsonl`-based inbox notifications). Points at any project's own data directory via
  the `TM_DIR` environment variable. Prints a stderr reminder on every run if the project's
  preferred language (set from the board) isn't English — see [Language](#language--i18n).
- **`engine/projects.sh`** — the project-registration admin CLI: for every registered
  project it creates a `data/<id>/` data directory and a `wrappers/<id>.sh` wrapper that
  already has `TM_DIR` and the engine's absolute path **baked in**.
- **`data/<id>/`** — the projects' actual tables (`tasks.json`, `context.json`,
  `events.jsonl`, `.cursors/`, `.board-lang`) — they live HERE, not in the target project.
- **`index.html` + `js/*` + `style.css`** — the browser board. Served by a PHP built-in
  server via docker compose; the Source selector switches between the projects registered
  in `data/projects.json`.
- **`api/index.php`** — the board's WRITE endpoint: runs allowlisted `task.sh` commands
  with the selected project's `TM_DIR` (the browser never writes the JSON directly).
- **`install.sh`** / **`bin/ctm`** — installs `.claude/skills/task-manager/` (wrapper
  `task.sh` + `SKILL.md`), the generic `ctm-*` teammate agents, and the `allow-task-sh.sh` /
  `notify-inbox.sh` hooks into an arbitrary target project, and extends its Bash allowlist.
- **`bin/add-agent.sh`** (`ctm agent add`) — creates a custom, `tm-*`-named teammate
  definition in an already-installed project.
- **`engine/check-update.sh`** — sourced by the admin-facing scripts (`ctm`, `install.sh`,
  `add-agent.sh`, `projects.sh`) to print a yellow "update available" notice — see
  [Staying up to date](#staying-up-to-date).

**Important:** `task.sh` calls (agent work) need **no docker at all** — the wrappers are
plain host-bash scripts. Only the browser **board** and its **API** run in a container.

## Quick start

### 1. Register the `ctm` command

Any install (`install.sh` / `ctm init`) registers `ctm` on PATH automatically
(`/usr/local/bin/ctm` or `~/.local/bin/ctm`, whichever is writable). If you've never run an
install yet, register it by hand:

```bash
ln -s /path/to/claude-task-manager/bin/ctm ~/.local/bin/ctm
# make sure ~/.local/bin is on your PATH
```

### 2. Start the board (docker)

```bash
ctm up            # default port: 3333 (see .env: CTM_PORT)
ctm up 4000        # a different port — rewrites .env and restarts the container
```

`ctm up` is **idempotent**: if the container is already running with the same config, it
does nothing; if it's not running, it starts it; if the port changed, it restarts it. If the
requested port is already taken by another process, it fails with a clear message before
ever calling docker.

```bash
ctm down                 # stop the board
ctm autostart on|off     # docker restart-policy (unless-stopped / no) — start the board
                          # automatically on Docker/machine restart or not
```

The board is then reachable at `http://localhost:<port>/`. The URL also accepts
`?project=<id>&lang=<en|hu>` to deep-link directly to a project in a given language.

### 3. Install into a project

Run from any project's root (or anywhere inside its git repo):

```bash
cd /path/to/some/project
ctm init                          # id/label = the folder name
ctm init my-id "Pretty Name"      # explicit id/label
ctm init --force                  # overwrite generated files without prompting
```

This creates:

- `<project>/.claude/skills/task-manager/task.sh` — the project's own wrapper (`TM_DIR` +
  the engine's absolute path baked in; docker NOT required).
- `<project>/.claude/skills/task-manager/SKILL.md` — Claude Code skill documentation (the
  `task.sh` calling contract, workflow, `context.json`, etc.) — project-agnostic.
- `<project>/.claude/agents/ctm-frontend-developer.md`, `ctm-backend-developer.md`,
  `ctm-code-investigator.md` — generic teammate definitions (they read the concrete stack
  from the project's own documentation).
- `<project>/.claude/hooks/allow-task-sh.sh` + `notify-inbox.sh`, registered in
  `<project>/.claude/settings.json` — auto-allow `task.sh` Bash calls, and inject inbox
  notifications into the calling agent after every `task.sh` run.
- `<project>/.claude/settings.local.json` — extended with `task.sh`'s Bash allowlist entry
  (no permission prompt).

Re-running `ctm init` is **idempotent** — if a generated file already exists, it asks
before overwriting (unless `--force`/`-y`, or non-interactive, where it skips and tells you
to pass `--force`). It never touches `data/<id>/`'s table contents, and never touches your
own `tm-*` custom agent files.

### 4. Add a custom teammate

In an already-installed project, when you need more than the 3 base roles
(frontend/backend/investigator):

```bash
cd /path/to/installed/project
ctm agent add reviewer "Reviews code and checks the quality gate."
```

Creates `.claude/agents/tm-reviewer.md`. **Naming convention:** the base set installed by
`install.sh`/`ctm init` is always `ctm-*`; custom agents added this way are always `tm-*` —
so at a glance you can tell the auto-refreshed base set apart from your own hand-edited
addition (`ctm init` never touches `tm-*` files).

### 5. Manage projects

```bash
ctm list                  # registered projects (id, label, data directory)
ctm wrapper <id>          # print a project's generated wrapper (for manual copying)
ctm rm <id> [--force]     # deregister a project (data + wrapper) — asks first
```

## `task.sh` from a project (no docker)

Through the installed wrapper, from the project's own `.claude/skills/task-manager/`:

```bash
/path/to/project/.claude/skills/task-manager/task.sh summary --as main
/path/to/project/.claude/skills/task-manager/task.sh list todo --as main
/path/to/project/.claude/skills/task-manager/task.sh list --module auth --as main
/path/to/project/.claude/skills/task-manager/task.sh add fix-1 "Bug fix" "description" --as main
/path/to/project/.claude/skills/task-manager/task.sh module fix-1 auth --as main
/path/to/project/.claude/skills/task-manager/task.sh status fix-1 in_progress --as main
```

Full command list: `task.sh help`. The calling contract (required `--as`, the bare-call
rule, the review→done handoff loop) is documented in detail in the installed `SKILL.md`.
Tasks support an optional `module` field (free text, e.g. `auth`/`frontend`/`infra`) for
grouping/filtering — set with `task.sh module <id> <name>`, filter with
`task.sh list --module <name>`, and filterable on the board too.

## Language / i18n

The board defaults to **English**. Click the language button in the header (or add
`?lang=hu` to the URL) to switch to **Hungarian** — the choice persists in `localStorage`
and is reflected in the URL (`?lang=hu`), so a board link is shareable in a specific
language.

The language is **not** stored in any task or note. Every write from the board also sends
its current UI language; `api/index.php` persists it in a small `data/<id>/.board-lang`
file (not part of the task schema). `engine/task.sh` reads that file on every invocation
(except `help`/`inbox`, to avoid noise) and — if it's not English — prints a reminder to
stderr, e.g.:

```
[task-manager] Preferred language for this project: Hungarian — please reply and do the work in Hungarian.
```

This is how an agent running `task.sh` (via its Bash tool) learns which language a human
was using on the board, without that instruction ever being written into the task data
itself.

## Staying up to date

`ctm`, `install.sh`, `add-agent.sh`, and `projects.sh` each check (via a lightweight
`git ls-remote`, not a full fetch) whether `origin`'s default branch has commits your local
checkout doesn't have yet. If so, they print a yellow notice telling you to `git pull`; if
you're already up to date, they print nothing. This check is **deliberately not** run by
`engine/task.sh` itself — that script is called on every single task mutation (often many
times per agent session), and a network round-trip on every call would add real, repeated
latency to that hot path.

## Directory structure

```
claude-task-manager/
  engine/task.sh, projects.sh, check-update.sh   # the engine + project-admin CLI + update-check
  bin/ctm, add-agent.sh                          # the "ctm" command-line entry point
  install.sh                                     # a target project's installer (ctm init calls it)
  templates/                                     # SKILL.md / ctm-* / tm-custom / hooks templates (with __PLACEHOLDER__s)
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

See `.env.example` (the real `.env` is gitignored, since `ctm` writes/updates it).

## Security notes

- The board's docker port is bound to `127.0.0.1` only (never `0.0.0.0`) — unreachable from
  the LAN, only from the host itself.
- The write endpoint (`api/index.php`) only runs an explicit command allowlist (`status`,
  `note`, `priority`, `module`, `tag`, `assign`, `dep`, `status-many`, `reopen`, `add`) —
  destructive commands (`rm`, `restore`, `raw`, `archive`) are never exposed to the browser.
- The `project` id in every write request is checked against `data/projects.json`'s
  registered list — a client can never point the API at an arbitrary directory.
