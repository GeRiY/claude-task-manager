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
- **Compact** — not a fourth layout on its own, but a density toggle that applies on top of
  Kanban/Swimlane: cards render smaller, with less per-card detail, so more of the board
  fits on screen.

The current view (and the compact toggle) persists in `localStorage` and is reflected in
the URL, so a board link reopens in the same layout.

## Filtering

- **Module filter** — a searchable multi-select dropdown (button → popover with a search
  box, per-module checkboxes, and a "Select all" toggle that reflects the current search and
  shows an indeterminate state on a partial selection). No selection shown means all modules;
  the selection is deep-linkable as a comma-separated `?module=` query parameter, mirroring
  the agent filter.
- **Agent filter** — narrows the board to one or more assignees.
- **Quick filters** — three one-click toggles above the board: **Awaiting you** (tasks in
  `review`), **Active** (`in_progress`), and **Blocked**. Deep-linkable via `?quick=`.
- **Search** (`q`) and **sort** (last activity / created / title / team #) — also
  deep-linkable (`?q=`, `?sort=`).

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
  review / Done) plus a free-text note field, driving the same `review`/`status`/`note`
  commands described in [COMMANDS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md).

## The projects picker

The **Source** selector in the header switches between the projects registered in
`data/projects.json` (i.e. every project that has run `ctm init`). Its "Copy for Claude
Code" action copies a ready-to-run script (with a Claude-Code-facing instruction comment
right after the shebang) that a coding agent can save and use to reach and manage that
project's board directly.

## Deep links

The board's full state lives in the URL, so any view is bookmarkable/shareable:

```
?project=<id>&lang=<en|hu>&task=<id>&agent=<a1,a2>&module=<m1,m2>&quick=<review|active|blocked>&q=<text>&sort=<activity|created|title|team>&view=<board|swim|feed>&compact=1
```

`project` and `lang` are the two most commonly shared: they open the board directly on one
project, in one language — e.g. to hand a specific view to a Hungarian-speaking teammate
without them having to reselect the project or switch languages themselves.
