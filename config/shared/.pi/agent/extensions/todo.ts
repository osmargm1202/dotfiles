import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
export type TaskAction = "create" | "update" | "list" | "get" | "delete" | "clear";

export interface Task {
	id: number;
	subject: string;
	description?: string;
	activeForm?: string;
	status: TaskStatus;
	blockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
}

export interface TaskState {
	tasks: Task[];
	nextId: number;
}

export interface TaskDetails {
	action: TaskAction;
	params: Record<string, unknown>;
	tasks: Task[];
	nextId: number;
	error?: string;
}

const TaskStatusSchema = StringEnum(["pending", "in_progress", "completed", "deleted"] as const);
const TaskActionSchema = StringEnum(["create", "update", "list", "get", "delete", "clear"] as const);

const TaskMutationParamsSchema = Type.Object({
	action: TaskActionSchema,
	id: Type.Optional(Type.Number({ description: "Task id for get, update, and delete" })),
	subject: Type.Optional(Type.String({ description: "Task subject; required for create" })),
	description: Type.Optional(Type.String({ description: "Task description" })),
	activeForm: Type.Optional(Type.String({ description: "Current active phrasing for the task" })),
	owner: Type.Optional(Type.String({ description: "Task owner" })),
	metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arbitrary task metadata" })),
	status: Type.Optional(TaskStatusSchema),
	blockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Initial dependency ids for create" })),
	addBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Dependency ids to add" })),
	removeBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Dependency ids to remove" })),
	includeDeleted: Type.Optional(Type.Boolean({ description: "Include deleted tasks when listing" })),
});

export type TaskMutationParams = Static<typeof TaskMutationParamsSchema>;

let state: TaskState = { tasks: [], nextId: 1 };

export function cloneState(input: TaskState): TaskState {
	return {
		nextId: input.nextId,
		tasks: input.tasks.map((task) => ({
			...task,
			blockedBy: task.blockedBy ? [...task.blockedBy] : undefined,
			metadata: task.metadata ? { ...task.metadata } : undefined,
		})),
	};
}

export function visibleTasks(input: TaskState, includeDeleted = false): Task[] {
	const tasks = includeDeleted ? input.tasks : input.tasks.filter((task) => task.status !== "deleted");
	return cloneState({ tasks, nextId: input.nextId }).tasks;
}

function findTask(tasks: Task[], id: number): Task | undefined {
	return tasks.find((task) => task.id === id);
}

export function detectCycle(tasks: Task[]): boolean {
	const visible = tasks.filter((task) => task.status !== "deleted");
	const byId = new Map(visible.map((task) => [task.id, task]));
	const visiting = new Set<number>();
	const visited = new Set<number>();

	const visit = (id: number): boolean => {
		if (visiting.has(id)) return true;
		if (visited.has(id)) return false;
		const task = byId.get(id);
		if (!task) return false;

		visiting.add(id);
		for (const dependencyId of task.blockedBy ?? []) {
			if (byId.has(dependencyId) && visit(dependencyId)) return true;
		}
		visiting.delete(id);
		visited.add(id);
		return false;
	};

	return visible.some((task) => visit(task.id));
}

export function validateBlockedBy(taskId: number, blockedBy: number[] | undefined, tasks: Task[]): string | undefined {
	const unique = new Set(blockedBy ?? []);
	if (unique.has(taskId)) return `Task #${taskId} cannot block itself`;

	for (const dependencyId of unique) {
		const dependency = findTask(tasks, dependencyId);
		if (!dependency || dependency.status === "deleted") {
			return `Blocked-by task #${dependencyId} does not exist`;
		}
	}

	const candidate = tasks.map((task) =>
		task.id === taskId ? { ...task, blockedBy: [...unique] } : task,
	);
	if (detectCycle(candidate)) return "Blocked-by dependencies cannot contain cycles";
	return undefined;
}

function normalizeIds(ids: number[] | undefined): number[] {
	return Array.from(new Set(ids ?? [])).filter((id) => Number.isFinite(id));
}

function requireId(params: TaskMutationParams): number | string {
	return typeof params.id === "number" ? params.id : "id is required";
}

function validateTransition(from: TaskStatus, to: TaskStatus): string | undefined {
	if (from === "deleted") return "Deleted tasks cannot be updated";
	if (to === "deleted") return undefined;
	if (from === "completed" && to !== "completed") return `Invalid status transition: ${from} -> ${to}`;
	if (from === to) return undefined;
	if (from === "pending" && (to === "in_progress" || to === "completed")) return undefined;
	if (from === "in_progress" && (to === "pending" || to === "completed")) return undefined;
	return `Invalid status transition: ${from} -> ${to}`;
}

function taskLine(task: Task): string {
	return `#${task.id} ${task.subject} [${task.status}]`;
}

interface MutationResult {
	state: TaskState;
	tasks: Task[];
	summary: string;
	error?: string;
}

