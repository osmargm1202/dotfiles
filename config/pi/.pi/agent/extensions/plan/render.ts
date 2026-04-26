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

type ThemeLike = {
	fg?: (color: string, text: string) => string;
};

type PlanColor =
	| "muted"
	| "dim"
	| "success"
	| "accent"
	| "warning"
	| "error"
	| "text"
	| "borderAccent"
	| "borderMuted";

function paint(theme: ThemeLike, color: PlanColor, text: string): string {
	return typeof theme.fg === "function" ? theme.fg(color, text) : text;
}

function clampWidgetWidth(hostWidth: number): number {
	return Math.max(1, Math.min(PLAN_WIDGET_WIDTH, Math.floor(hostWidth || 0)));
}

function padAnsi(text: string, width: number): string {
	const targetWidth = width > 0 ? width : 0;
	const clipped = truncateToWidth(`${text}`, targetWidth);
	const padding = targetWidth - visibleWidth(clipped);
	if (padding <= 0) return clipped;
	return `${clipped}${" ".repeat(padding)}`;
}

function markerForState(state: PlanTaskState): string {
	if (state === "active") return "▶";
	if (state === "implemented") return "◉";
	if (state === "done") return "✓";
	if (state === "blocked") return "!";
	return "○";
}

function colorForState(state: PlanTaskState): PlanColor {
	if (state === "active") return "accent";
	if (state === "implemented" || state === "done") return "success";
	if (state === "blocked") return "warning";
	return "dim";
}

function pinnedTaskIndexes(tasks: PlanTask[]): number[] {
	const indexes: number[] = [];
	for (const [index, task] of tasks.entries()) {
		if (task.state === "active") indexes.push(index);
	}
	for (const [index, task] of tasks.entries()) {
		if (task.state === "blocked") indexes.push(index);
	}
	return indexes;
}

function visibleTasksForCapacity(
	tasks: PlanTask[],
	capacity: number,
): PlanTask[] {
	if (capacity <= 0) return [];
	if (tasks.length <= capacity) return tasks;

	const pinnedIndexes = pinnedTaskIndexes(tasks);
	const anchorIndex = pinnedIndexes[0];
	if (anchorIndex === undefined) return tasks.slice(0, capacity);

	const start = Math.max(
		0,
		Math.min(anchorIndex - Math.floor(capacity / 2), tasks.length - capacity),
	);
	const selectedIndexes = new Set<number>();
	for (let index = start; index < start + capacity; index += 1) {
		selectedIndexes.add(index);
	}

	for (const pinnedIndex of pinnedIndexes) {
		if (selectedIndexes.has(pinnedIndex)) continue;
		const replaceableIndex = [...selectedIndexes]
			.reverse()
			.find((index) => !pinnedIndexes.includes(index));
		if (replaceableIndex === undefined) break;
		selectedIndexes.delete(replaceableIndex);
		selectedIndexes.add(pinnedIndex);
	}

	return [...selectedIndexes]
		.sort((a, b) => a - b)
		.map((index) => tasks[index]!)
		.filter(Boolean);
}

function stateCounts(tasks: PlanTask[], state: PlanTaskState): number {
	return tasks.filter((task) => task.state === state).length;
}

function lineHeight(): number {
	return PLAN_WIDGET_MIN_HEIGHT;
}

function statusColor(state: PlanWidgetState): PlanColor {
	if (state.blocked > 0) return "warning";
	if (state.active > 0) return "accent";
	return "muted";
}

function borderColor(state: PlanWidgetState): PlanColor {
	if (state.blocked > 0) return "warning";
	if (state.active > 0) return "borderAccent";
	return "borderMuted";
}

function taskRow(task: PlanTask, theme: ThemeLike, innerWidth: number): string {
	const prefix = ` ${markerForState(task.state)} ${task.line}. `;
	const titleWidth = Math.max(0, innerWidth - visibleWidth(prefix));
	const raw = prefix + truncateToWidth(task.title, titleWidth);
	return paint(theme, colorForState(task.state), padAnsi(raw, innerWidth));
}

