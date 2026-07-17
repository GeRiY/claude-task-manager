# claude-task-manager

[![npm version](https://img.shields.io/npm/v/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![npm downloads](https://img.shields.io/npm/dm/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![license](https://img.shields.io/npm/l/%40mgeri1993%2Fclaude-task-manager.svg)](https://github.com/GeRiY/claude-task-manager/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GeRiY/claude-task-manager?style=flat-square)](https://github.com/GeRiY/claude-task-manager/stargazers)
[![last commit](https://img.shields.io/github/last-commit/GeRiY/claude-task-manager?style=flat-square)](https://github.com/GeRiY/claude-task-manager/commits/main)
[![CI](https://img.shields.io/github/actions/workflow/status/GeRiY/claude-task-manager/publish.yml?style=flat-square&label=CI)](https://github.com/GeRiY/claude-task-manager/actions)

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/README.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md)

A standalone, dockerized, **multi-project** Kanban task manager for coordinating Claude
Code agents (main agent + teammates) and the humans working alongside them.

**Why:** run more than one agent — or just a long session — and you lose track of what's
done, what's blocked, who's working on what, and what the goal even was. `claude-task-manager`
gives agents and humans one persistent, shared source of truth, updated through a
token-efficient CLI (`task.sh`) instead of re-reading state every time, with a shared
browser board so a human can see it too.

![claude-task-manager architecture: agents and the human/board both converge on task.sh, the single writer under an atomic lock, which alone writes the project's tasks.json](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/img/architecture.svg)

> 📖 **New here? Start with the how-to.** A simple, user-facing walkthrough of working
> with Claude Code on the board — *what to type* (in plain language), through user
> stories: **[Claude Code + ctm: a simple how-to](https://github.com/GeRiY/claude-task-manager/discussions/3)**
> ([magyarul](https://github.com/GeRiY/claude-task-manager/discussions/4)).

## Screenshots

![Live update: task.sh drives the board through todo → in_progress → review → done in real time](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-live-update.gif)

| Kanban board (English) | Task detail (English) |
|---|---|
| ![Kanban board, English](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-board.png) | ![Task detail modal, English](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-modal.png) |

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

That's it — no build step.

## Quick start

### 1. Register the `ctm` command

Any install (`install.sh` / `ctm init`) registers `ctm` on PATH automatically. If you've
never run an install yet, register it by hand:

```bash
ln -s /path/to/claude-task-manager/bin/ctm ~/.local/bin/ctm
# make sure ~/.local/bin is on your PATH
```

### 2. Start the board (docker)

```bash
ctm up            # default port: 3333 (see .env: CTM_PORT)
ctm up 4000        # a different port — rewrites .env and restarts the container
```

`ctm up` is idempotent. The board is reachable at `http://localhost:<port>/` (also
accepts `?project=<id>&lang=<en|hu>` for a direct deep link).

### 3. Install into a project

```bash
cd /path/to/some/project
ctm init                          # id/label = the folder name
```

This writes `.claude/skills/task-manager/task.sh` (a docker-free wrapper), the installed
`SKILL.md`, the eight base teammate agents (see below), and the Bash-permission hooks that
let those agents call `task.sh` without a prompt. Re-running `ctm init` is idempotent and
never touches `data/<id>/` or your own custom `tm-*` agent files.

### 4. Everyday `task.sh` examples

```bash
task.sh assign fix-login ctm-be-medior --as main     # route it — a teammate cannot take it otherwise
task.sh next --claim --as ctm-be-medior              # take your top ready todo, race-safe
task.sh review fix-login main "done, please review" --as ctm-be-medior
task.sh list --module auth --as main
```

Full command reference (~40 commands): **[docs/COMMANDS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md)**.

### 5. Manage projects

```bash
ctm list                  # registered projects (id, label, data directory)
ctm rm <id> [--force]     # deregister a project (data + wrapper) — asks first
```

## Teammates

`ctm init` installs eight base teammate agents whose launch name *is* their task-manager
identity, plus a `main` coordinator agent that assigns work and reviews results:

- a **tiered dev roster** — **`ctm-be-junior`**, **`ctm-be-medior`**, **`ctm-be-senior`** for backend and
  **`ctm-fe-junior`**, **`ctm-fe-medior`**, **`ctm-fe-senior`** for frontend, where **the tier is the
  model** (junior = haiku, medior = sonnet, senior = opus). The **medior is the default
  workhorse**; the opus seniors may only be launched with your explicit permission.
- **`ctm-investigator`** (read-only code investigation) and **`ctm-playwright-tester`** (verifying
  behavior in a real browser).

The roster is a **menu, not a launch list** — still run 3-4 at a time. Work flows
`todo → in_progress → review → done`; a teammate never closes its own task as `done`, it
routes to `review` and main decides. Main must `assign` a task explicitly — `claim` is
strict, and only the assignee may take it. Need a role beyond the base roster? `ctm agent
add <name>` creates a custom `tm-*` agent.

Full model — the tiers, the `tm-*` convention, per-agent tool allow-lists, and how many
teammates to run at once: **[docs/AGENTS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)**.

## Language / i18n

The board defaults to **English**. Click the language button in the header (or add
`?lang=hu` to the URL) to switch to **Hungarian** — the choice persists in `localStorage`
and in the URL, so a board link is shareable in a specific language.

![Kanban board, Hungarian — proof of the bilingual UI](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-board.png)

The language is **not** stored in any task or note — it lives in a small
`data/<id>/.board-lang` file. `engine/task.sh lang` reads it and reports which language a
human was using on the board; every generated agent template requires the agent to call
this once per session (see the "task.sh — calling rules" section of its own definition).

## Staying up to date

`ctm`, `install.sh`, `add-agent.sh`, and `projects.sh` each check (via a lightweight
`git ls-remote`, not a full fetch) whether `origin` has commits your checkout is missing,
and print a yellow notice if so. This is **not** run by `engine/task.sh` itself — that
would add network latency to a command called on every single task mutation.

## Documentation

- **[docs/ARCHITECTURE.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md)** — the single-writer invariant, components, directory structure, `.env` settings.
- **[docs/COMMANDS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md)** — the full `task.sh` command reference.
- **[docs/BOARD.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.md)** — the browser board: view modes, filtering, the task modal, deep links.
- **[docs/AGENTS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)** — the teammate model in full.
- **[CONTRIBUTING.md](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.md)** — no build step, running the board locally, the mirrored-files rule, and the English-only convention.

## Security

- The board's docker port is bound to `127.0.0.1` only — never reachable from the LAN.
- The write endpoint (`api/index.php`) runs an explicit command allowlist; destructive
  commands (`rm`, `restore`, `raw`, `archive`) are never exposed to the browser.
- Full posture and how to report a vulnerability: **[SECURITY.md](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.md)**.

## Community & discussions

Questions, ideas, and configs live in
[**GitHub Discussions**](https://github.com/GeRiY/claude-task-manager/discussions) —
concrete bugs belong in [Issues](https://github.com/GeRiY/claude-task-manager/issues)
instead. Good things to bring: multi-agent setups and the `--as <agent>` calling
contract, your own teammate configs, feature ideas, and usability friction.

New here? Say hi in the
[welcome thread](https://github.com/GeRiY/claude-task-manager/discussions/1) — tell us
which projects you coordinate agents on and what you're using the tool for.

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=GeRiY/claude-task-manager&type=Date)](https://star-history.com/#GeRiY/claude-task-manager&Date)
