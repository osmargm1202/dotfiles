import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	chooseActivePlan,
	extractMentionedPaths,
	extractSessionSignals,
	overlayEvidence,
} from "./plan/evidence";
import { parsePlanMarkdown } from "./plan/parser";
import {
	buildPlanStatus,
	buildPlanWidgetLines,
	summarizePlan,
} from "./plan/render";
import {
	type ArtifactProbe,
	emptyPlanWidgetState,
	type ParsedPlan,
	PLAN_STATUS_KEY,
	PLAN_WIDGET_KEY,
	type PlanWidgetState,
	type SessionSignal,
} from "./plan/types";

const PLAN_DIR = "docs/superpowers/plans";
const SUBAGENTS_EVENT = "subagents:deployments-changed";
const REFRESH_DEBOUNCE_MS = 150;
const MAX_EVENT_SIGNALS = 100;
const MAX_COMBINED_SIGNALS = 200;

type WidgetHandle = { requestRender: () => void };

type SessionManagerLike = {
	getBranch?: () => unknown;
	getEntries?: () => unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function safeJson(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		const seen = new WeakSet<object>();
		const json = JSON.stringify(value, (_key, item) => {
			if (typeof item === "bigint") return item.toString();
			if (!item || typeof item !== "object") return item;
			if (seen.has(item)) return "[Circular]";
			seen.add(item);
			return item;
		});
		return json ?? "";
	} catch {
		try {
			return String(value ?? "");
		} catch {
			return "";
		}
	}
}

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
		tasks: state.tasks.map((task) => {
			const evidence = task.evidence[task.evidence.length - 1];
			return [task.id, task.state, task.title, evidence?.summary ?? ""];
		}),
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
		} catch {}
	}
	return plans;
}

