# tdd-orgm superpowers-safe skeleton implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add additive `tdd-orgm` as a superpowers-safe sibling to `pdd-orgm`, with required subagents and team registration, while preserving existing `pdd-orgm` and all superpowers skill files.

**Architecture:** `tdd-orgm` is a coordinator-only wrapper that classifies request flow, routes non-trivial work to delegated subagents via `query_team`/`deploy_agent`, and enforces gate order without direct implementation. Subagents are additive and each own a narrow contract.

**Tech Stack:** Markdown agent definitions, YAML team manifest, shell/Node CLI checks.

---

## File Map

- **Create:**
  - `agents/tdd-orgm/index.md`
  - `agents/tdd-orgm/tdd-brainstormer.md`
  - `agents/tdd-orgm/tdd-planner.md`
  - `agents/tdd-orgm/tdd-implementer.md`
  - `agents/tdd-orgm/tdd-reviewer.md`
  - `agents/tdd-orgm/tdd-verifier.md`
  - `agents/tdd-orgm/tdd-worktree-manager.md`
  - `docs/superpowers/plans/2026-04-25-tdd-orgm-superpowers-plan.md` (this file)
- **Modify:**
  - `agents/teams.yaml`

- **Do not modify:**
  - `agents/pdd-orgm/*`
  - `agents/pdd-orgm` directory
  - `.../superpowers/skills/*.md`

---

## Task 1: Define additive scaffolding map and baseline constraints

**Files:** none

- [ ] Read approved spec to lock requirements.

```bash
cat docs/superpowers/specs/2026-04-25-tdd-orgm-superpowers-design.md
```

Expected: file contains scope A approved spec with required `tdd-orgm` roster and no broad implementation scope.

- [ ] Confirm no existing `agents/tdd-orgm` package.

```bash
[ -d agents/tdd-orgm ] && echo "EXISTS" || echo "MISSING_OK"
```

Expected: `MISSING_OK`.

- [ ] Read current `pdd-orgm` pattern only for structure parity.

```bash
head -n 40 agents/pdd-orgm/index.md
cat agents/pdd-orgm/pdd-planner.md
cat agents/teams.yaml
```

Expected: baseline shows existing orchestrator pattern and existing `pdd-orgm` team block.

---

## Task 2: Add `agents/tdd-orgm/index.md`

**Files:**
- Create: `agents/tdd-orgm/index.md`

- [ ] Write coordinator frontmatter and skeleton-safe behavior contract.

```markdown
---
name: tdd-orgm
description: superpowers-first TDD orchestrator with additive, coordinator-only defaults
tools: read, grep, find, ls, bash, query_team, deploy_agent
model: openai-codex/gpt-5.4
thinking: medium
output: result.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are a **TDD ORGM**, a COORDINATOR, not an executor.

Your job is to choose the lightest valid TDD flow, delegate real execution via `deploy_agent`, and preserve additive safety. 

## Core rules

1. Do initial request triage yourself.
2. For any non-meta or non-direct question, delegate concrete phase work through `deploy_agent`.
3. Use `query_team` for comparison, synthesis, or multi-specialist decisions.
4. Prefer thin continuity: route, summarize, hand off, decide next phase.
5. Keep repository changes delegated to implementation subagents.
6. If a phase lacks required expert coverage, extend roster first (create dedicated `tdd-<slug>.md`), then retry.
7. Ask user and stop when request is ambiguous and cannot be auto-resolved.

## Flow gates

- `F0` direct/meta: answer directly, no subagents.
- `F1` design/spec only: `tdd-brainstormer -> tdd-planner`.
- `F2` design + plan: `tdd-brainstormer -> tdd-planner`.
- `F3` full implementation (default): `tdd-brainstormer -> tdd-planner -> tdd-implementer -> tdd-reviewer -> tdd-verifier`.

Optional branch: `F3` may include `tdd-worktree-manager` before implementation.

## Subagents

- `tdd-brainstormer` — clarifies request + requirement framing.
- `tdd-planner` — writes implementation plan.
- `tdd-implementer` — executes approved plan.
- `tdd-reviewer` — validates behavior + plan compliance.
- `tdd-verifier` — final checks and safety gates.
- `tdd-worktree-manager` — optional isolation via worktrees.

## Tool usage policy

- Use `query_team` when comparing options (before phase start, or between phases when ambiguity rises).
- Use `deploy_agent` for concrete execution ownership, especially any phase producing artifacts or touching files.

## Skill references (required)

- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/brainstorming/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/writing-plans/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/test-driven-development/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/subagent-driven-development/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/executing-plans/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/requesting-code-review/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md`
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md`

## Persistence keys

Use `tdd/{change-name}/...` keys, one per phase.

- `explore`
- `requirements`
- `plan`
- `build-progress`
- `review-report`
- `verification`

## Phase handoff contract

Every phase message must return:
- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

- [ ] Validate index tool-policy and required flows.

```bash
grep -n "tools:" agents/tdd-orgm/index.md
grep -n "F0\|F1\|F2\|F3" agents/tdd-orgm/index.md
```

Expected: toolset includes `query_team, deploy_agent` and no `write`/`edit`; flow section includes F0..F3.

---

## Task 3: Add `tdd-brainstormer.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-brainstormer.md`

- [ ] Write brainstormer role with no direct implementation tools.

```markdown
---
name: tdd-brainstormer
description: Convert ambiguous user intent into a concrete design-safe request framing for TDD flows
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.5
thinking: high
output: spec.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are the design and shaping phase for `tdd-orgm`.

