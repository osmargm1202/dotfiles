import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const WIDGET_KEY = "git-diff-panel";
const WIDGET_MIN_HEIGHT = 6;
const WIDGET_MAX_HEIGHT = 12;
const WIDGET_MAX_WIDTH = 110;
const REFRESH_DEBOUNCE_MS = 1_000;
const GIT_TIMEOUT_MS = 5_000;
const SIZE_LOOKUP_CONCURRENCY = 4;

type FileStatus = "M" | "A" | "D" | "R" | "C" | "?" | "!" | "U";

interface DiffFile {
	path: string;
	status: FileStatus;
	added: number | null;
	deleted: number | null;
	binary: boolean;
	binaryOldBytes?: number | null;
	binaryNewBytes?: number | null;
}

interface DiffState {
	files: DiffFile[];
	totalAdded: number;
	totalDeleted: number;
	binaryFiles: number;
	scrollOffset: number;
	lastRefresh: number;
	loading: boolean;
	enabled: boolean;
	gitRoot?: string;
	error?: string;
}

function zeroState(): DiffState {
	return {
		files: [],
		totalAdded: 0,
		totalDeleted: 0,
		binaryFiles: 0,
		scrollOffset: 0,
		lastRefresh: 0,
		loading: false,
		enabled: true,
	};
}

function runGit(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve) => {
		const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try { child.kill("SIGTERM"); } catch { /* ignore */ }
			resolve({ stdout, stderr: stderr || "git command timed out", exitCode: 124 });
		}, timeoutMs);
		timer.unref?.();

		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: 1 });
		});
		child.once("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ stdout, stderr, exitCode: typeof code === "number" ? code : 1 });
		});
	});
}

function normalizeStatus(raw: string): FileStatus {
	if (raw.includes("U")) return "U";
	if (raw === "??") return "?";
	if (raw === "!!") return "!";
	const code = raw.replace(/\s/g, "")[0] ?? "M";
	if (["M", "A", "D", "R", "C"].includes(code)) return code as FileStatus;
	return "M";
}

function parseStatus(output: string): Map<string, FileStatus> {
	const statuses = new Map<string, FileStatus>();
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const raw = line.slice(0, 2);
		let path = line.slice(3).trim();
		if (!path || raw === "!!") continue;
		const renameParts = path.split(" -> ");
		if (renameParts.length > 1) path = renameParts[renameParts.length - 1];
		statuses.set(path, normalizeStatus(raw));
	}
	return statuses;
}

function parseNumstat(output: string): Map<string, Pick<DiffFile, "path" | "added" | "deleted" | "binary">> {
	const stats = new Map<string, Pick<DiffFile, "path" | "added" | "deleted" | "binary">>();
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const columns = line.split("\t");
		if (columns.length < 3) continue;
		const [addedRaw, deletedRaw, ...pathParts] = columns;
		const path = (pathParts?.length ? pathParts : []).join("\t").trim();
		if (!path) continue;
		const binary = addedRaw === "-" || deletedRaw === "-";
		stats.set(path, {
			path,
			added: binary ? null : Number.parseInt(addedRaw ?? "0", 10) || 0,
			deleted: binary ? null : Number.parseInt(deletedRaw ?? "0", 10) || 0,
			binary,
		});
	}
	return stats;
}

