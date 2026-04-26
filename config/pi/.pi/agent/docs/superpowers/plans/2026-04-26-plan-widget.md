# Plan Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Pi TUI widget that observes Superpowers plan tasks and renders detailed task progress below the editor.

**Architecture:** Add a small `extensions/plan.ts` extension that rebuilds in-memory widget state from plan markdown, current session text, Pi lifecycle events, and subagent handoff broadcasts. Keep parser, evidence inference, and rendering as pure helper modules under `extensions/plan/` so focused smoke checks can exercise behavior without launching an interactive TUI.

**Tech Stack:** TypeScript Pi extension API, Node `fs/promises`, `@mariozechner/pi-tui` width helpers, Pi lifecycle events, Pi shared event bus.

---

## File Structure Map

- **Create:**
  - `extensions/plan.ts` — extension entrypoint, lifecycle/event wiring, UI mount/clear, plan file reads, state signature, shutdown cleanup.
  - `extensions/plan/types.ts` — shared task/evidence/state interfaces and constants.
  - `extensions/plan/parser.ts` — pure markdown checkbox extraction, heading ancestry, fenced-code/blockquoted example skipping, stable task ids.
  - `extensions/plan/evidence.ts` — pure session/handoff text extraction, active plan path selection, evidence overlay, artifact/path matching.
  - `extensions/plan/render.ts` — pure 50-column/13-line widget renderer and footer status builder with ANSI-safe truncation.
  - `extensions/plan/smoke-test.mjs` — focused smoke assertions for parser, evidence, and renderer when no repo test harness exists.
- **Modify:**
  - `settings.json` — add `~/.pi/agent/extensions/plan.ts` to enabled extensions after `agent-status.ts`.

**Helper justification:** `extensions/plan.ts` would be too large and brittle if parser, evidence matching, renderer, and lifecycle code lived in one file. The helper directory is not auto-discovered by Pi because it has no `index.ts`; only the top-level `extensions/plan.ts` is loaded. Pure helpers also make parser/render checks feasible in this config repo, which has no package-level test runner.

**Do not modify:**

- `docs/superpowers/plans/*.md` at runtime from extension code.
- `docs/superpowers/specs/*.md` at runtime from extension code.
- `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/**`.
- `agents/teams.yaml`.
- `agents/tdd-orgm/**`.
- `extensions/agent-status.ts` except reading it for sizing/event conventions.

---

## Task 1: Verify baseline and capture constraints

**Files:** none

- [ ] Read approved design spec.

```bash
sed -n '1,260p' docs/superpowers/specs/2026-04-26-plan-widget-design.md
```

Expected: spec includes widget key `superpowers-plan`, width `50`, min/default height `13`, overflow label `+N más`, read-only constraint, `ctx.hasUI` guard, and shutdown cleanup acceptance criteria.

- [ ] Read existing extension sizing/lifecycle patterns.

```bash
grep -n "DEPLOYMENT_CARD_MIN_WIDTH\|DEPLOYMENT_GRID_GAP\|setWidget\|setStatus\|session_shutdown" extensions/agent-status.ts extensions/panel.ts
```

Expected: `agent-status.ts` uses card width `24`, gap `2`, widget key `pdd-orgm-agents`; `panel.ts` shows `session_shutdown` cleanup.

- [ ] Confirm no existing plan extension or helper directory.

```bash
[ -e extensions/plan.ts ] && echo "PLAN_TS_EXISTS" || echo "PLAN_TS_MISSING_OK"
[ -d extensions/plan ] && echo "PLAN_DIR_EXISTS" || echo "PLAN_DIR_MISSING_OK"
```

Expected before implementation: `PLAN_TS_MISSING_OK` and `PLAN_DIR_MISSING_OK`.

- [ ] Confirm repository lacks package-level test harness.

```bash
find .. -maxdepth 3 -name package.json -print
find . -maxdepth 4 -name 'tsconfig*.json' -print
```

Expected in current config repo: no project `package.json` or `tsconfig*.json` near `.pi/agent`; use Pi load checks and focused smoke script instead.

---

## Task 2: Add shared model and constants

**Files:**

- Create: `extensions/plan/types.ts`

- [ ] Create `extensions/plan/types.ts` with constants and interfaces.

