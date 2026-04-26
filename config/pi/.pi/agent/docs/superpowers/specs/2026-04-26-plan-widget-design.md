# Superpowers plan widget design

Date: 2026-04-26
Status: approved design
Scope: `extensions/plan.ts` design only

## Goals

Create a read-only Pi TUI widget that tracks Superpowers/TDD-orgm plan tasks while the user and agents work.

The widget must:

- observe plan/task progress without modifying Superpowers skill files, TDD-orgm agents, plan documents, or session history
- show the full task titles, not only aggregate progress like `3/8`
- render as a compact two-card-width widget aligned with existing `agent-status.ts` sizing conventions
- infer task state from existing artifacts and runtime signals: plan markdown, agent handoffs, Pi events, and generated docs
- stay safe in non-interactive modes by checking `ctx.hasUI` before using TUI APIs
- clean up mounted widget/status state on session shutdown and reload

## Non-goals

- No implementation in this spec step
- No creation or modification of `extensions/plan.ts`
- No changes to Superpowers internals under `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/`
- No changes to TDD-orgm agent prompts or `agents/teams.yaml`
- No mutation of plan markdown checkboxes or task text
- No enforcement of TDD gates; this widget observes, it does not orchestrate
- No writable task manager, task editor, or progress source of truth
- No replacement for `agent-status.ts` or its subagent deployment cards

## UI contract

### Placement

- Use `ctx.ui.setWidget(WIDGET_KEY, factory, { placement: "belowEditor" })` when tasks are available and UI is enabled.
- Use `ctx.ui.setStatus(STATUS_KEY, styledText)` for compact footer status.
- Clear both with `undefined` when no active plan is detected, when disabled, or during cleanup.
- Guard all UI calls with `ctx.hasUI`.

### Identity

Recommended stable keys:

- widget key: `superpowers-plan`
- status key: `superpowers-plan`

The keys must not collide with `agent-status.ts`, which uses `pdd-orgm-agents`.

### Visual shape

Target layout is one fixed-width panel, not separate deployment cards.

- Fixed target width: 50 columns
- Rationale: current `agent-status.ts` card width is 24, grid gap is 2, so two cards occupy `24 + 2 + 24 = 50` columns
- Default visible height: 13 lines
- Minimum visible height: 13 lines
- Render lines must never exceed the `width` argument provided by Pi TUI
- When host width is below 50, degrade by truncating every line to available width with ANSI-safe truncation

### Content

The widget shows task list detail, not only a numeric summary.

Example shape at 50 columns:

```text
╭─ Plan · docs/superpowers/plans/example.md ─╮
│ ▶ 1. Add failing parser tests              │
│ ○ 2. Implement checkbox parser             │
│ ○ 3. Render pending tasks                  │
│ ✓ 4. Wire session lifecycle                │
│ ○ 5. Verify no Superpowers mutations       │
│ +3 más                                     │
╰────────────────────────────────────────────╯
```

Status line example:

```text
📋 1 active · 1 done · 6 pending
```

The status text may include counts because the widget itself lists task titles.

## Dimensions

Use these constants in implementation:

```typescript
const PLAN_WIDGET_KEY = "superpowers-plan";
const PLAN_STATUS_KEY = "superpowers-plan";
const PLAN_WIDGET_WIDTH = 50;
const PLAN_WIDGET_MIN_HEIGHT = 13;
const PLAN_WIDGET_DEFAULT_VISIBLE_LINES = 13;
const PLAN_OVERFLOW_LABEL = "+N más";
```

Line budget for default 13-line view:

| Lines | Purpose                                                              |
| ----- | -------------------------------------------------------------------- |
| 1     | top border/header                                                    |
| 2     | compact source/progress metadata or first task line                  |
| 3-12  | task rows, depending on metadata presence                            |
| 13    | bottom border when no overflow, or overflow row when overflow exists |

Recommended default composition:

- line 1: border/header
- line 2: compact source/progress metadata
- lines 3-12: up to 10 task rows
- line 13: bottom border when no overflow, or overflow line with bottom border replacing the last visible task when overflow exists

If border style consumes too much vertical space, prefer preserving more task rows over decorative metadata.

## State sources

The widget is read-only and derives state from existing sources only.

### Primary sources

1. Plan markdown files
   - `docs/superpowers/plans/*.md`
   - active/current plan path inferred from current session mentions, latest modified plan document, or explicit command selection if commands are added later
   - task syntax primarily from checkbox lines (`- [ ]`, `- [x]`, `- [X]`)

2. Pi session entries
   - `ctx.sessionManager.getEntries()` and/or `ctx.sessionManager.getBranch()` on `session_start`, resume, reload, and turn boundaries
   - assistant summaries, user prompts, tool results, and custom extension messages can provide evidence of active task and completion
   - session data is read only; do not append widget state as source of truth unless adding a purely observational cache entry is explicitly approved later

