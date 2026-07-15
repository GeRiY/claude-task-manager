# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Fixed a stale, self-contradicting claim about agent naming in both READMEs.** The
  [1.2.0] release renamed the base teammate set from `ctm-*` to unprefixed
  (`backend-dev`/`frontend-dev`/`investigator`/`playwright-tester`), but only one of the
  four places each README described the base set was updated at the time — the rest
  still said "`ctm-*`" and undercounted the base set at 3 roles instead of 4. Both
  READMEs now consistently name the actual current set everywhere they mention it.
- **Restructured both READMEs from ~1,860 words down to roughly 800**, and gave each a
  short "why" (previously missing entirely: the READMEs said what the tool is, never
  what problem it solves). Contributor-facing content — the architecture breakdown,
  directory structure, environment variables, and the full `task.sh` command list — moved
  out to dedicated, English-only reference docs (see Added, below); the README now links
  to them instead of inlining them, keeping the "3 audiences in 1 file" problem from
  growing every release. A new hand-authored architecture diagram
  (`docs/img/architecture.svg`) illustrates the single-writer invariant, the idea at the
  center of the whole design, which previously had no picture anywhere.
- **Each README now shows its own language's screenshots** instead of both showing the
  same (Hungarian) set — `README.md` shows the English board/modal, `README.hu.md` shows
  the Hungarian ones, and each keeps exactly one screenshot in the opposite language as
  proof the UI is actually bilingual.

### Removed
- **Deleted a screenshot that leaked private information.**
  `docs/screenshots/demo-en-projects.png` was published on both GitHub and npm and
  exposed a private project name in the visible projects list, plus the maintainer's
  absolute home directory path in a window title/breadcrumb. The "Projects panel" column
  referencing it is gone from the screenshot table in both READMEs; no other screenshot
  was touched.
- **Removed the Socket badge from both READMEs.** Its badge URL
  (`https://socket.dev/api/badge/npm/package/@mgeri1993/claude-task-manager`) currently
  returns HTTP 403 and rendered as a broken image on GitHub and npm alike — a badge that
  never worked carries negative signal, not positive.
- **Stopped shipping `docs/screenshots/` in the npm package.** It was added in [1.0.3] so
  README images would render locally, but [1.0.4] switched every image reference to
  absolute `raw.githubusercontent.com` URLs — so the bundled copies were never actually
  read by anything, while still accounting for roughly 2.2 MB of a 2.49 MB package (~88%)
  downloaded on every `npm install -g`.

### Added
- `docs/ARCHITECTURE.md` — the single-writer invariant spelled out explicitly (every
  mutation, from an agent's Bash tool or from the board, goes through `task.sh` under an
  atomic mkdir-lock; the browser never writes JSON directly; `api/index.php` runs a
  command allowlist), plus the components list, directory structure, and `.env`
  reference that used to live in the README.
- `docs/COMMANDS.md` — a full reference for `task.sh`'s ~40 commands (the README
  previously documented about 10), grouped by purpose: lifecycle, claiming/hand-off,
  review, context, checklist, files, inbox, and admin/meta, plus the `--as <agent>` rule.
- `docs/BOARD.md` — documents the browser board's four view controls (Kanban/Swimlane/
  Feed, plus the Compact density toggle), module/agent/quick filtering, the task modal
  (Files, collapsible notes, checklist), the projects picker, and the full deep-link
  query-parameter reference — none of which had a home in the README before.
- `docs/AGENTS.md` — the teammate model end to end: the four base agents and their
  launch-name-is-identity convention, the `tm-*` custom-agent convention and why
  `ctm agent add` refuses the four base names, the per-agent tool allow-list precedence
  (`templates/agent-tools.json` + project `.claude/agent-tools.json` override), and
  guidance on running 3-4 concurrent teammates rather than stopping and restarting them.
- `SECURITY.md` — how to report a vulnerability, and the security posture already true of
  this project (board bound to `127.0.0.1` only, write-endpoint command allowlist,
  registered-project validation) collected in one place instead of only living inside the
  README's Security notes section.
- `CONTRIBUTING.md` — no build step, running the board locally, the READMEs'-must-stay-
  mirrored rule, the English-only convention (except `README.hu.md` and `js/i18n.js`),
  and that `data/` is local live state that's never committed.
