# `task.sh` command reference

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md)

`engine/task.sh` is the single writer for a project's `tasks.json` and `context.json` — see
the [single-writer invariant](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md#the-single-writer-invariant).
This page lists its ~40 commands, grouped by purpose. The full, always-current list is one
call away:

```bash
task.sh help
```

(Run through the installed wrapper: `<project>/.claude/skills/task-manager/task.sh help`.)

## The `--as <agent>` rule

**Every non-meta command requires `--as <agent-name>`** — your own identity (the main agent
uses `--as main`; a teammate uses its own name, e.g. `--as ctm-be-medior`). It is recorded as
the `by` field on every note/history entry and event, and it's how the inbox hook knows who
to deliver fresh events to. Without it, a non-meta command fails outright.

The **meta commands are exempt** (no `--as` needed): `help`, `inbox`, `init`, `validate`,
`restore`, `raw`.

## Task lifecycle

| Command | What it does |
|---|---|
| `add <id> <title> [desc]` | New task (`todo`, `priority=normal`, empty `tags`/`dependsOn`). |
| `status <id> <status> [note]` | Status change (`todo`\|`in_progress`\|`blocked`\|`review`\|`done`) + history entry. |
| `status-many <status> <id...>` | Move several tasks to one status in a single atomic write. |
| `reopen <id> [status]` | Reopen a closed/archived task (default: `todo`), with history. |
| `note <id> <text>` | Append a note. An ALL-CAPS prefix + `:` (e.g. `IMPL:`, `DONE:`, `BLOCK:`) earns a colored kind badge on the board. |
| `priority <id> <low\|normal\|high\|urgent>` | Set priority (drives `next`'s ordering). |
| `tag <id> <add\|rm> <tag>` | Add/remove a label. |
| `module <id> <module>` | Set the free-text module/area label (empty string clears it). |
| `dep <id> <add\|rm> <other-id>` | Dependency: `id` waits on `other-id` (cycle- and existence-checked). |
| `set <id> <field> <json>` | Set an arbitrary field to a raw JSON value — the escape hatch. |
| `archive <id>` / `unarchive <id>` | Toggle `isArchived`. |
| `rm <id>` | Delete a task. |

## Claiming & hand-off

| Command | What it does |
|---|---|
| `assign <id> <agent>` | Set `assignedAgentId` directly. **Required before anyone can claim.** |
| `claim <id> [agent]` | **Atomic, race-safe**: flips a `todo` **assigned to the `--as` caller** to `in_progress` in one locked write; refuses if another agent already claimed it. |
| `next [--claim]` | The next recommended `todo` (no open dependency), by priority — **scoped to the `--as` caller**. `--claim` atomically takes it, walking to the next candidate if the first is taken in the race window. |
| `handoff <id> <to> [note]` | Reassign to `<to>` and send them a **directed** inbox ping (`‼️`) — the explicit way to route a finding/bug/sub-task to a specific teammate. |

### `claim` is strict: only the assignee may claim

A task assigned to **somebody else**, or assigned to **nobody**, is refused. There is no
tag-based self-service — a `backend` tag does **not** make a task yours. **Main must
`assign` every task explicitly** (or route it with `handoff`), or it can never be claimed at
all.

`next` follows the same rule: it is **scoped to the `--as` caller** — it lists (and
`--claim` takes) only the todos assigned to that agent, matching what `claim` would actually
allow, so it can never advertise another agent's work. For an unscoped overview of
everything ready, main uses `list todo`.

## Review

| Command | What it does |
|---|---|
| `review <id> [reviewer=main] [note]` | Move to `review`, assign the reviewer, and ping their inbox — review gets an owner instead of silting up. |
| `review-queue [reviewer]` | Tasks in `review`, oldest first, with age; optionally scoped to one reviewer. |
| `stale [--older-than 24h] [status...]` | Held-but-idle tasks (default `in_progress`+`review`) past the threshold, by `lastActivityAt` — surfaces stuck/forgotten work. |

## Context (session continuity)

`context.json` is a separate, small store for the human's intent across sessions — same
single-writer rule, never written directly.

| Command | What it does |
|---|---|
| `ctx` | Print the whole `context.json`. |
| `ctx-init [init] [goal]` | Create `context.json` if missing (`initPrompt`, `goal`). |
| `ctx-set <field> <json>` | Set a top-level field (`goal`\|`currentFocus`\|`initPrompt`\|`notes`…). |
| `ctx-decision <topic> <decision> [rationale]` | Append a timestamped decision. |
| `ctx-constraint <text>` | Append a standing constraint. |
| `ctx-question <add\|rm> <text>` | Add / resolve an open question. |

## Checklist

Small steps *inside* a task — the ones that don't deserve their own id, owner, status, or
board card. A real, independent unit of work still belongs in `dep`/`handoff`.

| Command | What it does |
|---|---|
| `checklist <id>` | List the task's checklist items. |
| `checklist <id> add <text>...` | Add one or more items (stable `c<n>` ids, never reused). Phrase each as a short SENTENCE, not a one/two-word label — "patch the null check in Login.php", not "patch". |
| `checklist <id> done <item-id>...` / `undo <item-id>...` | Tick / untick items. |
| `checklist <id> rm <item-id>...` | Remove items. |

Marking a task `done` with unchecked items **warns on stderr but does not block**; ticking
the last item does **not** move the status by itself.

## Files

| Command | What it does |
|---|---|
| `files <id>` | List the absolute file paths recorded on the task. |
| `files <id> add <abs-path>...` | Record source files the task touches (unique, absolute paths). |
| `files <id> rm <abs-path>...` | Remove recorded file paths. |

Recording touched files is a **standard duty** in every teammate's work cycle — it's the
machine-readable pointer to a change, kept out of the free-text note.

## Queries (non-mutating)

| Command | What it does |
|---|---|
| `list [status] [filters]` | Terse list: `<id> [status] (prio) @module title #tag`. Filters: `--tag`, `--agent`, `--priority`, `--module`, `--all` (include archived), `--json`. |
| `ids [status] [--all]` | Just the ids, one per line. Archived tasks are excluded unless `--all`. |
| `get <id>` | One task's full JSON (not the whole file). |
| `field <id> <field>` | The raw value of one field of one task. |
| `summary [--all]` | Count by status + total. Archived tasks are excluded unless `--all`. |
| `find <text> [--all]` | Title/description search (case-insensitive), terse list. Archived tasks are excluded unless `--all`. |
| `deps <id>` | What a task waits on and what it blocks. |
| `history <id>` | One task's history entries, terse. |

## Inbox

| Command | What it does |
|---|---|
| `inbox <agent>` | Events generated by *other* agents since `<agent>`'s cursor (not its own), then advances the cursor. Silent if nothing's new. Called automatically by the installed `PostToolUse` hook after every `task.sh` run — but callable by hand too. |

## Admin / meta (no `--as` needed)

| Command | What it does |
|---|---|
| `help` | This command list. |
| `init` | Create an empty `tasks.json` if missing. |
| `validate` | Schema check (required fields, status, priority, broken dependency, duplicate id). |
| `raw` | The whole file — rarely needed, token-expensive. |
| `restore` | Restore the latest pre-write backup (`tasks.json.bak`). |

## Examples

```bash
task.sh list todo --priority high --as main
task.sh add fix-login "Login fix" "Login returns 500" --as main
task.sh assign fix-login ctm-be-medior --as main      # route it — a teammate cannot take it otherwise
task.sh next --claim --as ctm-be-medior               # take your top ready todo, race-safe
task.sh claim fix-login --as ctm-be-medior            # take a specific todo of YOURS -> in_progress
task.sh handoff fix-login ctm-be-medior "404 on the export route" --as ctm-playwright-tester
task.sh review fix-login main "done, please review" --as ctm-be-medior
task.sh review-queue main --as main               # what's waiting for my sign-off
task.sh stale --older-than 24h --as main          # stuck in_progress/review tasks
task.sh checklist fix-login add "add the /discount route to the API" "wire the discount field into the checkout form" --as main
  # each item a short SENTENCE, not a one/two-word label — "route" tells nobody anything
task.sh files fix-login add /abs/path/to/file.php --as ctm-be-medior
task.sh inbox ctm-be-medior                           # (meta: no --as) fresh events
```
