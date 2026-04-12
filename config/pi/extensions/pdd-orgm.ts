import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── Primary agent constants ────────────────────────────────────────────────
const SYSTEM_AGENT = "pi";
const DEFAULT_PRIMARY_AGENT = "pdd-orgm";
const PRIMARY_STATE_ENTRY = "pdd-primary-agent";
const PRIMARY_STATE_EVENT = "pdd:primary-agent-changed";

// ─── Widget / status keys ───────────────────────────────────────────────────
const WIDGET_KEY = "pdd-orgm-agents";
const STATUS_KEY = "pdd-orgm-agents";
const SUBAGENT_ENV_FLAG = "PI_PDD_SUBAGENT";
const DEFAULT_CONTEXT_WINDOW = 200_000;
const GLOBAL_FALLBACK_MODEL = process.env.PI_PDD_FALLBACK_MODEL ?? "openai-codex/gpt-5.4";
const DEPLOYMENT_GRID_MAX_COLUMNS = 6;
const DEPLOYMENT_CARD_MIN_WIDTH = 24;
const DEPLOYMENT_GRID_GAP = 2;

const IS_SUBAGENT_RUNTIME = process.env[SUBAGENT_ENV_FLAG] === "1";

// ─── Types ──────────────────────────────────────────────────────────────────
type AgentSource = "user" | "project";
type DeploymentStatus = "running" | "done" | "error";

interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
}

interface PrimaryAgent {
	name: string;
	description: string;
	systemPrompt: string;
	filePath: string;
}

interface PrimaryAgentState {
	selectedName: string; // SYSTEM_AGENT or a primary agent name
}

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
	source: AgentSource;
	tools: string[];
	model?: string;
	contextWindow: number;
	contextTokens: number;
	status: DeploymentStatus;
	summary: string;
	turns: number;
	usage: UsageStats;
	exitCode?: number;
	stopReason?: string;
	errorMessage?: string;
	expectedArtifactTopicKey?: string;
	persistedArtifactTopicKey?: string;
	persistedToEngram?: boolean;
	engramWrites: number;
	attemptedModels: string[];
	primaryModel?: string;
	fallbackModel?: string;
	fallbackUsed: boolean;
}

interface AgentRunDetails {
	deploymentId: string;
	agent: string;
	source: AgentSource;
	tools: string[];
	model?: string;
	contextWindow: number;
	status: DeploymentStatus;
	summary: string;
	usage: UsageStats;
	exitCode: number;
	stopReason?: string;
	errorMessage?: string;
	expectedArtifactTopicKey?: string;
	persistedArtifactTopicKey?: string;
	persistedToEngram?: boolean;
	engramWrites?: number;
	attemptedModels?: string[];
	primaryModel?: string;
	fallbackModel?: string;
	fallbackUsed?: boolean;
	interactionOutcome?: "completed" | "awaiting_user_input_relayed" | "awaiting_user_input_missing_payload" | "awaiting_user_input_cancelled";
	awaitingUserInput?: boolean;
	questionPayload?: AwaitingUserInputPayload;
	userResponse?: RelayUserResponse;
}

interface AwaitingUserInputPayload {
	status: "awaiting_user_input";
	question?: string;
	context?: string;
	options?: Array<string | { title: string; description?: string }>;
	allowMultiple?: boolean;
	allowFreeform?: boolean;
	allowComment?: boolean;
	timeout?: number;
	executive_summary?: string;
	risks?: unknown;
	next_recommended?: unknown;
	artifacts?: unknown;
	[key: string]: unknown;
}

interface RelayUserResponse {
	cancelled: boolean;
	selection?: string | string[];
	comment?: string;
	raw?: unknown;
}

const DeployAgentParams = Type.Object({
	agent: Type.String({ description: "Agent name from ~/.pi/agent/agents or nearest .pi/agents" }),
	task: Type.String({ description: "Task to delegate to that agent" }),
	cwd: Type.Optional(Type.String({ description: "Optional working directory for the deployed agent" })),
	scope: Type.Optional(
		StringEnum(["user", "project", "both"] as const, {
			description: "Agent discovery scope. Default: both",
			default: "both",
		}),
	),
});

// ─── Utility functions ──────────────────────────────────────────────────────
function stripFrontmatter(markdown: string): string {
	const trimmed = markdown.trim();
	if (!trimmed.startsWith("---")) return trimmed;
	const match = trimmed.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
	return match?.[1]?.trim() ?? trimmed;
}

function zeroUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function parseTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return value.split(",").map((tool) => tool.trim()).filter(Boolean);
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "agents");
		try {
			if (statSync(candidate).isDirectory()) return candidate;
		} catch {
			// keep walking up
		}
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
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

function getExpectedArtifactTopicKey(agentName: string, task: string): string | undefined {
	const patterns: Array<[string, string]> = [
		["pdd-explorer", "explore"],
		["pdd-requirements", "requirements"],
		["pdd-planner", "plan"],
		["pdd-builder", "build-progress"],
		["pdd-reviewer", "review-report"],
	];
	const match = task.match(/change [`']?([^`'\n]+)[`']?/i) || task.match(/change-name[:\s]+([^\n]+)/i);
	const rawChangeName = match?.[1]?.trim();
	const changeName = rawChangeName?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	const suffix = patterns.find(([name]) => name === agentName)?.[1];
	if (!changeName || !suffix) return undefined;
	return `pdd/${changeName}/${suffix}`;
}

