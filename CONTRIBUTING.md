# Contributing

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.hu.md)

Thanks for considering a contribution. This is a small, single-maintainer project — the
notes below are meant to keep changes easy to review, not to add process for its own sake.

## No build step

There's nothing to compile or bundle. `bash`, `jq`, `php`, and (for the board) `docker` with
the `docker compose` plugin are the only runtime dependencies. Edit a file, then exercise it
directly.

## Running the board while you work

```bash
ctm up            # builds the image on first run, starts on port 3333 (see .env: CTM_PORT)
ctm down           # stop it
```

`ctm init` inside a scratch project is the fastest way to see `install.sh`'s output, or use
`ctm wrapper <id>` to print an already-registered project's generated wrapper.

## Mirrored files must stay mirrored

Every `X.md` / `X.hu.md` pair in this repo — `README.md`/`README.hu.md`,
`docs/ARCHITECTURE.md`/`docs/ARCHITECTURE.hu.md`, `docs/COMMANDS.md`/`docs/COMMANDS.hu.md`,
`docs/BOARD.md`/`docs/BOARD.hu.md`, `docs/AGENTS.md`/`docs/AGENTS.hu.md`,
`SECURITY.md`/`SECURITY.hu.md`, and this file's own `CONTRIBUTING.md`/`CONTRIBUTING.hu.md`
— is a line-by-line structural mirror of its counterpart: same heading order, same
sections, same code blocks — only the prose differs by language. **Every change to one
file in a pair must be mirrored in its counterpart in the same commit.** This is
deliberate: a diff-reviewable mirror is the only thing stopping the two languages from
silently drifting apart, and this project has already hit that exact failure mode once —
a stale agent-naming convention (`ctm-*` instead of the current unprefixed names) sat
documented identically in both READMEs across multiple releases before anyone noticed,
because nothing forced a side-by-side comparison.

## English-only, except `.hu.md` files

Code, comments, commit messages, and everything else in this repo are **English-only**.
The exceptions are any `*.hu.md` file (the Hungarian counterpart of a mirrored doc — see
above) and the Hungarian strings inside `js/i18n.js` (the board's bilingual UI). This is
stated as a pattern rather than a list of specific files on purpose: a growing enumeration
goes stale the moment someone adds a new mirrored doc, a rule keyed on the `.hu.md`
extension does not. If you're editing a `.hu.md` file, keep the diacritics correct —
`ő`/`ű` are easy to typo as `ö`/`ü` and vice versa.

## `data/` is local, live state — never commit it

`data/<id>/` holds the real `tasks.json`/`context.json`/`events.jsonl` for every registered
project on your machine. It's gitignored for a reason: it's per-installation state, not
project source. Never add it to a commit, and never hand-edit it — go through `task.sh` even
when testing.

## Pull requests

Keep PRs focused and describe the *why*, not just the *what* — see `CHANGELOG.md`'s existing
entries for the tone this project uses. If your change touches user-facing behavior, add a
`## [Unreleased]` entry to `CHANGELOG.md`.