async function loadGitDiff(cwd: string): Promise<Omit<DiffState, "scrollOffset" | "loading" | "enabled">> {
	const root = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (root.exitCode !== 0) {
		return {
			files: [],
			totalAdded: 0,
			totalDeleted: 0,
			binaryFiles: 0,
			lastRefresh: Date.now(),
			error: "not a git repo",
		};
	}

	const gitRoot = root.stdout.trim();
	const [statusResult, numstatResult] = await Promise.all([
		runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=normal"]),
		runGit(cwd, ["diff", "--numstat", "HEAD", "--"]),
	]);

	if (statusResult.exitCode !== 0) {
		return {
			files: [],
			totalAdded: 0,
			totalDeleted: 0,
			binaryFiles: 0,
			gitRoot,
			lastRefresh: Date.now(),
			error: statusResult.stderr.trim() || "git status failed",
		};
	}

	const statuses = parseStatus(statusResult.stdout);
	const stats = parseNumstat(numstatResult.exitCode === 0 ? numstatResult.stdout : "");
	const paths = new Set<string>([...statuses.keys(), ...stats.keys()]);
	const files: DiffFile[] = [...paths].map((path) => {
		const stat = stats.get(path);
		return {
			path,
			status: statuses.get(path) ?? "M",
			added: stat?.added ?? 0,
			deleted: stat?.deleted ?? 0,
			binary: stat?.binary ?? false,
		};
	}).sort((a, b) => {
		const rank = (file: DiffFile) => file.status === "?" ? 2 : file.status === "D" ? 1 : 0;
		return rank(a) - rank(b) || a.path.localeCompare(b.path);
	});

	await annotateBinarySizes(cwd, gitRoot, files);

	return {
		files,
		totalAdded: files.reduce((sum, file) => sum + (file.added ?? 0), 0),
		totalDeleted: files.reduce((sum, file) => sum + (file.deleted ?? 0), 0),
		binaryFiles: files.filter((file) => file.binary).length,
		gitRoot,
		lastRefresh: Date.now(),
		error: numstatResult.exitCode === 0 ? undefined : (numstatResult.stderr.trim() || undefined),
	};
}

function padAnsi(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function shortenPath(path: string, width: number): string {
	if (visibleWidth(path) <= width) return path;
	if (width <= 1) return "…";
	const parts = path.split(/[\\/]/);
	const file = parts.pop() ?? path;
	if (visibleWidth(file) + 1 >= width) return truncateToWidth(file, width);
	return truncateToWidth(`…/${file}`, width);
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const item = items[next++];
			if (item === undefined) continue;
			await worker(item);
		}
	});
	await Promise.all(workers);
}

async function getWorktreeFileSize(gitRoot: string, path: string): Promise<number | null> {
	try {
		const info = await stat(join(gitRoot, path));
		return info.isFile() ? info.size : null;
	} catch {
		return null;
	}
}

async function getHeadFileSize(cwd: string, path: string): Promise<number | null> {
	const result = await runGit(cwd, ["cat-file", "-s", `HEAD:${path}`]);
	if (result.exitCode !== 0) return null;
	const size = Number.parseInt(result.stdout.trim(), 10);
	return Number.isFinite(size) ? size : null;
}

async function annotateBinarySizes(cwd: string, gitRoot: string, files: DiffFile[]): Promise<void> {
	const binaryFiles = files.filter((file) => file.binary);
	await mapLimit(binaryFiles, SIZE_LOOKUP_CONCURRENCY, async (file) => {
		const [oldBytes, newBytes] = await Promise.all([
			file.status === "A" || file.status === "?" ? Promise.resolve(null) : getHeadFileSize(cwd, file.path),
			file.status === "D" ? Promise.resolve(null) : getWorktreeFileSize(gitRoot, file.path),
		]);
		file.binaryOldBytes = oldBytes;
		file.binaryNewBytes = newBytes;
	});
}

function formatBinarySize(value: number | null | undefined): string {
	if (value === null || value === undefined) return "bin";
	if (value < 1024) return `${value}B`;
	const kib = value / 1024;
	if (kib < 10) return `${kib.toFixed(1)}K`;
	if (kib < 1000) return `${Math.round(kib)}K`;
	return `${Math.round(kib / 1024)}M`;
}

function formatBinaryColumn(value: number | null | undefined, applicable: boolean): string {
	return applicable ? formatBinarySize(value) : "-";
}

function formatCount(value: number | null): string {
	if (value === null) return "-";
	if (value > 9999) return `${Math.round(value / 1000)}k`;
	return String(value);
}

function statusColor(status: FileStatus): "success" | "warning" | "error" | "muted" | "accent" {
	if (status === "A" || status === "?") return "success";
	if (status === "D") return "error";
	if (status === "R" || status === "C") return "warning";
	if (status === "U") return "error";
	return "accent";
}

