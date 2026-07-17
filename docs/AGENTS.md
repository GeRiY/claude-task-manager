# The teammate model

[![English](https://img.shields.io/badge/lang-English-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)

`claude-task-manager` coordinates a **main agent** (the coordinator: captures/breaks down
requests, assigns tasks, reviews results, decides the `review → done | assign+todo`
hand-off) and a set of **teammate agents** that do the actual implementation work, all
communicating through `task.sh` and its inbox events rather than direct messages about task
state.

## Base agents

`ctm init` installs/refreshes eight generic teammate definitions into
`<project>/.claude/agents/`:

| Agent | Model | Use it for |
|---|---|---|
| `ctm-be-junior` | haiku | Backend work that is **already decided** — a task with a checklist and named files. |
| `ctm-be-medior` | sonnet | Backend work. **The default workhorse.** |
| `ctm-be-senior` | opus | Backend work that needs design/judgement. **Explicit user permission required to launch.** |
| `ctm-fe-junior` | haiku | Frontend work that is **already decided** — a task with a checklist and named files. |
| `ctm-fe-medior` | sonnet | Frontend work. **The default workhorse.** |
| `ctm-fe-senior` | opus | Frontend work that needs design/judgement. **Explicit user permission required to launch.** |
| `ctm-investigator` | sonnet | Read-only code investigation — usually first in the chain. |
| `ctm-playwright-tester` | sonnet | Verifying behavior in a real, running browser — usually last in the chain. **Environment-dependent**: it needs the Playwright MCP server; without it, the agent is installed but can't drive a browser, and the correct move is to say so rather than let a task pass as "verified" when the check never ran. |

They read their concrete stack/conventions from the target project's own documentation —
the templates themselves are project-agnostic.

### The tier *is* the model

Main does **not** pass the Agent tool's `model` parameter. It picks the right *agent*, and
the model comes with it: junior = haiku, medior = sonnet, senior = opus. There is no
per-launch model override to get right — choosing `ctm-be-medior` over `ctm-be-junior` *is* the
choice of model.

- **When unsure, use the medior.** It is the default workhorse for both areas.
- **The seniors (`ctm-be-senior`, `ctm-fe-senior`) run on opus and may only be launched with the
  user's explicit permission.** Main asks first. Without permission, the medior does the
  work.
- **The juniors only accept a task that already has a checklist and named files.** Anything
  vaguer bounces straight back with a `BLOCK:` note — main (or the senior) has to break the
  work down first. A junior is for grinding a decided list, not for deciding.
- **Area hand-offs go medior-to-medior** (`ctm-be-medior` ↔ `ctm-fe-medior`), never diagonally
  across levels.

### Junior review routing

By default a junior routes its finished work to `main`. Main **may** delegate that review
to the medior of the same area — and then the medior is allowed to close the junior's task
as `done` — but that delegation needs the user's explicit permission too.

This never becomes self-approval: **no teammate ever closes its OWN task as `done`.**

### How the roster is generated

The six dev agents are not six templates. They are rendered from **one**
`templates/agents/dev.md.tmpl`, a manifest (`templates/agents-manifest.json`, which carries
each agent's area/tier/model/color), and a per-tier fragment
(`templates/agent-tiers/{junior,medior,senior}.md`) spliced in. `engine/roster.sh` is the
single source of truth for the list of agent names — every consumer (`install.sh`,
`ctm agent tools`, `add-agent.sh`) reads the roster from there, so the name list can't drift
from what was actually generated.

**Agent colors** encode the same two axes. Backend is a cool ramp — `ctm-be-junior` cyan,
`ctm-be-medior` blue, `ctm-be-senior` purple; frontend is a warm ramp — `ctm-fe-junior` yellow,
`ctm-fe-medior` orange, `ctm-fe-senior` red. Area reads from the temperature, seniority from the
depth. `ctm-investigator` is `pink`, `ctm-playwright-tester` is `green`.

## Identity: the launch name IS the identity

**The launch name IS the task-manager identity.** For the base set, the file name
(`ctm-be-medior.md`), the frontmatter `name:`, the Agent-tool `subagent_type` used to launch it,
and the `assign`/`--as` value it claims tasks under are all the *same string*. There is
nothing to strip or translate — a task assigned to `ctm-be-medior` is picked up by an agent
launched as `ctm-be-medior`, full stop.

This matters more than it used to, because **`claim` is strict**: only the assignee may
claim a task. Assign to the identity you intend to launch, or the task can never be taken —
see [docs/COMMANDS.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md#claiming--hand-off).

## Custom agents (`tm-*`)

When a project needs a role beyond the base roster:

```bash
cd /path/to/installed/project
ctm agent add reviewer "Reviews code and checks the quality gate."
```

This creates `.claude/agents/tm-reviewer.md`. Custom agents are **always** `tm-*`-prefixed
files; their task-manager identity is the stripped short name (`tm-reviewer.md` claims
tasks as `reviewer`). `ctm init` re-running never touches `tm-*` files — they're exclusively
yours to hand-edit.

`bin/add-agent.sh` **refuses two things**: a short name that already IS a base-roster name
(`ctm-be-junior`, `ctm-be-medior`, `ctm-be-senior`, `ctm-fe-junior`, `ctm-fe-medior`, `ctm-fe-senior`,
`ctm-investigator`, `ctm-playwright-tester`), and — the broader guard — **any short name starting
with `ctm-` at all**, even one not on today's roster (so a future tier can't be squatted in
advance). This is why the whole base roster lives in the `ctm-` namespace and custom agents in
the `tm-` namespace: `tm-ctm-be-medior` (short `ctm-be-medior`) collides and is rejected, but a
plain `tm-be-medior` (short `be-medior`, no `ctm-` anywhere) is a different identity from the
real `ctm-be-medior` agent and is allowed — choose a short name outside the `ctm-` namespace and
there's nothing to collide with.

## Per-agent tool allow-lists

Each generated agent's frontmatter `tools:` line is resolved by `engine/agent-tools.sh` from
`templates/agent-tools.json` (a `default` plus a per-agent-name `agents` map; each value is
either a comma-separated string or a JSON array). A project overrides this with its own
`.claude/agent-tools.json` in the target repo. Precedence for a given agent name (first
match wins):

1. project override — `.agents[<name>]` — this one agent, in this project
2. project override — `.default` — every agent in this project
3. repo config — `.agents[<name>]` — this one agent, everywhere
4. repo config — `.default` — the baseline
5. built-in fallback (so a deleted/broken config never blocks an install)

Note the ordering of 2 and 3: the **project config wins over the repo config entirely**, and
within each scope the specific beats the default. That's what makes "configure every agent
at once, from the project" actually work. The flip side is worth knowing: a project-wide
`.default` therefore also overrides the repo's *per-agent* lists — e.g.
`ctm-playwright-tester`'s Playwright MCP tools. `ctm agent tools set <list>` warns when that
happens.

### A mandatory core

**`Bash, Read, SendMessage` is always present and cannot be removed.** It's unioned into
every resolved list, and `ctm agent tools rm` refuses those three. `task.sh` is invoked as a
bare command, so an agent without `Bash` could not claim, note or review — it would be
generated fine and then be unable to participate in the task manager at all.

### Reading and writing the lists

```bash
ctm agent tools                       # effective list for the whole roster
ctm agent tools show ctm-be-medior        # one agent
ctm agent tools set ctm-be-junior Read,Edit,Bash    # replace one agent's list
ctm agent tools set Read,Edit,Bash              # no name = project-wide default (all agents)
ctm agent tools add ctm-be-medior Glob,Grep         # extend
ctm agent tools rm  ctm-be-medior Grep              # trim (refuses the mandatory core)
ctm agent tools unset ctm-be-medior                 # drop the project override
```

The write side edits the project's `.claude/agent-tools.json`.

**Tools do not differentiate the tiers.** All six dev agents share one tool list; seniority
is expressed by the model and by the scope written into the agent definition, not by
capability. They couldn't be separated by tools anyway — `task.sh` needs `Bash` from every
agent.

## Running teammates

**The roster of eight is a menu, not a launch list.** Run **3-4 teammates at a time — no
more — and keep feeding them.** The sensible default mix is `ctm-be-medior`, `ctm-fe-medior`,
`ctm-investigator`, plus a fourth as the work calls for it: `ctm-playwright-tester` where the
environment allows it, or one junior or senior — not both. This is a limit on *concurrency*,
not on total throughput: a teammate that finishes a task stays alive and takes the next one.

- **Never run two levels of the same area at once** unless the work genuinely splits — e.g.
  the senior designs while the junior grinds a decided list.
- **Don't stop a teammate to start another.** Spawning is expensive and discards everything
  it has already learned about the codebase — send it the next task instead.
- **Feed them, don't batch them.** When a teammate reports back, hand it the next task right
  away rather than waiting for the others to finish; a blocked teammate is idle capacity.
- **More than 4 in parallel only if the work genuinely calls for it** — beyond that,
  coordination cost (routing, review, two agents editing the same file) grows faster than
  the throughput gained.

See the installed `SKILL.md`'s "Roles" and "How many teammates to run" sections for the
full workflow this drives (claim → work → checklist → files → note → review).
