# tdd-orgm superpowers-safe skeleton design

Date: 2026-04-25
Status: approved (scope A: Skeleton seguro)

## Goal

Create a new additive `tdd-orgm` variant of `pdd-orgm` that follows superpowers philosophy by default, without modifying `pdd-orgm` or superpowers skill files.

`tdd-orgm` must:
- orchestrate safe design-first → plan-first → implementation flows
- support both `query_team` and `deploy_agent`
- allow subagent roster expansion beyond current PDD roles when a required superpowers skill needs a dedicated agent

## Non-goals

- No edits to `agents/pdd-orgm/*`
- No edits to `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/*`
- No broad redesign of existing Pi orchestrators
- No runtime auto-migration of old sessions
- No implementation of this design in this spec step

## Architecture

### 1) Additive primary-agent package

Introduce new folder:

- `agents/tdd-orgm/index.md` (new primary orchestrator)
- `agents/tdd-orgm/*.md` (new subagents)
- `agents/teams.yaml` add `tdd-orgm` team entry

Existing `pdd-orgm` stays untouched and remains selectable.

### 2) Orchestrator model

`tdd-orgm` is coordinator-only by default:
- performs request triage and flow selection
- delegates phase work through `query_team` and/or `deploy_agent`
- synthesizes outputs and drives next step
- avoids direct implementation except true direct-answer/meta cases

### 3) Coordination channels

- `query_team` for parallel consultation and skill-routing fan-out
- `deploy_agent` for concrete execution ownership and stateful continuation

Rule:
- Use `query_team` when deciding or comparing across specialists.
- Use `deploy_agent` when one agent must produce artifacts or execute a phase.

## Agent roster (v1 skeleton)

Minimum safe roster under `agents/tdd-orgm/`:

1. `tdd-orgm` (primary orchestrator)
2. `tdd-brainstormer` (brainstorming/spec shaping)
3. `tdd-planner` (implementation plan writing)
4. `tdd-implementer` (TDD-first execution)
5. `tdd-reviewer` (code review request + synthesis)
6. `tdd-verifier` (verification gate before completion)
7. `tdd-worktree-manager` (optional isolation when flow requires worktrees)

### Extension rule: skill-required agents

Roster is extensible. If a required skill does not map cleanly to existing agents, create a dedicated subagent in `agents/tdd-orgm/` and add it to `teams.yaml` under `tdd-orgm`.

Naming convention:
- Prefix `tdd-` plus concise purpose slug (example: `tdd-executing-plans-runner.md`)

Safety rule:
- Additive creation only. Never repurpose or mutate `pdd-orgm` agents to satisfy `tdd-orgm` needs.

## Tools model

### Orchestrator (`tdd-orgm`)

Required tools:
- `read, grep, find, ls, bash`
- `query_team, deploy_agent`

Optional (if memory parity desired later):
- engram memory tools, but not required for skeleton scope

Constraint:
- no `write`/`edit` in orchestrator for skeleton-safe posture

### Execution subagents

- Planning/review roles: read-only + shell inspection tools
- Implementation roles: include `edit` and `write`
- Verification role: read + bash/test tools, no product-code editing

## Skill references (authoritative)

`tdd-orgm` flow gates reference these skill files:

- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/brainstorming/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/writing-plans/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/test-driven-development/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/subagent-driven-development/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/executing-plans/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/requesting-code-review/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md`

## Flow selection

`tdd-orgm` chooses lightest valid flow while preserving mandatory gates.

### F0 — direct response (no subagent)
Use only for direct/meta answers that do not modify behavior/code.

### F1 — design/spec only
`brainstorming -> spec`

### F2 — design + plan
`brainstorming -> spec -> writing-plans`

### F3 — full implementation (default for build requests)
`brainstorming -> spec approval -> writing-plans -> (optional using-git-worktrees) -> test-driven-development -> (subagent-driven-development and/or executing-plans) -> requesting-code-review -> verification-before-completion`

Selection notes:
- `query_team` may run before or between gates for specialist input.
- `deploy_agent` performs each concrete phase.
- If a gate is missing required specialist support, extend roster first (add agent), then continue.

## Artifact strategy

Primary persisted artifacts:

- design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`

Phase handoff contract (all delegated phases):
- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`

Skeleton safety rules:
- no hidden artifact locations
- no overwrite of unrelated specs/plans
- one canonical file per phase artifact

## Migration and safety constraints

1. **Additive-only rollout**
   - Add new `agents/tdd-orgm/*`
   - Add `tdd-orgm` entry in `agents/teams.yaml`
   - Do not edit `agents/pdd-orgm/*`

2. **Superpowers compatibility**
   - Follow skill gates by reference; do not fork/patch superpowers skill files

3. **Blast-radius control**
   - Orchestrator remains coordination-first with restricted tools
   - Code edits happen only in implementation subagents

4. **Fallback behavior**
   - If requirements unclear, stop and ask user
   - If required skill-agent missing, create additive agent then continue

## Testing and verification strategy

### A) Static/config checks
- Validate every new agent frontmatter (`name`, `description`, `tools`)
- Validate `teams.yaml` membership for `tdd-orgm`
- Validate no diffs in `agents/pdd-orgm/*`

### B) Prompt-behavior checks
Run scripted prompt scenarios to confirm:
- direct/meta questions stay in F0
- build requests enter design + plan + TDD gates
- orchestrator can use both `query_team` and `deploy_agent`
- missing skill-agent path triggers additive roster extension path

### C) Safety checks
- orchestrator does not edit product files directly
- completion path requires review + verification gates
- no superpowers skill file changes required

## Acceptance criteria

Design considered satisfied when implementation demonstrates:
1. `tdd-orgm` exists as independent primary agent package
2. `query_team` and `deploy_agent` both usable by orchestrator
3. flow gating aligns with listed superpowers skills
4. roster can expand with new skill-required agents beyond legacy PDD roles
5. `pdd-orgm` and superpowers files remain unchanged

## Spec self-review

- Placeholder scan: no unresolved TODO/TBD items; naming/path templates are intentional conventions
- Consistency scan: additive-only architecture matches safety constraints and non-goals
- Ambiguity scan: flow gates, tool boundaries, and roster-extension trigger made explicit
- Scope scan: confined to scope A skeleton (design + structure + safety), no implementation details beyond implementation-ready contracts