export function applyMutation(current: TaskState, action: TaskAction, params: TaskMutationParams): MutationResult {
	const next = cloneState(current);
	const fail = (error: string): MutationResult => ({
		state: cloneState(current),
		tasks: visibleTasks(current, params.includeDeleted),
		summary: `Error: ${error}`,
		error,
	});

	switch (action) {
		case "create": {
			const subject = params.subject?.trim();
			if (!subject) return fail("subject is required");

			const task: Task = {
				id: next.nextId,
				subject,
				description: params.description,
				activeForm: params.activeForm,
				owner: params.owner,
				metadata: params.metadata,
				status: "pending",
				blockedBy: normalizeIds(params.blockedBy),
			};
			next.tasks.push(task);
			const blockedByError = validateBlockedBy(task.id, task.blockedBy, next.tasks);
			if (blockedByError) return fail(blockedByError);
			next.nextId += 1;
			return { state: next, tasks: [cloneState({ tasks: [task], nextId: next.nextId }).tasks[0]!], summary: `Created ${taskLine(task)}` };
		}

		case "update": {
			const id = requireId(params);
			if (typeof id === "string") return fail(id);
			const task = findTask(next.tasks, id);
			if (!task) return fail(`Task #${id} not found`);
			if (task.status === "deleted") return fail("Deleted tasks cannot be updated");

			if (params.subject !== undefined) {
				const subject = params.subject.trim();
				if (!subject) return fail("subject cannot be empty");
				task.subject = subject;
			}
			if (params.description !== undefined) task.description = params.description;
			if (params.activeForm !== undefined) task.activeForm = params.activeForm;
			if (params.owner !== undefined) task.owner = params.owner;
			if (params.metadata !== undefined) task.metadata = params.metadata;

			if (params.status !== undefined) {
				const transitionError = validateTransition(task.status, params.status);
				if (transitionError) return fail(transitionError);
				if (params.status === "in_progress") {
					for (const other of next.tasks) {
						if (other.id !== task.id && other.status === "in_progress") other.status = "pending";
					}
				}
				task.status = params.status;
			}

			const existing = normalizeIds(task.blockedBy);
			const remove = new Set(normalizeIds(params.removeBlockedBy));
			const merged = new Set(existing.filter((dependencyId) => !remove.has(dependencyId)));
			for (const dependencyId of normalizeIds(params.addBlockedBy)) merged.add(dependencyId);
			task.blockedBy = Array.from(merged);
			const blockedByError = validateBlockedBy(task.id, task.blockedBy, next.tasks);
			if (blockedByError) return fail(blockedByError);

			return { state: next, tasks: [cloneState({ tasks: [task], nextId: next.nextId }).tasks[0]!], summary: `Updated ${taskLine(task)}` };
		}

		case "list": {
			let tasks = visibleTasks(next, params.includeDeleted);
			if (params.status) tasks = tasks.filter((task) => task.status === params.status);
			return {
				state: next,
				tasks,
				summary: tasks.length ? tasks.map(taskLine).join("\n") : "No todos",
			};
		}

		case "get": {
			const id = requireId(params);
			if (typeof id === "string") return fail(id);
			const task = findTask(next.tasks, id);
			if (!task || (!params.includeDeleted && task.status === "deleted")) return fail(`Task #${id} not found`);
			return { state: next, tasks: [cloneState({ tasks: [task], nextId: next.nextId }).tasks[0]!], summary: taskLine(task) };
		}

		case "delete": {
			const id = requireId(params);
			if (typeof id === "string") return fail(id);
			const task = findTask(next.tasks, id);
			if (!task) return fail(`Task #${id} not found`);
			if (task.status !== "deleted") task.status = "deleted";
			return { state: next, tasks: [cloneState({ tasks: [task], nextId: next.nextId }).tasks[0]!], summary: `Deleted ${taskLine(task)}` };
		}

		case "clear":
			return { state: { tasks: [], nextId: 1 }, tasks: [], summary: "Cleared all todos" };
	}
}

function detailsFor(action: TaskAction, params: TaskMutationParams, current: TaskState, error?: string): TaskDetails {
	return {
		action,
		params: { ...params },
		tasks: cloneState(current).tasks,
		nextId: current.nextId,
		error,
	};
}

function formatCall(args: Partial<TaskMutationParams>): string {
	const parts = [`todo ${args.action ?? ""}`.trim()];
	if (args.id !== undefined) parts.push(`#${args.id}`);
	if (args.subject) parts.push(args.subject);
	return parts.join(": ").replace(": #", " #");
}

function renderTaskLines(tasks: Task[], theme: Theme, limit: number): string {
	const display = tasks.slice(0, limit);
	const lines = display.map((task) => {
		const icon = task.status === "completed" ? theme.fg("success", "✓") : task.status === "in_progress" ? theme.fg("warning", "◐") : task.status === "deleted" ? theme.fg("dim", "✕") : theme.fg("dim", "○");
		const subject = task.status === "completed" || task.status === "deleted" ? theme.fg("dim", task.subject) : theme.fg("muted", task.subject);
		return `${icon} ${theme.fg("accent", `#${task.id}`)} ${subject} ${theme.fg("dim", `[${task.status}]`)}`;
	});
	if (tasks.length > display.length) lines.push(theme.fg("dim", `… ${tasks.length - display.length} more`));
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: "Manage branch-scoped todos. Actions: create, update, list, get, delete, clear.",
		promptSnippet: "Manage branch-scoped todos with create, update, list, get, delete, and clear actions.",
		promptGuidelines: [
			"Use todo to track multi-step work requested by the user when a visible task list would help coordination.",
		],
		parameters: TaskMutationParamsSchema,

		async execute(_toolCallId, params) {
			const result = applyMutation(state, params.action, params);
			if (!result.error) state = result.state;
			const details = detailsFor(params.action, params, state, result.error);
			return {
				content: [{ type: "text" as const, text: result.summary }],
				details,
			};
		},

		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", formatCall(args)), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as TaskDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			if (details.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);

			const tasks = details.action === "list" ? visibleTasks({ tasks: details.tasks, nextId: details.nextId }, details.params.includeDeleted === true) : details.tasks;
			if (tasks.length === 0) return new Text(theme.fg("dim", "No todos"), 0, 0);
			const text = renderTaskLines(tasks, theme, expanded ? tasks.length : 6);
			return new Text(text, 0, 0);
		},
	});
}
