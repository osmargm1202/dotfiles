# Subagents tmux pane + recoverable provider-stop design

Date: 2026-04-22
Status: approved design draft
Scope: `extensions/subagents.ts`, `extensions/agent-status.ts`

## Goal

Add optional tmux-pane launching for deployed subagents so the user can observe them in a live pane, inspect failures, and keep persistent runtimes recoverable when provider failures happen. When a subagent hits a provider-class failure, stop the wider workflow in a controlled way, leave the subagent runtime reusable, and hide completed agents from the main status widget unless they are still actionable.

## Problem

Current `deploy_agent` behavior in `extensions/subagents.ts` launches subagents in-process and waits for completion. That creates two UX problems:

1. While subagents run, the primary agent is effectively blocked and cannot be given extra context to help a stuck subagent.
2. `agent-status.ts` still treats finished deployments as displayable state, so the widget remains cluttered with completed work instead of only actionable items.

The user wants to keep the current embedded mode, but add an optional mode that launches subagents in a new tmux pane in the current tmux window. They also want provider failures to pause work in a recoverable way instead of fully destroying reusable runtimes.

## Non-goals

This design does not include:

- replacing embedded subagent execution completely
- kitty window support in v1
- live bidirectional programmatic chat between primary agent and running subagent
- subagent-to-subagent communication
- automatic provider/model switching or automatic retry loops
- a new historical UI for finished deployments

## Constraints and current context

Observed in current codebase:

- `extensions/subagents.ts` already supports persistent runtimes, runtime reuse, session files, and returning runtimes to `idle` after successful completion
- `extensions/subagents.ts` already relays structured `awaiting_user_input` payloads, but does not support arbitrary mid-run follow-up messages to a running subagent
- `extensions/agent-status.ts` already derives display deployments from runtime snapshots and can show `idle` reusable runtimes, but still keeps `done` and `error` deployments in the main widget display path
- project does not currently expose a usable `pi-orchestrator` team in `agents/teams.yaml`, so design was derived from code inspection and user decisions rather than team consultation

## User decisions captured

The user explicitly chose:

- first target is observability/manual rescue, not full live control
- provider failure detection in v1 should use heuristics
- when provider failure happens in a tmux pane, leave the pane open and let the process end
- when subagent provider failure implies broader provider outage, the primary agent should also stop and require manual continuation
- subagent continuation should reuse the same runtime/session, not rebuild from scratch
- main `agent-status.ts` widget should show only: `running`, `idle/reusable`, `paused_provider_error`, and `awaiting_user_input`
- `done` deployments should disappear from the widget

## Approaches considered

### Approach A — optional tmux-pane backend for subagent launch (recommended)

Add a launch backend abstraction with `embedded` as the default and `tmux-pane` as an optional backend. Keep runtime/session ownership inside `subagents.ts`, but persist terminal binding metadata for tmux-launched subagents.

**Pros**
- smallest change that solves the main pain
- preserves current embedded mode for automation and portability
- fits existing persistent runtime registry model
- gives visible panes for inspection and manual rescue
- creates a clean path for future kitty support

**Cons**
- v1 still does not give full live control from the primary agent
- depends on tmux availability
- resume/rebind logic adds runtime metadata complexity

### Approach B — always external terminal launch

Run every subagent in tmux/kitty and treat the primary as a supervisor only.

**Pros**
- everything visible
- strong manual control model

**Cons**
- too much friction for simple tasks
- hurts current workflows
- larger scope and weaker portability

### Approach C — separate supervisor service/process

Create a dedicated supervisor to manage panes, runtime state, resumes, and global stops.

**Pros**
- clean long-term architecture
- strong base for future inter-agent communication

**Cons**
- too much scope for current goal
- introduces a new subsystem before validating UX value

## Recommendation

Implement Approach A.

This is the best fit because it solves the immediate UX gap, keeps existing embedded behavior intact, and extends the current persistent-runtime model instead of replacing it.

## Design

### 1. Launch backend abstraction

Add an explicit launch backend concept to subagent deployment:

- `embedded` — current behavior, in-process spawned run
- `tmux-pane` — launch subagent in a new tmux pane in the current tmux window

`embedded` remains the default. `tmux-pane` is opt-in.

At API level, extend the `deploy_agent` schema with an optional field:

- `launchBackend?: "embedded" | "tmux-pane"`

No kitty support in v1. If kitty is added later, it should reuse the same backend abstraction instead of layering custom flags directly into runtime logic.

### 2. Runtime and terminal binding model

Persistent runtime state should remain the source of truth for reuse, but runtime metadata must now include terminal binding information when external launch is used.

Add runtime-side metadata such as:

