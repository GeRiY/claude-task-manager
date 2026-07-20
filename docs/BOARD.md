# The browser board

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.hu.md)

The board is the shared, human-facing view onto the same data `task.sh` writes — one
project at a time, picked from the **Source** selector in the header. Every write it makes
still goes through `api/index.php` → `task.sh` (see the
[single-writer invariant](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md#the-single-writer-invariant));
the browser never writes `tasks.json` directly.

## View modes

The **View** control offers four buttons:

- **Kanban** — the default: columns by status (`todo` / `in_progress` / `blocked` /
  `review` / `done`), one card per task. Columns are individually collapsible.
- **Swimlane** — the same statuses, but rows are grouped by assigned agent, so you can see
  each teammate's queue at a glance.
- **Feed** — a flat, reverse-chronological activity feed instead of columns, useful for
  "what just happened."
- **Archive** — archived tickets that have been dropped from the live columns, listed in
  reverse-chronological order (`?view=archive`). A segmented switch groups them **by day**
  (`?agroup=day`, the default — each day header carries a count and a throughput mini-bar)
  or **by module** (`?agroup=module`). Each row shows the done-check (or a status pill),
  title, agent avatar, a cycle-time badge, and a relative close time, and the `#stats` bar
  switches to archive metrics (total archived, closes-per-day average, average lead time,
  and the count still open).

**Compact** is not a fourth layout on its own, but a density toggle that applies on top of
Kanban/Swimlane: cards render smaller, with less per-card detail, so more of the board
fits on screen.

The current view (and the compact and archive-grouping toggles) persists in `localStorage`
and is reflected in the URL, so a board link reopens in the same layout.

## The command palette (⌘K)

Search and navigation both run through the **command palette**, a single overlay opened
with **⌘K / Ctrl+K**, with **`/`** (when the focus is not in an input), or by clicking the
**`⌘K` chip** in the header; Escape closes it. One field does **fuzzy search over tickets**
(title, id, agent, module, and note text) *and* a **command catalog** — view switch,
compact toggle, archive grouping, HU/EN, pause/resume polling, refresh, open
Context/Projects — plus the live lists of projects, agents, and modules; results are
grouped under Tickets / Commands / Recent. An empty field shows the last five things you
opened; a leading `>` narrows to commands only. Arrow keys move, **Enter** opens the task
modal, and **⌘Enter** scrolls to the card on the board and flashes it.

## Filtering

- **Module filter** — a searchable multi-select dropdown (button → popover with a search
  box, per-module checkboxes, and a "Select all" toggle that reflects the current search and
  shows an indeterminate state on a partial selection). No selection shown means all modules;
  the selection is deep-linkable as a comma-separated `?module=` query parameter, mirroring
  the agent filter.
- **Agent filter** — narrows the board to one or more assignees.
- **Search** now lives in the **command palette** (⌘K, see above), not a header field —
  fuzzy-matching tickets by title, id, agent, module, and note text. Status-based filtering
  (the former Awaiting-you / Active / Blocked shortcuts) is reachable as palette commands
  and through the board controls.
- **Sort** (last activity / created / title / team #) is deep-linkable via `?sort=`.

## The task modal

Clicking a card opens the task's modal, which includes:

- Key/value header (id, team, agent, module, channel, source, thread, created/updated/last
  activity).
- **Relations** — "Depends on" / "Blocks", status-pilled and clickable, jumping to the
  related task.
- **Checklist** (`Checklist (done/total)`) — tick, untick, add, and remove items inline; the
  browser's edits go through `api/index.php` → `task.sh checklist` like everything else.
- **Files** (`Files (n)`) — the absolute paths recorded via `task.sh files add`, each
  shortened for display to the project-relative path (the stored value and copy-to-clipboard
  target stay the full absolute path — the shortening is purely visual).
- **Notes** (`Notes (n)`) — each note is a collapsed-by-default `<details>` accordion with
  its kind badge, author, and a one-line preview; opening it reveals the full text. Long
  notes (some run to thousands of characters) no longer spill the whole modal open by
  default.
- **History** (`History (n)`) — the terse status-transition timeline, each entry's `by` and
  touched `files` included where recorded.
- The primary action buttons (Approve / Changes needed / Block / Reopen / Starting / To
  review / Done, plus **To do** on done/review and an **Archive** button in every status)
  and a free-text note field, driving the same `review`/`status`/`note`/`archive` commands
  described in [COMMANDS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md).
  An archived ticket opens read-only, with just **Unarchive** and **Reopen**.

## The projects picker

The **Source** selector in the header switches between the projects registered in
`data/projects.json` (i.e. every project that has run `ctm init`). Its "Copy for Claude
Code" action copies a ready-to-run script (with a Claude-Code-facing instruction comment
right after the shebang) that a coding agent can save and use to reach and manage that
project's board directly.

## Deep links

The board's full state lives in the URL, so any view is bookmarkable/shareable:

```
?project=<id>&lang=<en|hu>&task=<id>&agent=<a1,a2>&module=<m1,m2>&sort=<activity|created|title|team>&view=<board|swim|feed|archive>&agroup=<day|module>&compact=1
```

`project` and `lang` are the two most commonly shared: they open the board directly on one
project, in one language — e.g. to hand a specific view to a Hungarian-speaking teammate
without them having to reselect the project or switch languages themselves.