3. Runtime events and handoffs
   - `agent_end`, `turn_end`, `tool_execution_end`, and extension event-bus messages can indicate task progress
   - subagent/TDD-orgm handoff objects can include `status`, `executive_summary`, `artifacts`, and `next_recommended`
   - progress is inferred from these handoffs/events/docs, not by modifying Superpowers internals

4. Generated docs/artifacts
   - design specs under `docs/superpowers/specs/*.md`
   - verification output and final handoffs in session text
   - artifact existence can support `implemented`/`done` inference when task text names concrete paths

### Secondary sources

- Existing `agent-status.ts` event stream may be observed only as context if it exposes relevant deployment activity; do not depend on it as the canonical task source.
- File metadata such as newest plan document can help choose a default plan, but task state must come from document/session evidence.

## Parsing strategy

### Plan discovery

1. Prefer an explicit active plan path if the user or agent mentions a `docs/superpowers/plans/*.md` path in the current branch.
2. Otherwise prefer the newest plan file under `docs/superpowers/plans/` that contains checkbox tasks.
3. If multiple candidate plans are equally plausible, choose the one most recently referenced in session text.
4. If no plan with tasks exists, unmount widget and clear status.

### Task extraction

Parse markdown with conservative line-based rules:

- Task line pattern: `^\s*- \[( |x|X)\]\s+(.+)$`
- Preserve original task title text after checkbox marker, minus leading/trailing whitespace
- Capture heading ancestry above each task for grouping/context if needed
- Support indented subtasks by storing `depth`, but v1 rendering may flatten tasks in document order
- Ignore fenced code blocks
- Ignore checkbox examples inside blockquotes unless later evidence marks them active

### Progress inference

Each task starts from markdown checkbox state:

- `[ ]` → `pending`
- `[x]` or `[X]` → `done`

Then overlay session/runtime evidence:

- `active` when recent handoff or assistant text says a task is being executed, started, next, current, or in progress
- `implemented` when recent handoff says implementation completed, artifact exists, or verification step references the task as completed
- `done` when plan checkbox is checked, handoff status is complete, final response marks it complete, or verification evidence says it passed
- `blocked` only when explicit wording says blocked, waiting for user, or failed in a task-specific way

Confidence order for conflicting evidence:

1. Explicit current-session handoff/event with task identity
2. Explicit checked markdown task
3. Artifact existence tied to task path
4. Fuzzy assistant summary text
5. File modified time/default ordering

If evidence conflicts, prefer the newer current-session signal over older document state, but do not write that result back to the plan file.

### Task identity matching

Use a stable task id derived from:

- plan file path
- task line number
- normalized title
- heading ancestry

When matching session text to tasks:

- exact title substring match wins
- path mentions inside task title improve confidence
- normalized token overlap may mark `active` only if confidence is high
- never mark unrelated task complete from vague phrases like “done” without task identity

## Data model

Conceptual TypeScript model:

```typescript
type PlanTaskState = "pending" | "active" | "implemented" | "done" | "blocked";

interface PlanTask {
  id: string;
  planPath: string;
  line: number;
  depth: number;
  title: string;
  section?: string;
  state: PlanTaskState;
  evidence: PlanTaskEvidence[];
}

interface PlanTaskEvidence {
  source: "markdown" | "session" | "handoff" | "event" | "artifact";
  state: PlanTaskState;
  confidence: "low" | "medium" | "high";
  summary: string;
  timestamp?: number;
  path?: string;
}

interface PlanWidgetState {
  activePlanPath?: string;
  tasks: PlanTask[];
  lastUpdatedAt: number;
  visibleHeight: number;
  total: number;
  pending: number;
  active: number;
  implemented: number;
  done: number;
  blocked: number;
}
```

State remains in memory and is rebuilt from sources on lifecycle events. Any future persistence must be cache-only and reconstructable.

## Rendering rules

### Ordering

- Preserve document order by default.
- Keep active task visible first if the list overflows.
- After active task, show nearest surrounding tasks from the active task’s position.
- If no active task exists, show first pending tasks, then implemented/done tasks as space permits.

### Icons

Recommended markers:

- `○` pending
- `▶` active
- `◉` implemented
- `✓` done
- `!` blocked

### Colors

Use theme foreground colors:

- pending titles: gray via `theme.fg("muted", title)` or `theme.fg("dim", title)`
- done/implemented: green via `theme.fg("success", text)`
- active: soft highlight via accent marker/border and normal/accent title, not harsh error/warning styling
- blocked: warning/error only when explicit blocked state exists
- border/header: muted normally, accent when an active task exists

### Text handling

- Always show full task titles conceptually; do not replace list with `3/8` progress.
- If terminal width prevents full title display, truncate individual title lines with ellipsis using `truncateToWidth` so rendered lines obey TUI width limits.
- Do not abbreviate task titles before width truncation.
- If a task title is longer than one row, v1 may truncate rather than wrap to preserve 13-line stability.

### Overflow

When not all tasks fit:

- Reserve one row for overflow indicator.
- Render `+N más`, where `N` is hidden task count.
- Style overflow indicator with `theme.fg("dim", ...)`.
- Count hidden tasks after active-task pinning/reordering, not just tasks after visible slice.

