## goal
Implement optional `tmux-pane` launching for subagents, add conservative recoverable provider-stop semantics, and change `agent-status.ts` to show only actionable subagent/runtime states.

## assumptions
- Approved design spec: `docs/superpowers/specs/2026-04-22-subagents-tmux-recoverable-runtime-design.md`
- Existing persistent runtime/session registry in `extensions/subagents.ts` remains foundation
- v1 targets tmux only; no kitty backend yet
- Resume path should reuse same runtime/session; exact user-facing resume command can extend existing deploy/reuse flow instead of introducing a new tool name immediately
- `deploy_agent` remains backward-compatible with default embedded behavior

## constraints
- Keep current embedded launch mode working unchanged by default
- Do not silently fall back from `tmux-pane` to `embedded`
- Provider-error detection must be conservative to avoid false global stops
- Main status widget must hide `done` and normal final `error`
- Inspect/history must still retain full deployment visibility
- Avoid large refactor unless needed for safe boundaries

## impacted areas
- `extensions/subagents.ts` — deploy schema, runtime metadata, launch backend abstraction, tmux orchestration, failure classification, global provider-stop event, recoverable pause semantics, resume/rebind behavior
- `extensions/agent-status.ts` — display-state derivation, actionable-only filtering, paused/waiting visibility, inspect/history separation
- optional helper modules under `extensions/lib/` if extracting tmux/failure helpers is cleaner
- tests or validation scripts if project has existing pattern; otherwise command-based/manual validation notes

## parallel-groups

### group: main
**Type:** sequential  
**Steps:**
- Read approved design spec and current `extensions/subagents.ts` / `extensions/agent-status.ts` code paths together.
- Identify existing runtime registry shape, event names, deployment finalization path, and display derivation path.
- Define exact additive schema changes for runtime metadata and `deploy_agent` params.
- Decide whether tmux helpers and failure classifier stay in `subagents.ts` or move to small helper functions/files.
- Define new/updated event payloads for recoverable provider stop without breaking current widget updates.
- Define precise actionable display states: `running`, `idle`, `paused_provider_error`, `awaiting_user_input`.

### group: build-launch-backend
**Type:** parallel-build  
**Dependencies:** main  
**Steps:**
- Extend `deploy_agent` params with `launchBackend?: "embedded" | "tmux-pane"`.
- Add runtime metadata for terminal binding: backend, terminal state, tmux window/pane identifiers, recoverable reason, last visible state.
- Implement tmux availability/current-window resolution.
- Implement tmux pane creation and command launch using existing runtime session file.
- Persist tmux binding metadata into runtime registry.
- Ensure pane-open lifecycle does not break current deployment accounting.
- Handle pane-missing-on-resume by recreating pane and rebinding runtime metadata.

### group: build-failure-semantics
**Type:** parallel-build  
**Dependencies:** main  
**Steps:**
- Add failure classifier helper for `task_error | provider_error | orchestrator_error`.
- Implement conservative provider-error heuristic using `exitCode`, `stopReason`, `stderr`, and final output text.
- Hook classifier into final deployment path in `subagents.ts`.
- Add recoverable paused semantics for provider errors so runtime remains reusable instead of being treated as ordinary terminal failure.
- Emit dedicated provider-stop event payload with runtime/deployment summary.
- Ensure provider-stop path leaves tmux pane open and does not destroy runtime/session.
- Define primary-stop behavior payload/message for controlled manual continuation.

### group: build-status-ui
**Type:** parallel-build  
**Dependencies:** main  
**Steps:**
- Refactor `agent-status.ts` display derivation so widget uses actionable display state, not raw deployment history.
- Filter out `done`, normal final `error`, and completed ephemeral runs from main widget.
- Keep visible only `running`, `idle/reusable`, `paused_provider_error`, and `awaiting_user_input`.
- Add visual treatment and icons for paused provider failure if needed.
- Ensure footer/status line disappears when no actionable items remain.
- Preserve `/agent-status inspect` behavior so hidden finished/error items are still available in history.