```typescript
export const PLAN_WIDGET_KEY = "superpowers-plan";
export const PLAN_STATUS_KEY = "superpowers-plan";
export const PLAN_WIDGET_WIDTH = 50;
export const PLAN_WIDGET_MIN_HEIGHT = 13;
export const PLAN_WIDGET_DEFAULT_VISIBLE_LINES = 13;
export const PLAN_OVERFLOW_TEMPLATE = "+N más";

export type PlanTaskState =
  | "pending"
  | "active"
  | "implemented"
  | "done"
  | "blocked";
export type PlanEvidenceSource =
  | "markdown"
  | "session"
  | "handoff"
  | "event"
  | "artifact";
export type PlanEvidenceConfidence = "low" | "medium" | "high";

export interface PlanTaskEvidence {
  source: PlanEvidenceSource;
  state: PlanTaskState;
  confidence: PlanEvidenceConfidence;
  summary: string;
  timestamp?: number;
  path?: string;
}

export interface PlanTask {
  id: string;
  planPath: string;
  line: number;
  depth: number;
  title: string;
  section?: string;
  state: PlanTaskState;
  evidence: PlanTaskEvidence[];
}

export interface ParsedPlan {
  path: string;
  tasks: PlanTask[];
  mtimeMs: number;
  referencedAt?: number;
}

export interface PlanWidgetState {
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

export interface SessionSignal {
  text: string;
  timestamp: number;
  source: "session" | "handoff" | "event";
}

export interface ArtifactProbe {
  relativePath: string;
  exists: boolean;
  mtimeMs?: number;
}

export function emptyPlanWidgetState(now = Date.now()): PlanWidgetState {
  return {
    tasks: [],
    lastUpdatedAt: now,
    visibleHeight: PLAN_WIDGET_DEFAULT_VISIBLE_LINES,
    total: 0,
    pending: 0,
    active: 0,
    implemented: 0,
    done: 0,
    blocked: 0,
  };
}
```

- [ ] Validate no mutable persistence fields are defined.

```bash
grep -n "appendEntry\|writeFile\|checkbox\|mutat" extensions/plan/types.ts || true
```

Expected: no `appendEntry`, no `writeFile`; only model constants and read-only state types.

---

## Task 3: Add markdown parser helper

**Files:**

- Create: `extensions/plan/parser.ts`

- [ ] Create parser with line-based rules, heading ancestry, fenced-code skipping, blockquote checkbox skipping, nesting depth, and stable ids.

````typescript
import { createHash } from "node:crypto";
import type { ParsedPlan, PlanTask } from "./types";