function borderedLine(
	content: string,
	theme: ThemeLike,
	color: PlanColor,
	innerWidth: number,
): string {
	return (
		paint(theme, color, "│") +
		padAnsi(content, innerWidth) +
		paint(theme, color, "│")
	);
}

function fitLine(line: string, width: number): string {
	return padAnsi(line, width);
}

export function summarizePlan(
	tasks: PlanTask[],
	activePlanPath?: string,
	now = Date.now(),
): PlanWidgetState {
	return {
		activePlanPath,
		tasks,
		lastUpdatedAt: now,
		visibleHeight: PLAN_WIDGET_DEFAULT_VISIBLE_LINES,
		total: tasks.length,
		pending: stateCounts(tasks, "pending"),
		active: stateCounts(tasks, "active"),
		implemented: stateCounts(tasks, "implemented"),
		done: stateCounts(tasks, "done"),
		blocked: stateCounts(tasks, "blocked"),
	};
}

export function buildPlanStatus(
	state: PlanWidgetState,
	theme: ThemeLike,
): string | undefined {
	if (state.tasks.length === 0) return undefined;

	const completed = state.done + state.implemented;
	const active = state.active > 0 ? ` · ${state.active} active` : "";
	const blocked = state.blocked > 0 ? ` · ${state.blocked} blocked` : "";
	const text = `📋 ${state.total} tasks · ${completed} done · ${state.pending} pending${active}${blocked}`;
	return paint(theme, statusColor(state), text);
}

export function buildPlanWidgetLines(
	state: PlanWidgetState,
	theme: ThemeLike,
	hostWidth: number,
): string[] {
	if (state.tasks.length === 0) return [];

	const width = clampWidgetWidth(hostWidth);
	const height = lineHeight();
	const innerWidth = Math.max(0, width - 2);
	const frameColor = borderColor(state);
	const completed = state.done + state.implemented;
	const planName = state.activePlanPath
		? basename(state.activePlanPath)
		: "detected";
	const titleRaw = ` Plan · ${planName} `;
	const title = truncateToWidth(titleRaw, innerWidth);
	const top = paint(
		theme,
		frameColor,
		`╭${title}${"─".repeat(Math.max(0, innerWidth - visibleWidth(title)))}╮`,
	);
	const bottom = paint(theme, frameColor, `╰${"─".repeat(innerWidth)}╯`);
	const metaRaw = ` ${state.total} tasks · ${completed} done · ${state.pending} pending`;
	const bodySlots = Math.max(0, height - 3);
	const hasOverflow = state.tasks.length > bodySlots;
	const taskCapacity = hasOverflow ? Math.max(0, bodySlots - 1) : bodySlots;
	const visibleTasks = visibleTasksForCapacity(state.tasks, taskCapacity);
	const hiddenCount = Math.max(0, state.tasks.length - visibleTasks.length);

	const lines: string[] = [
		top,
		borderedLine(
			paint(theme, "muted", padAnsi(metaRaw, innerWidth)),
			theme,
			frameColor,
			innerWidth,
		),
	];

	for (const task of visibleTasks) {
		lines.push(
			borderedLine(
				taskRow(task, theme, innerWidth),
				theme,
				frameColor,
				innerWidth,
			),
		);
	}

	if (hiddenCount > 0) {
		const overflowText = PLAN_OVERFLOW_TEMPLATE.replace(
			"N",
			String(hiddenCount),
		);
		lines.push(
			borderedLine(
				paint(theme, "dim", padAnsi(` ${overflowText}`, innerWidth)),
				theme,
				frameColor,
				innerWidth,
			),
		);
	}

	while (lines.length < height - 1) {
		lines.push(borderedLine("", theme, frameColor, innerWidth));
	}
	lines.push(bottom);

	return lines.slice(0, height).map((line) => fitLine(line, width));
}
