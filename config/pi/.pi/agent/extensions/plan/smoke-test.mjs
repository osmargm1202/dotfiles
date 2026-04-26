import assert from "node:assert/strict";
import Module from "node:module";
import { delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PI_PACKAGE_ROOT =
	"/home/osmarg/.local/share/fnm/node-versions/v22.22.1/installation/lib/node_modules/@mariozechner/pi-coding-agent";
const PI_PACKAGE_ROOT = process.env.PI_PACKAGE_ROOT ?? DEFAULT_PI_PACKAGE_ROOT;
const PI_NODE_MODULES = join(PI_PACKAGE_ROOT, "node_modules");
const JITI_PATH = join(PI_NODE_MODULES, "@mariozechner/jiti/lib/jiti.mjs");

process.env.NODE_PATH = [PI_NODE_MODULES, process.env.NODE_PATH]
	.filter(Boolean)
	.join(delimiter);
Module._initPaths();

const { createJiti } = await import(pathToFileURL(JITI_PATH).href);
const jiti = createJiti(import.meta.url);
const here = fileURLToPath(new URL(".", import.meta.url));

const { parsePlanMarkdown } = await jiti.import(join(here, "parser.ts"));
const { chooseActivePlan, extractMentionedPaths, overlayEvidence } =
	await jiti.import(join(here, "evidence.ts"));
const { buildPlanStatus, buildPlanWidgetLines, summarizePlan } =
	await jiti.import(join(here, "render.ts"));
const { visibleWidth } = await jiti.import("@mariozechner/pi-tui");

const theme = {};
const planPath = "docs/superpowers/plans/feature-render.md";
const fixture = `# Feature
> - [ ] quoted example ignored
\`\`\`md
- [ ] fenced example ignored
\`\`
- [ ] invalid closer should stay fenced
\`\`\`
## Render
- [ ] Build widget title exactly: \`# C#\`
  - [x] Nested done task
- [ ] Touch ./extensions/plan.ts.
`;

const parsed = parsePlanMarkdown(planPath, fixture, 100);
assert.equal(parsed.tasks.length, 3, "parser keeps only real fixture tasks");
assert.equal(parsed.tasks[0].section, "Feature > Render");
assert.equal(
	parsed.tasks[0].title,
	"Build widget title exactly: `# C#`",
	"parser preserves task title text",
);
assert.ok(
	parsed.tasks.every((task) => !/ignored|invalid closer/.test(task.title)),
	"parser ignores quoted and fenced checkbox examples",
);

const nestedDone = parsed.tasks.find(
	(task) => task.title === "Nested done task",
);
assert.ok(nestedDone, "nested task exists");
assert.equal(nestedDone.depth, 1, "nested done depth is 1");
assert.equal(nestedDone.state, "done", "nested checkbox state is done");

const csharpPlan = parsePlanMarkdown(
	"docs/superpowers/plans/csharp.md",
	"# C#\n- [ ] Preserve heading\n",
);
assert.equal(csharpPlan.tasks[0]?.section, "C#", "# C# heading is preserved");

const staleNewerPlan = parsePlanMarkdown(
	"docs/superpowers/plans/newer.md",
	"# Other\n- [ ] Other task\n",
	999,
);
const chosen = chooseActivePlan(
	[staleNewerPlan, parsed],
	[
		{
			text: `Nested note:\n  - continue ${planPath}`,
			timestamp: 10,
			source: "session",
		},
	],
);
assert.equal(chosen?.path, planPath, "mentioned plan wins over newer mtime");

const activeOverlay = overlayEvidence(parsed.tasks, [
	{
		text: "current task Build widget title exactly # C# started",
		timestamp: 10,
		source: "session",
	},
]);
assert.equal(
	activeOverlay[0]?.state,
	"active",
	"session evidence marks task active",
);

const doneOverlay = overlayEvidence(parsed.tasks, [
	{
		text: "current task Build widget title exactly # C# started",
		timestamp: 10,
		source: "session",
	},
	{
		text: "Build widget title exactly # C# completed",
		timestamp: 20,
		source: "session",
	},
]);
assert.equal(doneOverlay[0]?.state, "done", "newer done beats stale active");

const zeroFailedOverlay = overlayEvidence(parsed.tasks, [
	{
		text: "Touch ./extensions/plan.ts. 0 failed",
		timestamp: 30,
		source: "session",
	},
]);
assert.equal(zeroFailedOverlay[2]?.state, "done", "0 failed means done");
assert.notEqual(
	zeroFailedOverlay[2]?.state,
	"blocked",
	"0 failed is not blocked",
);
assert.deepEqual(
	extractMentionedPaths("modified ./extensions/plan.ts."),
	["extensions/plan.ts"],
	"relative path with trailing period normalizes",
);

function taskFixture(title, state = "pending", line = 1) {
	return {
		id: `fixture-${line}`,
		planPath,
		line,
		depth: 0,
		title,
		state,
		evidence: [
			{
				source: "markdown",
				state,
				confidence: "high",
				summary: "fixture",
			},
		],
	};
}

const parserTask = taskFixture("Add parser");
const globalBlockedOverlay = overlayEvidence(
	[parserTask],
	[
		{
			text: "status: BLOCKED\nreview: Add parser tokens appeared in a handoff summary only",
			timestamp: 40,
			source: "handoff",
		},
	],
);
assert.equal(
	globalBlockedOverlay[0]?.state,
	"pending",
	"global blocked handoff text without task context does not mark task blocked",
);

const reviewFailedOverlay = overlayEvidence(
	[parserTask],
	[
		{
			text: "Review failed overall while discussing Add parser tokens, no task marker here",
			timestamp: 41,
			source: "session",
		},
	],
);
assert.equal(
	reviewFailedOverlay[0]?.state,
	"pending",
	"review failure text without task context does not mark task blocked",
);

const exactTitleBlockedOverlay = overlayEvidence(
	[parserTask],
	[
		{
			text: "Add parser blocked",
			timestamp: 42,
			source: "session",
		},
	],
);
assert.equal(
	exactTitleBlockedOverlay[0]?.state,
	"blocked",
	"exact title followed by blocked marks task blocked",
);

const explicitTaskBlockedOverlay = overlayEvidence(
	[parserTask],
	[
		{
			text: "Task: Add parser blocked",
			timestamp: 42,
			source: "session",
		},
	],
);
assert.equal(
	explicitTaskBlockedOverlay[0]?.state,
	"blocked",
	"explicit task-scoped blocked evidence marks task blocked",
);

const currentTaskBlockedOverlay = overlayEvidence(
	[parserTask],
	[
		{
			text: "Current task Add parser blocked",
			timestamp: 43,
			source: "session",
		},
	],
);
assert.equal(
	currentTaskBlockedOverlay[0]?.state,
	"blocked",
	"current task blocked evidence marks task blocked",
);

const mixedState = summarizePlan(
	[
		taskFixture("Done task", "done", 1),
		taskFixture("Blocked task", "blocked", 2),
		taskFixture("Pending task", "pending", 3),
	],
	planPath,
	456,
);
const mixedStatus = buildPlanStatus(mixedState, theme) ?? "";
assert.match(
	mixedStatus,
	/2 unfinished/,
	"status reports unfinished work including blocked tasks",
);
assert.match(mixedStatus, /1 blocked/, "status reports blocked count");
assert.doesNotMatch(
	mixedStatus,
	/0 pending/,
	"status avoids misleading 0 pending",
);
const mixedLines = buildPlanWidgetLines(mixedState, theme, 80);
assert.ok(
	mixedLines.some((line) => /2 unfinished/.test(line)),
	"widget meta reports unfinished work including blocked tasks",
);
assert.ok(
	mixedLines.some((line) => /1 blocked/.test(line)),
	"widget meta reports blocked count",
);
assert.ok(
	mixedLines.every((line) => !/0 pending/.test(line)),
	"widget meta avoids misleading 0 pending",
);

function makeTask(index, state = "pending") {
	return {
		id: `task-${index}`,
		planPath,
		line: index,
		depth: index % 3,
		title:
			index === 14
				? "Task 14 active pinned"
				: `Task ${String(index).padStart(2, "0")} pending`,
		state,
		evidence: [
			{
				source: "markdown",
				state,
				confidence: "high",
				summary: "fixture",
			},
		],
	};
}

const renderTasks = Array.from({ length: 14 }, (_, index) =>
	makeTask(index + 1, index === 13 ? "active" : "pending"),
);
const state = summarizePlan(renderTasks, planPath, 123);
const lines = buildPlanWidgetLines(state, theme, 80);
assert.equal(lines.length, 13, "renderer emits 13 lines");
assert.ok(
	lines.some((line) => line.includes("▶")),
	"renderer includes active marker",
);
assert.ok(
	lines.some((line) => line.includes("+5 más")),
	"renderer shows overflow",
);
assert.ok(
	lines.some((line) => line.includes("Task 14 active pinned")),
	"active task is pinned despite overflow",
);
assert.ok(
	lines.every((line) => visibleWidth(line) <= 50),
	"renderer clamps every line to 50 columns",
);

for (const width of [1, 5, 9]) {
	const smallLines = buildPlanWidgetLines(state, theme, width);
	assert.equal(
		smallLines.length,
		13,
		`renderer emits 13 lines at width ${width}`,
	);
	assert.ok(
		smallLines.every((line) => visibleWidth(line) <= width),
		`renderer fits every line within width ${width}`,
	);
}

console.log("plan widget smoke checks passed");