const TASK_PATTERN = /^(\s*)- \[( |x|X)\]\s+(.+)$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function stableTaskId(
  planPath: string,
  line: number,
  title: string,
  section?: string,
): string {
  const hash = createHash("sha1")
    .update(`${planPath}\n${line}\n${normalizeTitle(title)}\n${section ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return `${planPath}:${line}:${hash}`;
}

function cleanHeading(raw: string): string {
  return raw.replace(/#+\s*$/, "").trim();
}

function currentSection(
  headings: Array<{ level: number; title: string }>,
): string | undefined {
  if (headings.length === 0) return undefined;
  return headings.map((heading) => heading.title).join(" > ");
}

export function parsePlanMarkdown(
  planPath: string,
  content: string,
  mtimeMs = 0,
): ParsedPlan {
  const tasks: PlanTask[] = [];
  const headings: Array<{ level: number; title: string }> = [];
  let inFence = false;
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const lineNumber = index + 1;

    if (FENCE_PATTERN.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*>/.test(rawLine)) continue;

    const headingMatch = rawLine.match(HEADING_PATTERN);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const title = cleanHeading(headingMatch[2] ?? "");
      while (
        headings.length > 0 &&
        headings[headings.length - 1]!.level >= level
      )
        headings.pop();
      if (title) headings.push({ level, title });
      continue;
    }

    const taskMatch = rawLine.match(TASK_PATTERN);
    if (!taskMatch) continue;
    const indent = taskMatch[1] ?? "";
    const checkbox = taskMatch[2] ?? " ";
    const title = (taskMatch[3] ?? "").trim();
    if (!title) continue;
    const section = currentSection(headings);
    const state = checkbox.toLowerCase() === "x" ? "done" : "pending";
    tasks.push({
      id: stableTaskId(planPath, lineNumber, title, section),
      planPath,
      line: lineNumber,
      depth: Math.floor(indent.replace(/\t/g, "    ").length / 2),
      title,
      section,
      state,
      evidence: [
        {
          source: "markdown",
          state,
          confidence: "high",
          summary: `markdown ${checkbox.toLowerCase() === "x" ? "checked" : "open"}`,
          path: planPath,
        },
      ],
    });
  }

  return { path: planPath, tasks, mtimeMs };
}
````

- [ ] Run syntax/import smoke after file exists.

```bash
node --check extensions/plan/smoke-test.mjs
```

Expected after Task 7 creates smoke script: `node --check` reports no syntax error.

---

## Task 4: Add evidence and plan-selection helper

**Files:**

- Create: `extensions/plan/evidence.ts`

- [ ] Create helper for session text extraction, active plan selection, task-state overlay, and artifact path detection.

```typescript
import type {
  ArtifactProbe,
  ParsedPlan,
  PlanTask,
  PlanTaskEvidence,
  PlanTaskState,
  SessionSignal,
} from "./types";

const PLAN_PATH_PATTERN = /docs\/superpowers\/plans\/[\w./-]+\.md/g;
const PATH_PATTERN =
  /(?:^|[\s`'"(])((?:agents|extensions|docs|skills|themes|\.pi)\/[\w./-]+|settings\.json)(?=$|[\s`'"),:])/g;
const ACTIVE_WORDS =
  /\b(active|started|starting|current|in progress|executing|next)\b/i;
const IMPLEMENTED_WORDS =
  /\b(implemented|created|modified|wired|added|built)\b/i;
const DONE_WORDS = /\b(done|complete|completed|passed|verified|success)\b/i;
const BLOCKED_WORDS = /\b(blocked|waiting for user|failed|cannot proceed)\b/i;

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) =>
      part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "text"
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

export function extractSessionSignals(entries: unknown[]): SessionSignal[] {
  const signals: SessionSignal[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as {
      type?: string;
      timestamp?: string;
      message?: {
        role?: string;
        content?: unknown;
        details?: unknown;
        toolName?: string;
        isError?: boolean;
      };
      summary?: string;
      content?: unknown;
      customType?: string;
      details?: unknown;
    };
    const timestamp = Date.parse(candidate.timestamp ?? "") || Date.now();
    if (candidate.type === "message" && candidate.message) {
      const body = [
        textContent(candidate.message.content),
        JSON.stringify(candidate.message.details ?? {}),
      ]
        .filter(Boolean)
        .join("\n");
      if (body.trim())
        signals.push({ text: body, timestamp, source: "session" });
      continue;
    }
    if (
      candidate.type === "branch_summary" ||
      candidate.type === "compaction"
    ) {
      if (candidate.summary)
        signals.push({ text: candidate.summary, timestamp, source: "session" });
      continue;
    }
    if (candidate.type === "custom" || candidate.type === "custom_message") {
      const body = [
        textContent(candidate.content),
        JSON.stringify(candidate.details ?? {}),
      ]
        .filter(Boolean)
        .join("\n");
      if (body.trim()) signals.push({ text: body, timestamp, source: "event" });
    }
  }
  return signals;
}

export function extractPlanPathMentions(
  signals: SessionSignal[],
): Map<string, number> {
  const mentions = new Map<string, number>();
  for (const signal of signals) {
    for (const match of signal.text.matchAll(PLAN_PATH_PATTERN)) {
      mentions.set(
        match[0],
        Math.max(signal.timestamp, mentions.get(match[0]) ?? 0),
      );
    }
  }
  return mentions;
}

export function chooseActivePlan(
  plans: ParsedPlan[],
  signals: SessionSignal[],
): ParsedPlan | undefined {
  const withTasks = plans.filter((plan) => plan.tasks.length > 0);
  if (withTasks.length === 0) return undefined;
  const mentions = extractPlanPathMentions(signals);
  return [...withTasks]
    .map((plan) => ({ plan, mentionedAt: mentions.get(plan.path) ?? 0 }))
    .sort(
      (a, b) =>
        b.mentionedAt - a.mentionedAt ||
        b.plan.mtimeMs - a.plan.mtimeMs ||
        a.plan.path.localeCompare(b.plan.path),
    )[0]?.plan;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/_ .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatches(text: string, task: PlanTask): boolean {
  const haystack = normalize(text);
  const title = normalize(task.title);
  if (title.length > 8 && haystack.includes(title)) return true;
  const titleTokens = title.split(" ").filter((token) => token.length > 3);
  if (titleTokens.length === 0) return false;
  const hits = titleTokens.filter((token) => haystack.includes(token)).length;
  return hits >= Math.max(3, Math.ceil(titleTokens.length * 0.75));
}

export function extractMentionedPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(PATH_PATTERN)) paths.add(match[1]!);
  return [...paths];
}

function taskPaths(task: PlanTask): string[] {
  return extractMentionedPaths(task.title);
}

function evidenceState(text: string): PlanTaskState | undefined {
  if (BLOCKED_WORDS.test(text)) return "blocked";
  if (ACTIVE_WORDS.test(text)) return "active";
  if (IMPLEMENTED_WORDS.test(text)) return "implemented";
  if (DONE_WORDS.test(text)) return "done";
  return undefined;
}

function stateRank(state: PlanTaskState): number {
  if (state === "blocked") return 5;
  if (state === "active") return 4;
  if (state === "done") return 3;
  if (state === "implemented") return 2;
  return 1;
}

function latestEvidence(task: PlanTask): PlanTaskEvidence | undefined {
  return [...task.evidence].sort(
    (a, b) =>
      (b.timestamp ?? 0) - (a.timestamp ?? 0) ||
      stateRank(b.state) - stateRank(a.state),
  )[0];
}

export function overlayEvidence(
  tasks: PlanTask[],
  signals: SessionSignal[],
  artifacts: ArtifactProbe[] = [],
): PlanTask[] {
  const artifactByPath = new Map(
    artifacts.map((artifact) => [artifact.relativePath, artifact]),
  );
  return tasks.map((task) => {
    const evidence: PlanTaskEvidence[] = [...task.evidence];
    for (const signal of signals) {
      if (!titleMatches(signal.text, task)) continue;
      const state = evidenceState(signal.text);
      if (!state) continue;
      evidence.push({
        source: signal.source,
        state,
        confidence: "high",
        summary: signal.text.replace(/\s+/g, " ").slice(0, 160),
        timestamp: signal.timestamp,
      });
    }
    for (const path of taskPaths(task)) {
      const artifact = artifactByPath.get(path);
      if (artifact?.exists)
        evidence.push({
          source: "artifact",
          state: "implemented",
          confidence: "medium",
          summary: `${path} exists`,
          timestamp: artifact.mtimeMs,
          path,
        });
    }
    const best = latestEvidence({ ...task, evidence });
    return { ...task, evidence, state: best?.state ?? task.state };
  });
}
```

- [ ] Verify plan path mention regex on real plan path names.

```bash
node -e 'const r=/docs\/superpowers\/plans\/[\w./-]+\.md/g; const s="docs/superpowers/plans/2026-04-26-plan-widget.md"; console.log(s.match(r)?.[0])'
```

Expected: prints `docs/superpowers/plans/2026-04-26-plan-widget.md`.

---

## Task 5: Add renderer helper

**Files:**

- Create: `extensions/plan/render.ts`

- [ ] Create renderer with fixed target width, 13-line default/minimum, active pinning, overflow `+N más`, color rules, and ANSI-safe truncation.

```typescript
import { basename } from "node:path";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
  PLAN_OVERFLOW_TEMPLATE,
  PLAN_WIDGET_DEFAULT_VISIBLE_LINES,
  PLAN_WIDGET_MIN_HEIGHT,
  PLAN_WIDGET_WIDTH,
  type PlanTask,
  type PlanTaskState,
  type PlanWidgetState,
} from "./types";

function padAnsi(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function markerForState(state: PlanTaskState): string {
  if (state === "active") return "▶";
  if (state === "implemented") return "◉";
  if (state === "done") return "✓";
  if (state === "blocked") return "!";
  return "○";
}

function colorForState(
  state: PlanTaskState,
): "muted" | "dim" | "success" | "accent" | "warning" | "error" | "text" {
  if (state === "active") return "accent";
  if (state === "implemented" || state === "done") return "success";
  if (state === "blocked") return "warning";
  return "dim";
}

function displayOrder(tasks: PlanTask[], capacity: number): PlanTask[] {
  const activeIndex = tasks.findIndex(
    (task) => task.state === "active" || task.state === "blocked",
  );
  if (activeIndex < 0 || tasks.length <= capacity) {
    const pending = tasks.filter(
      (task) =>
        task.state === "pending" ||
        task.state === "active" ||
        task.state === "blocked",
    );
    const finished = tasks.filter(
      (task) => task.state === "implemented" || task.state === "done",
    );
    return [...pending, ...finished];
  }
  const start = Math.max(
    0,
    Math.min(activeIndex - Math.floor(capacity / 2), tasks.length - capacity),
  );
  return tasks
    .slice(start, start + capacity)
    .concat(
      tasks.filter((_, index) => index < start || index >= start + capacity),
    );
}

export function summarizePlan(
  tasks: PlanTask[],
  activePlanPath?: string,
  now = Date.now(),
): PlanWidgetState {
  const count = (state: PlanTaskState) =>
    tasks.filter((task) => task.state === state).length;
  return {
    activePlanPath,
    tasks,
    lastUpdatedAt: now,
    visibleHeight: PLAN_WIDGET_DEFAULT_VISIBLE_LINES,
    total: tasks.length,
    pending: count("pending"),
    active: count("active"),
    implemented: count("implemented"),
    done: count("done"),
    blocked: count("blocked"),
  };
}

export function buildPlanStatus(
  state: PlanWidgetState,
  theme: any,
): string | undefined {
  if (state.tasks.length === 0) return undefined;
  const activeText = state.active > 0 ? `${state.active} active` : "0 active";
  const doneText = `${state.done + state.implemented} done`;
  const pendingText = `${state.pending} pending`;
  const blockedText = state.blocked > 0 ? ` · ${state.blocked} blocked` : "";
  return theme.fg(
    state.blocked > 0 ? "warning" : state.active > 0 ? "accent" : "muted",
    `📋 ${activeText} · ${doneText} · ${pendingText}${blockedText}`,
  );
}

export function buildPlanWidgetLines(
  state: PlanWidgetState,
  theme: any,
  hostWidth: number,
): string[] {
  if (state.tasks.length === 0) return [];
  const width = Math.max(
    1,
    Math.min(PLAN_WIDGET_WIDTH, Math.floor(hostWidth || 0)),
  );
  const innerWidth = Math.max(0, width - 2);
  const borderColor =
    state.blocked > 0
      ? "warning"
      : state.active > 0
        ? "borderAccent"
        : "borderMuted";
  const titleRaw = ` Plan · ${state.activePlanPath ? basename(state.activePlanPath) : "detected"} `;
  const title = truncateToWidth(titleRaw, innerWidth);
  const top = theme.fg(
    borderColor,
    `╭${title}${"─".repeat(Math.max(0, innerWidth - visibleWidth(title)))}╮`,
  );
  const bottom = theme.fg(borderColor, `╰${"─".repeat(innerWidth)}╯`);
  const metaRaw = ` ${state.total} tasks · ${state.done + state.implemented} done · ${state.pending} pending`;
  const lines = [
    top,
    theme.fg(borderColor, "│") +
      theme.fg("muted", padAnsi(metaRaw, innerWidth)) +
      theme.fg(borderColor, "│"),
  ];
  const capacityWithoutOverflow = Math.max(0, PLAN_WIDGET_MIN_HEIGHT - 3);
  const hasOverflow = state.tasks.length > capacityWithoutOverflow;
  const taskCapacity = hasOverflow
    ? Math.max(0, capacityWithoutOverflow - 1)
    : capacityWithoutOverflow;
  const ordered = displayOrder(state.tasks, taskCapacity);
  const visibleTasks = ordered.slice(0, taskCapacity);
  const hiddenCount = Math.max(0, state.tasks.length - visibleTasks.length);

  for (const task of visibleTasks) {
    const stateColor = colorForState(task.state);
    const prefix = ` ${markerForState(task.state)} ${task.line}. `;
    const availableTitle = Math.max(0, innerWidth - visibleWidth(prefix));
    const titleText = truncateToWidth(task.title, availableTitle);
    const row = theme.fg(stateColor, prefix + titleText);
    lines.push(
      theme.fg(borderColor, "│") +
        padAnsi(row, innerWidth) +
        theme.fg(borderColor, "│"),
    );
  }

  if (hiddenCount > 0) {
    const overflowText = PLAN_OVERFLOW_TEMPLATE.replace(
      "N",
      String(hiddenCount),
    );
    lines.push(
      theme.fg(borderColor, "│") +
        theme.fg("dim", padAnsi(` ${overflowText}`, innerWidth)) +
        theme.fg(borderColor, "│"),
    );
  }
  while (lines.length < PLAN_WIDGET_MIN_HEIGHT - 1) {
    lines.push(
      theme.fg(borderColor, "│") +
        padAnsi("", innerWidth) +
        theme.fg(borderColor, "│"),
    );
  }
  lines.push(bottom);
  return lines
    .slice(0, PLAN_WIDGET_MIN_HEIGHT)
    .map((line) => truncateToWidth(line, width));
}
```

- [ ] Verify hard-coded constants align with spec.

```bash
grep -n "PLAN_WIDGET_WIDTH\|PLAN_WIDGET_MIN_HEIGHT\|PLAN_WIDGET_DEFAULT_VISIBLE_LINES\|PLAN_OVERFLOW" extensions/plan/types.ts extensions/plan/render.ts
```

Expected: width `50`, min/default `13`, overflow template `+N más`.

---

## Task 6: Add extension entrypoint and lifecycle wiring

**Files:**

- Create: `extensions/plan.ts`

- [ ] Create entrypoint imports and read helpers.

```typescript
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { parsePlanMarkdown } from "./plan/parser";
import {
  chooseActivePlan,
  extractMentionedPaths,
  extractSessionSignals,
  overlayEvidence,
} from "./plan/evidence";
import {
  buildPlanStatus,
  buildPlanWidgetLines,
  summarizePlan,
} from "./plan/render";
import {
  emptyPlanWidgetState,
  PLAN_STATUS_KEY,
  PLAN_WIDGET_KEY,
  type ArtifactProbe,
  type ParsedPlan,
  type PlanWidgetState,
  type SessionSignal,
} from "./plan/types";

const PLAN_DIR = "docs/superpowers/plans";
const SUBAGENTS_EVENT = "subagents:deployments-changed";
const REFRESH_DEBOUNCE_MS = 150;

type WidgetHandle = { requestRender: () => void };

function compactSignature(state: PlanWidgetState): string {
  return JSON.stringify({
    activePlanPath: state.activePlanPath,
    counts: [
      state.pending,
      state.active,
      state.implemented,
      state.done,
      state.blocked,
    ],
    tasks: state.tasks.map((task) => [task.id, task.state, task.title]),
  });
}

async function readPlans(ctx: ExtensionContext): Promise<ParsedPlan[]> {
  const absoluteDir = join(ctx.cwd, PLAN_DIR);
  let names: string[] = [];
  try {
    names = await readdir(absoluteDir);
  } catch {
    return [];
  }
  const plans: ParsedPlan[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".md")).sort()) {
    const absolutePath = join(absoluteDir, name);
    const planPath = join(PLAN_DIR, name);
    try {
      const [info, content] = await Promise.all([
        stat(absolutePath),
        readFile(absolutePath, "utf8"),
      ]);
      plans.push(parsePlanMarkdown(planPath, content, info.mtimeMs));
    } catch {
      continue;
    }
  }
  return plans;
}