function buildScrollBar(total: number, visible: number, offset: number, height: number): string[] {
	if (height <= 0) return [];
	if (total <= visible) return Array.from({ length: height }, () => " ");
	const thumbSize = Math.max(1, Math.round((visible / total) * height));
	const maxOffset = Math.max(1, total - visible);
	const start = Math.min(height - thumbSize, Math.round((offset / maxOffset) * (height - thumbSize)));
	return Array.from({ length: height }, (_, index) => index >= start && index < start + thumbSize ? "█" : "░");
}

function renderPanel(state: DiffState, theme: any, width: number, height: number): string[] {
	const innerWidth = Math.max(10, width - 2);
	const bodyHeight = Math.max(0, height - 4);
	const maxScroll = Math.max(0, state.files.length - bodyHeight);
	state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll));

	const top = theme.fg("accent", "┌" + "─".repeat(Math.max(0, width - 2)) + "┐");
	const bottom = theme.fg("accent", "└" + "─".repeat(Math.max(0, width - 2)) + "┘");
	const titleRaw = state.loading
		? "Δ git HEAD · loading"
		: `Δ git HEAD +${state.totalAdded} -${state.totalDeleted} ${state.files.length} files`;
	const title = theme.fg("accent", padAnsi(truncateToWidth(titleRaw, innerWidth), innerWidth));
	const lines = [top, theme.fg("accent", "│") + title + theme.fg("accent", "│")];

	if (state.error) {
		const error = theme.fg("warning", padAnsi(truncateToWidth(state.error, innerWidth), innerWidth));
		lines.push(theme.fg("accent", "│") + error + theme.fg("accent", "│"));
		while (lines.length < height - 1) lines.push(theme.fg("accent", "│") + padAnsi("", innerWidth) + theme.fg("accent", "│"));
		lines.push(bottom);
		return lines.slice(0, height);
	}

	const header = theme.fg("muted", padAnsi("st file".padEnd(Math.max(6, innerWidth - 12)) + " +     -", innerWidth));
	lines.push(theme.fg("accent", "│") + header + theme.fg("accent", "│"));

	const visibleFiles = state.files.slice(state.scrollOffset, state.scrollOffset + bodyHeight);
	const scrollBar = buildScrollBar(state.files.length, bodyHeight, state.scrollOffset, bodyHeight);
	const rowWidth = Math.max(10, innerWidth - 1);
	for (let i = 0; i < bodyHeight; i += 1) {
		const file = visibleFiles[i];
		let row = "";
		if (file) {
			const status = theme.fg(statusColor(file.status), file.status.padEnd(2));
			const countsWidth = 11;
			const pathWidth = Math.max(4, rowWidth - 2 - countsWidth);
			const path = theme.fg("text", padAnsi(shortenPath(file.path, pathWidth), pathWidth));
			const plusText = file.binary ? formatBinaryColumn(file.binaryNewBytes, file.status !== "D") : formatCount(file.added);
			const minusText = file.binary ? formatBinaryColumn(file.binaryOldBytes, file.status !== "A" && file.status !== "?") : formatCount(file.deleted);
			const plus = theme.fg("success", padAnsi(`+${plusText}`, 5));
			const minus = theme.fg("error", padAnsi(`-${minusText}`, 5));
			row = status + path + " " + plus + minus;
		} else {
			row = padAnsi("", rowWidth);
		}
		const bar = theme.fg("dim", scrollBar[i] ?? " ");
		lines.push(theme.fg("accent", "│") + padAnsi(row, rowWidth) + bar + theme.fg("accent", "│"));
	}
	lines.push(bottom);
	return lines.slice(0, height).map((line) => truncateToWidth(line, width));
}

function renderWidget(state: DiffState, theme: any, width: number): string[] {
	const panelWidth = Math.max(10, Math.min(WIDGET_MAX_WIDTH, width));
	const maxRows = Math.max(1, WIDGET_MAX_HEIGHT - 4);
	const fileRows = Math.min(state.files.length, maxRows);
	const height = Math.min(WIDGET_MAX_HEIGHT, Math.max(WIDGET_MIN_HEIGHT, fileRows + 4));
	return renderPanel(state, theme, panelWidth, height);
}