function validRelativePath(candidate: string, cwd: string): string | undefined {
	const path = candidate.trim().replace(/^\.\//, "");
	if (!path || path.startsWith("/") || path.startsWith("../")) return undefined;
	if (path.split("/").includes("..")) return undefined;

	const absolutePath = join(cwd, path);
	const normalized = relative(cwd, absolutePath);
	if (
		!normalized ||
		normalized.startsWith("..") ||
		normalized.startsWith("/")
	) {
		return undefined;
	}
	if (normalized.split("/").includes("..")) return undefined;
	return normalized;
}

async function probeArtifacts(
	ctx: ExtensionContext,
	signals: SessionSignal[],
	plans: ParsedPlan[],
): Promise<ArtifactProbe[]> {
	const paths = new Set<string>();
	for (const signal of signals) {
		for (const path of extractMentionedPaths(signal.text)) {
			const normalized = validRelativePath(path, ctx.cwd);
			if (normalized) paths.add(normalized);
		}
	}
	for (const plan of plans) {
		for (const task of plan.tasks) {
			for (const path of extractMentionedPaths(task.title)) {
				const normalized = validRelativePath(path, ctx.cwd);
				if (normalized) paths.add(normalized);
			}
		}
	}

	const probes: ArtifactProbe[] = [];
	for (const path of [...paths].sort()) {
		try {
			const absolutePath = join(ctx.cwd, path);
			const relativePath = validRelativePath(
				relative(ctx.cwd, absolutePath),
				ctx.cwd,
			);
			if (!relativePath) continue;
			const info = await lstat(absolutePath);
			probes.push({ relativePath, exists: true, mtimeMs: info.mtimeMs });
		} catch {
			probes.push({ relativePath: path, exists: false });
		}
	}
	return probes;
}

function arrayResult(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function collectSessionEntries(ctx: ExtensionContext): unknown[] {
	const manager = ctx.sessionManager as SessionManagerLike | undefined;
	if (!manager || !isRecord(manager)) return [];

	if (typeof manager.getBranch === "function") {
		try {
			return arrayResult(manager.getBranch.call(manager));
		} catch {}
	}

	if (typeof manager.getEntries === "function") {
		try {
			return arrayResult(manager.getEntries.call(manager));
		} catch {}
	}

	return [];
}

function dedupeSignals(signals: SessionSignal[]): SessionSignal[] {
	const seen = new Set<string>();
	const deduped: SessionSignal[] = [];
	for (const signal of signals) {
		const key = `${signal.source}\0${signal.timestamp}\0${signal.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(signal);
	}
	return deduped;
}

function limitedSignals(signals: SessionSignal[]): SessionSignal[] {
	return dedupeSignals(signals)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(-MAX_COMBINED_SIGNALS);
}

function eventSignal(
	text: unknown,
	source: SessionSignal["source"] = "event",
): SessionSignal {
	return { text: safeJson(text), timestamp: Date.now(), source };
}

export default function (pi: ExtensionAPI) {
	let currentCtx: ExtensionContext | undefined;
	let state: PlanWidgetState = emptyPlanWidgetState();
	let widgetHandle: WidgetHandle | undefined;
	let widgetMounted = false;
	let lastSignature = "";
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshInFlight = false;
	let refreshInFlightGeneration: number | undefined;
	let refreshInFlightCtx: ExtensionContext | undefined;
	let refreshPending = false;
	let eventSignals: SessionSignal[] = [];
	let lifecycleGeneration = 0;
	let sessionActive = false;
	let unsubscribeSubagents: (() => void) | undefined;

	const clearUi = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (widgetMounted) ctx.ui.setWidget(PLAN_WIDGET_KEY, undefined);
		ctx.ui.setStatus(PLAN_STATUS_KEY, undefined);
		widgetMounted = false;
		widgetHandle = undefined;
	};

	const isActiveCtx = (ctx: ExtensionContext): boolean => {
		return sessionActive && currentCtx === ctx;
	};

	const isRefreshCurrent = (
		ctx: ExtensionContext,
		generation: number,
	): boolean => {
		return (
			sessionActive && lifecycleGeneration === generation && currentCtx === ctx
		);
	};

	const requestWidgetRender = (): boolean => {
		if (!widgetHandle) return false;
		try {
			widgetHandle.requestRender();
			return true;
		} catch {
			widgetHandle = undefined;
			widgetMounted = false;
			return false;
		}
	};

	const mountWidget = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
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
	};

	const syncWidget = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (!state.activePlanPath || state.tasks.length === 0) {
			clearUi(ctx);
			lastSignature = "";
			return;
		}

		const signature = compactSignature(state);
		if (signature === lastSignature && widgetMounted) return;
		lastSignature = signature;

		if (!widgetMounted) {
			mountWidget(ctx);
		} else if (!requestWidgetRender()) {
			lastSignature = "";
			mountWidget(ctx);
		}

		ctx.ui.setStatus(PLAN_STATUS_KEY, buildPlanStatus(state, ctx.ui.theme));
	};

	const refreshNow = async (ctx = currentCtx) => {
		if (!ctx || !isActiveCtx(ctx)) return;
		currentCtx = ctx;
		const refreshGeneration = lifecycleGeneration;
		if (
			refreshInFlight &&
			refreshInFlightGeneration === refreshGeneration &&
			refreshInFlightCtx === ctx
		) {
			refreshPending = true;
			return;
		}

		refreshInFlight = true;
		refreshInFlightGeneration = refreshGeneration;
		refreshInFlightCtx = ctx;
		try {
			const sessionSignals = extractSessionSignals(collectSessionEntries(ctx));
			const signals = limitedSignals([...sessionSignals, ...eventSignals]);
			const plans = await readPlans(ctx);
			if (!isRefreshCurrent(ctx, refreshGeneration)) return;
			const activePlan = chooseActivePlan(plans, signals);
			if (!activePlan || activePlan.tasks.length === 0) {
				state = emptyPlanWidgetState();
				clearUi(ctx);
				return;
			}

			const artifacts = await probeArtifacts(ctx, signals, plans);
			if (!isRefreshCurrent(ctx, refreshGeneration)) return;
			const tasks = overlayEvidence(activePlan.tasks, signals, artifacts);
			state = summarizePlan(tasks, activePlan.path);
			syncWidget(ctx);
		} catch {
			if (!isRefreshCurrent(ctx, refreshGeneration)) return;
			state = emptyPlanWidgetState();
			clearUi(ctx);
		} finally {
			if (
				refreshInFlightGeneration === refreshGeneration &&
				refreshInFlightCtx === ctx
			) {
				refreshInFlight = false;
				refreshInFlightGeneration = undefined;
				refreshInFlightCtx = undefined;
				if (refreshPending && isRefreshCurrent(ctx, refreshGeneration)) {
					refreshPending = false;
					scheduleRefresh(ctx, REFRESH_DEBOUNCE_MS);
				}
			}
		}
	};

	const scheduleRefresh = (ctx = currentCtx, delay = REFRESH_DEBOUNCE_MS) => {
		if (!ctx || !isActiveCtx(ctx)) return;
		currentCtx = ctx;
		const refreshGeneration = lifecycleGeneration;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			if (!isRefreshCurrent(ctx, refreshGeneration)) return;
			void refreshNow(ctx);
		}, delay);
		const timerHandle = refreshTimer as unknown as { unref?: () => void };
		timerHandle.unref?.();
	};

	const pushEventSignal = (signal: SessionSignal) => {
		if (!signal.text.trim()) return;
		eventSignals = [...eventSignals, signal].slice(-MAX_EVENT_SIGNALS);
	};

	const subscribeSubagentsEvents = () => {
		if (unsubscribeSubagents) return;
		unsubscribeSubagents = pi.events.on(SUBAGENTS_EVENT, (data: unknown) => {
			pushEventSignal(eventSignal(data, "handoff"));
			scheduleRefresh(currentCtx, 0);
		});
	};

	subscribeSubagentsEvents();

	pi.on("session_start", async (_event, ctx) => {
		lifecycleGeneration += 1;
		sessionActive = true;
		currentCtx = ctx;
		state = emptyPlanWidgetState();
		widgetHandle = undefined;
		widgetMounted = false;
		lastSignature = "";
		eventSignals = [];
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = undefined;
		refreshPending = false;
		subscribeSubagentsEvents();
		await refreshNow(ctx);
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!isActiveCtx(ctx)) return;
		currentCtx = ctx;
		pushEventSignal(
			eventSignal({ message: event.message, toolResults: event.toolResults }),
		);
		scheduleRefresh(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (!isActiveCtx(ctx)) return;
		currentCtx = ctx;
		pushEventSignal(
			eventSignal({
				toolName: event.toolName,
				status: event.isError ? "failed" : "completed",
				result: event.result,
			}),
		);
		scheduleRefresh(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!isActiveCtx(ctx)) return;
		currentCtx = ctx;
		pushEventSignal(eventSignal({ messages: event.messages }));
		scheduleRefresh(ctx, 0);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		lifecycleGeneration += 1;
		sessionActive = false;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = undefined;
		refreshInFlight = false;
		refreshInFlightGeneration = undefined;
		refreshInFlightCtx = undefined;
		refreshPending = false;
		state = emptyPlanWidgetState();
		eventSignals = [];
		lastSignature = "";
		clearUi(ctx);
		currentCtx = undefined;
		if (unsubscribeSubagents) {
			unsubscribeSubagents();
			unsubscribeSubagents = undefined;
		}
	});
}