function getContextWindow(modelRef: string | undefined, ctx: ExtensionContext): number {
	if (!modelRef) return DEFAULT_CONTEXT_WINDOW;
	const parts = modelRef.split("/");
	if (parts.length < 2) return DEFAULT_CONTEXT_WINDOW;
	const provider = parts[0];
	const id = parts.slice(1).join("/");
	const model = ctx.modelRegistry.find(provider, id);
	return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

function getFallbackModel(primaryModel: string | undefined): string | undefined {
	if (!primaryModel) return undefined;
	return primaryModel === GLOBAL_FALLBACK_MODEL ? undefined : GLOBAL_FALLBACK_MODEL;
}

function isLikelyModelFailure(params: {
	exitCode: number;
	stopReason?: string;
	errorMessage?: string;
	stderr?: string;
	finalText?: string;
}): boolean {
	if (params.stopReason === "abort") return false;
	const haystack = [params.errorMessage, params.stderr, params.finalText].filter(Boolean).join("\n").toLowerCase();
	if (!haystack.trim()) return params.exitCode !== 0;
	return [
		/insufficient balance/,
		/billing/,
		/quota/,
		/rate limit/,
		/too many requests/,
		/model.*not found/,
		/provider.*error/,
		/authentication/,
		/api key/,
		/credit/,
		/overloaded/,
		/service unavailable/,
		/context window/,
		/invalid model/,
	].some((pattern) => pattern.test(haystack));
}

function extractJsonObjectCandidates(text: string): string[] {
	const candidates = new Set<string>();
	for (const fenced of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
		const body = fenced[1]?.trim();
		if (body?.startsWith("{") && body.endsWith("}")) candidates.add(body);
	}
	const stack: number[] = [];
	let start = -1;
	let inString = false;
	let escaped = false;
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (inString) {
			escaped = !escaped && char === "\\";
			if (char === '"' && !escaped) inString = false;
			if (char !== "\\") escaped = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			escaped = false;
			continue;
		}
		if (char === "{") {
			if (stack.length === 0) start = i;
			stack.push(i);
			continue;
		}
		if (char === "}" && stack.length > 0) {
			stack.pop();
			if (stack.length === 0 && start >= 0) {
				candidates.add(text.slice(start, i + 1));
				start = -1;
			}
		}
	}
	return Array.from(candidates);
}

function parseAwaitingUserInputPayload(text: string): AwaitingUserInputPayload | undefined {
	for (const candidate of extractJsonObjectCandidates(text)) {
		try {
			const parsed = JSON.parse(candidate);
			if (parsed && typeof parsed === "object" && parsed.status === "awaiting_user_input") {
				return parsed as AwaitingUserInputPayload;
			}
		} catch {
			// ignore invalid candidate
		}
	}
	return undefined;
}

async function relayAwaitingUserInput(
	payload: AwaitingUserInputPayload,
	ctx: ExtensionContext,
): Promise<RelayUserResponse> {
	if (!ctx.hasUI) {
		return { cancelled: true, raw: { reason: "ui_unavailable" } };
	}
	const title = payload.question || "Subagent needs your input";
	const context = payload.context || payload.executive_summary || "The delegated agent needs clarification before continuing.";
	const timeout = payload.timeout && payload.timeout > 0 ? payload.timeout : undefined;
	const options = payload.options?.map((option) =>
		typeof option === "string"
			? { title: option, description: undefined }
			: { title: option.title, description: option.description },
	);

	if (options && options.length > 0) {
		const renderedOptions = options.map((option) =>
			option.description ? `${option.title} — ${option.description}` : option.title,
		);
		if (payload.allowMultiple) {
			const selection = await ctx.ui.input(
				title,
				`One or more choices, comma separated. Options: ${renderedOptions.join(" | ")}`,
				{ timeout },
			);
			if (selection === undefined) return { cancelled: true };
			const values = selection.split(",").map((line) => line.trim()).filter(Boolean);
			if (payload.allowComment) {
				const comment = await ctx.ui.input("Additional comment (optional)", "", { timeout });
				return { cancelled: false, selection: values, comment: comment?.trim() || undefined, raw: selection };
			}
			return { cancelled: false, selection: values, raw: selection };
		}
		const selected = await ctx.ui.select(`${title}\n\n${context}`, renderedOptions, { timeout });
		if (selected === undefined) return { cancelled: true };
		const comment = payload.allowComment ? await ctx.ui.input("Optional comment", "", { timeout }) : undefined;
		return { cancelled: false, selection: selected, comment: comment?.trim() || undefined, raw: selected };
	}

	const answer = await ctx.ui.input(title, context, { timeout });
	if (answer === undefined) return { cancelled: true };
	return { cancelled: false, selection: answer.trim(), raw: answer };
}