### Empty state

- If no active plan/tasks are detected, clear widget and status.
- Do not show an empty placeholder by default; absence means no current observable plan.

## Lifecycle

### Extension load

- Register no mutating tools.
- Register optional read-only commands only if needed.
- Set up event listeners.

### `session_start`

- Reset in-memory state.
- Rebuild from current session branch and plan files.
- If `ctx.hasUI` and tasks exist, mount widget/status.

### During agent work

- On `turn_end`, `agent_end`, and relevant event-bus updates, rescan current evidence.
- Compare a compact state signature before re-rendering to avoid flicker.
- Request widget render through stored handle when already mounted.

### Session switch/reload/shutdown

- On `session_shutdown`, clear widget and status when `ctx.hasUI`.
- Drop handles and in-memory state.
- Treat `/reload` as teardown followed by fresh `session_start`.

### Non-UI modes

- If `ctx.hasUI` is false, keep parsing optional but skip `setWidget`, `setStatus`, dialogs, and notifications.
- No command should require UI unless explicitly documented.

## Commands

No commands are required for v1.

Optional future commands, still read-only:

- `/plan-widget inspect` — show detected active plan path, parsed tasks, and evidence summary
- `/plan-widget refresh` — rescan plan files and session entries
- `/plan-widget hide` — hide widget for current session without mutating plan state

If commands are implemented later, they must not edit plan files or Superpowers internals.

## Testing and verification

### Static checks

- Typecheck extension after implementation.
- Ensure `extensions/plan.ts` imports only needed Pi/TUI APIs.
- Ensure no writes to `docs/superpowers/plans/*.md` or Superpowers skill paths.
- Ensure `ctx.hasUI` guards all UI operations.

### Unit tests or pure-function checks

Test parser and renderer helpers with fixtures:

- extracts `- [ ]` and `- [x]` tasks
- ignores fenced code blocks
- preserves full task titles in model
- handles nested tasks with `depth`
- derives stable ids from path/line/title/heading
- overlays active/done/implemented evidence in correct precedence
- produces overflow `+N más`
- never emits visible lines wider than supplied width
- defaults to 13 visible lines and fixed 50-column target

### Integration/manual verification

Recommended manual scenarios:

1. Start Pi with UI and a plan file containing more than 10 tasks.
2. Confirm widget appears below editor at 50-column target width.
3. Confirm pending titles are gray.
4. Confirm done and implemented tasks render green.
5. Create or simulate active handoff evidence; confirm active task gets soft highlight and remains visible.
6. Confirm overflow displays `+N más`.
7. Run in non-UI/print mode; confirm no UI errors.
8. Trigger `/reload` or session switch; confirm widget/status cleanup and remount behavior.
9. Confirm plan markdown and Superpowers skill files remain unchanged.

### Verification commands after implementation

```bash
git diff -- extensions/plan.ts docs/superpowers/plans docs/superpowers/specs
npm test -- --runInBand plan
npm run typecheck
```

Use project-appropriate test commands if this repository does not define these scripts.

## Risks

- Session text may ambiguously refer to tasks, causing false active/done inference.
- Latest plan file may not be the intended active plan when multiple plans exist.
- Long task titles can exceed fixed width; truncation preserves layout but hides tail text.
- Evidence from generated docs may lag behind actual work.
- Over-observing frequent events can cause flicker or unnecessary re-rendering.
- Theme color names can vary; implementation should stick to common Pi colors (`muted`, `dim`, `success`, `accent`, `warning`, `error`).
- Read-only observer semantics can be weakened if future commands add writes; keep command scope explicit.

## Acceptance criteria

Design is satisfied when implementation can show a read-only plan widget that:

1. observes current Superpowers/TDD-orgm plan tasks without mutating source files
2. lists full task titles within a fixed 50-column, 13-line default/minimum widget
3. colors pending gray, done/implemented green, active with soft accent highlight
4. shows `+N más` on overflow
5. infers progress from plan docs, session events, handoffs, and artifacts
6. uses `setWidget`/`setStatus` only when `ctx.hasUI`
7. cleans up on shutdown/reload/session switch
8. leaves Superpowers internals unchanged

## Spec self-review

- Placeholder scan: no unresolved implementation markers remain.
- Scope scan: spec covers design only and does not implement `extensions/plan.ts`.
- Requirement scan: goals, non-goals, UI contract, dimensions, state sources, parsing strategy, data model, rendering rules, lifecycle, commands, testing/verification, and risks are present.
- Known-facts scan: uses `agent-status.ts` width facts (24-card width, 2 gap, 50 two-card width), default/minimum 13-line height, `setWidget`/`setStatus`, `ctx.hasUI`, cleanup on shutdown, read-only observer semantics, full task titles, color rules, overflow `+N más`, and inference from handoffs/events/docs without Superpowers mutation.
- Ambiguity scan: active plan discovery, task extraction, evidence precedence, overflow behavior, and no-command v1 scope are explicit.