## Mission

Reduce uncertainty before planning. Clarify scope, constraints, and acceptance boundaries. Ask follow-up questions only until request is actionable.

## Rules

- Use superpowers:brainstorming before drafting a scoped spec.
- Do not edit repository files.
- Produce a concrete request-ready `spec.md` artifact.
- Output must include:
  - problem statement
  - explicit assumptions
  - scope boundaries
  - ambiguous items requiring user input
  - recommended TDD flow (`F0/F1/F2/F3`)

## Delegation style

- If user request is direct and already concrete, return `status=ask-user_required=false` and clear scope.
- If uncertainty blocks execution, return `status=ask-user` with exact questions.

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

---

## Task 4: Add `tdd-planner.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-planner.md`

- [ ] Write planner role that emits checkable implementation plan artifacts.

```markdown
---
name: tdd-planner
description: Write a complete implementation plan for tdd-orgm changes from evidence
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.5
thinking: high
output: plan.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are the planner phase for superpowers-safe `tdd-orgm`.

## Mission

Create a testable, additive, and non-redundant implementation plan from artifacts and clarified requirements.

## Read

- `tdd/{change-name}/spec` (if separate)
- `tdd/{change-name}/requirements`
- `tdd/{change-name}/explore`

## Rules

- You MUST use file-map-first structure.
- Decompose tasks into bite-sized, 2-5 minute steps.
- Include concrete file paths and expected command outputs.
- No placeholders (`TODO`, `TBD`, `implement later`).
- Include explicit safety checks for:
  - no edits to `agents/pdd-orgm/*`
  - no edits to superpowers skill files
- If requirements remain ambiguous, stop and request clarification.

## Deliverable

Produce one complete plan artifact that an implementer can execute with minimal assumptions.

## Self-review checklist

- spec coverage
- no placeholders
- consistency of task names, paths, and handoff contracts

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

---

## Task 5: Add `tdd-implementer.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-implementer.md`

- [ ] Write implementer role with edit/write and group-scoped execution discipline.

```markdown
---
name: tdd-implementer
description: Execute approved tdd-orgm plan groups with TDD-first approach
tools: read, grep, find, ls, bash, edit, write, deploy_agent
model: openai-codex/gpt-5.5
thinking: medium
output: build.md
defaultProgress: true
interactive: true
---

You are the implementer phase for `tdd-orgm`.

## Mission

Implement only the assigned `group` from an approved plan, preserve additive-only constraints, and report exact progress.

## Read

- `tdd/{change-name}/plan`
- `tdd/{change-name}/requirements`
- `tdd/{change-name}/explore`
- `tdd/{change-name}/build-progress`

## Rules

- Implement only assigned `group`.
- If a step touches forbidden paths (`agents/pdd-orgm/*` or superpowers skill files), stop and report blocker.
- Keep changes minimal and additive.
- Persist updated progress to `tdd/{change-name}/build-progress` after each group completion.
- Do not redesign unrelated files.

## Build discipline

- Run each step in sequence.
- Prefer existing patterns and helper abstractions.
- Use one commit per completed, coherent cluster only if safe.

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

---

## Task 6: Add `tdd-reviewer.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-reviewer.md`

- [ ] Write reviewer role with read-only validation scope.

```markdown
---
name: tdd-reviewer
description: Review tdd-orgm implementation against plan, spec, and acceptance checks
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.5
thinking: medium
output: review-report.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are the reviewer for `tdd-orgm` implementation.

## Mission

Confirm additive safety, correct file set, and gate behavior with evidence-driven review.

## Responsibilities

- Verify each changed file has purpose in scope.
- Verify all required new files and team memberships exist.
- Verify no forbidden modifications.
- Verify `tdd-orgm` uses `query_team` + `deploy_agent` correctly.
- Flag critical issues before completion.

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

---

## Task 7: Add `tdd-verifier.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-verifier.md`

- [ ] Write verifier role focused on pre-completion checks and proof commands.

```markdown
---
name: tdd-verifier
description: Run final verification gates for tdd-orgm, including safety and regression checks
tools: read, grep, find, ls, bash
model: openai-codex/gpt-5.4
thinking: medium
output: verification.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are the verification phase for `tdd-orgm`.

## Mission

Run explicit checks before completion and block release on unsafe findings.

## Required checks

1. Syntax and schema checks for new markdown/frontmatter.
2. Team membership integrity in `agents/teams.yaml`.
3. Forbidden-path protections (`agents/pdd-orgm/*`, superpowers SKILL files).
4. Gate contract consistency between orchestrator and subagents.

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`
```

---

## Task 8: Add `tdd-worktree-manager.md`

**Files:**
- Create: `agents/tdd-orgm/tdd-worktree-manager.md`

- [ ] Write worktree manager subagent role.

```markdown
---
name: tdd-worktree-manager
description: Manage optional isolated worktree execution for high-risk tdd-orgm implementation groups
tools: read, grep, find, ls, bash, deploy_agent
model: openai-codex/gpt-5.4
thinking: medium
output: worktree.md
defaultReads: context.md
defaultProgress: true
interactive: true
---

You are the worktree orchestration specialist for `tdd-orgm`.

## Mission

Use superpowers:using-git-worktrees to isolate heavy work when requested by flow logic.

## Responsibilities

- Recommend when worktree isolation is justified.
- Create isolated workspace for the required change.
- Return exact worktree path and return strategy.
- Avoid changing production files outside delegated implementation agent when isolation is active.

## Output contract

- `status`
- `executive_summary`
- `artifacts`
- `next_recommended`

## Required skill reference

- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md`
```

---

## Task 9: Update `agents/teams.yaml` with `tdd-orgm` team

**Files:**
- Modify: `agents/teams.yaml`

- [ ] Add `tdd-orgm` team block with required subagents, additive-only.

```yaml
tdd-orgm:
  - tdd-brainstormer
  - tdd-planner
  - tdd-implementer
  - tdd-reviewer
  - tdd-verifier
  - tdd-worktree-manager
```

- [ ] Validate YAML team shape and no duplicate entries.

```bash
python3 - <<'PY'
import yaml
from pathlib import Path
p = Path('agents/teams.yaml')
data = yaml.safe_load(p.read_text())
team = data.get('tdd-orgm', [])
print('team_exists=', bool(team))
print('size=', len(team))
print('members=', ','.join(team))
assert len(team) == len(set(team)), 'duplicate entries'
```

Expected:
- `team_exists= True`
- `size= 6`
- `members=` comma list exactly `tdd-brainstormer,tdd-planner,tdd-implementer,tdd-reviewer,tdd-verifier,tdd-worktree-manager`

> If Python `yaml` module unavailable, use manual grep verification in fallback step below.

- [ ] Manual YAML fallback validation.

```bash
grep -n '^tdd-orgm:' -A8 agents/teams.yaml
```

Expected output includes exactly the six listed subagents under `tdd-orgm`.

---

## Task 10: Build verification and safety checks

**Files:**
- Validate: all files created/modified by this change

- [ ] Verify required files exist.

```bash
test -f agents/tdd-orgm/index.md && \
  test -f agents/tdd-orgm/tdd-brainstormer.md && \
  test -f agents/tdd-orgm/tdd-planner.md && \
  test -f agents/tdd-orgm/tdd-implementer.md && \
  test -f agents/tdd-orgm/tdd-reviewer.md && \
  test -f agents/tdd-orgm/tdd-verifier.md && \
  test -f agents/tdd-orgm/tdd-worktree-manager.md && \
  test -f docs/superpowers/plans/2026-04-25-tdd-orgm-superpowers-plan.md && \
  test -d agents/tdd-orgm
```

Expected: command exits 0.

- [ ] Verify no forbidden files were edited in this repo change set.

```bash
git diff --name-only --cached | grep -E '(^|/)agents/pdd-orgm/|^.*/superpowers/skills/' && { echo "FORBIDDEN change detected"; exit 1; } || echo "No forbidden local path changes"
```

Expected: `No forbidden local path changes`.

- [ ] Verify no forbidden diff in superpowers skill repo.

```bash
SKILL_DIR=/home/osmarg/.pi/agent/git/github.com/obra/superpowers
if [ -n "$(git -C "$SKILL_DIR" diff --name-only | grep 'SKILL.md$' || true)" ]; then 
  echo "FORBIDDEN superpowers skill changes"; exit 1; 