// ─── Deployable agent discovery (root agents/ only, unchanged contract) ─────
function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
	if (!existsSync(dir)) return [];
	try {
		return readdirSync(dir)
			.filter((entry) => entry.endsWith(".md"))
			.map((entry) => join(dir, entry))
			.filter((filePath) => {
				try {
					const stat = lstatSync(filePath);
					return stat.isFile() || stat.isSymbolicLink();
				} catch {
					return false;
				}
			})
			.map((filePath) => {
				const raw = readFileSync(filePath, "utf8");
				const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
				const name = frontmatter.name || parse(filePath).name;
				return {
					name,
					description: frontmatter.description || name,
					tools: parseTools(frontmatter.tools),
					model: frontmatter.model,
					systemPrompt: body.trim(),
					source,
					filePath,
				} satisfies AgentConfig;
			});
	} catch {
		return [];
	}
}

function discoverAgents(cwd: string, scope: "user" | "project" | "both" = "both"): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = findNearestProjectAgentsDir(cwd);
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectDir ? [] : loadAgentsFromDir(projectDir, "project");
	const merged = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) merged.set(agent.name, agent);
		for (const agent of projectAgents) merged.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) merged.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) merged.set(agent.name, agent);
	}

	return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function findAgent(cwd: string, name: string, scope: "user" | "project" | "both"): AgentConfig | undefined {
	return discoverAgents(cwd, scope).find((agent) => agent.name === name);
}