function safeRequestRender(handle: { requestRender: () => void } | undefined): boolean {
	if (!handle) return false;
	try {
		handle.requestRender();
		return true;
	} catch {
		return false;
	}
}

export default function (pi: ExtensionAPI) {
	const state = zeroState();
	let currentCtx: ExtensionContext | undefined;
	let widgetHandle: { requestRender: () => void } | undefined;
	let widgetMounted = false;
	let refreshTimer: NodeJS.Timeout | undefined;
	let refreshInFlight = false;

	const syncWidget = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (!state.enabled || state.error || state.files.length === 0) {
			if (widgetMounted) {
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				widgetMounted = false;
				widgetHandle = undefined;
			}
			return;
		}
		if (!widgetMounted) {
			ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
				widgetHandle = { requestRender: () => tui.requestRender() };
				return {
					render(width: number): string[] {
						return renderWidget(state, theme, width);
					},
					invalidate() {},
				};
			});
			widgetMounted = true;
			return;
		}
		if (!safeRequestRender(widgetHandle)) {
			widgetMounted = false;
			widgetHandle = undefined;
			syncWidget(ctx);
		}
	};

	const refreshNow = async (ctx = currentCtx) => {
		if (!ctx || refreshInFlight) return;
		refreshInFlight = true;
		state.loading = true;
		syncWidget(ctx);
		try {
			const next = await loadGitDiff(ctx.cwd);
			const previousOffset = state.scrollOffset;
			Object.assign(state, next, { loading: false, enabled: state.enabled });
			state.scrollOffset = previousOffset;
		} catch (error) {
			Object.assign(state, {
				files: [],
				totalAdded: 0,
				totalDeleted: 0,
				binaryFiles: 0,
				error: error instanceof Error ? error.message : String(error),
				loading: false,
			});
		} finally {
			refreshInFlight = false;
			syncWidget(ctx);
		}
	};

	const scheduleRefresh = (ctx = currentCtx, delay = REFRESH_DEBOUNCE_MS) => {
		if (!ctx || !state.enabled) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => { void refreshNow(ctx); }, delay);
		refreshTimer.unref?.();
	};

	const install = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		currentCtx = ctx;
		syncWidget(ctx);
		scheduleRefresh(ctx, 0);
	};

	pi.on("session_start", async (_event, ctx) => install(ctx));
	pi.on("model_select", async (_event, ctx) => install(ctx));
	pi.on("tool_execution_end", async (_event, ctx) => scheduleRefresh(ctx));
	pi.on("turn_end", async (_event, ctx) => scheduleRefresh(ctx));
	pi.on("session_shutdown", async (_event, ctx) => {
		if (refreshTimer) clearTimeout(refreshTimer);
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
		widgetMounted = false;
		widgetHandle = undefined;
	});

	pi.registerCommand("diff-panel-toggle", {
		description: "Toggle the git diff widget",
		handler: async (_args, ctx) => {
			state.enabled = !state.enabled;
			syncWidget(ctx);
			if (state.enabled) scheduleRefresh(ctx, 0);
			ctx.ui.notify(`Git diff widget ${state.enabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.registerCommand("diff-panel-refresh", {
		description: "Refresh the git diff widget",
		handler: async (_args, ctx) => {
			await refreshNow(ctx);
			ctx.ui.notify("Git diff widget refreshed", state.error ? "warning" : "success");
		},
	});

	pi.registerCommand("diff-panel-up", {
		description: "Scroll the git diff widget up",
		handler: async () => {
			state.scrollOffset = Math.max(0, state.scrollOffset - 1);
			if (!safeRequestRender(widgetHandle) && currentCtx) syncWidget(currentCtx);
		},
	});

	pi.registerCommand("diff-panel-down", {
		description: "Scroll the git diff widget down",
		handler: async () => {
			state.scrollOffset = Math.max(0, state.scrollOffset + 1);
			if (!safeRequestRender(widgetHandle) && currentCtx) syncWidget(currentCtx);
		},
	});
}
