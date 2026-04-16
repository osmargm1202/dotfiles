import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, parse } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import {
	CAVEMAN_STATE_EVENT,
	formatCavemanStatus,
	resolveInitialCavemanState,
	type CavemanLevel,
} from "./lib/caveman-state";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	type AgentStatusConfig,
	loadAgentStatusConfig,
	saveAgentStatusConfig,
} from "./lib/agent-status-config";

const PRIMARY_STATE_ENTRY = "pdd-primary-agent";
const PRIMARY_STATE_EVENT = "pdd:primary-agent-changed";
const SUBAGENTS_EVENT = "subagents:deployments-changed";
const WIDGET_KEY = "pdd-orgm-agents";
const STATUS_KEY = "pdd-orgm-agents";
const SYSTEM_AGENT = "pi";
const DEFAULT_PRIMARY_AGENT = "pdd-orgm";
const DEPLOYMENT_GRID_MAX_COLUMNS = 6;
const DEPLOYMENT_CARD_MIN_WIDTH = 24;
const DEPLOYMENT_GRID_GAP = 2;

type DeploymentStatus = "running" | "done" | "error";

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface DeploymentState {
	deploymentId: string;
	agent: string;
	instanceNumber?: number;
	source: "user" | "project";
	tools: string[];
	model?: string;
	contextWindow: number;
	contextTokens: number;
	status: DeploymentStatus;
	summary: string;
	currentActivity?: string;
	turns: number;
	usage: UsageStats;
	exitCode?: number;
	stopReason?: string;
	errorMessage?: string;
	expectedArtifactTopicKey?: string;
	persistedArtifactTopicKey?: string;
	persistedToPddMemory?: boolean;
	pddMemoryWrites: number;
	attemptedModels: string[];
	primaryModel?: string;
	fallbackModel?: string;
	fallbackUsed: boolean;
}

type DeploymentTranscriptMap = Record<string, string[]>;

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (value < 1000) return `${Math.round(value)}`;
	if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function formatCurrency(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0.000";
	if (value < 0.001) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(3)}`;
}

function buildContextBar(percent: number, width = 10): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)));
	return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]${Math.round(clamped)}%`;
}