// ─── Primary agent discovery (agents/primary/*.md, separate from deployable) ─
function discoverPrimaryAgents(): PrimaryAgent[] {
	const primaryDir = join(getAgentDir(), "agents", "primary");
	if (!existsSync(primaryDir)) return [];

	try {
		return readdirSync(primaryDir)
			.filter((entry) => entry.endsWith(".md"))
			.map((entry) => join(primaryDir, entry))
			.filter((filePath) => {
				try {
					const stat = lstatSync(filePath);
					return stat.isFile() || stat.isSymbolicLink();
				} catch {
					return false;
				}
			})
			.map((filePath) => {
				const raw = readFileSync(filePath, "utf8");
				const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
				const name = frontmatter.name || parse(filePath).name;
				return {
					name,
					description: frontmatter.description || name,
					systemPrompt: body.trim(),
					filePath,
				} satisfies PrimaryAgent;
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

function findPrimaryAgent(name: string): PrimaryAgent | undefined {
	return discoverPrimaryAgents().find((agent) => agent.name === name);
}

// ─── Primary agent selection state ──────────────────────────────────────────
function buildPrimaryCycleList(): string[] {
	const primaries = discoverPrimaryAgents().map((a) => a.name);
	return [SYSTEM_AGENT, ...primaries];
}

function resolveDefaultPrimary(): string {
	const primaries = discoverPrimaryAgents();
	if (primaries.some((a) => a.name === DEFAULT_PRIMARY_AGENT)) return DEFAULT_PRIMARY_AGENT;
	return SYSTEM_AGENT;
}

function restorePrimaryState(entries: readonly any[]): string {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === PRIMARY_STATE_ENTRY) {
			const name = entry.data?.selectedName;
			if (typeof name === "string") {
				if (name === SYSTEM_AGENT) return SYSTEM_AGENT;
				if (findPrimaryAgent(name)) return name;
			}
		}
	}
	return resolveDefaultPrimary();
}

function setPrimaryAgent(pi: ExtensionAPI, name: string): void {
	pi.appendEntry(PRIMARY_STATE_ENTRY, { selectedName: name });
	pi.events.emit(PRIMARY_STATE_EVENT, { selectedName: name });
}

function getPrimaryStatusLabel(selectedName: string): string {
	if (selectedName === SYSTEM_AGENT) return SYSTEM_AGENT;
	return `primary:${selectedName}`;
}

interface SelectorItem {
	value: string;
	label: string;
	description: string;
}

function buildSelectorItems(currentPrimary: string): SelectorItem[] {
	const items: SelectorItem[] = [{
		value: SYSTEM_AGENT,
		label: SYSTEM_AGENT,
		description: "No primary overlay — use pi defaults",
	}];
	for (const agent of discoverPrimaryAgents()) {
		items.push({
			value: agent.name,
			label: agent.name === currentPrimary ? `${agent.name}  ✓ current` : agent.name,
			description: agent.description || "",
		});
	}
	return items;
}

// ─── Pi invocation & temp file helpers ──────────────────────────────────────
function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	return { command: "pi", args };
}

function writePromptToTempFile(agentName: string, prompt: string): { dir: string; filePath: string } {
	const dir = join(tmpdir(), `pi-pdd-${agentName.replace(/[^\w.-]+/g, "_")}-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, "prompt.md");
	writeFileSync(filePath, prompt, { encoding: "utf8", mode: 0o600 });
	return { dir, filePath };
}

function extractAssistantText(message: any): string {
	if (!message || !Array.isArray(message.content)) return "";
	return message.content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("\n")
		.trim();
}

// ─── Widget rendering ───────────────────────────────────────────────────────
function renderWidget(ctx: ExtensionContext, deployments: DeploymentState[]): void {
	if (!ctx.hasUI) return;
	if (deployments.length === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	const statusRank = (status: DeploymentStatus): number => {
		if (status === "running") return 0;
		if (status === "error") return 1;
		return 2;
	};
	const sortedDeployments = [...deployments].sort((a, b) => {
		const rankDiff = statusRank(a.status) - statusRank(b.status);
		if (rankDiff !== 0) return rankDiff;
		return a.deploymentId.localeCompare(b.deploymentId);
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
		const statusColor =
			deployment.status === "done" ? "success" : deployment.status === "error" ? "error" : isActive ? "accent" : "warning";
		const statusLabel = deployment.status === "done" ? "done" : deployment.status === "error" ? "error" : "running";
		const modelLabel = shortenMiddle(deployment.model ?? "default-model", Math.max(10, innerWidth - 2));
		const persistenceLabel = deployment.persistedToEngram
			? `engram ✓ ${shortenMiddle(deployment.persistedArtifactTopicKey ?? "saved", Math.max(8, innerWidth - 11))}`
			: `engram … ${shortenMiddle(deployment.expectedArtifactTopicKey ?? "pending", Math.max(8, innerWidth - 11))}`;
		const summaryLabel = deployment.summary || (deployment.status === "running" ? "waiting for result..." : "done");
		const titleLabel = `${deployment.agent} ${deployment.deploymentId.split("#").pop() ?? "1"}`;
		const titleText = ` ${titleLabel} `;
		const titleWidth = Math.max(0, innerWidth - visibleWidth(titleText));
		const usageTokens = `↑${formatTokens(deployment.usage.input)} ↓${formatTokens(deployment.usage.output)}`;
		const usageCost = `$${deployment.usage.cost.toFixed(3)}`;
		const borderColor = statusColor;

		return [
			ctx.ui.theme.fg(borderColor, `╭${titleText}${"─".repeat(titleWidth)}╮`),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg("muted", padCell(` ${statusLabel} · ${modelLabel}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg("accent", padCell(` ${formatBar(percent)}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg("muted", padCell(` ${usageTokens}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg("warning", padCell(` cost ${usageCost}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg(deployment.persistedToEngram ? "success" : "warning", padCell(` ${persistenceLabel}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, "│") +
				ctx.ui.theme.fg("text", padCell(` ${summaryLabel}`, innerWidth)) +
				ctx.ui.theme.fg(borderColor, "│"),
			ctx.ui.theme.fg(borderColor, `╰${"─".repeat(innerWidth)}╯`),
		];
	};

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui, theme) => ({
			render(width: number): string[] {
				const header = theme.fg("accent", "PDD agent deployments");
				const gap = DEPLOYMENT_GRID_GAP;
				const maxColumns = Math.min(DEPLOYMENT_GRID_MAX_COLUMNS, sortedDeployments.length);
				const minCardWidth = DEPLOYMENT_CARD_MIN_WIDTH;
				const computedColumns = Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minCardWidth + gap)) || 1));
				const cardWidth = Math.max(minCardWidth, Math.floor((width - gap * (computedColumns - 1)) / computedColumns));
				const cards = sortedDeployments.map((deployment) => buildCard(deployment, cardWidth));
				const lines: string[] = [truncateToWidth(header, width)];

				for (let rowStart = 0; rowStart < cards.length; rowStart += computedColumns) {
					const rowCards = cards.slice(rowStart, rowStart + computedColumns);
					const rowHeight = Math.max(...rowCards.map((card) => card.length));
					for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
						const rowLine = rowCards
							.map((card) => card[lineIndex] ?? " ".repeat(cardWidth))
							.join(" ".repeat(gap));
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

// ─── Main extension export ──────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
	let promptDeployments: DeploymentState[] = [];
	let deploymentSequence = 0;
	let currentPrimary: string = SYSTEM_AGENT;

	const refreshUI = (ctx: ExtensionContext) => renderWidget(ctx, promptDeployments);
	const resetPromptDeployments = (ctx: ExtensionContext) => {
		promptDeployments = [];
		deploymentSequence = 0;
		refreshUI(ctx);
	};

	// ── Session start: restore primary agent state ───────────────────────
	pi.on("session_start", async (_event, ctx) => {
		resetPromptDeployments(ctx);
		currentPrimary = restorePrimaryState(ctx.sessionManager.getEntries());
		// Emit resolved default so footer/UI consumers stay in sync on fresh sessions
		pi.events.emit(PRIMARY_STATE_EVENT, { selectedName: currentPrimary });
	});

	// ── Before agent start: apply primary agent overlay ──────────────────
	pi.on("before_agent_start", async (event, ctx) => {
		if (IS_SUBAGENT_RUNTIME) return;
		resetPromptDeployments(ctx);

		// If primary is "pi", return original system prompt (no overlay)
		if (currentPrimary === SYSTEM_AGENT) return;

		const primary = findPrimaryAgent(currentPrimary);
		if (!primary) {
			if (ctx.hasUI) ctx.ui.notify(`Primary agent not found: ${currentPrimary}, falling back to pi`, "warning");
			currentPrimary = SYSTEM_AGENT;
			return;
		}

		const agentPrompt = primary.systemPrompt;
		if (!agentPrompt) return;

		const agents = discoverAgents(ctx.cwd, "both");
		const availableAgents = agents.length
			? agents.map((agent) => `- ${agent.name} (${agent.source}): ${agent.description}`).join("\n")
			: "- no agents discovered";

		return {
			systemPrompt: `${event.systemPrompt}

## Global User Instructions
Keep pi's built-in operational/tool instructions intact, but prioritize the following global behavior instructions loaded from \`${currentPrimary}\`.

${agentPrompt}

## Adaptive orchestration rules
You perform the INITIAL ROUTING ANALYSIS yourself. Do not spawn a separate analysis subagent.

Before delegating, classify the user input into the lightest valid path:
- answer-now: direct answer, explanation, or coordination response with no subagent
- builder-only: tiny, explicit implementation that does not need prior exploration or planning
- planner -> builder: clear request that still benefits from an implementation plan
- explorer -> builder: codebase discovery plus direct implementation
- requirements -> planner -> builder: request is clear enough to skip exploration
- full PDD: explore -> requirements -> plan -> build -> review
- any justified subset of the above

Phase skipping rules:
- Skip requirements for small, concrete, low-ambiguity changes.
- Skip planner only when implementation is mechanical and obvious.
- Skip reviewer when validation is intentionally manual, visual, or explicitly left to the user, or when the change is trivial and the user can verify directly.
- If you skip a phase, say why briefly.
- For actual delegated work, use the deploy_agent tool.
- Do not deploy agents by default; deploy only the minimum needed for the current prompt.
- After each deployment, summarize the result and decide the next step.
- A deployment returning its result means that subagent is closed. If you deploy again, treat it as a new deployment.

## Hard orchestration constraints
- If the request is NOT \`answer-now\`, do NOT do the substantive work yourself. Delegate the real phase work with \`deploy_agent\`.
- Keep the main session thin: routing, summarizing, relaying questions, and deciding next phase only.
- Do not perform explorer/planner/builder/reviewer work inline in the main conversation when a subagent should do it.
- If the user asks for implementation, investigation, planning, or review, prefer a subagent path instead of solving it directly in the main thread.

## Hard Engram persistence rules
- For any non-trivial request, save the user's intent with \`engram_mem_save_prompt\` before or during the first meaningful phase.
- Resolve previous PDD state from Engram artifacts before guessing the next phase.
- Every PDD phase must read relevant Engram context first when applicable and must persist its phase artifact before finishing.
- Do not end a phase without writing its artifact to Engram.
- Use topic keys exactly as specified by the PDD instructions.

## Agents available to deploy in this workspace
${availableAgents}
`,
		};
	});

	// ── Shared: open visual primary-agent palette ────────────────────────
	async function openPrimaryAgentPalette(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Visual selector requires interactive mode", "error");
			return;
		}

		const items = buildSelectorItems(currentPrimary);

		const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();

			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			container.addChild(new Text(theme.fg("accent", theme.bold("Select Primary Agent")), 1, 0));
			container.addChild(new Text(theme.fg("muted", `Active: ${getPrimaryStatusLabel(currentPrimary)}`), 1, 0));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			});
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);

			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		}, { overlay: true });

		if (result && result !== currentPrimary) {
			currentPrimary = result;
			setPrimaryAgent(pi, currentPrimary);
			const label = getPrimaryStatusLabel(currentPrimary);
			ctx.ui.notify(`Primary agent: ${label}`, "success");
		} else if (result === currentPrimary) {
			ctx.ui.notify(`Already active: ${getPrimaryStatusLabel(currentPrimary)}`, "info");
		}
	}

	// ── Ctrl+\: open visual primary-agent palette ──
	pi.registerShortcut("ctrl+\\", {
		description: "Open visual primary-agent selector palette",
		handler: openPrimaryAgentPalette,
	});

	// ── Ctrl+Tab: open visual primary-agent palette ──────────────────────
	pi.registerShortcut("ctrl+tab", {
		description: "Open visual primary-agent selector palette",
		handler: openPrimaryAgentPalette,
	});

	// ── Visual selector: palette/modal for primary agent ─────────────────
	pi.registerCommand("primary-agent", {
		description: "Open a visual palette to select the primary agent",
		handler: async (_args, ctx) => openPrimaryAgentPalette(ctx),
	});

	// ── Register deploy_agent tool (unchanged contract) ──────────────────
	pi.registerTool({
		name: "deploy_agent",
		label: "Deploy Agent",
		description:
			"Run a named agent from ~/.pi/agent/agents or the nearest .pi/agents in an isolated pi subprocess and return its result.",
		promptSnippet:
			"Deploy a named agent with isolated context. Use this for pdd-explorer, pdd-requirements, pdd-planner, pdd-builder, and pdd-reviewer after you decide the minimal flow.",
		promptGuidelines: [
			"Use deploy_agent only after you, the orchestrator, decide whether the request needs no flow, a partial flow, or the full PDD flow.",
			"Prefer the smallest valid flow. Do not deploy explorer/requirements/planner/reviewer automatically.",
		],
		parameters: DeployAgentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const scope = params.scope ?? "both";
			const agent = findAgent(ctx.cwd, params.agent, scope);
			if (!agent) {
				const available = discoverAgents(ctx.cwd, scope)
					.map((item) => item.name)
					.join(", ");
				return {
					content: [
						{
							type: "text",
							text: `Unknown agent: ${params.agent}. Available: ${available || "none"}.`,
						},
					],
					isError: true,
					details: { requestedAgent: params.agent, availableAgents: available },
				};
			}

			deploymentSequence += 1;
			const deploymentId = `${agent.name}#${deploymentSequence}`;
			const fallbackModel = getFallbackModel(agent.model);
			const deployment: DeploymentState = {
				deploymentId,
				agent: agent.name,
				source: agent.source,
				tools: agent.tools,
				model: agent.model,
				contextWindow: getContextWindow(agent.model, ctx),
				contextTokens: 0,
				status: "running",
				summary: "queued",
				turns: 0,
				usage: zeroUsage(),
				expectedArtifactTopicKey: getExpectedArtifactTopicKey(agent.name, params.task),
				persistedArtifactTopicKey: undefined,
				persistedToEngram: false,
				engramWrites: 0,
				attemptedModels: [],
				primaryModel: agent.model,
				fallbackModel,
				fallbackUsed: false,
			};
			promptDeployments.push(deployment);
			refreshUI(ctx);

			let finalText = "";
			let stopReason: string | undefined;
			let errorMessage: string | undefined;
			let stderr = "";
			let exitCode = 0;
			let interactionOutcome: AgentRunDetails["interactionOutcome"] = "completed";
			let questionPayload: AwaitingUserInputPayload | undefined;
			let userResponse: RelayUserResponse | undefined;
			let tmpPromptDir: string | null = null;
			let tmpPromptPath: string | null = null;

			const emitProgress = () => {
				onUpdate?.({
					content: [
						{
							type: "text",
							text: finalText || deployment.summary || `${deployment.agent} running...`,
						},
					],
					details: {
						deploymentId,
						agent: deployment.agent,
						source: deployment.source,
						status: deployment.status,
						summary: deployment.summary,
						tools: deployment.tools,
						model: deployment.model,
						contextWindow: deployment.contextWindow,
						usage: deployment.usage,
						exitCode,
						stopReason,
						errorMessage,
						expectedArtifactTopicKey: deployment.expectedArtifactTopicKey,
						persistedArtifactTopicKey: deployment.persistedArtifactTopicKey,
						persistedToEngram: deployment.persistedToEngram,
						engramWrites: deployment.engramWrites,
						attemptedModels: deployment.attemptedModels,
						primaryModel: deployment.primaryModel,
						fallbackModel: deployment.fallbackModel,
						fallbackUsed: deployment.fallbackUsed,
						interactionOutcome,
						awaitingUserInput: Boolean(questionPayload),
						questionPayload,
						userResponse,
					} as AgentRunDetails,
				});
			};

			const runAttempt = async (modelRef: string | undefined) => {
				let attemptFinalText = "";
				let attemptStopReason: string | undefined;
				let attemptErrorMessage: string | undefined;
				let attemptStderr = "";
				let attemptExitCode = 0;
				const modelLabel = modelRef ?? "default";
				deployment.model = modelRef;
				deployment.contextWindow = getContextWindow(modelRef, ctx);
				deployment.summary = `running with ${modelLabel}`;
				deployment.attemptedModels = [...deployment.attemptedModels, modelLabel];
				refreshUI(ctx);
				emitProgress();

				const args = ["--mode", "json", "-p", "--no-session"];
				if (modelRef) args.push("--model", modelRef);
				if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
				if (tmpPromptPath) args.push("--append-system-prompt", tmpPromptPath);
				args.push(`Task: ${params.task}`);

				const invocation = getPiInvocation(args);
				attemptExitCode = await new Promise<number>((resolve) => {
					const child = spawn(invocation.command, invocation.args, {
						cwd: params.cwd || ctx.cwd,
						env: { ...process.env, [SUBAGENT_ENV_FLAG]: "1" },
						stdio: ["ignore", "pipe", "pipe"],
						shell: false,
					});
					let stdoutBuffer = "";
					let aborted = false;

					const parseLine = (line: string) => {
						if (!line.trim()) return;
						let event: any;
						try {
							event = JSON.parse(line);
						} catch {
							return;
						}

						if (event.type === "message_end" && event.message?.role === "assistant") {
							const text = extractAssistantText(event.message);
							if (text) {
								attemptFinalText = text;
								finalText = text;
								deployment.summary = truncate(text);
							}
							deployment.turns += 1;
							deployment.usage.turns += 1;

							const usage = event.message.usage;
							if (usage) {
								deployment.usage.input += usage.input || 0;
								deployment.usage.output += usage.output || 0;
								deployment.usage.cacheRead += usage.cacheRead || 0;
								deployment.usage.cacheWrite += usage.cacheWrite || 0;
								deployment.usage.cost += usage.cost?.total || 0;
								deployment.usage.contextTokens = usage.totalTokens || deployment.usage.contextTokens;
								deployment.contextTokens = deployment.usage.contextTokens;
							}

							attemptStopReason = event.message.stopReason;
							attemptErrorMessage = event.message.errorMessage;
							stopReason = attemptStopReason;
							errorMessage = attemptErrorMessage;
							refreshUI(ctx);
							emitProgress();
						}

						if (event.type === "message_end" && event.message?.role === "toolResult") {
							const toolName = event.message.toolName;
							if (toolName === "engram_mem_save" || toolName === "engram_mem_update") {
								deployment.engramWrites += 1;
								deployment.persistedToEngram = !event.message.isError;
								if (Array.isArray(event.message.content)) {
									const text = event.message.content
										.filter((part: any) => part?.type === "text" && typeof part.text === "string")
										.map((part: any) => part.text)
										.join("\n");
									const topicMatch = text.match(/topic_key[:\s]+([^\n]+)/i);
									if (topicMatch?.[1]) deployment.persistedArtifactTopicKey = topicMatch[1].trim();
								}
								if (!deployment.persistedArtifactTopicKey) {
									deployment.persistedArtifactTopicKey = deployment.expectedArtifactTopicKey;
								}
								refreshUI(ctx);
								emitProgress();
							}
						}
					};

					child.stdout.on("data", (chunk) => {
						stdoutBuffer += chunk.toString();
						const lines = stdoutBuffer.split("\n");
						stdoutBuffer = lines.pop() || "";
						for (const line of lines) parseLine(line);
					});

					child.stderr.on("data", (chunk) => {
						attemptStderr += chunk.toString();
					});

					child.on("close", (code) => {
						if (stdoutBuffer.trim()) parseLine(stdoutBuffer);
						if (aborted) deployment.summary = "aborted";
						resolve(code ?? 0);
					});

					child.on("error", (error) => {
						attemptErrorMessage = error.message;
						resolve(1);
					});

					const abortChild = () => {
						aborted = true;
						child.kill("SIGTERM");
						setTimeout(() => {
							if (!child.killed) child.kill("SIGKILL");
						}, 3000);
					};

					if (signal?.aborted) abortChild();
					else signal?.addEventListener("abort", abortChild, { once: true });
				});

				return {
					finalText: attemptFinalText,
					stopReason: attemptStopReason,
					errorMessage: attemptErrorMessage,
					stderr: attemptStderr,
					exitCode: attemptExitCode,
				};
			};

			try {
				if (agent.systemPrompt) {
					const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
					tmpPromptDir = tmp.dir;
					tmpPromptPath = tmp.filePath;
				}

				let attempt = await runAttempt(agent.model);
				finalText = attempt.finalText;
				stopReason = attempt.stopReason;
				errorMessage = attempt.errorMessage;
				stderr = attempt.stderr;
				exitCode = attempt.exitCode;

				const shouldRetryWithFallback =
					Boolean(fallbackModel) &&
					exitCode !== 0 &&
					isLikelyModelFailure({
						exitCode,
						stopReason,
						errorMessage,
						stderr,
						finalText,
					});

				if (shouldRetryWithFallback && fallbackModel) {
					deployment.fallbackUsed = true;
					deployment.summary = `primary model failed, retrying with ${fallbackModel}`;
					refreshUI(ctx);
					emitProgress();

					attempt = await runAttempt(fallbackModel);
					finalText = attempt.finalText;
					stopReason = attempt.stopReason;
					errorMessage = attempt.errorMessage;
					stderr = attempt.stderr;
					exitCode = attempt.exitCode;
				}
			} finally {
				if (tmpPromptPath) rmSync(tmpPromptPath, { force: true });
				if (tmpPromptDir) rmSync(tmpPromptDir, { recursive: true, force: true });
			}

			questionPayload = parseAwaitingUserInputPayload(finalText);
			if (exitCode === 0 && questionPayload) {
				if (questionPayload.question) {
					deployment.summary = truncate(questionPayload.executive_summary || questionPayload.question);
					refreshUI(ctx);
					emitProgress();
					userResponse = await relayAwaitingUserInput(questionPayload, ctx);
					if (userResponse.cancelled) {
						interactionOutcome = "awaiting_user_input_cancelled";
						finalText = [
							questionPayload.executive_summary || "Subagent requires user input.",
							"User cancelled or timed out while answering the relayed question.",
						].filter(Boolean).join("\n\n");
						exitCode = 1;
						stopReason = "awaiting_user_input_cancelled";
						errorMessage = "User cancelled or timed out while answering the relayed subagent question.";
					} else {
						interactionOutcome = "awaiting_user_input_relayed";
						const responseSummary = typeof userResponse.selection === "string"
							? userResponse.selection
							: Array.isArray(userResponse.selection)
								? userResponse.selection.join(", ")
								: "answered";
						finalText = [
							questionPayload.executive_summary || "Subagent question relayed to user.",
							`User response: ${responseSummary}`,
							userResponse.comment ? `Comment: ${userResponse.comment}` : undefined,
						].filter(Boolean).join("\n\n");
					}
				} else {
					interactionOutcome = "awaiting_user_input_missing_payload";
					finalText = [
						questionPayload.executive_summary || "Subagent requested user input.",
						"The subagent returned `status: awaiting_user_input` but did not include a structured `question` payload the orchestrator can relay.",
						"Expected fields: question, optional context, optional options, allowMultiple, allowFreeform, allowComment, timeout.",
					].join("\n\n");
					exitCode = 1;
					stopReason = "awaiting_user_input_missing_payload";
					errorMessage = "Missing structured question payload for awaiting_user_input relay.";
				}
			}

			deployment.exitCode = exitCode;
			deployment.stopReason = stopReason;
			deployment.errorMessage = errorMessage || (stderr.trim() ? truncate(stderr.trim(), 180) : undefined);
			deployment.status = exitCode === 0 && stopReason !== "error" ? "done" : "error";
			deployment.summary = truncate(
				finalText || deployment.errorMessage || stderr.trim() || deployment.summary || "finished without text output",
			);
			refreshUI(ctx);
			emitProgress();

			const details: AgentRunDetails = {
				deploymentId,
				agent: deployment.agent,
				source: deployment.source,
				tools: deployment.tools,
				model: deployment.model,
				contextWindow: deployment.contextWindow,
				status: deployment.status,
				summary: deployment.summary,
				usage: deployment.usage,
				exitCode,
				stopReason,
				errorMessage: deployment.errorMessage,
				expectedArtifactTopicKey: deployment.expectedArtifactTopicKey,
				persistedArtifactTopicKey: deployment.persistedArtifactTopicKey,
				persistedToEngram: deployment.persistedToEngram,
				engramWrites: deployment.engramWrites,
				attemptedModels: deployment.attemptedModels,
				primaryModel: deployment.primaryModel,
				fallbackModel: deployment.fallbackModel,
				fallbackUsed: deployment.fallbackUsed,
				interactionOutcome,
				awaitingUserInput: Boolean(questionPayload),
				questionPayload,
				userResponse,
			};

			if (deployment.status === "error") {
				return {
					content: [
						{
							type: "text",
							text: finalText || deployment.errorMessage || stderr.trim() || `${deployment.agent} failed.`,
						},
					],
					isError: true,
					details,
				};
			}

			const successText = deployment.fallbackUsed && finalText
				? `Fallback ${deployment.primaryModel} → ${deployment.model} succeeded.\n${finalText}`
				: finalText || deployment.summary;

			return {
				content: [{ type: "text", text: successText }],
				details,
			};
		},

		renderCall(args, theme) {
			const taskPreview = truncate(args.task || "", 72);
			const scope = args.scope ?? "both";
			const text =
				theme.fg("toolTitle", theme.bold("deploy_agent ")) +
				theme.fg("accent", args.agent || "unknown") +
				theme.fg("muted", ` [${scope}]`) +
				(taskPreview ? `\n  ${theme.fg("dim", taskPreview)}` : "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AgentRunDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const percent = details.contextWindow > 0 ? (details.usage.contextTokens / details.contextWindow) * 100 : 0;
			const statusColor = details.status === "done" ? "success" : details.status === "error" ? "error" : "warning";
			const statusLine =
				theme.fg(statusColor, details.status === "done" ? "✓" : details.status === "error" ? "✗" : "⏳") +
				" " +
				theme.fg("toolTitle", theme.bold(details.deploymentId)) +
				theme.fg("muted", ` · ${details.agent} (${details.source})`);
			const usageLine =
				theme.fg("accent", formatBar(percent)) +
				theme.fg(
					"muted",
					` · ctx ${formatTokens(details.usage.contextTokens)}/${formatTokens(details.contextWindow)} · ↑${formatTokens(details.usage.input)} ↓${formatTokens(details.usage.output)} · ${details.usage.turns} turn${details.usage.turns === 1 ? "" : "s"}`,
				);
			const toolsLine = details.tools.length > 0 ? theme.fg("muted", `tools: ${details.tools.join(", ")}`) : "";
			const modelsLine = details.attemptedModels?.length
				? theme.fg(
					"muted",
					`models: ${details.attemptedModels.join(" → ")}${details.fallbackUsed ? " (fallback used)" : ""}`,
				)
				: "";
			const interactionLine = details.interactionOutcome
				? theme.fg("muted", `interaction: ${details.interactionOutcome}`)
				: "";
			const summary = result.content[0]?.type === "text" ? result.content[0].text : details.summary;
			const extra = details.errorMessage ? `\n${theme.fg("error", details.errorMessage)}` : "";
			return new Text(
				[statusLine, usageLine, toolsLine, modelsLine, interactionLine, summary, extra]
					.filter(Boolean)
					.join("\n"),
				0,
				0,
			);
		},
	});
}
