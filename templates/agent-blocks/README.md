# agent-blocks/

Repo-level defaults for the free-text "project block" that `ctm init` appends to every
generated teammate agent's body (see `__AGENT_BLOCK__` in `templates/agents/*.md.tmpl` and
`templates/tm-custom.md.tmpl`, resolved by `engine/agent-block.sh`).

- `default.md` — used for any agent name with no more specific file.
- `<agent-name>.md` — per-agent override (e.g. `ctm-be-medior.md`, `tm-foo.md`).

The agent names to key a file by are the roster's — `engine/roster.sh names` prints them
(`ctm agent block show` lists the effective block for each).

Both are optional; this directory ships empty. A project sets its OWN block (without touching
claude-task-manager) with:

    ctm agent block set [name] <file>

which copies `<file>` into the target project's `.claude/agent-blocks/{default,<name>}.md` —
see `ctm agent block --help` / the precedence order documented in `engine/agent-block.sh`.
