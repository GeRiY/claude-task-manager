# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2026-07-10

### Added
- User-facing how-to guides — *"Claude Code + ctm: a simple how-to"* (EN) and *"egyszerű
  használati útmutató"* (HU) — published as GitHub Discussions and written from the user's
  perspective: **what to type** to Claude Code in plain language, through user stories
  (record a task, check status, hand off, unblock, dependencies, review→close, session
  continuity). Linked prominently near the top of both `README.md` and `README.hu.md`.

## [1.1.1] - 2026-07-08

### Fixed
- Root-owned `tasks.json` on **native Linux Docker**: the container ran as `root` (no `USER`
  in the Dockerfile), so the board's PHP write endpoint (`api/index.php`) invoked
  `engine/task.sh` as UID 0 and left `data/<project>/tasks.json` as `root:root` `-rw-------`.
  From then on the host user (and the Claude agent) could neither read nor write it — even
  `task.sh` died at its `jq` read, and a direct `Write`/`Edit` hit `Permission denied`.
  `docker-compose.yml` now runs the container as the host user
  (`user: "${CTM_UID:-0}:${CTM_GID:-0}"`), and `bin/ctm` writes the real `CTM_UID`/`CTM_GID`
  into `.env` on every `up`/`autostart`, so the engine always writes files owned by the host
  user. (macOS Docker Desktop already masked this via UID remapping; the fix is for Linux.)

### Added
- `ctm fix-perms`: reclaims ownership of `data/` files a previously root-running container
  left as `root:root`. Chowns **through the container's root** (`docker exec -u 0`), so no
  host `sudo` is needed while the board is up; falls back to a host `chown` otherwise.
- `SKILL.md` template: troubleshooting note steering agents to `ctm fix-perms` (not a direct
  JSON write, which also fails) when `task.sh` reports `Permission denied` on `tasks.json`.

## [1.1.0] - 2026-07-08

### Fixed
- Board UI: write/validation errors now surface **in context** instead of behind the modal.
  When a modal is open the message is shown inside it (sticky banner at the top of the
  modal) rather than in the fixed page banner, which the overlay used to cover. The message
  is **dismissible** (✕) and no longer auto-vanishes on the next poll — so a backend error
  raised while approving/reviewing a task is actually readable. Applies to all three modals
  (task, context, projects).

### Changed
- Header "As …" (actor / `task.sh --as`): defaults to **`human`** when left empty, both on
  load and as a fallback in `ApiClient`. The first approve/review action no longer fails
  with a hidden "set an actor first" error.
- Projects modal: "Copy wrapper" → **"Copy for Claude Code"**. The button now copies a
  single, ready-to-run bash script whose header carries a built-in instruction (as shell
  comments right after the shebang) telling a Claude Code agent to save it as
  `ctm-<id>.sh`, `chmod +x` it, and use it to reach and manage that project's board. A hint
  at the top of the modal states the copied content is meant to be handed to Claude Code.

### Added
- Task **relations** (structured `dependsOn`) are now surfaced in the UI. Each card shows a
  single summary badge (`🔗 N`) with the count of related tasks (dependencies + tasks it
  blocks) and a tooltip listing them. The task modal gains a **Relations** section
  ("Depends on" / "Blocks") with status-pilled, clickable links that open the related task.

## [1.0.5] - 2026-07-08

### Fixed
- `bin/ctm`: `ctm up` no longer silently aborts on first run (missing or empty `.env`).
  Under `set -euo pipefail`, `current_port()`'s `grep '^CTM_PORT='` pipe exited non-zero
  when there was no `CTM_PORT=` line, the `$(current_port)` substitution inherited that
  failure, and `set -e` killed the script — with no error and before `docker compose up`
  ever ran. Added `|| true` to the pipe so it returns empty and falls back to the default
  port (`3333`).