- `terminalBackend: "embedded" | "tmux-pane"`
- `terminalState: "attached" | "missing" | "closed"`
- `tmuxWindowId?: string`
- `tmuxPaneId?: string`
- `recoverableReason?: "provider_error"`
- `awaitingUserInput?: boolean`
- `lastVisibleState?: "running" | "idle" | "paused_provider_error" | "awaiting_user_input"`

This metadata belongs primarily in runtime registry state, not only in deployment records, because a reusable runtime may outlive a specific deployment.

### 3. tmux-pane launch flow

When `launchBackend = "tmux-pane"`:

1. Resolve or create the persistent runtime as usual.
2. Determine current tmux window context.
3. Create a new pane in the current tmux window.
4. Launch the Pi subagent command inside that pane using the runtime session file.
5. Persist `runtimeId`, `sessionFilePath`, and tmux binding metadata.
6. Monitor lifecycle through process completion plus runtime/deployment events.

Behavior rules:

- the pane stays open after completion
- the pane stays open after provider failure
- if a paused runtime is resumed later, the system should prefer the same pane when available
- if the pane no longer exists, create a new pane and rebind runtime metadata to the new pane

### 4. Failure model

Subagent failures must be classified into distinct categories:

- `task_error`
- `provider_error`
- `orchestrator_error`

Definitions:

- `task_error`: prompt issue, tool failure, business logic failure, malformed output, or similar task-scoped problem
- `provider_error`: rate limit, quota, authentication, upstream outage, provider overload, transport/provider connectivity issue, model unavailable, or clear provider-side service instability
- `orchestrator_error`: failure launching tmux, broken session file, registry corruption, or local orchestration bug

### 5. Provider error heuristic in v1

Provider errors will be detected heuristically using:

- `exitCode`
- `stopReason`
- `stderr`
- `finalText`

Heuristic matching should look for explicit signals such as:

- `rate limit`
- `too many requests`
- `quota`
- `provider`
- `upstream`
- `overloaded`
- `capacity`
- `temporarily unavailable`
- `authentication`
- `api key`
- `model not available`
- `connection reset`
- `timeout`
- `5xx`

Heuristic policy should be conservative. False positives are costly because they stop broader workflow, so generic ambiguous failures should remain `task_error` unless the provider signature is reasonably clear.

### 6. Global provider-stop semantics

When a subagent ends with `provider_error`:

1. mark the subagent deployment/runtime as `paused_provider_error`
2. leave the pane open
3. keep the runtime reusable rather than destroying it
4. emit a global event indicating recoverable provider failure
5. stop the primary agent in a controlled way
6. require the user to manually continue the primary and later continue the subagent

The primary agent should not attempt auto-retry or auto-switch provider/model. It should stop with a short structured explanation that the workflow paused because a subagent hit a provider-class failure and manual continuation is required.

If the primary itself later encounters the same provider failure, it should also stop and remain recoverable/manual to continue later.

### 7. Recoverable stop state

A normal `error` is not enough for this workflow. The system needs a recoverable paused state for provider failures.

Conceptual display/lifecycle state:

- `running`
- `idle`
- `awaiting_user_input`
- `paused_provider_error`
- hidden terminal states such as `done` and normal `error`

This state can be implemented either as a new deployment status or as derived display state built from runtime metadata plus completion results. For v1, derived display state is safer because it avoids broad churn across every status consumer.

### 8. Resume semantics

Continuation after provider recovery must reuse the same runtime/session.

Rules:

- do not reconstruct context from scratch when resuming a paused provider-failure runtime
- reuse the same `runtimeId` and `sessionFilePath`
- prefer the same tmux pane if it still exists
- if pane is gone, create a new pane and reattach the runtime logically
- user may first continue the primary agent, then explicitly continue the subagent

This design does not require a new tool name yet. Resume can be supported by extending existing deployment/reuse inputs as long as the code path explicitly targets an existing reusable runtime rather than creating a new one.

### 9. `agent-status.ts` display rules

The main widget should show only actionable state.

Visible in widget:

- `running`
- `idle/reusable`
- `paused_provider_error`
- `awaiting_user_input`

Hidden from widget:

- `done`
- normal final `error`
- completed ephemeral runs

This keeps the widget operational instead of historical.

Historical and completed records should remain available in inspect mode. `/agent-status inspect` should still expose full deployment history, including `done` and `error`, so debugging and transcript review remain possible.

### 10. Widget/status behavior

`agent-status.ts` should derive a display model that filters raw deployment/runtime data before rendering.

Recommended display priorities:

- `running` → accent
- `awaiting_user_input` → warning/accent
- `paused_provider_error` → error or strong warning
- `idle/reusable` → warning or muted-warning

Widget/status line behavior:

- if no actionable deployments/runtimes exist, remove widget and footer status entirely
- if actionable items exist, render only those items
- avoid flicker by hiding final items only after final transcript/state persistence is complete

### 11. Boundaries and implementation shape

To keep v1 maintainable, responsibilities should be separated inside `subagents.ts` even if they remain in one file initially:

- runtime manager
  - create, reuse, finalize, persist runtime state
- launch backend
  - embedded spawn
  - tmux-pane launch/rebind
- failure classifier
  - classify `task_error`, `provider_error`, `orchestrator_error`
- event emitter
  - publish deployment/runtime state changes to `agent-status.ts`

This is a boundary recommendation, not a requirement for a large refactor. Small focused helper functions are sufficient for v1.

## Data flow summary

### Normal successful tmux-pane run

1. primary calls `deploy_agent` with `launchBackend: "tmux-pane"`
2. runtime created/reused
3. pane created in current tmux window
4. subagent runs in pane
5. deployment completes successfully
6. pane stays open
7. runtime may remain `idle/reusable` if persistent
8. widget hides completed non-actionable deployment state

### Provider failure tmux-pane run

1. subagent runs in pane
2. subagent exits with provider-signature failure
3. classifier marks `provider_error`
4. runtime marked `paused_provider_error`
5. pane remains open
6. global provider-stop event emitted
7. primary stops in controlled recoverable state
8. user later continues primary and then resumes subagent using same runtime/session

## Error handling

### tmux unavailable

If `launchBackend = "tmux-pane"` but tmux context cannot be resolved or pane creation fails, classify as `orchestrator_error`. Do not silently fall back to `embedded`, because that changes user-visible control semantics. Return a clear error instead.

### pane disappears before resume

If runtime is reusable but bound pane no longer exists, create a new pane and update runtime binding metadata. Resume should still succeed.

### ambiguous failure text

If failure text cannot be confidently matched to provider heuristics, keep it as normal `task_error`. Do not stop the full workflow.

## Testing strategy

### Unit-level

- provider error classifier matches known provider failure strings
- classifier does not over-classify common task failures as provider failures
- display-state derivation hides `done` and normal `error`
- display-state derivation keeps `idle`, `paused_provider_error`, and `awaiting_user_input`
- runtime metadata persists tmux binding and recoverable reason

### Integration-level

- deploy persistent subagent with `launchBackend: "tmux-pane"` creates pane and stores pane metadata
- successful persistent run returns runtime to reusable idle state
- provider-failure run leaves pane open, marks runtime recoverable, and emits global stop event
- primary receives provider-stop event and terminates in controlled recoverable state
- resume path reuses same runtime/session and reuses pane when available
- resume path recreates pane when missing
- `agent-status` widget disappears when only `done`/normal `error` remain
- `/agent-status inspect` still shows hidden completed/error deployments

## Rollout plan

### v1

- add `launchBackend: "tmux-pane"`
- persist tmux binding metadata on runtime
- implement conservative provider-failure heuristic
- emit global provider-stop event
- mark provider failures as recoverable paused state
- stop primary in controlled recoverable way
- filter widget to actionable states only

### v1.1

- harden explicit resume path over existing runtime/session
- improve pane reattach/recreate behavior
- refine paused/waiting metadata and copy

### v2

- add kitty backend
- add richer programmatic control of live external runtimes
- explore inter-agent communication if still needed

## Open decisions intentionally deferred

These are intentionally out of scope for this spec and should not block v1:

- kitty window backend design
- live message injection into already-running subagents
- direct subagent-to-subagent messaging
- auto provider/model failover policy
- whether recoverable paused state becomes a first-class stored enum or remains derived display state long-term

## Acceptance criteria

Design is successful when:

1. a user can deploy a subagent into a new tmux pane from the current tmux window
2. persistent runtime metadata records tmux binding and remains reusable after completion
3. provider-signature failures leave the subagent recoverable instead of fully dead
4. provider-signature failures stop the primary workflow in a controlled, manual-resume-required way
5. users can later resume the same subagent runtime/session rather than recreate it from scratch
6. `agent-status.ts` hides `done` and normal `error` entries from the main widget
7. `agent-status.ts` continues showing `running`, `idle/reusable`, `paused_provider_error`, and `awaiting_user_input`
8. inspect/history still exposes completed and failed deployments for debugging

## Spec self-review

- Placeholder scan: no TODO/TBD placeholders remain
- Internal consistency: tmux-pane is optional throughout; provider-failure path always results in recoverable stop, not auto-retry
- Scope check: focused on one feature slice across `subagents.ts` and `agent-status.ts`; kitty and live messaging intentionally deferred
- Ambiguity check: provider-failure detection is explicitly heuristic and conservative in v1; widget visibility rules are explicitly enumerated