async function probeArtifacts(
  ctx: ExtensionContext,
  signals: SessionSignal[],
  plans: ParsedPlan[],
): Promise<ArtifactProbe[]> {
  const paths = new Set<string>();
  for (const signal of signals)
    for (const path of extractMentionedPaths(signal.text)) paths.add(path);
  for (const plan of plans)
    for (const task of plan.tasks)
      for (const path of extractMentionedPaths(task.title)) paths.add(path);
  const probes: ArtifactProbe[] = [];
  for (const path of [...paths].filter(
    (candidate) => !candidate.includes("..") && !candidate.startsWith("/"),
  )) {
    try {
      const info = await stat(join(ctx.cwd, path));
      probes.push({
        relativePath: relative(ctx.cwd, join(ctx.cwd, path)),
        exists: true,
        mtimeMs: info.mtimeMs,
      });
    } catch {
      probes.push({ relativePath: path, exists: false });
    }
  }
  return probes;
}
```

- [ ] Add `syncWidget` and `refreshNow` with `ctx.hasUI` guards and no plan writes.

```typescript
export default function (pi: ExtensionAPI) {
	let currentCtx: ExtensionContext | undefined;
	let state: PlanWidgetState = emptyPlanWidgetState();
	let widgetHandle: WidgetHandle | undefined;
	let widgetMounted = false;
	let lastSignature = "";
	let refreshTimer: NodeJS.Timeout | undefined;
	let refreshInFlight = false;
	let eventSignals: SessionSignal[] = [];

	const clearUi = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (widgetMounted) ctx.ui.setWidget(PLAN_WIDGET_KEY, undefined);
		ctx.ui.setStatus(PLAN_STATUS_KEY, undefined);
		widgetMounted = false;
		widgetHandle = undefined;
	};

	const safeRequestRender = (): boolean => {
		try {
			widgetHandle?.requestRender();
			return Boolean(widgetHandle);
		} catch {
			widgetHandle = undefined;
			widgetMounted = false;
			return false;
		}
	};

	const syncWidget = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (state.tasks.length === 0 || !state.activePlanPath) {
			clearUi(ctx);
			lastSignature = "";
			return;
		}
		const signature = compactSignature(state);
		if (signature === lastSignature && widgetMounted) return;
		lastSignature = signature;
		if (!widgetMounted) {
			ctx.ui.setWidget(
				PLAN_WIDGET_KEY,
				(tui, theme) => {
					widgetHandle = { requestRender: () => tui.requestRender() };
					return {
						render(width: number): string[] {
							return buildPlanWidgetLines(state, theme, width);
						},
						invalidate() {},
					};
				},
				{ placement: "belowEditor" },
			);
			widgetMounted = true;
		} else if (!safeRequestRender()) {
			lastSignature = "";
			syncWidget(ctx);
			return;
		}
		ctx.ui.setStatus(PLAN_STATUS_KEY, buildPlanStatus(state, ctx.ui.theme));
	};

	const refreshNow = async (ctx = currentCtx) => {
		if (!ctx || refreshInFlight) return;
		refreshInFlight = true;
		try {
			const sessionSignals = extractSessionSignals(ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries());
			const signals = [...sessionSignals, ...eventSignals].sort((a, b) => a.timestamp - b.timestamp).slice(-200);
			const plans = await readPlans(ctx);
			const activePlan = chooseActivePlan(plans, signals);
			if (!activePlan) {
				state = emptyPlanWidgetState();
				clearUi(ctx);
				return;
			}
			const artifacts = await probeArtifacts(ctx, signals, plans);
			const tasks = overlayEvidence(activePlan.tasks, signals, artifacts);
			state = summarizePlan(tasks, activePlan.path);
			syncWidget(ctx);
		} finally {
			refreshInFlight = false;
		}
	};

	const scheduleRefresh = (ctx = currentCtx, delay = REFRESH_DEBOUNCE_MS) => {
		if (!ctx) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => { void refreshNow(ctx); }, delay);
		refreshTimer.unref?.();
	};