- `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md`.
- **Hungarian counterparts for the four new reference docs, plus `SECURITY.md` and
  `CONTRIBUTING.md`** — `docs/ARCHITECTURE.hu.md`, `docs/COMMANDS.hu.md`,
  `docs/BOARD.hu.md`, `docs/AGENTS.hu.md`, `SECURITY.hu.md`, `CONTRIBUTING.hu.md`. Each is
  a structural mirror of its English source (same heading order, same code blocks), the
  same guarantee `README.md`/`README.hu.md` already give each other — otherwise these
  would be the corner of the project the Hungarian-only docs promise didn't reach.
  `README.hu.md`'s links into `docs/` and into `SECURITY.md` now point at the `.hu.md`
  files instead of the English ones, so a Hungarian-speaking reader following the README
  never lands on an English page by surprise.
- **A language-switcher badge pair on all twelve mirrored files** (six English, six
  Hungarian), matching the badge style already used at the top of
  `README.md`/`README.hu.md` — every one now links directly to its other-language
  counterpart instead of leaving a reader to find it by guessing a URL.
- **`CONTRIBUTING.md`'s mirroring and English-only rules are now stated as patterns, not
  enumerations.** With six mirrored `.md`/`.hu.md` pairs instead of one, listing each pair
  by name in prose was already showing the seams; the rule now reads "every `X.md` /
  `X.hu.md` pair" and "any `*.hu.md` file" instead, so adding the next mirrored doc doesn't
  require also remembering to update this list.
- **Both READMEs' Documentation lists now link `CONTRIBUTING.md`/`CONTRIBUTING.hu.md`.**
  It existed and was mirrored into Hungarian, but neither README pointed to it, so a reader
  had no way to discover it short of browsing the repo root.

## [1.2.0] - 2026-07-14

### Added
- **Atomic, race-safe task claiming** — `task.sh claim <id>` flips a `todo` to `in_progress`
  and assigns it to the `--as` caller in a single locked write, refusing if another agent
  already claimed it. The guard lives inside the jq filter under the existing mkdir-lock, so
  two agents racing on the same task can never both win (previously `assign` + `status
  in_progress` were two unguarded writes — both racers could self-assign and double-work).
  `task.sh next --claim` picks the top ready `todo` and claims it, walking to the next
  candidate if the first is taken in the race window.
- **Directed hand-offs** — `task.sh handoff <id> <to> [note]` reassigns a task AND sends the
  target a *directed* inbox message. `emit_event` now writes an optional `to` field, and
  `inbox` highlights events addressed to the reader with `‼️` (vs `📬` for broadcast) — the
  explicit way to route a finding/bug/sub-task to a specific teammate instead of manually
  creating and reassigning a ticket.
- **Review routing & aging** — `task.sh review <id> [reviewer=main] [note]` moves a task to
  `review`, assigns a reviewer, and pings their inbox, so review has an owner instead of
  silting up. `task.sh review-queue [reviewer]` lists tasks in review (oldest first, with
  age); `task.sh stale [--older-than 24h] [status...]` surfaces held-but-idle
  `in_progress`/`review` tasks (by `lastActivityAt`) so main can re-route forgotten work.
  Both correctly exclude archived tasks.
- **Per-task `files` list** — `task.sh files <id> [add|rm <abs-path>...]` records the source
  files a task touches as a `files` array of **absolute paths** (unique; no sub-op lists
  them). It is a machine-readable pointer to the change kept out of the free-text note,
  included in new tasks' schema and in `list --json`, and backward-compatible with tasks that
  predate the field. Introduced as a **standard duty** in every teammate agent's work cycle.
- **Silent, non-blocking update notice from `task.sh`** — coding agents never learned on their
  own when a newer package version shipped (the update check was, and stays, off `task.sh`'s
  hot path to avoid per-call network latency). Now the networked check runs occasionally in a
  fully **detached background** subshell (gated by both a random draw and a 6h TTL) that writes
  a small flag file; every non-meta command then cheaply reads that flag (no network) and, when
  an update is available, prints a **throttled** one-line notice to stderr (at most once/hour
  per store) so the agent surfaces it to the human. Tunable via `TM_UPDATE_TTL` /
  `TM_UPDATE_PROB` / `TM_UPDATE_NOTICE_TTL`; disable with `TM_NO_UPDATE_CHECK=1`. The shared
  git-ahead detection in `engine/check-update.sh` was refactored into a reusable
  `remote_is_ahead` / `refresh_update_cache` (the synchronous admin-facing `check_for_updates`
  is unchanged in behavior).
