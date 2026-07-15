# The teammate model

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)

`claude-task-manager` coordinates a **main agent** (the coordinator: captures/breaks down
requests, assigns tasks, reviews results, decides the `review → done | assign+todo`
hand-off) and a set of **teammate agents** that do the actual implementation work, all
communicating through `task.sh` and its inbox events rather than direct messages about task
state.

## Base agents

`ctm init` installs/refreshes four generic teammate definitions into
`<project>/.claude/agents/`:

| Agent | Use it for |
|---|---|
| `backend-dev` | Backend work. |
| `frontend-dev` | Frontend work. |
| `investigator` | Read-only code investigation — usually first in the chain. |
| `playwright-tester` | Verifying behavior in a real, running browser — usually last in the chain. **Environment-dependent**: it needs the Playwright MCP server; without it, the agent is installed but can't drive a browser, and the correct move is to say so rather than let a task pass as "verified" when the check never ran. |

**The launch name IS the task-manager identity.** For the base set, the file name
(`backend-dev.md`), the frontmatter `name:`, the Agent-tool `subagent_type` used to launch
it, and the `assign`/`--as` value it claims tasks under are all the *same string*. There is
nothing to strip or translate — a task assigned to `backend-dev` is picked up by an agent
launched as `backend-dev`, full stop.

They read their concrete stack/conventions from the target project's own documentation —
the templates themselves are project-agnostic.

## Custom agents (`tm-*`)

When a project needs a role beyond the base four:

```bash
cd /path/to/installed/project
ctm agent add reviewer "Reviews code and checks the quality gate."
```

This creates `.claude/agents/tm-reviewer.md`. Custom agents are **always** `tm-*`-prefixed
files; their task-manager identity is the stripped short name (`tm-reviewer.md` claims
tasks as `reviewer`). `ctm init` re-running never touches `tm-*` files — they're exclusively
yours to hand-edit.

`bin/add-agent.sh` **refuses to create a custom agent using one of the four base names**
(`backend-dev`, `frontend-dev`, `investigator`, `playwright-tester`), with or without a
`tm-` prefix: a hand-added `tm-backend-dev` would still claim tasks as identity
`backend-dev` (the prefix is only on the launch/file name, not the `--as` identity) and
fight the real `backend-dev` agent over the same queue. Choose a different short name.

## Per-agent tool allow-lists

Each generated agent's frontmatter `tools:` line is resolved by `engine/agent-tools.sh` from
`templates/agent-tools.json` (a `default` plus a per-agent-name `agents` map; each value is
either a comma-separated string or a JSON array). A project can override this by placing its
own `.claude/agent-tools.json` in the target repo. Precedence for a given agent name (first
match wins):

1. project override — `.agents[<name>]`
2. repo config — `.agents[<name>]`
3. project override — `.default`
4. repo config — `.default`
5. built-in fallback (so a deleted/broken config never blocks an install)

Inspect the effective, resolved mapping at any time:

```bash
ctm agent tools            # every agent
ctm agent tools backend-dev
```

## Running teammates

Run **3-4 teammates at a time — no more — and keep feeding them.** The default mix is the
base set: `investigator`, `backend-dev`, `frontend-dev`, plus `playwright-tester` where the
environment allows it. This is a limit on *concurrency*, not on total throughput: a teammate
that finishes a task stays alive and takes the next one.

- **Don't stop a teammate to start another.** Spawning is expensive and discards everything
  it has already learned about the codebase — send it the next task instead.
- **Feed them, don't batch them.** When a teammate reports back, hand it the next task right
  away rather than waiting for the others to finish; a blocked teammate is idle capacity.
- **More than 4 in parallel only if the work genuinely calls for it** — beyond that,
  coordination cost (routing, review, two agents editing the same file) grows faster than
  the throughput gained.

See the installed `SKILL.md`'s "Roles" and "How many teammates to run" sections for the
full workflow this drives (claim → work → checklist → files → note → review).
