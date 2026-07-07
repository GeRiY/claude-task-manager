# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/GeRiY/claude-task-manager/releases/tag/v1.0.0