- **Configurable per-agent tool allow-lists at `ctm init`** — the `tools:` frontmatter baked
  into each generated teammate agent is now driven by `templates/agent-tools.json` (a
  `default` plus a per-agent-name `agents` map; values may be a comma string or a JSON array),
  resolved by `engine/agent-tools.sh`. A project may override per agent by placing its own
  `.claude/agent-tools.json` in the target repo (precedence: project `agents[name]` → repo
  `agents[name]` → project `default` → repo `default` → built-in fallback). `ctm agent tools
  [name]` prints the effective mapping. Custom `tm-*` agents (`ctm agent add`) resolve tools
  from the same config.
- **The `files` list is now visible on the board** — `task.sh` wrote the array and it reached
  the browser with the raw `tasks.json`, but nothing rendered it, so it stayed invisible (of
  525 real tasks only 15 had it filled). The task modal now has its own **Files** section,
  each path shortened to the project root: the project id in `data/projects.json` matches the
  source folder's name, so everything up to and including the first segment that matches it is
  trimmed (`/app/Models/Invoice.php` instead of the full path from the filesystem root).
  Matching is segment-exact, so a sibling directory whose name merely starts with the project
  id is never mistaken for it, and a path outside the project keeps its full absolute form
  rather than being blindly truncated. The stored value is untouched — `files
  add` still requires absolute paths, and both the hover title and click-to-copy yield the full
  absolute path. The shortening is purely visual.
- **`by` and `files` on every note and status transition** — notes and history entries now
  record *who* wrote them and *which files* they cover, and `task.sh` derives both itself
  instead of expecting the caller to pass them (the `files` field is the cautionary tale: it
  has existed for a while, but only 15 of 525 tasks ever had it filled, precisely because it
  had to be supplied by hand). `by` comes from the `--as` caller; a note's `files` are the
  task's files not yet claimed by any earlier note; a transition's `files` are the union of all
  note files minus those already attributed to earlier history entries. That last rule is
  deliberately **set-based rather than timestamp-based**: `now_iso()` is second-granular, and
  the usual `files add` → `note` → `status` sequence runs well inside one second, so comparing
  timestamps would silently drop notes. Applied consistently to all six transition sites
  (`add`, `status`, `claim`, `review`, `reopen`, `status-many`) and to `handoff`'s note, so a
  transition is never annotated in one command and bare in another. Both fields render in the
  modal — `by` in the note's summary and on the history timeline, `files` beneath each entry.
  Fully backward-compatible: entries predating the fields simply render without them.
- **Per-task checklist** — `task.sh checklist <id> [add <text>… | done <item-id>… | undo
  <item-id>… | rm <item-id>…]` records the small steps inside a task: the ones that don't
  deserve an id, an owner, a status and a board card of their own. That boundary is the point —
  real sub-tasks still belong in `dep`/`handoff`; the checklist is for everything below that
  threshold, which until now had nowhere to live but prose in a note. Items carry a **stable
  `c<n>` id**, never an index: two agents ticking concurrently would otherwise hit the wrong row
  after a delete, which would undercut the same race-safety the mkdir-lock and atomic `claim`
  exist to provide. Ids are never recycled — a monotonic `checklistSeq` counter survives the
  deletion of the highest item, which a naive "max + 1" would not. `addedBy`/`doneBy` come from
  the `--as` caller; nothing but the text is passed in. Progress (`3/5`) is derived, not stored.
  The board renders the list in the task modal and can fully edit it (tick, untick, delete, add)
  — the browser still writes nothing directly, every change goes through `api/index.php` →
  `task.sh`. Marking a task `done` with unchecked items **warns on stderr but does not block**,
  and ticking the last item does **not** move the status by itself: the status stays the agent's
  call. Backward-compatible with the tasks that predate the field.