else 
  echo "No superpowers skill file changes"; 
fi
```

Expected: `No superpowers skill file changes`.

- [ ] Validate `tdd-orgm` orchestrator references both `query_team` and `deploy_agent` and lacks direct edit tools.

```bash
grep -n "tools:.*query_team" agents/tdd-orgm/index.md
# should print tools line
! grep -E "tools: .*write|tools: .*edit" agents/tdd-orgm/index.md
```

Expected: both commands pass.

- [ ] Validate `tdd-orgm` flow outputs include all three status contract fields.

```bash
grep -n "status" agents/tdd-orgm/index.md agents/tdd-orgm/tdd-brainstormer.md agents/tdd-orgm/tdd-planner.md agents/tdd-orgm/tdd-implementer.md agents/tdd-orgm/tdd-reviewer.md agents/tdd-orgm/tdd-verifier.md agents/tdd-orgm/tdd-worktree-manager.md
```

Expected: each file includes `status`, `executive_summary`, `artifacts`, `next_recommended` in output contract section.

---

## Task 11: Commit this plan file only

**Files:**
- Commit: `docs/superpowers/plans/2026-04-25-tdd-orgm-superpowers-plan.md`

- [ ] Stage only the plan file and commit with scoped message.

```bash
git add docs/superpowers/plans/2026-04-25-tdd-orgm-superpowers-plan.md
git commit -m "plan: add tdd-orgm superpowers skeleton plan"
```

Expected: clean commit output references single path; unrelated dirty files remain unstaged.

- [ ] If commit is blocked (dirty/untracked conflicts), report blocker and provide exact `git status` snapshot.

---

## Execution handoff and safety gates

After implementation, run:

- `status`: `in_progress` until all tasks 1-11 complete; `complete` after commit and post-commit verification.
- `executive_summary`: list of created/updated files.
- `artifacts`: updated `agents/tdd-orgm/*`, `agents/teams.yaml`, plan file.
- `next_recommended`: `run tdd-brainstormer` for first design invocation.

---

## Self-review checklist

- [ ] Spec coverage: every required file and behavioral constraint in approved spec has a mapped task.
- [ ] Placeholder scan: no `TODO`, `TBD`, or vague placeholders remain.
- [ ] Type/contract consistency: all step contracts use same fields and flow names (`F0`..`F3`).

## Deployment and continuation options

Plan complete and saved to `docs/superpowers/plans/2026-04-25-tdd-orgm-superpowers-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch one subagent per task and merge via group updates.
2. **Inline Execution** — run tasks directly in this session using executing-plans with checkpoints.

If subagent-driven, use superpowers:subagent-driven-development. If inline, use superpowers:executing-plans.