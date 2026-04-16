import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Box, Container, type SelectItem, SelectList, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
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
const GLOBAL_FALLBACK_MODEL = process.env.PI_PDD_FALLBACK_MODEL?.trim() || undefined;
const DEPLOYMENT_GRID_MAX_COLUMNS = 6;
const DEPLOYMENT_CARD_MIN_WIDTH = 24;
const DEPLOYMENT_GRID_GAP = 2;
const SUBAGENT_COMPLETION_STALL_TIMEOUT_MS = 4_000;
const SUBAGENT_FORCE_KILL_TIMEOUT_MS = 3_000;
const SUBAGENT_TRANSCRIPT_MAX_LINES = 400;
const BUILTIN_TOOL_NAMES = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

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
	instanceNumber: number;
	source: AgentSource;
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

type DeploymentTranscriptKind = "task" | "assistant" | "thinking" | "tool_call" | "tool_result" | "status" | "stderr" | "error";

interface DeploymentTranscriptEntry {
	kind: DeploymentTranscriptKind;
	title: string;
	text?: string;
	toolName?: string;
	ts: number;
}

interface AgentRunDetails {
	deploymentId: string;
	agent: string;
	instanceNumber: number;
	source: AgentSource;
	tools: string[];
	model?: string;
	contextWindow: number;
	status: DeploymentStatus;
	summary: string;
	currentActivity?: string;
	usage: UsageStats;
	exitCode: number;
	stopReason?: string;
	errorMessage?: string;
	expectedArtifactTopicKey?: string;
	persistedArtifactTopicKey?: string;
	persistedToPddMemory?: boolean;
	pddMemoryWrites?: number;
	attemptedModels?: string[];
	primaryModel?: string;
	fallbackModel?: string;
	fallbackUsed?: boolean;
	interactionOutcome?: "completed" | "awaiting_user_input_relayed" | "awaiting_user_input_missing_payload" | "awaiting_user_input_cancelled" | "awaiting_user_input_deferred";
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

interface TeamConfig {
	name: string;
	members: string[];
	source: AgentSource;
	filePath: string;
}

interface QueryTeamQuery {
	member?: string;
	agent?: string;
	question: string;
}

interface ExpandedTeamQuery {
	member: string;
	question: string;
}

interface QueryTeamResultItem {
	member: string;
	question: string;
	status: DeploymentStatus;
	exitCode: number;
	summary: string;
	fullOutput: string;
	usage: UsageStats;
	model?: string;
	source: AgentSource;
	filePath: string;
	deploymentId: string;
	stopReason?: string;
	errorMessage?: string;
	interactionOutcome?: AgentRunDetails["interactionOutcome"];
	awaitingUserInput?: boolean;
}

interface QueryTeamDetails {
	team: string;
	execution: "parallel" | "serial";
	scope: "user" | "project" | "both";
	resolvedMembers: string[];
	requestedQueries: ExpandedTeamQuery[];
	completed: number;
	failed: number;
	results: QueryTeamResultItem[];
	missingMembers: string[];
	teamSource?: AgentSource;
	teamsFilePath?: string;
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

const QueryTeamParams = Type.Object({
	team: Type.String({ description: "Team name from agents/teams.yaml" }),
	queries: Type.Array(Type.Object({
		member: Type.Optional(Type.String({ description: "Specific team member to query (e.g. 'ext-expert'). Omitting this sends the question to ALL team members — use only when truly needed." })),
		agent: Type.Optional(Type.String({ description: "Alias of member" })),
		question: Type.String({ description: "Question/task for the team member(s)" }),
	})),
	execution: Type.Optional(
		StringEnum(["parallel", "serial"] as const, {
			description: "Run all queries concurrently or sequentially. Default: parallel",
			default: "parallel",
		}),
	),
	scope: Type.Optional(
		StringEnum(["user", "project", "both"] as const, {
			description: "Team and member discovery scope. Default: both",
			default: "both",
		}),
	),
	cwd: Type.Optional(Type.String({ description: "Optional working directory for subprocess execution and project discovery" })),
	continueOnError: Type.Optional(Type.Boolean({ description: "In serial mode, continue after member failures. Default: true", default: true })),
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

function formatActivity(toolName: string, args: any): string {
	if (toolName === "bash") {
		const command = typeof args?.command === "string" ? truncate(args.command.replace(/\s+/g, " "), 72) : "bash";
		return `$ ${command}`;
	}
	if (toolName === "read" && typeof args?.path === "string") return `read ${truncate(args.path, 72)}`;
	if (toolName === "edit" && typeof args?.path === "string") return `edit ${truncate(args.path, 72)}`;
	if (toolName === "write" && typeof args?.path === "string") return `write ${truncate(args.path, 72)}`;
	return toolName;
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

function getToolShellBg(theme: any, options: { isPartial?: boolean; isError?: boolean }) {
	if (options.isPartial) return (text: string) => theme.bg("toolPendingBg", text);
	if (options.isError) return (text: string) => theme.bg("toolErrorBg", text);
	return (text: string) => theme.bg("toolSuccessBg", text);
}

function createToolShell(lines: Array<string | undefined | null>, theme: any, options: { isPartial?: boolean; isError?: boolean }) {
	const box = new Box(1, 0, getToolShellBg(theme, options));
	box.addChild(new Text(lines.filter((line): line is string => Boolean(line)).join("\n"), 0, 0));
	return box;
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

function stringifyUnknown(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") return value.trim() || undefined;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message || error.name || "Unknown error";
	return stringifyUnknown(error) || "Unknown error";
}

function extractJsonLikeErrorMessage(text: string): string | undefined {
	const keys = ["detail", "error", "message", "reason", "title", "description"];
	for (const candidate of extractJsonObjectCandidates(text)) {
		try {
			const parsed = JSON.parse(candidate) as Record<string, unknown>;
			if (!parsed || typeof parsed !== "object") continue;
			for (const key of keys) {
				const asText = stringifyUnknown(parsed[key]);
				if (asText) return asText;
			}
		} catch {
			// ignore invalid json candidates
		}
	}
	return undefined;
}

function explainSubagentFailure(errorText: string): string | undefined {
	const haystack = errorText.toLowerCase();
	if (/unsupported model|invalid model|model.*not found/.test(haystack)) {
		return "The deployed agent is configured with a model reference that the provider does not accept.";
	}
	if (/insufficient balance|billing|quota|credit|rate limit|too many requests/.test(haystack)) {
		return "The provider likely rejected the request due to account limits or throttling.";
	}
	if (/api key|authentication|unauthorized|forbidden/.test(haystack)) {
		return "The provider request failed authentication/authorization for the current credentials.";
	}
	if (/context window|token limit|maximum context/.test(haystack)) {
		return "The delegated task likely exceeded the selected model context limits.";
	}
	if (/timed out|timeout/.test(haystack)) {
		return "The delegated subprocess did not complete in time.";
	}
	return undefined;
}

function suggestSubagentFailureActions(params: {
	errorText: string;
	fallbackModel?: string;
	fallbackUsed?: boolean;
	attemptedModels?: string[];
}): string[] {
	const actions: string[] = [];
	const haystack = params.errorText.toLowerCase();

	if (/unsupported model|invalid model|model.*not found/.test(haystack)) {
		actions.push("Update the subagent's model setting to a supported provider/model pair, then retry.");
	}
	if (/insufficient balance|billing|quota|credit|rate limit|too many requests/.test(haystack)) {
		actions.push("Check provider quota/billing or wait for rate limits to reset, then rerun.");
	}
	if (/api key|authentication|unauthorized|forbidden/.test(haystack)) {
		actions.push("Verify provider credentials/environment variables for this session and rerun.");
	}
	if (/context window|token limit|maximum context/.test(haystack)) {
		actions.push("Reduce prompt/task size or switch to a model with a larger context window.");
	}
	if (!params.fallbackUsed && params.fallbackModel) {
		actions.push(`Retry with fallback model \`${params.fallbackModel}\` if the primary model remains unavailable.`);
	}
	if (params.attemptedModels && params.attemptedModels.length > 1) {
		actions.push("Inspect the chained model attempts and keep the first model that consistently succeeds.");
	}
	if (actions.length === 0) {
		actions.push("Review subagent logs/details, adjust agent config or task constraints, and retry deployment.");
	}
	return Array.from(new Set(actions));
}

function buildSubagentFailureReport(params: {
	agent: string;
	deploymentId: string;
	exitCode: number;
	stopReason?: string;
	errorMessage?: string;
	stderr?: string;
	finalText?: string;
	fallbackModel?: string;
	fallbackUsed?: boolean;
	attemptedModels?: string[];
}): string {
	const jsonError =
		extractJsonLikeErrorMessage(params.errorMessage || "") ||
		extractJsonLikeErrorMessage(params.finalText || "") ||
		extractJsonLikeErrorMessage(params.stderr || "");
	const baseError = [
		jsonError,
		params.errorMessage?.trim(),
		params.stderr?.trim(),
		params.finalText?.trim(),
		params.stopReason ? `stopReason=${params.stopReason}` : undefined,
	].find((item) => Boolean(item && item.trim()));
	const normalizedError = truncate(baseError || `exitCode=${params.exitCode}`, 500);
	const explanation = explainSubagentFailure(normalizedError);
	const actions = suggestSubagentFailureActions({
		errorText: normalizedError,
		fallbackModel: params.fallbackModel,
		fallbackUsed: params.fallbackUsed,
		attemptedModels: params.attemptedModels,
	});
	const failureState = `error (exitCode=${params.exitCode}${params.stopReason ? `, stopReason=${params.stopReason}` : ""})`;

	return [
		`Subagent: ${params.agent} (${params.deploymentId})`,
		`Failure state: ${failureState}`,
		`Error detail: ${normalizedError}`,
		explanation ? `Explanation: ${explanation}` : undefined,
		`Likely next actions:\n- ${actions.join("\n- ")}`,
	].filter(Boolean).join("\n\n");
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

function readAgentConfig(filePath: string, source: AgentSource): AgentConfig | undefined {
	try {
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
	} catch {
		return undefined;
	}
}

function mergeByName<T extends { name: string }>(
	userItems: T[],
	projectItems: T[],
	scope: "user" | "project" | "both",
): T[] {
	const merged = new Map<string, T>();
	if (scope !== "project") {
		for (const item of userItems) merged.set(item.name, item);
	}
	if (scope !== "user") {
		for (const item of projectItems) merged.set(item.name, item);
	}
	return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
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
			.map((filePath) => readAgentConfig(filePath, source))
			.filter((agent): agent is AgentConfig => Boolean(agent));
	} catch {
		return [];
	}
}

function loadAgentsRecursiveFromDir(dir: string, source: AgentSource, excludedDirNames = new Set<string>()): AgentConfig[] {
	if (!existsSync(dir)) return [];
	const agents: AgentConfig[] = [];
	const walk = (currentDir: string) => {
		let entries: string[];
		try {
			entries = readdirSync(currentDir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			let stat;
			try {
				stat = lstatSync(fullPath);
			} catch {
				continue;
			}
			if (stat.isDirectory()) {
				if (excludedDirNames.has(entry)) continue;
				walk(fullPath);
				continue;
			}
			if (!(stat.isFile() || stat.isSymbolicLink()) || !entry.endsWith(".md")) continue;
			const agent = readAgentConfig(fullPath, source);
			if (agent) agents.push(agent);
		}
	};
	walk(dir);
	return agents;
}

function discoverAgents(cwd: string, scope: "user" | "project" | "both" = "both"): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = findNearestProjectAgentsDir(cwd);
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectDir ? [] : loadAgentsFromDir(projectDir, "project");
	return mergeByName(userAgents, projectAgents, scope);
}

function discoverTeamAgents(cwd: string, scope: "user" | "project" | "both" = "both"): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = findNearestProjectAgentsDir(cwd);
	const excludeDirs = new Set(["primary"]);
	const userAgents = scope === "project" ? [] : loadAgentsRecursiveFromDir(userDir, "user", excludeDirs);
	const projectAgents = scope === "user" || !projectDir ? [] : loadAgentsRecursiveFromDir(projectDir, "project", excludeDirs);
	return mergeByName(userAgents, projectAgents, scope);
}

function findAgent(cwd: string, name: string, scope: "user" | "project" | "both"): AgentConfig | undefined {
	return discoverAgents(cwd, scope).find((agent) => agent.name === name);
}

function findTeamAgent(cwd: string, name: string, scope: "user" | "project" | "both"): AgentConfig | undefined {
	return discoverTeamAgents(cwd, scope).find((agent) => agent.name === name);
}

function findNearestProjectTeamsFile(cwd: string): string | null {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "agents", "teams.yaml");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const rawLine of raw.split("\n")) {
		const line = rawLine.replace(/	/g, "    ");
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const teamMatch = line.match(/^([^\s:#][^:#]*):\s*$/);
		if (teamMatch) {
			current = teamMatch[1].trim();
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s+-\s+(.+?)\s*$/);
		if (!itemMatch || !current) continue;
		const value = itemMatch[1].split(/\s+#/)[0]?.trim();
		if (!value) continue;
		if (!teams[current].includes(value)) teams[current].push(value);
	}
	return teams;
}

function loadTeamsFromFile(filePath: string, source: AgentSource): TeamConfig[] {
	if (!existsSync(filePath)) return [];
	try {
		const parsed = parseTeamsYaml(readFileSync(filePath, "utf8"));
		return Object.entries(parsed)
			.map(([name, members]) => ({
				name: name.trim(),
				members: members.map((member) => member.trim()).filter(Boolean),
				source,
				filePath,
			}))
			.filter((team) => Boolean(team.name));
	} catch {
		return [];
	}
}

function discoverTeams(cwd: string, scope: "user" | "project" | "both" = "both"): TeamConfig[] {
	const userFile = join(getAgentDir(), "agents", "teams.yaml");
	const projectFile = findNearestProjectTeamsFile(cwd);
	const userTeams = scope === "project" ? [] : loadTeamsFromFile(userFile, "user");
	const projectTeams = scope === "user" || !projectFile ? [] : loadTeamsFromFile(projectFile, "project");
	return mergeByName(userTeams, projectTeams, scope);
}

function findTeam(cwd: string, name: string, scope: "user" | "project" | "both"): TeamConfig | undefined {
	return discoverTeams(cwd, scope).find((team) => team.name === name);
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

async function openSelectPalette(
	ctx: ExtensionContext,
	title: string,
	subtitle: string,
	items: SelectorItem[],
): Promise<string | null> {
	if (!ctx.hasUI) {
		return null;
	}
	try {
		return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			try {
				const container = new Container();

				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
				container.addChild(new Text(theme.fg("muted", subtitle), 1, 0));

				const selectList = new SelectList(items, Math.min(items.length, 12), {
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
			} catch (innerError) {
				// If component creation fails, close with null and log
				console.error("SelectPalette component error:", innerError);
				done(null);
				return {
					render: () => [theme.fg("error", "Error creating selector")],
					invalidate: () => {},
					handleInput: () => {},
				};
			}
		}, { overlay: true });
	} catch (error) {
		console.error("openSelectPalette error:", error);
		return null;
	}
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

function previewTranscriptText(text: string, maxLines = 12, maxChars = 1600): string {
	const trimmed = text.trim();
	if (!trimmed) return "";
	const lines = trimmed.split("\n");
	const sliced = lines.slice(0, maxLines).join("\n");
	const clipped = sliced.length > maxChars ? `${sliced.slice(0, maxChars - 1)}…` : sliced;
	return lines.length > maxLines ? `${clipped}\n… ${lines.length - maxLines} more lines` : clipped;
}

function extractToolResultText(message: any): string {
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
		const persistenceLabel = deployment.persistedToPddMemory
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
				ctx.ui.theme.fg(deployment.persistedToPddMemory ? "success" : "warning", padCell(` ${persistenceLabel}`, innerWidth)) +
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
	let deploymentCountsByAgent = new Map<string, number>();
	let deploymentTranscripts = new Map<string, DeploymentTranscriptEntry[]>();

	const snapshotTranscripts = (): Record<string, DeploymentTranscriptEntry[]> => Object.fromEntries(
		Array.from(deploymentTranscripts.entries()).map(([deploymentId, entries]) => [deploymentId, entries.map((entry) => ({ ...entry }))]),
	);

	const refreshUI = (_ctx: ExtensionContext) => {
		pi.events.emit("subagents:deployments-changed", {
			deployments: promptDeployments.map((deployment) => ({ ...deployment })),
			transcripts: snapshotTranscripts(),
		});
	};
	const resetPromptDeployments = (ctx: ExtensionContext) => {
		promptDeployments = [];
		deploymentCountsByAgent = new Map<string, number>();
		deploymentTranscripts = new Map<string, string[]>();
		refreshUI(ctx);
	};

	const appendTranscript = (
		ctx: ExtensionContext,
		deploymentId: string,
		...entries: Array<DeploymentTranscriptEntry | string | undefined | null>
	) => {
		const items = deploymentTranscripts.get(deploymentId) ?? [];
		for (const entry of entries) {
			if (!entry) continue;
			if (typeof entry === "string") {
				const text = entry.trim();
				if (!text) continue;
				items.push({ kind: "status", title: text, ts: Date.now() });
				continue;
			}
			items.push({ ...entry, ts: entry.ts || Date.now() });
		}
		deploymentTranscripts.set(deploymentId, items.slice(-SUBAGENT_TRANSCRIPT_MAX_LINES));
		refreshUI(ctx);
	};

	const nextDeploymentNumber = (agentName: string): number => {
		const next = (deploymentCountsByAgent.get(agentName) ?? 0) + 1;
		deploymentCountsByAgent.set(agentName, next);
		return next;
	};

	pi.on("session_start", async (_event, ctx) => {
		resetPromptDeployments(ctx);
	});

	function buildDeploymentState(agent: AgentConfig, deploymentId: string, task: string, instanceNumber: number): DeploymentState {
		const fallbackModel = getFallbackModel(agent.model);
		return {
			deploymentId,
			agent: agent.name,
			instanceNumber,
			source: agent.source,
			tools: agent.tools,
			model: agent.model,
			contextWindow: 0,
			contextTokens: 0,
			status: "running",
			summary: "queued",
			currentActivity: truncate(task, 72),
			turns: 0,
			usage: zeroUsage(),
			expectedArtifactTopicKey: getExpectedArtifactTopicKey(agent.name, task),
			persistedArtifactTopicKey: undefined,
			persistedToPddMemory: false,
			pddMemoryWrites: 0,
			attemptedModels: [],
			primaryModel: agent.model,
			fallbackModel,
			fallbackUsed: false,
		};
	}

	async function runAgentTask(params: {
		agent: AgentConfig;
		task: string;
		deploymentId: string;
		instanceNumber: number;
		cwd: string;
		signal?: AbortSignal;
		onUpdate?: (payload: { text: string; details: AgentRunDetails }) => void;
		ctx: ExtensionContext;
		relayUserInput: boolean;
	}): Promise<{ text: string; details: AgentRunDetails; isError: boolean }> {
		const deployment = buildDeploymentState(params.agent, params.deploymentId, params.task, params.instanceNumber);
		deployment.contextWindow = getContextWindow(params.agent.model, params.ctx);
		promptDeployments.push(deployment);
		appendTranscript(
			params.ctx,
			deployment.deploymentId,
			{ kind: "task", title: `Task · ${deployment.agent}`, text: params.task, ts: Date.now() },
			{ kind: "status", title: `Deploy ${deployment.deploymentId} · ${deployment.source}`, text: `tools: ${deployment.tools.join(", ") || "none"}`, ts: Date.now() },
		);

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
			const details: AgentRunDetails = {
				deploymentId: deployment.deploymentId,
				agent: deployment.agent,
				instanceNumber: deployment.instanceNumber,
				source: deployment.source,
				tools: deployment.tools,
				model: deployment.model,
				contextWindow: deployment.contextWindow,
				status: deployment.status,
				summary: deployment.summary,
				currentActivity: deployment.currentActivity,
				usage: deployment.usage,
				exitCode,
				stopReason,
				errorMessage,
				expectedArtifactTopicKey: deployment.expectedArtifactTopicKey,
				persistedArtifactTopicKey: deployment.persistedArtifactTopicKey,
				persistedToPddMemory: deployment.persistedToPddMemory,
				pddMemoryWrites: deployment.pddMemoryWrites,
				attemptedModels: deployment.attemptedModels,
				primaryModel: deployment.primaryModel,
				fallbackModel: deployment.fallbackModel,
				fallbackUsed: deployment.fallbackUsed,
				interactionOutcome,
				awaitingUserInput: Boolean(questionPayload),
				questionPayload,
				userResponse,
			};
			try {
				params.onUpdate?.({
					text: finalText || deployment.summary || `${deployment.agent} running...`,
					details,
				});
			} catch (progressError) {
				deployment.summary = truncate(`progress update failed: ${getErrorMessage(progressError)}`);
			}
		};

		const runAttempt = async (modelRef: string | undefined) => {
			let attemptFinalText = "";
			let attemptStopReason: string | undefined;
			let attemptErrorMessage: string | undefined;
			let attemptStderr = "";
			let attemptExitCode = 0;
			let lastAssistantPreview = "";
			const modelLabel = modelRef ?? "default";
			deployment.model = modelRef;
			deployment.contextWindow = getContextWindow(modelRef, params.ctx);
			deployment.summary = `running with ${modelLabel}`;
			deployment.currentActivity = `thinking with ${modelLabel}`;
			deployment.attemptedModels = [...deployment.attemptedModels, modelLabel];
			appendTranscript(
				params.ctx,
				deployment.deploymentId,
				{ kind: "status", title: `Model ${modelLabel}`, text: `cwd: ${params.cwd}`, ts: Date.now() },
			);
			emitProgress();

			const args = ["--mode", "json", "-p", "--no-session"];
			if (modelRef) args.push("--model", modelRef);
			const builtinTools = params.agent.tools.filter((tool) => BUILTIN_TOOL_NAMES.has(tool));
			if (builtinTools.length > 0) args.push("--tools", builtinTools.join(","));
			if (tmpPromptPath) args.push("--append-system-prompt", tmpPromptPath);
			args.push(`Task: ${params.task}`);

			const invocation = getPiInvocation(args);
			attemptExitCode = await new Promise<number>((resolve) => {
				const child = spawn(invocation.command, invocation.args, {
					cwd: params.cwd,
					env: { ...process.env, [SUBAGENT_ENV_FLAG]: "1" },
					stdio: ["ignore", "pipe", "pipe"],
					shell: false,
				});
				let stdoutBuffer = "";
				let aborted = false;
				let settled = false;
				let closeWatchdog: NodeJS.Timeout | undefined;
				let completionWatchdog: NodeJS.Timeout | undefined;
				let forceKillWatchdog: NodeJS.Timeout | undefined;
				let completionEventSeen = false;
				let completionTerminationTriggered = false;

				const clearWatchdogs = () => {
					if (closeWatchdog) clearTimeout(closeWatchdog);
					if (completionWatchdog) clearTimeout(completionWatchdog);
					if (forceKillWatchdog) clearTimeout(forceKillWatchdog);
					closeWatchdog = undefined;
					completionWatchdog = undefined;
					forceKillWatchdog = undefined;
				};

				const resolveExitCode = (code: number | null | undefined): number => {
					if (typeof code === "number") return code;
					if (aborted) return 1;
					if (completionEventSeen && !attemptErrorMessage) return 0;
					return 1;
				};

				const armCompletionWatchdog = () => {
					if (!completionEventSeen || settled || aborted) return;
					if (completionWatchdog) clearTimeout(completionWatchdog);
					completionWatchdog = setTimeout(() => {
						if (settled || aborted) return;
						completionTerminationTriggered = true;
						deployment.summary = truncate(`${deployment.summary || "final response received"} (forcing completion)`);
						refreshUI(params.ctx);
						emitProgress();
						child.kill("SIGTERM");
						forceKillWatchdog = setTimeout(() => {
							if (!settled) child.kill("SIGKILL");
						}, SUBAGENT_FORCE_KILL_TIMEOUT_MS);
						forceKillWatchdog.unref?.();
					}, SUBAGENT_COMPLETION_STALL_TIMEOUT_MS);
					completionWatchdog.unref?.();
				};

				const parseLine = (line: string) => {
					if (!line.trim()) return;
					let event: any;
					try {
						event = JSON.parse(line);
					} catch {
						return;
					}

					if (event.type === "message_start" && event.message?.role === "assistant") {
						deployment.currentActivity = "thinking...";
						appendTranscript(params.ctx, deployment.deploymentId, { kind: "thinking", title: "Assistant thinking", ts: Date.now() });
						emitProgress();
					}

					if (event.type === "message_update" && deployment.status === "running") {
						deployment.currentActivity = "thinking...";
						const preview = extractAssistantText(event.message);
						if (preview) {
							const clipped = previewTranscriptText(preview, 6, 700);
							if (clipped && clipped !== lastAssistantPreview) {
								lastAssistantPreview = clipped;
								appendTranscript(params.ctx, deployment.deploymentId, {
									kind: "thinking",
									title: "Assistant update",
									text: clipped,
									ts: Date.now(),
								});
							}
						}
						refreshUI(params.ctx);
						emitProgress();
					}

					if (event.type === "tool_execution_start") {
						deployment.currentActivity = formatActivity(event.toolName, event.args);
						appendTranscript(params.ctx, deployment.deploymentId, {
							kind: "tool_call",
							title: `Tool · ${event.toolName}`,
							text: previewTranscriptText(JSON.stringify(event.args ?? {}, null, 2), 10, 1000),
							toolName: event.toolName,
							ts: Date.now(),
						});
						emitProgress();
					}

					if (event.type === "message_end" && event.message?.role === "assistant") {
						const text = extractAssistantText(event.message);
						if (text) {
							attemptFinalText = text;
							finalText = text;
							deployment.summary = truncate(text);
							deployment.currentActivity = "final response";
							appendTranscript(params.ctx, deployment.deploymentId, {
								kind: "assistant",
								title: "Assistant",
								text: previewTranscriptText(text, 18, 2200),
								ts: Date.now(),
							});
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
						refreshUI(params.ctx);
						emitProgress();
					}

					if (event.type === "agent_end") {
						const messages = Array.isArray(event.messages) ? event.messages : [];
						const lastAssistant = [...messages].reverse().find((message: any) => message?.role === "assistant");
						const text = extractAssistantText(lastAssistant);
						if (text) {
							attemptFinalText = text;
							finalText = text;
							deployment.summary = truncate(text);
							deployment.currentActivity = "final response";
						}
						if (lastAssistant?.usage) {
							deployment.usage.contextTokens = lastAssistant.usage.totalTokens || deployment.usage.contextTokens;
							deployment.contextTokens = deployment.usage.contextTokens;
						}
						attemptStopReason = lastAssistant?.stopReason ?? attemptStopReason;
						attemptErrorMessage = lastAssistant?.errorMessage ?? attemptErrorMessage;
						stopReason = attemptStopReason;
						errorMessage = attemptErrorMessage;
						completionEventSeen = !attemptErrorMessage && attemptStopReason !== "error";
						appendTranscript(params.ctx, deployment.deploymentId, {
							kind: "status",
							title: `Agent end · stopReason=${attemptStopReason ?? "unknown"}`,
							ts: Date.now(),
						});
						refreshUI(params.ctx);
						emitProgress();
						if (completionEventSeen) armCompletionWatchdog();
					}

					if (event.type === "tool_execution_end" && deployment.status === "running") {
						deployment.currentActivity = `finished ${event.toolName}`;
						appendTranscript(params.ctx, deployment.deploymentId, {
							kind: "status",
							title: `Tool finished · ${event.toolName}`,
							ts: Date.now(),
						});
						emitProgress();
					}

					if (event.type === "message_end" && event.message?.role === "toolResult") {
						const toolName = event.message.toolName;
						const toolText = extractToolResultText(event.message);
						appendTranscript(params.ctx, deployment.deploymentId, {
							kind: event.message.isError ? "error" : "tool_result",
							title: `Result · ${toolName}`,
							text: toolText ? previewTranscriptText(toolText, 14, 1800) : undefined,
							toolName,
							ts: Date.now(),
						});
						if (
							toolName === "memory_save" ||
							toolName === "memory_update" ||
							toolName === "memory_session_summary" ||
							toolName === "memory_summary_end" ||
							toolName === "engram_mem_save" ||
							toolName === "engram_mem_update" ||
							toolName === "engram_mem_session_summary"
						) {
							deployment.pddMemoryWrites += 1;
							deployment.persistedToPddMemory = !event.message.isError;
							if (Array.isArray(event.message.content)) {
								const contentText = event.message.content
									.filter((part: any) => part?.type === "text" && typeof part.text === "string")
									.map((part: any) => part.text)
									.join("\n");
								const topicMatch = contentText.match(/topic_key[:\s]+([^\n]+)/i);
								if (topicMatch?.[1]) deployment.persistedArtifactTopicKey = topicMatch[1].trim();
							}
							if (!deployment.persistedArtifactTopicKey) {
								deployment.persistedArtifactTopicKey = deployment.expectedArtifactTopicKey;
							}
							refreshUI(params.ctx);
							emitProgress();
						}
					}
				};

				const flushStdoutBuffer = () => {
					if (stdoutBuffer.trim()) parseLine(stdoutBuffer);
					stdoutBuffer = "";
				};

				const abortChild = () => {
					aborted = true;
					child.kill("SIGTERM");
					setTimeout(() => {
						if (!child.killed) child.kill("SIGKILL");
					}, SUBAGENT_FORCE_KILL_TIMEOUT_MS).unref?.();
				};

				const finalize = (code: number) => {
					if (settled) return;
					settled = true;
					clearWatchdogs();
					params.signal?.removeEventListener("abort", abortChild);
					flushStdoutBuffer();
					if (aborted) {
						deployment.summary = "aborted";
						deployment.currentActivity = "aborted";
					}
					if (completionTerminationTriggered && !aborted && code === 0) {
						deployment.summary = truncate(attemptFinalText || deployment.summary || "completed");
					}
					resolve(code);
				};

				child.stdout.on("data", (chunk) => {
					stdoutBuffer += chunk.toString();
					const lines = stdoutBuffer.split("\n");
					stdoutBuffer = lines.pop() || "";
					for (const line of lines) parseLine(line);
					if (completionEventSeen) armCompletionWatchdog();
				});

				child.stderr.on("data", (chunk) => {
					attemptStderr += chunk.toString();
					appendTranscript(params.ctx, deployment.deploymentId, {
						kind: "stderr",
						title: "stderr",
						text: previewTranscriptText(chunk.toString(), 10, 1200),
						ts: Date.now(),
					});
					if (completionEventSeen) armCompletionWatchdog();
				});

				child.once("close", (code) => {
					finalize(resolveExitCode(code));
				});

				child.once("exit", (code) => {
					closeWatchdog = setTimeout(() => finalize(resolveExitCode(code)), 1_000);
					closeWatchdog.unref?.();
				});

				child.once("error", (error) => {
					attemptErrorMessage = error.message;
					appendTranscript(params.ctx, deployment.deploymentId, {
						kind: "error",
						title: "Spawn error",
						text: error.message,
						ts: Date.now(),
					});
					finalize(1);
				});

				if (params.signal?.aborted) abortChild();
				else params.signal?.addEventListener("abort", abortChild, { once: true });
			});

			appendTranscript(params.ctx, deployment.deploymentId, {
				kind: "status",
				title: `Attempt exit ${attemptExitCode}`,
				ts: Date.now(),
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
			try {
				if (params.agent.systemPrompt) {
					const tmp = writePromptToTempFile(params.agent.name, params.agent.systemPrompt);
					tmpPromptDir = tmp.dir;
					tmpPromptPath = tmp.filePath;
				}
				let attempt = await runAttempt(params.agent.model);
				finalText = attempt.finalText;
				stopReason = attempt.stopReason;
				errorMessage = attempt.errorMessage;
				stderr = attempt.stderr;
				exitCode = attempt.exitCode;

				const shouldRetryWithFallback =
					Boolean(deployment.fallbackModel) &&
					exitCode !== 0 &&
					isLikelyModelFailure({ exitCode, stopReason, errorMessage, stderr, finalText });

				if (shouldRetryWithFallback && deployment.fallbackModel) {
					deployment.fallbackUsed = true;
					deployment.summary = `primary model failed, retrying with ${deployment.fallbackModel}`;
					refreshUI(params.ctx);
					emitProgress();
					attempt = await runAttempt(deployment.fallbackModel);
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
				if (!params.relayUserInput) {
					interactionOutcome = "awaiting_user_input_deferred";
					finalText = [
						questionPayload.executive_summary || `Subagent ${params.agent.name} requested user input.`,
						"Parallel team execution cannot relay interactive questions safely. Re-run this member in serial mode or ask it directly.",
					].join("\n\n");
					exitCode = 1;
					stopReason = "awaiting_user_input_deferred";
					errorMessage = "Subagent requested user input during non-interactive team execution.";
				} else if (questionPayload.question) {
					deployment.summary = truncate(questionPayload.executive_summary || questionPayload.question);
					refreshUI(params.ctx);
					emitProgress();
					userResponse = await relayAwaitingUserInput(questionPayload, params.ctx);
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
		} catch (error) {
			exitCode = 1;
			stopReason = stopReason || "orchestrator_exception";
			errorMessage = getErrorMessage(error);
			if (!stderr.trim()) stderr = errorMessage;
		}

		deployment.exitCode = exitCode;
		deployment.stopReason = stopReason;
		deployment.errorMessage = errorMessage || (stderr.trim() ? truncate(stderr.trim(), 180) : undefined);
		deployment.status = exitCode === 0 && stopReason !== "error" ? "done" : "error";
		deployment.currentActivity = deployment.status === "done" ? "completed" : "failed";

		const failureReport = deployment.status === "error"
			? buildSubagentFailureReport({
				agent: deployment.agent,
				deploymentId: deployment.deploymentId,
				exitCode,
				stopReason,
				errorMessage: deployment.errorMessage,
				stderr,
				finalText,
				fallbackModel: deployment.fallbackModel,
				fallbackUsed: deployment.fallbackUsed,
				attemptedModels: deployment.attemptedModels,
			})
			: undefined;
		if (failureReport) finalText = failureReport;
		deployment.summary = truncate(
			deployment.status === "error"
				? deployment.errorMessage || stderr.trim() || "subagent failed"
				: finalText || deployment.summary || "finished without text output",
		);
		appendTranscript(
			params.ctx,
			deployment.deploymentId,
			{
				kind: deployment.status === "error" ? "error" : "status",
				title: `Status · ${deployment.status}`,
				text: [stopReason ? `stop reason: ${stopReason}` : undefined, deployment.errorMessage ? `error: ${deployment.errorMessage}` : undefined].filter(Boolean).join("\n") || undefined,
				ts: Date.now(),
			},
		);
		refreshUI(params.ctx);
		emitProgress();

		const details: AgentRunDetails = {
			deploymentId: deployment.deploymentId,
			agent: deployment.agent,
			instanceNumber: deployment.instanceNumber,
			source: deployment.source,
			tools: deployment.tools,
			model: deployment.model,
			contextWindow: deployment.contextWindow,
			status: deployment.status,
			summary: deployment.summary,
			currentActivity: deployment.currentActivity,
			usage: deployment.usage,
			exitCode,
			stopReason,
			errorMessage: deployment.errorMessage,
			expectedArtifactTopicKey: deployment.expectedArtifactTopicKey,
			persistedArtifactTopicKey: deployment.persistedArtifactTopicKey,
			persistedToPddMemory: deployment.persistedToPddMemory,
			pddMemoryWrites: deployment.pddMemoryWrites,
			attemptedModels: deployment.attemptedModels,
			primaryModel: deployment.primaryModel,
			fallbackModel: deployment.fallbackModel,
			fallbackUsed: deployment.fallbackUsed,
			interactionOutcome,
			awaitingUserInput: Boolean(questionPayload),
			questionPayload,
			userResponse,
		};

		const outputText = deployment.status === "error"
			? failureReport || finalText || deployment.errorMessage || stderr.trim() || `${deployment.agent} failed.`
			: deployment.fallbackUsed && finalText
				? `Fallback ${deployment.primaryModel} → ${deployment.model} succeeded.
${finalText}`
				: finalText || deployment.summary;
		return { text: outputText, details, isError: deployment.status === "error" };
	}

	function emitQueryTeamProgress(onUpdate: any, details: QueryTeamDetails) {
		try {
			onUpdate?.({
				content: [{
					type: "text",
					text: `team ${details.team}: ${details.completed}/${details.requestedQueries.length} completed, ${details.failed} failed`,
				}],
				details,
			});
		} catch {
			// noop
		}
	}

	pi.registerTool({
		name: "query_team",
		label: "Query Team",
		description: "Query members of a team defined in agents/teams.yaml using parallel or serial execution.",
		promptSnippet: "Query a team of agents defined in agents/teams.yaml. Use parallel for research fan-out and serial when interaction or deterministic ordering matters.",
		promptGuidelines: [
			"Use query_team for research/consultation across a named team, not for persistent PDD phase delegation.",
			"Use execution=parallel for independent research questions and fan-out.",
			"Use execution=serial when a member may need user interaction or when stable ordering matters.",
		],
		parameters: QueryTeamParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const scope = params.scope ?? "both";
			const execution = params.execution ?? "parallel";
			const continueOnError = params.continueOnError ?? true;
			const runtimeCwd = params.cwd || ctx.cwd;
			const team = findTeam(runtimeCwd, params.team, scope);
			if (!team) {
				const availableTeams = discoverTeams(runtimeCwd, scope).map((item) => item.name).join(", ");
				return {
					content: [{ type: "text", text: `Unknown team: ${params.team}. Available teams: ${availableTeams || "none"}.` }],
					isError: true,
					details: { requestedTeam: params.team, availableTeams },
				};
			}

			const requestedQueries: ExpandedTeamQuery[] = [];
			for (const query of params.queries as QueryTeamQuery[]) {
				const requestedMember = query.member ?? query.agent;
				if (requestedMember) {
					if (!team.members.includes(requestedMember)) {
						return {
							content: [{ type: "text", text: `Member ${requestedMember} is not part of team ${team.name}. Members: ${team.members.join(", ")}.` }],
							isError: true,
							details: { team: team.name, invalidMember: requestedMember, teamMembers: team.members },
						};
					}
					requestedQueries.push({ member: requestedMember, question: query.question });
					continue;
				}
				for (const member of team.members) requestedQueries.push({ member, question: query.question });
			}

			const agentCatalog = new Map(discoverTeamAgents(runtimeCwd, scope).map((agent) => [agent.name, agent]));
			const missingMembers = team.members.filter((member) => !agentCatalog.has(member));
			if (missingMembers.length > 0) {
				return {
					content: [{
						type: "text",
						text: `Team ${team.name} references unresolved members: ${missingMembers.join(", ")}. Teams file: ${team.filePath}.`,
					}],
					isError: true,
					details: { team: team.name, missingMembers, teamsFilePath: team.filePath },
				};
			}

			const details: QueryTeamDetails = {
				team: team.name,
				execution,
				scope,
				resolvedMembers: team.members,
				requestedQueries,
				completed: 0,
				failed: 0,
				results: [],
				missingMembers: [],
				teamSource: team.source,
				teamsFilePath: team.filePath,
			};
			emitQueryTeamProgress(onUpdate, details);

			const runOne = async (query: ExpandedTeamQuery, index: number): Promise<QueryTeamResultItem> => {
				const memberAgent = agentCatalog.get(query.member)!;
				const instanceNumber = nextDeploymentNumber(memberAgent.name);
				const run = await runAgentTask({
					agent: memberAgent,
					task: query.question,
					deploymentId: `${memberAgent.name}#${instanceNumber}`,
					instanceNumber,
					cwd: runtimeCwd,
					signal,
					onUpdate: () => emitQueryTeamProgress(onUpdate, details),
					ctx,
					relayUserInput: execution === "serial",
				});
				return {
					member: memberAgent.name,
					question: query.question,
					status: run.details.status,
					exitCode: run.details.exitCode,
					summary: run.details.summary,
					fullOutput: run.text,
					usage: run.details.usage,
					model: run.details.model,
					source: memberAgent.source,
					filePath: memberAgent.filePath,
					deploymentId: run.details.deploymentId,
					stopReason: run.details.stopReason,
					errorMessage: run.details.errorMessage,
					interactionOutcome: run.details.interactionOutcome,
					awaitingUserInput: run.details.awaitingUserInput,
				};
			};

			const acceptResult = (result: QueryTeamResultItem) => {
				details.results.push(result);
				details.completed += 1;
				if (result.status === "error") details.failed += 1;
				emitQueryTeamProgress(onUpdate, details);
			};

			if (execution === "parallel") {
				const settled = await Promise.allSettled(requestedQueries.map((query, index) => runOne(query, index)));
				for (let i = 0; i < settled.length; i += 1) {
					const settledResult = settled[i];
					if (settledResult.status === "fulfilled") {
						acceptResult(settledResult.value);
						continue;
					}
					const query = requestedQueries[i];
					acceptResult({
						member: query.member,
						question: query.question,
						status: "error",
						exitCode: 1,
						summary: truncate(getErrorMessage(settledResult.reason)),
						fullOutput: getErrorMessage(settledResult.reason),
						usage: zeroUsage(),
						model: agentCatalog.get(query.member)?.model,
						source: agentCatalog.get(query.member)?.source ?? team.source,
						filePath: agentCatalog.get(query.member)?.filePath ?? team.filePath,
						deploymentId: `${team.name}/${query.member}#${i + 1}`,
						errorMessage: getErrorMessage(settledResult.reason),
					});
				}
			} else {
				for (let i = 0; i < requestedQueries.length; i += 1) {
					const query = requestedQueries[i];
					try {
						acceptResult(await runOne(query, i));
					} catch (error) {
						acceptResult({
							member: query.member,
							question: query.question,
							status: "error",
							exitCode: 1,
							summary: truncate(getErrorMessage(error)),
							fullOutput: getErrorMessage(error),
							usage: zeroUsage(),
							model: agentCatalog.get(query.member)?.model,
							source: agentCatalog.get(query.member)?.source ?? team.source,
							filePath: agentCatalog.get(query.member)?.filePath ?? team.filePath,
							deploymentId: `${team.name}/${query.member}#${i + 1}`,
							errorMessage: getErrorMessage(error),
						});
					}
					if (!continueOnError && details.failed > 0) break;
				}
			}

			const statusLine = `team ${team.name} (${execution}) — ${details.completed} completed, ${details.failed} failed`;
			const resultLines = details.results.map((result) => {
				const icon = result.status === "done" ? "✓" : "✗";
				return `${icon} ${result.member}: ${result.summary}`;
			});
			return {
				content: [{ type: "text", text: [statusLine, ...resultLines].join("\n") }],
				isError: details.results.length === 0 || details.failed === details.results.length,
				details,
			};
		},

		renderCall(args, theme) {
			const execution = args.execution ?? "parallel";
			const queries = (args.queries || []) as QueryTeamQuery[];
			return new Text(
				theme.fg("toolTitle", theme.bold("query_team ")) +
				theme.fg("accent", args.team || "unknown") +
				theme.fg("muted", ` [${execution}]`) +
				theme.fg("dim", ` · ${queries.length} quer${queries.length === 1 ? "y" : "ies"}`),
				0,
				0,
			);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QueryTeamDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}
			const header =
				theme.fg(result.isError ? "error" : "success", result.isError ? "✗" : "✓") +
				" " +
				theme.fg("toolTitle", theme.bold(`team ${details.team}`)) +
				theme.fg("muted", ` · ${details.execution} · ${details.completed}/${details.requestedQueries.length} completed · ${details.failed} failed`);
			const meta = theme.fg("muted", `resolved: ${details.resolvedMembers.join(", ")} · teams: ${details.teamsFilePath ?? "n/a"}`);
			const members = details.results.map((item) => `${item.status === "done" ? "✓" : "✗"} ${item.member} · ${item.summary}`).join("\n");
			return new Text([header, meta, members || "(no results)"].join("\n"), 0, 0);
		},
	});

	// ── Register deploy_agent tool (unchanged contract) ──────────────────
	pi.registerTool({
		name: "deploy_agent",
		renderShell: "self",
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
				const available = discoverAgents(ctx.cwd, scope).map((item) => item.name).join(", ");
				return {
					content: [{ type: "text", text: `Unknown agent: ${params.agent}. Available: ${available || "none"}.` }],
					isError: true,
					details: { requestedAgent: params.agent, availableAgents: available },
				};
			}
			const instanceNumber = nextDeploymentNumber(agent.name);
			const run = await runAgentTask({
				agent,
				task: params.task,
				deploymentId: `${agent.name}#${instanceNumber}`,
				instanceNumber,
				cwd: params.cwd || ctx.cwd,
				signal,
				onUpdate: onUpdate ? ({ text, details }) => onUpdate({ content: [{ type: "text", text }], details }) : undefined,
				ctx,
				relayUserInput: true,
			});
			return {
				content: [{ type: "text", text: run.text }],
				isError: run.isError,
				details: run.details,
			};
		},

		renderCall(args, theme, context) {
			if (context.state.deployAgentHasResult) return new Container();
			const taskPreview = truncate(args.task || "", 72);
			const scope = args.scope ?? "both";
			const header =
				theme.fg("toolTitle", theme.bold("deploy_agent ")) +
				theme.fg("accent", args.agent || "unknown") +
				theme.fg("muted", ` [${scope}]`);
			const taskLine = taskPreview ? `  ${theme.fg("dim", taskPreview)}` : undefined;
			return createToolShell([header, taskLine], theme, {
				isPartial: context.isPartial,
				isError: context.isError,
			});
		},

		renderResult(result, options, theme, context) {
			context.state.deployAgentHasResult = true;
			const taskPreview = truncate(context.args.task || "", 72);
			const scope = context.args.scope ?? "both";
			const header =
				theme.fg("toolTitle", theme.bold("deploy_agent ")) +
				theme.fg("accent", context.args.agent || "unknown") +
				theme.fg("muted", ` [${scope}]`);
			const taskLine = taskPreview ? `  ${theme.fg("dim", taskPreview)}` : undefined;
			const details = result.details as AgentRunDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return createToolShell([header, taskLine, text?.type === "text" ? text.text : "(no output)"], theme, {
					isPartial: options.isPartial,
					isError: result.isError,
				});
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
				theme.fg("muted", ` · ctx ${formatTokens(details.usage.contextTokens)}/${formatTokens(details.contextWindow)} · ↑${formatTokens(details.usage.input)} ↓${formatTokens(details.usage.output)} · ${details.usage.turns} turn${details.usage.turns === 1 ? "" : "s"}`);
			const toolsLine = details.tools.length > 0 ? theme.fg("muted", `tools: ${details.tools.join(", ")}`) : "";
			const modelsLine = details.attemptedModels?.length
				? theme.fg("muted", `models: ${details.attemptedModels.join(" → ")}${details.fallbackUsed ? " (fallback used)" : ""}`)
				: "";
			const interactionLine = details.interactionOutcome ? theme.fg("muted", `interaction: ${details.interactionOutcome}`) : "";
			const activityLine = details.currentActivity ? theme.fg("muted", `activity: ${details.currentActivity}`) : "";
			const summary = result.content[0]?.type === "text" ? result.content[0].text : details.summary;
			return createToolShell([
				header,
				taskLine,
				statusLine,
				usageLine,
				toolsLine,
				modelsLine,
				interactionLine,
				activityLine,
				summary,
				details.errorMessage ? theme.fg("error", details.errorMessage) : "",
			], theme, {
				isPartial: options.isPartial,
				isError: result.isError,
			});
		},
	});
}