### Changed
- **The base agents are renamed, and their launch name IS their identity** — `backend-dev`,
  `frontend-dev`, `investigator`, plus the new `playwright-tester`. The `ctm-` prefix is gone
  from the base set: `subagent_type` and the `assign`/`--as` identity are now the same string,
  so there is nothing to strip or translate. This closes a whole class of bug rather than just
  renaming things — previously `ctm-frontend-developer` launched an agent whose identity was
  `frontend-developer`, and a task assigned to the launch name sat unclaimed forever, silently.
  The roster table that existed to document that translation is no longer needed for the base
  set. **Breaking:** tasks already assigned to an old identity (`backend-developer`, …) are not
  migrated — they keep their `assignedAgentId` and won't match the new agents' "which tasks are
  mine" filter, so re-assign any still-open ones. `tm-*` custom agents are unaffected (their
  identity is still the name minus the `tm-` prefix), but `ctm agent add` now **refuses the four
  base names**: a custom `tm-backend-dev` would claim tasks as `backend-dev` and fight the base
  agent over the same queue — the `tm-` prefix on the launch name never protected against that.
- **`playwright-tester` teammate** — drives the running app in a real browser and reports what
  it OBSERVED (what it did, expected, and actually got), rather than what the code implies. It
  fixes nothing: a defect becomes a task handed to the teammate it belongs to. It is
  **environment-dependent** — without the Playwright MCP server it can't do its job, and the
  rule is to say so, not to let a task pass as verified because the check never ran.
- Teammate agent templates (`backend-dev`, `frontend-dev`, `investigator`, `playwright-tester`,
  `tm-custom`) now exercise the new coordination commands: the claim
  step uses atomic `claim`, closing uses `review <id> main` (routed review instead of a bare
  `status … review`), sub-task creation uses `handoff`, and recording touched `files` is a
  step in every work cycle. `SKILL.md` documents `claim`, `handoff`, `review`, `review-queue`,
  `stale`, and `files`.
- The board viewer's **Module filter is now a searchable multi-select dropdown** — a button
  opens a popover with a search box, per-module checkboxes, and a "Select all" toggle (which
  reflects the current search and shows an indeterminate state on a partial selection), so you
  can view several modules' tasks together. No selection = all modules; the selection is
  deep-linkable as a comma-separated `?module=` query param, mirroring the agent filter.
- **Notes in the task modal are collapsible** — each note is now a native `<details>`/
  `<summary>` accordion, collapsed by default, with the kind badge, author and a one-line
  preview of the text visible while closed (the preview is clipped in CSS, so opening still
  reveals the untruncated note). Notes here run to thousands of characters and previously
  spilled into the modal in full, which made a task with any history unreadable. Native
  `<details>` keeps keyboard support and accessibility for free and needs no event handler.
- **Note-kind vocabulary widened from 4 stems to 10** — an ALL-CAPS prefix at the start of a
  note still earns a colored badge, but the classifier now recognises `KÉSZ`/`DONE`,
  `BLOKK`/`BLOCK`, `FIGYELEM`/`WARNING`, `VERIFIKÁLVA`/`TESZT`, `USER` and `ÁTADÁS`/`HANDOFF`
  alongside the existing research/plan/decision/impl (which also picks up `REFAKTOR`), in both
  accented and unaccented spellings. The list was chosen from what agents actually write: of
  794 real notes, 127 carry a recognisable prefix, and those were dominated by exactly these
  words — yet only `DÖNTÉS` mapped to a real category, leaving the rest grey. Measured on that
  corpus, prefixed notes resolving to a real category rose from 11 (8.7%) to 42 (33.1%).
  Free-text prefixes still fall back to the neutral badge, so the
  vocabulary guides without excluding. `task.sh`'s `note` help lists the canonical keys, and
  both sides carry a cross-reference comment (`js/Utils.js`'s `NOTE_KIND_STEMS` ↔ the help
  text), since no build step links them.
- `handoff`'s generated note now starts with a `HANDOFF:` prefix ahead of the 🤝 marker. The
  badge classifier keys off an ALL-CAPS prefix, so an emoji-first note could never match — the
  hand-off category was unreachable in practice. Every hand-off is now badged automatically,
  with no manual tagging by the agent.

### Fixed
- Nested file lists inside the notes and history timeline inherited the timeline's bullet and
  left border, because `.timeline li` / `ul.notes li` matched descendants rather than direct
  children — every file row drew a stray dot and rule. Now scoped with `> li`.

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