```

- [ ] Add lifecycle and event-bus listeners.

```typescript
	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;
		state = emptyPlanWidgetState();
		widgetHandle = undefined;
		widgetMounted = false;
		lastSignature = "";
		eventSignals = [];
		await refreshNow(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		currentCtx = ctx;
		scheduleRefresh(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		currentCtx = ctx;
		eventSignals.push({ text: `${event.toolName} ${event.isError ? "failed" : "completed"} ${JSON.stringify(event.result ?? {})}`, timestamp: Date.now(), source: "event" });
		eventSignals = eventSignals.slice(-100);
		scheduleRefresh(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		currentCtx = ctx;
		eventSignals.push({ text: JSON.stringify(event.messages ?? []), timestamp: Date.now(), source: "event" });
		eventSignals = eventSignals.slice(-100);
		scheduleRefresh(ctx, 0);
	});

	pi.events.on(SUBAGENTS_EVENT, (data: unknown) => {
		eventSignals.push({ text: JSON.stringify(data ?? {}), timestamp: Date.now(), source: "handoff" });
		eventSignals = eventSignals.slice(-100);
		scheduleRefresh(currentCtx, 0);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (refreshTimer) clearTimeout(refreshTimer);
		state = emptyPlanWidgetState();
		eventSignals = [];
		clearUi(ctx);
		currentCtx = undefined;
		lastSignature = "";
	});
}
```

- [ ] Verify UI calls are guarded and no writes exist.

```bash
grep -n "ctx.ui\.\|setWidget\|setStatus" extensions/plan.ts
grep -n "writeFile\|appendEntry\|save\|checkbox" extensions/plan.ts extensions/plan/*.ts || true
```

Expected: every UI path is reached from `if (!ctx.hasUI) return` or `clearUi`; no file writes, `appendEntry`, or checkbox mutation.

---

## Task 7: Add focused smoke checks

**Files:**

- Create: `extensions/plan/smoke-test.mjs`

- [ ] Create smoke script using Pi's bundled Jiti and pure helper exports.

```javascript
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const piRoot =
  process.env.PI_PACKAGE_ROOT ??
  "/home/osmarg/.local/share/fnm/node-versions/v22.22.1/installation/lib/node_modules/@mariozechner/pi-coding-agent";
const { createJiti } = await import(
  pathToFileURL(join(piRoot, "node_modules/@mariozechner/jiti/lib/jiti.mjs"))
    .href
);
const jiti = createJiti(import.meta.url, { interopDefault: true });

const { parsePlanMarkdown } = await jiti.import(
  pathToFileURL(join(here, "parser.ts")).href,
);
const { overlayEvidence, chooseActivePlan } = await jiti.import(
  pathToFileURL(join(here, "evidence.ts")).href,
);
const { buildPlanWidgetLines, summarizePlan } = await jiti.import(
  pathToFileURL(join(here, "render.ts")).href,
);

const fixture = `# Feature

- [ ] Add failing parser tests
  - [x] Nested finished task

> - [ ] quoted example ignored

\`\`\`markdown
- [ ] fenced example ignored
\`\`\`

## Render
- [ ] Render pending tasks with a very long title that must remain in the model and truncate only at render time
`;

const parsed = parsePlanMarkdown(
  "docs/superpowers/plans/example.md",
  fixture,
  10,
);
assert.equal(parsed.tasks.length, 3);
assert.equal(parsed.tasks[0].state, "pending");
assert.equal(parsed.tasks[1].state, "done");
assert.equal(parsed.tasks[1].depth, 1);
assert.equal(parsed.tasks[2].section, "Feature > Render");
assert.match(parsed.tasks[2].title, /very long title/);

const selected = chooseActivePlan(
  [parsed],
  [
    {
      text: "Use docs/superpowers/plans/example.md",
      timestamp: 99,
      source: "session",
    },
  ],
);
assert.equal(selected?.path, "docs/superpowers/plans/example.md");

const overlayed = overlayEvidence(parsed.tasks, [
  {
    text: "Current task: Add failing parser tests in progress",
    timestamp: 100,
    source: "handoff",
  },
  {
    text: "Nested finished task completed and passed",
    timestamp: 101,
    source: "session",
  },
]);
assert.equal(overlayed[0].state, "active");
assert.equal(overlayed[1].state, "done");

const theme = {
  fg(_color, text) {
    return text;
  },
};
const state = summarizePlan(overlayed, parsed.path, 123);
const lines = buildPlanWidgetLines(state, theme, 50);
assert.equal(lines.length, 13);
assert.ok(lines.some((line) => line.includes("▶")));
assert.ok(lines.every((line) => [...line].length <= 50));

for (const smallWidth of [1, 5, 9]) {
  const smallLines = buildPlanWidgetLines(state, theme, smallWidth);
  assert.equal(smallLines.length, 13);
  assert.ok(
    smallLines.every((line) => line.length <= smallWidth),
    `hostWidth ${smallWidth} overflow: ${JSON.stringify(smallLines)}`,
  );
}

const many = summarizePlan(
  Array.from({ length: 16 }, (_, index) => ({
    ...parsed.tasks[index % parsed.tasks.length],
    id: `task-${index}`,
    line: index + 1,
    title: `Task ${index + 1}`,
    state: index === 9 ? "active" : "pending",
  })),
  parsed.path,
  123,
);
const overflowLines = buildPlanWidgetLines(many, theme, 50);
assert.ok(overflowLines.some((line) => /\+\d+ más/.test(line)));
assert.ok(overflowLines.some((line) => line.includes("▶ 10.")));

console.log("plan widget smoke checks passed");
```

- [ ] Run smoke script after Tasks 2-6.

```bash
node extensions/plan/smoke-test.mjs
```

Expected: `plan widget smoke checks passed`.

---

## Task 8: Enable extension in settings

**Files:**

- Modify: `settings.json`

- [ ] Add plan extension path directly after `agent-status.ts`.

```json
"~/.pi/agent/extensions/agent-status.ts",
"~/.pi/agent/extensions/plan.ts",
"~/.pi/agent/extensions/panel.ts"
```

- [ ] Validate `settings.json` stays valid JSON and extension path appears once.

```bash
python -m json.tool settings.json >/tmp/pi-settings.json
python - <<'PY'
import json
from pathlib import Path
settings=json.loads(Path('settings.json').read_text())
paths=settings.get('extensions', [])
print(paths.count('~/.pi/agent/extensions/plan.ts'))
PY
```

Expected: second command prints `1`.

---

## Task 9: Type/import/runtime verification

**Files:**

- Read: `extensions/plan.ts`
- Read: `extensions/plan/*.ts`
- Read: `settings.json`

- [ ] Check TypeScript import graph by loading the extension through Pi in non-UI print mode.

```bash
pi --offline --no-session --no-extensions -e extensions/plan.ts -p --tools read "Respond with: plan widget extension loaded"
```

Expected: Pi starts without extension import errors. Output contains `plan widget extension loaded` or model/provider auth failure after extension load; no stack trace mentions `extensions/plan.ts` or `extensions/plan/`.

- [ ] Run smoke tests, including small-width renderer assertions for host widths `1`, `5`, and `9`.

```bash
node extensions/plan/smoke-test.mjs
```

Expected: `plan widget smoke checks passed`; smoke script asserts every rendered line length is `<= hostWidth` for small widths `1`, `5`, and `9`.

- [ ] Verify no runtime writes to protected plan/spec/Superpowers paths are present.

```bash
grep -RIn "writeFile\|appendEntry\|saveAgent\|docs/superpowers/specs\|git/github.com/obra/superpowers/skills" extensions/plan.ts extensions/plan || true
```

Expected: no write APIs. Mentions of protected paths are absent from implementation code except read-only plan path constants.

- [ ] Verify UI guard coverage.

```bash
python - <<'PY'
from pathlib import Path
text=Path('extensions/plan.ts').read_text()
for needle in ['ctx.ui.setWidget', 'ctx.ui.setStatus']:
    print(needle, text.count(needle))
assert 'if (!ctx.hasUI) return;' in text
PY
```

Expected: prints counts for `setWidget` and `setStatus`, then exits `0`.

- [ ] Verify settings, smoke script, and implementation are the only intended files changed.

```bash
git status --short extensions/plan.ts extensions/plan settings.json docs/superpowers/plans/2026-04-26-plan-widget.md
```

Expected after implementation: new/modified paths limited to files in this plan plus the plan document.

---

## Task 10: Manual TUI acceptance checks

**Files:**

- Read: `docs/superpowers/plans/*.md`
- Read: `extensions/plan.ts`

- [ ] Start Pi with UI after implementation.

```bash
pi --offline
```

Expected: no startup stack trace; when a plan file with checkboxes exists, widget appears below editor.

- [ ] Confirm dimensions and placement.

Manual check: widget is one panel below editor, target width is 50 columns on wide terminals, and every rendered line fits when terminal width is below 50.

- [ ] Confirm content and colors.

Manual check: pending titles render dim/gray, done and implemented render green, active task uses `▶` and accent border/text, blocked uses warning only when explicit blocked text exists.

- [ ] Confirm overflow.

Manual check with a plan containing more than 10 displayable tasks: widget shows `+N más`, and active task remains visible when evidence marks it active.

- [ ] Confirm read-only behavior.

```bash
git diff -- docs/superpowers/plans docs/superpowers/specs /home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills || true
```

Expected: no plan/spec/Superpowers skill mutations caused by the widget.

- [ ] Confirm reload/shutdown cleanup.

Manual check: run `/reload`; old widget/status clears during shutdown and remounts once after `session_start` if tasks exist. Exit Pi; no lingering status line remains in next startup when no plan is detected.

---

## Task 11: Commit implementation changes

**Files:**

- Add: `extensions/plan.ts`
- Add: `extensions/plan/types.ts`
- Add: `extensions/plan/parser.ts`
- Add: `extensions/plan/evidence.ts`
- Add: `extensions/plan/render.ts`
- Add: `extensions/plan/smoke-test.mjs`
- Modify: `settings.json`

- [ ] Review diff.

```bash
git diff -- settings.json extensions/plan.ts extensions/plan
```

Expected: implementation matches this plan; no edits to `extensions/agent-status.ts`, Superpowers skill files, or plan markdown files from widget runtime.

- [ ] Commit implementation.

```bash
git add settings.json extensions/plan.ts extensions/plan/types.ts extensions/plan/parser.ts extensions/plan/evidence.ts extensions/plan/render.ts extensions/plan/smoke-test.mjs
git commit -m "feat: add Superpowers plan widget"
```

Expected: commit succeeds. If unrelated working-tree changes exist, stage only paths listed above.

---

## Self-Review Against Spec

- [ ] **Read-only observer:** Tasks 2-9 define no mutating tools, no `writeFile`, no `appendEntry`, and no plan checkbox updates.
- [ ] **Target file:** Task 6 creates `extensions/plan.ts`; helper directory is justified and not auto-discovered as an extension.
- [ ] **UI contract:** Task 6 uses `ctx.ui.setWidget(PLAN_WIDGET_KEY, factory, { placement: "belowEditor" })`, `ctx.ui.setStatus(PLAN_STATUS_KEY, ...)`, stable key `superpowers-plan`, and `ctx.hasUI` guards.
- [ ] **Dimensions:** Task 5 uses width `50`, min/default lines `13`, and ANSI-safe `truncateToWidth` on every rendered line.
- [ ] **Task details:** Task 5 renders task titles with markers, not only numeric progress; status line is compact counts.
- [ ] **Colors:** Task 5 maps pending to dim/gray, done/implemented to success/green, active to accent, blocked to warning.
- [ ] **Overflow:** Task 5 renders `+N más` and pins active/blocked tasks when overflowing.
- [ ] **State sources:** Tasks 4 and 6 read plan docs, session branch entries, Pi events, subagent event bus handoffs, and artifact existence.
- [ ] **Lifecycle:** Task 6 handles `session_start`, `turn_end`, `tool_execution_end`, `agent_end`, subagent event bus updates, and `session_shutdown` cleanup.
- [ ] **Non-UI modes:** Task 6 skips `setWidget`/`setStatus` when `ctx.hasUI` is false; Task 9 verifies print-mode loading.
- [ ] **No Superpowers internals:** File map and verification commands exclude changes under `/home/osmarg/.pi/agent/git/github.com/obra/superpowers/skills/**`.
- [ ] **No unresolved markers:** This plan contains concrete file paths, commands, snippets, and expected outputs; implementation workers should keep behavior explicit and scoped to listed files.