### group: review-launch-backend
**Type:** parallel-review  
**Dependencies:** build-launch-backend  
**Steps:**
- Verify backward compatibility of `deploy_agent` default behavior.
- Verify tmux-pane launch uses current tmux window and stores pane binding metadata.
- Verify no silent fallback to embedded mode when tmux setup fails.
- Verify resume/rebind logic handles missing pane correctly.

### group: review-failure-semantics
**Type:** parallel-review  
**Dependencies:** build-failure-semantics  
**Steps:**
- Verify conservative classifier catches clear provider failures and avoids broad false positives.
- Verify provider-stop leaves runtime reusable and pane open.
- Verify normal task failures do not trigger global provider stop.
- Verify primary-stop path is controlled/manual and not auto-retrying.

### group: review-status-ui
**Type:** parallel-review  
**Dependencies:** build-status-ui  
**Steps:**
- Verify widget hides `done` and normal `error` states.
- Verify `idle/reusable`, `paused_provider_error`, and `awaiting_user_input` remain visible.
- Verify widget/status line disappears cleanly when nothing actionable remains.
- Verify inspect/history still lists hidden deployments.

### group: integrate-and-validate
**Type:** sequential  
**Dependencies:** review-launch-backend, review-failure-semantics, review-status-ui  
**Steps:**
- Reconcile any event payload mismatches between `subagents.ts` and `agent-status.ts`.
- Run TypeScript/build validation for modified extensions.
- Run manual end-to-end scenarios for embedded mode, tmux-pane mode, normal success, provider failure, normal task failure, and idle runtime visibility.
- Tighten copy, status summaries, and edge-case handling discovered during validation.
- Update any user-facing descriptions/help text for new `launchBackend` option.

## validation strategy
- Static validation:
  - TypeScript/typecheck for changed files
  - lint/format if project has command for it
- Manual scenario validation:
  1. `embedded` run still works exactly as before
  2. `tmux-pane` persistent run opens pane in current tmux window
  3. successful persistent tmux run returns runtime to `idle/reusable`
  4. provider-like failure marks runtime `paused_provider_error`, leaves pane open, emits global stop, and stops primary
  5. normal task failure does not trigger global provider stop
  6. widget hides `done` and normal `error`
  7. widget shows `idle/reusable`, `paused_provider_error`, and `awaiting_user_input`
  8. inspect view still shows hidden completed/error deployments
  9. resume path reuses same runtime/session and rebinds pane if original pane disappeared

## rollback or mitigation notes
- If tmux integration proves unstable, keep `launchBackend` gated and default to `embedded` while leaving schema additive.
- If provider heuristics are too noisy, narrow signatures rather than broadening stop behavior.
- If paused-state modeling causes churn, keep raw deployment statuses stable and derive paused display state separately.
- If pane rebinding is risky for v1, support runtime reuse first and make pane recreation explicit with a clear warning.

## handoff instructions for builders
- Preserve current `deploy_agent` and persistent runtime behavior first; add tmux-pane as additive path.
- Touch finalization code carefully: runtime-idle reuse logic already exists and should not regress.
- Prefer small helper functions for tmux command building, provider classification, and display-state derivation.
- Keep event naming/payloads explicit; `agent-status.ts` should not infer paused provider state from fragile string parsing.
- Separate operational widget visibility from inspect/history data retention.
- Validate with real tmux session, not only unit reasoning.

## risks and dependencies
- tmux environment detection may fail outside tmux or across nested sessions
- runtime registry changes can break reuse if metadata writes are inconsistent
- provider heuristics may under-match or over-match; false positives are especially costly
- primary-stop semantics depend on current orchestration lifecycle and may need careful event timing
- hiding too aggressively in widget could make debugging harder if inspect path regresses
- existing uncommitted changes in repo mean implementation should avoid unrelated file churn
