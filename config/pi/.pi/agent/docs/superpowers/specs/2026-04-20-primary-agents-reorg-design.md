# Primary agent folder reorganization design

Date: 2026-04-20
Status: Approved

## Goal

Reorganize primary-agent prompt overlays so each primary agent lives in its own folder and owns its subagents from that same folder. Remove the old `agents/primary/` layout, add `nec-engineer` as a first-class primary agent, and update extensions so discovery, prompt injection, status, team routing, and agent model selection all use the new structure.

## Current state

- Primary overlays are discovered from `agents/primary/*.md`.
- Subagents already live in per-domain folders:
  - `agents/pi-orchestrator/`
  - `agents/pdd-orgm/`
  - `agents/skill-orchestrator/`
  - `agents/nec-engineer/`
- `extensions/model-primary.ts` injects the active primary overlay into `before_agent_start`.
- `extensions/subagents.ts` duplicates primary discovery logic and still treats deployable agents as a root-level catalog.
- `extensions/agent-status.ts` and `extensions/minimal.ts` also hardcode `agents/primary`.
- `extensions/agent-selector.ts` discovers agents from a flat `agents/*.md` layout.
- NEC is inconsistent:
  - empty file: `agents/primary/nec-engeneer.md`
  - real folder: `agents/nec-engineer/`
  - team name: `nec-team`

## Approved target structure

```text
agents/
  pi-orchestrator/
    index.md
    ext-expert.md
    cli-expert.md
    ...
  pdd-orgm/
    index.md
    pdd-explorer.md
    pdd-builder.md
    ...
  skill-orchestrator/
    index.md
    pdf-manager.md
    ...
  nec-engineer/
    index.md
    nec-general-core.md
    ...
  teams.yaml
```

## Conventions

### Primary agents

- Primary agent identity = folder name under `agents/`.
- Primary prompt file = `agents/<primary>/index.md`.
- `index.md` frontmatter provides selector metadata:
  - `name`
  - `description`
- `index.md` body is the prompt overlay injected by the primary-agent extension.

### Subagents

- Subagents are all `*.md` files inside a primary folder except `index.md`.
- Runtime agent names remain global and must stay unique across folders.
- Folder name is used for display and organization, not for runtime namespacing.

### Teams

- `teams.yaml` remains the source of truth for team membership.
- Team names should match primary folder names where applicable.
- NEC team is renamed from `nec-team` to `nec-engineer`.

## Architecture changes

### Shared discovery helper

Create a shared helper in `extensions/lib/` to centralize:

- nearest project `agents/` discovery
- recursive subagent discovery
- primary discovery from `agents/*/index.md`
- frontmatter parsing into shared `AgentConfig` and `PrimaryAgent` shapes
- legacy primary-name normalization (`nec-engeneer` -> `nec-engineer`)
- primary-state restore helpers

This removes duplicated discovery logic from:

- `extensions/model-primary.ts`
- `extensions/subagents.ts`
- `extensions/agent-status.ts`
- `extensions/minimal.ts`
- `extensions/agent-selector.ts`

### Primary selector and prompt injection

`extensions/model-primary.ts` will:

- discover primaries from folder `index.md` files
- inject prompt overlays from the selected primary’s `index.md` body
- restore persisted selection while mapping legacy `nec-engeneer` to `nec-engineer`
- show `nec-engineer` automatically once its `index.md` exists

### Agent deployment and team routing

`extensions/subagents.ts` will:

- keep `query_team` and `deploy_agent` behavior
- discover deployable agents recursively from `agents/**.md`
- exclude `index.md` from deployable agents
- keep `teams.yaml` resolution unchanged except for the NEC team rename
- use the same shared primary discovery rules as the selector extension

### Agent model selector

`extensions/agent-selector.ts` will:

- discover subagents recursively instead of only `agents/*.md`
- exclude all `index.md` primary prompt files
- display agents with folder-qualified labels like `pi-orchestrator/ext-expert`
- continue writing the selected model back into the real agent file frontmatter

### Status/footer extensions

`extensions/agent-status.ts` and `extensions/minimal.ts` will:

- stop hardcoding `agents/primary`
- restore primary state via the shared helper
- continue rendering the active primary label as `primary:<name>`

## NEC primary agent

Create `agents/nec-engineer/index.md` as a proper primary overlay.

Responsibilities:

- act as NEC orchestrator, not the single source of every answer
- route to focused NEC specialists
- prefer `query_team(team: "nec-engineer")` for consultation fan-out
- use direct subagent delegation when one specialist is clearly sufficient
- synthesize code-rule answers conservatively and citation-first
- admit uncertainty and ask clarifying questions when article context or jurisdiction assumptions are missing

## Migration strategy

### File migration

- copy existing primary prompts into:
  - `agents/pi-orchestrator/index.md`
  - `agents/pdd-orgm/index.md`
  - `agents/skill-orchestrator/index.md`
- create new `agents/nec-engineer/index.md`
- remove `agents/primary/`

### Team migration

Update `agents/teams.yaml`:

- rename `nec-team` -> `nec-engineer`
- keep other team names unchanged

### Backward-compatibility

Accepted scope:

- no compatibility layer for `agents/primary/`
- direct migration to folder-based primaries
- one legacy alias only during state restore: `nec-engeneer` -> `nec-engineer`

## Risks and mitigations

### Duplicate agent names across folders

Risk:
- recursive discovery can create ambiguous runtime names if two folders contain agents with the same `name`.

Mitigation:
- preserve global uniqueness requirement for agent names.

### Hidden breakage from duplicated discovery code

Risk:
- partial migration leaves one extension still pointing at `agents/primary`.

Mitigation:
- move primary discovery and state restoration into a shared helper and reuse it everywhere.

### Selector confusion between primary prompts and subagents

Risk:
- `index.md` could appear in agent lists.

Mitigation:
- recursive deployable-agent discovery must explicitly exclude `index.md`.

### Persisted legacy primary name

Risk:
- older sessions may store `nec-engeneer`.

Mitigation:
- normalize to `nec-engineer` during restore.

## Implementation plan

### Phase 1 — shared discovery layer

1. Add `extensions/lib/agent-discovery.ts`.
2. Move common parsing and discovery logic there.
3. Add legacy primary-name normalization.

### Phase 2 — migrate primary files

1. Create folder `index.md` files for all primaries.
2. Add the new NEC primary overlay.
3. Remove `agents/primary/`.
4. Rename NEC team in `teams.yaml`.

### Phase 3 — update extensions

1. Update `extensions/model-primary.ts`.
2. Update `extensions/subagents.ts`.
3. Update `extensions/agent-status.ts`.
4. Update `extensions/minimal.ts`.
5. Update `extensions/agent-selector.ts`.

### Phase 4 — verify behavior

1. Primary selector shows 4 primaries.
2. Active primary prompt injection uses folder `index.md` files.
3. `nec-engineer` team resolves in `query_team`.
4. `deploy_agent` discovers subagents recursively.
5. Agent-model selector shows `folder/agent` labels and excludes `index.md`.
6. Legacy persisted `nec-engeneer` restores as `nec-engineer`.

## Relevant files

- `agents/teams.yaml`
- `agents/pi-orchestrator/index.md`
- `agents/pdd-orgm/index.md`
- `agents/skill-orchestrator/index.md`
- `agents/nec-engineer/index.md`
- `extensions/lib/agent-discovery.ts`
- `extensions/model-primary.ts`
- `extensions/subagents.ts`
- `extensions/agent-status.ts`
- `extensions/minimal.ts`
- `extensions/agent-selector.ts`
