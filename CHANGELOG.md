# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.3]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.3
[1.0.2]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.2
[1.0.1]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.1
[1.0.0]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.0