function truncate(text: string, max = 96): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function formatTokens(count: number): string {
	if (!Number.isFinite(count) || count <= 0) return "0";
	if (count < 1000) return `${count}`;
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatBar(percent: number): string {
	const normalized = Math.max(0, Math.min(100, Math.round(percent)));
	const filled = Math.max(0, Math.min(10, Math.round(normalized / 10)));
	return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]${normalized}%`;
}

function shortenMiddle(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	if (maxWidth <= 1) return "…";
	if (maxWidth <= 6) return truncateToWidth(text, maxWidth);
	const keep = Math.max(1, Math.floor((maxWidth - 1) / 2));
	return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

function findPrimaryAgentName(name: string): boolean {
	const primaryDir = `${getAgentDir()}/agents/primary`;
	if (!existsSync(primaryDir)) return false;
	try {
		return readdirSync(primaryDir)
			.filter((e) => e.endsWith(".md"))
			.map((e) => join(primaryDir, e))
			.filter((fp) => {
				try { return lstatSync(fp).isFile() || lstatSync(fp).isSymbolicLink(); } catch { return false; }
			})
			.some((fp) => {
				const raw = readFileSync(fp, "utf8");
				const { frontmatter } = parseFrontmatter<Record<string, string>>(raw);
				const n = frontmatter.name || parse(fp).name;
				return n === name;
			});
	} catch {
		return false;
	}
}

function resolveDefaultPrimary(): string {
	if (findPrimaryAgentName(DEFAULT_PRIMARY_AGENT)) return DEFAULT_PRIMARY_AGENT;
	return SYSTEM_AGENT;
}

function restorePrimaryName(entries: readonly any[]): string {
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === PRIMARY_STATE_ENTRY) {
			const name = entry.data?.selectedName;
			if (typeof name === "string") {
				if (name === SYSTEM_AGENT) return SYSTEM_AGENT;
				if (findPrimaryAgentName(name)) return name;
			}
		}
	}
	return resolveDefaultPrimary();
}

function formatPrimaryLabel(name: string): string {
	return name === SYSTEM_AGENT ? "pi" : `primary:${name}`;
}

function withInstanceNumbers(deployments: DeploymentState[]): DeploymentState[] {
	const counters = new Map<string, number>();
	return deployments.map((deployment) => {
		const next = (counters.get(deployment.agent) ?? 0) + 1;
		counters.set(deployment.agent, next);
		return { ...deployment, instanceNumber: deployment.instanceNumber ?? next };
	});
}

function formatDeploymentLabel(deployment: DeploymentState): string {
	return `${deployment.agent} ${deployment.instanceNumber ?? 1}`;
}

function renderWidget(
	ctx: ExtensionContext,
	deployments: DeploymentState[],
	config: AgentStatusConfig,
	cavemanLevel: CavemanLevel,
): void {
	if (!ctx.hasUI) return;
	if (!config.showWidget || deployments.length === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	const numberedDeployments = withInstanceNumbers(deployments);
	const statusRank = (status: DeploymentStatus): number => {
		if (status === "running") return 0;
		if (status === "error") return 1;
		return 2;
	};
	const sortedDeployments = [...numberedDeployments].sort((a, b) => {
		const rankDiff = statusRank(a.status) - statusRank(b.status);
		if (rankDiff !== 0) return rankDiff;
		if (a.agent !== b.agent) return a.agent.localeCompare(b.agent);
		return (a.instanceNumber ?? 0) - (b.instanceNumber ?? 0);
	});
	const running = sortedDeployments.filter((deployment) => deployment.status === "running").length;
	const padCell = (text: string, width: number) => {
		const truncated = truncateToWidth(text, width);
		const remaining = Math.max(0, width - visibleWidth(truncated));
		return truncated + " ".repeat(remaining);
	};

	const buildCard = (deployment: DeploymentState, cardWidth: number): string[] => {
		const isActive = deployment.status === "running";
		const innerWidth = Math.max(8, cardWidth - 2);
		const percent = deployment.contextWindow > 0 ? (deployment.contextTokens / deployment.contextWindow) * 100 : 0;
		const statusColor = deployment.status === "done" ? "success" : deployment.status === "error" ? "error" : isActive ? "accent" : "warning";
		const statusLabel = deployment.status === "done" ? "done" : deployment.status === "error" ? "error" : "running";
		const modelLabel = shortenMiddle(deployment.model ?? "default-model", Math.max(10, innerWidth - 2));
		const persistenceLabel = deployment.persistedToPddMemory
			? `engram ✓ ${shortenMiddle(deployment.persistedArtifactTopicKey ?? "saved", Math.max(8, innerWidth - 11))}`
			: `engram … ${shortenMiddle(deployment.expectedArtifactTopicKey ?? "pending", Math.max(8, innerWidth - 11))}`;
		const summaryLabel = deployment.summary || (deployment.status === "running" ? "waiting for result..." : "done");
		const activityLabel = deployment.currentActivity ? truncate(deployment.currentActivity, innerWidth - 1) : "thinking...";
		const titleText = ` ${formatDeploymentLabel(deployment)} `;
		const titleWidth = Math.max(0, innerWidth - visibleWidth(titleText));
		const usageTokens = `↑${formatTokens(deployment.usage.input)} ↓${formatTokens(deployment.usage.output)}`;
		const usageCost = `$${deployment.usage.cost.toFixed(3)}`;
		const cavemanLabel = shortenMiddle(formatCavemanStatus(cavemanLevel), Math.max(10, innerWidth - 5));
		const borderColor = isActive ? "borderAccent" : "borderMuted";
		const lines = [
			ctx.ui.theme.fg(borderColor, `╭${titleText}${"─".repeat(titleWidth)}╮`),
			ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("muted", padCell(` ${statusLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"),
		];

		if (config.showModel) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("muted", padCell(` ${modelLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		if (config.showActivity) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("accent", padCell(` ${activityLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		if (config.showCaveman) {
			const cavemanColor = cavemanLevel === "off" ? "muted" : "accent";
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg(cavemanColor, padCell(` ${cavemanLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("accent", padCell(` ${formatBar(percent)}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		if (config.showTokens) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("muted", padCell(` ${usageTokens}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		if (config.showCost) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("warning", padCell(` cost ${usageCost}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		if (config.showPersistence) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg(deployment.persistedToPddMemory ? "success" : "warning", padCell(` ${persistenceLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		if (config.showSummary) {
			lines.push(ctx.ui.theme.fg(borderColor, "│") + ctx.ui.theme.fg("text", padCell(` ${summaryLabel}`, innerWidth)) + ctx.ui.theme.fg(borderColor, "│"));
		}
		lines.push(ctx.ui.theme.fg(borderColor, `╰${"─".repeat(innerWidth)}╯`));
		return lines;
	};

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui, theme) => ({
			render(width: number): string[] {
				const header = theme.fg("accent", "PDD agent deployments");
				const gap = DEPLOYMENT_GRID_GAP;
				const maxColumns = Math.min(DEPLOYMENT_GRID_MAX_COLUMNS, sortedDeployments.length);
				const computedColumns = Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (DEPLOYMENT_CARD_MIN_WIDTH + gap)) || 1));
				const cardWidth = Math.max(DEPLOYMENT_CARD_MIN_WIDTH, Math.floor((width - gap * (computedColumns - 1)) / computedColumns));
				const cards = sortedDeployments.map((deployment) => buildCard(deployment, cardWidth));
				const lines: string[] = [truncateToWidth(header, width)];

				for (let rowStart = 0; rowStart < cards.length; rowStart += computedColumns) {
					const rowCards = cards.slice(rowStart, rowStart + computedColumns);
					const rowHeight = Math.max(...rowCards.map((card) => card.length));
					for (let lineIndex = 0; lineIndex < rowHeight; lineIndex += 1) {
						const rowLine = rowCards.map((card) => card[lineIndex] ?? " ".repeat(cardWidth)).join(" ".repeat(gap));
						lines.push(truncateToWidth(rowLine, width));
					}
					if (rowStart + computedColumns < cards.length) lines.push("");
				}
				return lines;
			},
			invalidate() {},
		}),
	);

	const status = running > 0 ? `🤖 ${running}/${deployments.length} running` : `🤖 ${deployments.length} used`;
	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(running > 0 ? "warning" : "accent", status));
}

function buildConfigOptions(config: AgentStatusConfig): Array<{ key: keyof AgentStatusConfig | "close"; title: string }> {
	const mark = (value: boolean) => (value ? "[on]" : "[off]");
	return [
		{ key: "showWidget", title: `${mark(config.showWidget)} Widget cards` },
		{ key: "showFooter", title: `${mark(config.showFooter)} Footer` },
		{ key: "showModel", title: `${mark(config.showModel)} Show model` },
		{ key: "showTokens", title: `${mark(config.showTokens)} Show tokens` },
		{ key: "showCost", title: `${mark(config.showCost)} Show cost` },
		{ key: "showPersistence", title: `${mark(config.showPersistence)} Show memory persistence` },
		{ key: "showSummary", title: `${mark(config.showSummary)} Show summary` },
		{ key: "showActivity", title: `${mark(config.showActivity)} Show current activity` },
		{ key: "showCaveman", title: `${mark(config.showCaveman)} Show caveman state` },
		{ key: "close", title: "Done" },
	];
}

function normalizeCommandAction(args: string): "settings" | "clear" | "inspect" | undefined {
	const value = args.trim().toLowerCase();
	if (!value || value === "settings" || value === "config" || value === "menu") return "settings";
	if (value === "clear") return "clear";
	if (value === "inspect" || value === "view" || value === "logs" || value === "transcript") return "inspect";
	return undefined;
}

function buildInspectOptions(deployments: DeploymentState[]): Array<{ label: string; deploymentId: string }> {
	return withInstanceNumbers([...deployments])
		.sort((a, b) => a.deploymentId.localeCompare(b.deploymentId))
		.map((deployment) => ({
			deploymentId: deployment.deploymentId,
			label: `${formatDeploymentLabel(deployment)} · ${deployment.status} · ${truncate(deployment.currentActivity || deployment.summary || "idle", 56)}`,
		}));
}

async function openTranscriptViewer(
	ctx: ExtensionContext,
	deploymentId: string,
	getDeployment: () => DeploymentState | undefined,
	getTranscriptLines: () => string[],
	onOpen: (handle: { requestRender: () => void }) => void,
	onClose: () => void,
): Promise<void> {
	if (!ctx.hasUI) return;
	const WINDOW_LINES = 18;
	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		onOpen(tui);
		let scrollOffset = 0;
		const close = () => {
			onClose();
			done();
		};
		return {
			render(width: number): string[] {
				const deployment = getDeployment();
				const transcript = getTranscriptLines();
				const innerWidth = Math.max(20, width - 2);
				const top = theme.fg("accent", `╭${"─".repeat(innerWidth)}╮`);
				const bottom = theme.fg("accent", `╰${"─".repeat(innerWidth)}╯`);
				const pad = (text: string) => {
					const clipped = truncateToWidth(text, innerWidth);
					return clipped + " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
				};
				const meta = deployment
					? [
						`${deployment.deploymentId} · ${deployment.status}`,
						`${deployment.agent} · ${deployment.model ?? "default"}`,
						`activity: ${deployment.currentActivity || deployment.summary || "idle"}`,
					]
					: [`${deploymentId} · finished/cleared`, "deployment metadata unavailable", "activity: n/a"];
				const maxScroll = Math.max(0, transcript.length - WINDOW_LINES);
				const clampedOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
				if (clampedOffset !== scrollOffset) scrollOffset = clampedOffset;
				const start = Math.max(0, transcript.length - WINDOW_LINES - scrollOffset);
				const visible = transcript.slice(start, start + WINDOW_LINES);
				const body = visible.length > 0 ? visible : [theme.fg("muted", "No transcript yet")];
				const lines = [top];
				for (const line of meta) {
					lines.push(theme.fg("accent", "│") + pad(theme.fg("text", ` ${line}`)) + theme.fg("accent", "│"));
				}
				lines.push(theme.fg("accent", "│") + pad(theme.fg("muted", ` lines ${transcript.length} · offset ${scrollOffset}`)) + theme.fg("accent", "│"));
				for (let i = 0; i < WINDOW_LINES; i += 1) {
					const line = body[i] ?? "";
					lines.push(theme.fg("accent", "│") + pad(line ? ` ${line}` : "") + theme.fg("accent", "│"));
				}
				lines.push(theme.fg("accent", "│") + pad(theme.fg("dim", " ↑↓/j/k scroll · esc/q close ")) + theme.fg("accent", "│"));
				lines.push(bottom);
				return lines.map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
			handleInput(data: string) {
				if (data === "\u001b" || data === "q") return close();
				if (data === "k" || data === "\u001b[A") {
					scrollOffset = Math.min(scrollOffset + 1, Math.max(0, getTranscriptLines().length - WINDOW_LINES));
					tui.requestRender();
					return;
				}
				if (data === "j" || data === "\u001b[B") {
					scrollOffset = Math.max(0, scrollOffset - 1);
					tui.requestRender();
				}
			},
		};
	}, {
		overlay: true,
		overlayOptions: { anchor: "center", width: "90%", maxHeight: "85%", margin: 1 },
	});
	onClose();
}

export default function (pi: ExtensionAPI) {
	let currentPrimary = SYSTEM_AGENT;
	let currentCaveman: CavemanLevel = "off";
	let currentCtx: ExtensionContext | null = null;
	let deployments: DeploymentState[] = [];
	let transcripts: DeploymentTranscriptMap = {};
	let footerHandle: { requestRender: () => void } | null = null;
	let transcriptViewerHandle: { deploymentId: string; requestRender: () => void } | null = null;
	let config = loadAgentStatusConfig();

	const rerender = () => {
		config = loadAgentStatusConfig();
		if (currentCtx) renderWidget(currentCtx, deployments, config, currentCaveman);
		if (footerHandle) footerHandle.requestRender();
		if (transcriptViewerHandle) transcriptViewerHandle.requestRender();
	};

	const clearRuntimeState = (ctx: ExtensionContext) => {
		deployments = [];
		transcripts = {};
		renderWidget(ctx, deployments, loadAgentStatusConfig(), currentCaveman);
		if (footerHandle) footerHandle.requestRender();
		if (transcriptViewerHandle) transcriptViewerHandle.requestRender();
	};

	const installFooter = (ctx: ExtensionContext) => {
		currentCtx = ctx;
		currentPrimary = restorePrimaryName(ctx.sessionManager.getEntries());
		currentCaveman = resolveInitialCavemanState(ctx.sessionManager.getEntries()).level;
		config = loadAgentStatusConfig();

		ctx.ui.setFooter((tui, theme, footerData) => {
			footerHandle = tui;
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: () => { unsubscribeBranch(); footerHandle = null; },
				invalidate() {},
				render(width: number): string[] {
					if (!config.showFooter) return [];
					const usage = ctx.getContextUsage();
					const percent = usage?.percent ?? 0;
					const contextText = buildContextBar(percent);

					let inputTokens = 0;
					let outputTokens = 0;
					let totalCost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const message = entry.message as AssistantMessage;
							inputTokens += message.usage?.input ?? 0;
							outputTokens += message.usage?.output ?? 0;
							totalCost += message.usage?.cost?.total ?? 0;
						}
					}

					const modelName = ctx.model?.name || ctx.model?.id || "no-model";
					const thinking = pi.getThinkingLevel();
					const tokenSummary = `↑${formatCompactNumber(inputTokens)} ↓${formatCompactNumber(outputTokens)}`;
					const primaryLabel = formatPrimaryLabel(currentPrimary);
					const left = theme.fg("accent", contextText);
					const middle = [
						config.showModel ? theme.fg("text", modelName) : "",
						theme.fg("muted", `${config.showModel ? " · " : ""}${thinking} · ${primaryLabel}`),
					].join("");
					const rightParts = [
						config.showTokens ? theme.fg("muted", tokenSummary) : "",
						config.showCost ? theme.fg("warning", formatCurrency(totalCost)) : "",
					].filter(Boolean);
					const right = rightParts.join(theme.fg("muted", " · "));
					const combinedWidth = visibleWidth(left) + visibleWidth(middle) + visibleWidth(right) + 4;

					if (combinedWidth <= width) {
						const free = width - combinedWidth;
						return [left + "  " + middle + " ".repeat(2 + free) + right];
					}

					const compactBar = theme.fg("accent", `${contextText} `);
					const compactTail = [
						config.showModel ? theme.fg("text", modelName) : "",
						theme.fg("muted", `${config.showModel ? " · " : ""}${thinking} · ${primaryLabel}`),
						config.showTokens ? theme.fg("muted", ` · ${tokenSummary}`) : "",
						config.showCost ? theme.fg("warning", ` · ${formatCurrency(totalCost)}`) : "",
					].join("");
					return [compactBar + truncateToWidth(compactTail, Math.max(0, width - visibleWidth(compactBar)))];
				},
			};
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;
		deployments = [];
		transcripts = {};
		if (ctx.hasUI) {
			installFooter(ctx);
			renderWidget(ctx, deployments, config, currentCaveman);
		}
	});

	pi.on("model_select", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		installFooter(ctx);
	});

	pi.events.on(PRIMARY_STATE_EVENT, (data: { selectedName: string }) => {
		currentPrimary = data?.selectedName ?? SYSTEM_AGENT;
		rerender();
	});

	pi.events.on(CAVEMAN_STATE_EVENT, (data: { level?: CavemanLevel }) => {
		currentCaveman = data?.level ?? "off";
		rerender();
	});

	pi.events.on(SUBAGENTS_EVENT, (data: { deployments?: DeploymentState[]; transcripts?: DeploymentTranscriptMap }) => {
		deployments = Array.isArray(data?.deployments) ? data.deployments : [];
		transcripts = data?.transcripts && typeof data.transcripts === "object" ? data.transcripts : {};
		rerender();
	});

	pi.registerCommand("agent-status", {
		description: "Manage agent status UI: /agent-status [settings|inspect|clear]",
		getArgumentCompletions: (prefix) => {
			const value = prefix.trim().toLowerCase();
			const options = [
				{ value: "settings", label: "settings — open status settings menu" },
				{ value: "inspect", label: "inspect — open live transcript viewer for a deployment" },
				{ value: "clear", label: "clear — clear current deployment runtime state" },
			].filter((option) => option.value.startsWith(value));
			return options.length > 0 ? options : null;
		},
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const action = normalizeCommandAction(args);
			if (!action) {
				ctx.ui.notify(`Unknown /agent-status arg: ${args.trim()}`, "error");
				ctx.ui.notify("Usage: /agent-status [settings|inspect|clear]", "warning");
				return;
			}
			if (action === "clear") {
				clearRuntimeState(ctx);
				ctx.ui.notify("Agent status runtime state cleared", "info");
				return;
			}
			if (action === "inspect") {
				const options = buildInspectOptions(deployments);
				if (options.length === 0) {
					ctx.ui.notify("No subagent deployments available to inspect", "warning");
					return;
				}
				const selected = await ctx.ui.select("Inspect subagent transcript", options.map((option) => option.label));
				if (!selected) return;
				const match = options.find((option) => option.label === selected);
				if (!match) return;
				await openTranscriptViewer(
					ctx,
					match.deploymentId,
					() => deployments.find((deployment) => deployment.deploymentId === match.deploymentId),
					() => transcripts[match.deploymentId] ?? [],
					(handle) => { transcriptViewerHandle = { deploymentId: match.deploymentId, requestRender: handle.requestRender }; },
					() => {
						if (transcriptViewerHandle?.deploymentId === match.deploymentId) transcriptViewerHandle = null;
					},
				);
				return;
			}
			while (true) {
				config = loadAgentStatusConfig();
				const options = buildConfigOptions(config);
				const selected = await ctx.ui.select(
					"Agent status settings",
					options.map((option) => option.title),
				);
				if (!selected) break;
				const chosen = options.find((option) => option.title === selected);
				if (!chosen || chosen.key === "close") break;
				config = { ...config, [chosen.key]: !config[chosen.key] };
				saveAgentStatusConfig(config);
				renderWidget(ctx, deployments, config, currentCaveman);
				installFooter(ctx);
				ctx.ui.notify(`agent-status: ${chosen.key} ${config[chosen.key] ? "on" : "off"}`, "info");
			}
			renderWidget(ctx, deployments, loadAgentStatusConfig(), currentCaveman);
			installFooter(ctx);
			ctx.ui.notify("Agent status settings applied", "success");
		},
	});
}