### Added
- SKILL.md template: a **Roles** section spelling out that the main agent coordinates
  (capture/break down/assign/review) and delegates all implementation to `ctm-*`/`tm-*`
  teammates rather than doing the work itself.
- SKILL.md template: a **teammate roster** table mapping each Agent launch name
  (`ctm-frontend-developer`, …) to its stripped task-manager identity
  (`frontend-developer`, …), so `assign` targets the identity the teammate actually
  filters on instead of the `ctm-`/`tm-` launch name.
- SKILL.md template: **model-choice guidance** for launching teammates — `haiku` for
  small/mechanical edits, `sonnet` for investigation/planning/testing, with `opus` and
  `fable`/`claude-fable-5` explicitly disallowed. The `ctm-*` frontmatter `model:` is only
  a default that the main overrides per launch via the Agent `model` parameter.
- SKILL.md template: documented the `module` command and the `list --module <m>` filter in
  the structured-fields catalog (already supported by `task.sh`, previously undocumented),
  plus workflow guidance for the main to set `priority` (and optionally `module`) at task
  creation.

### Changed
- `ctm-*` agent templates (frontend / backend / code-investigator): the task-pickup step
  now prefers `next` (priority-ordered) as the primary claim path and demotes `list` to an
  overview, since `list` is not priority-sorted — so main-set priorities actually take
  effect.

## [1.0.4] - 2026-07-07

### Fixed
- README: npm's registry serves the README verbatim (it does not rewrite relative links
  the way GitHub does), so the screenshot/GIF images, the `README.hu.md`/`README.md`
  cross-link, and the `LICENSE` badge link all rendered broken on npmjs.com. Switched them
  to absolute `raw.githubusercontent.com` / `github.com` URLs, which render correctly on
  both GitHub and npm.

## [1.0.3] - 2026-07-07

### Added
- README: an animated GIF showing `task.sh` driving a task live through
  `todo → in_progress → review → done` while the browser board updates via polling.
- `docs/screenshots/` is now included in the published npm package (`files`), so README
  images render correctly wherever the package is installed, not just on GitHub.

## [1.0.2] - 2026-07-07

### Changed
- CI: `publish.yml` now runs on Node 22 and publishes with a bypass-2FA `NPM_TOKEN`
  repo secret (Granular Access Token).

## [1.0.1] - 2026-07-07

### Changed
- Moved the npm package to the `@mgeri1993/claude-task-manager` scope (the unscoped
  `claude-task-manager` name is being retired).
- Expanded `package.json` `description` and `keywords` for npm discoverability.
- Added `npm install -g @mgeri1993/claude-task-manager` as an install option in the README.

### Added
- CI: GitHub Actions workflow (`.github/workflows/publish.yml`) that publishes to npm
  with provenance on every `v*` tag push, authenticated via a `NPM_TOKEN` repo secret.
- `CHANGELOG.md`, `LICENSE` (MIT).

## [1.0.0] - 2026-07-07

### Added
- Initial dockerized, multi-project Kanban board + `task.sh` CLI, extracted as a
  standalone tool for coordinating Claude Code agents.
- `ctm` CLI: `init`, `list`, `rm`, `wrapper`, `agent add`, `up`/`down`, `autostart on|off`.
- Per-project data isolation (`data/<id>/`) with generated, absolute-path wrapper scripts
  (`wrappers/<id>.sh`) so agents in different projects never collide.
- Task `module` field with board-side filtering.
- Bilingual (English/Hungarian) UI with shareable `?project=&lang=` URL state and a
  `.board-lang`-based hint so `task.sh` tells the calling agent which language to use.
- PreToolUse/PostToolUse Claude Code hooks, installed automatically by `ctm init`.
- Update-check notice (`engine/check-update.sh`) on all admin-facing scripts.
- Published to npm as `claude-task-manager`.

[1.0.5]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.5
[1.0.4]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.4
[1.0.3]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.3
[1.0.2]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.2
[1.0.1]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.1
[1.0.0]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.0
