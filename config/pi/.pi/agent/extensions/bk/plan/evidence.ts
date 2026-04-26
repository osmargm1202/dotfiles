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
	/(?:^|[\s`'"(])((?:\.\/)?(?:(?:agents|extensions|docs|skills|themes|\.pi)\/[^\s`'"]+|settings\.json))/g;

const BLOCKED_WORDS = /\b(blocked|waiting for user|cannot proceed)\b/i;
const NEGATED_BLOCKED_WORDS =
	/\b(?:no|0|zero|not|without)\s+(?:blocked|waiting\s+for\s+user|cannot\s+proceed)\b/gi;
const FAILED_WORDS = /\bfailed\b/i;
const NEGATED_FAILED_WORDS = /\b(?:no|0|zero|not|without)\s+failed\b/i;
const ACTIVE_WORDS =
	/\b(current task|active task|in progress|started|starting|executing|working on|underway)\b/i;
const ACTIVE_TASK_CONTEXT_WORDS =
	/\b(?:current|next)\s+(?:task|todo|step|item)\b|\b(?:task|todo|step|item)\s+(?:is\s+|[:=-]\s*)?(?:current|next)\b/i;
const IMPLEMENTED_WORDS =
	/\b(implemented|added|built|created|modified|wired)\b/i;
const DONE_WORDS = /\b(done|completed|complete|passed|verified|success)\b/i;

interface SessionEntryLike {
	type?: unknown;
	timestamp?: unknown;
	message?: unknown;
	summary?: unknown;
	content?: unknown;
	details?: unknown;
	customType?: unknown;
}

interface MessageLike {
	content?: unknown;
	details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function safeToString(value: unknown): string {
	try {
		return String(value);
	} catch {
		return "";
	}
}

function textContent(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";

	return value
		.map((part) => {
			if (typeof part === "string") return part;
			if (!isRecord(part)) return "";
			if (part.type === "text") return safeToString(part.text ?? "");
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function jsonText(value: unknown): string {
	if (value === undefined || value === null) return "";
	try {
		const text = JSON.stringify(value);
		return text === undefined || text === "{}" ? "" : text;
	} catch {
		return safeToString(value);
	}
}

function combinedText(...parts: unknown[]): string {
	return parts
		.map((part) => {
			if (typeof part === "string") return part;
			return jsonText(part);
		})
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n");
}

function timestampMs(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (value instanceof Date) {
		const parsed = value.getTime();
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
}

function asMessage(value: unknown): MessageLike | undefined {
	return isRecord(value) ? value : undefined;
}

export function extractSessionSignals(entries: unknown[]): SessionSignal[] {
	const signals: SessionSignal[] = [];

	for (const entry of entries) {
		if (!isRecord(entry)) continue;
		const candidate: SessionEntryLike = entry;
		const type = typeof candidate.type === "string" ? candidate.type : "";
		const timestamp = timestampMs(candidate.timestamp);

		if (type === "message") {
			const message = asMessage(candidate.message);
			if (!message) continue;
			const body = combinedText(
				textContent(message.content),
				message.details === undefined ? "" : jsonText(message.details),
			);
			if (body) signals.push({ text: body, timestamp, source: "session" });
			continue;
		}

		if (type === "branch_summary" || type === "compaction") {
			const summary =
				typeof candidate.summary === "string" ? candidate.summary.trim() : "";
			if (summary)
				signals.push({ text: summary, timestamp, source: "session" });
			continue;
		}

		if (type === "custom" || type === "custom_message") {
			const body = combinedText(
				textContent(candidate.content),
				candidate.details === undefined ? "" : jsonText(candidate.details),
			);
			if (body) signals.push({ text: body, timestamp, source: "event" });
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
			const path = match[0];
			mentions.set(path, Math.max(signal.timestamp, mentions.get(path) ?? 0));
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
		.map((plan) => ({
			plan,
			mentioned: mentions.has(plan.path),
			mentionedAt: mentions.get(plan.path) ?? 0,
		}))
		.sort(
			(a, b) =>
				Number(b.mentioned) - Number(a.mentioned) ||
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

function titleTokens(value: string): string[] {
	return normalize(value)
		.split(" ")
		.map((token) => token.trim())
		.filter((token) => token.length > 3);
}

function titleMatches(text: string, task: PlanTask): boolean {
	const haystack = normalize(text);
	const title = normalize(task.title);
	if (title.length > 8 && haystack.includes(title)) return true;

	const tokens = titleTokens(task.title);
	if (tokens.length === 0) return false;

	const hits = tokens.filter((token) => haystack.includes(token)).length;
	return hits >= Math.max(3, Math.ceil(tokens.length * 0.75));
}

function normalizeMentionedPath(value: string): string | undefined {
	const path = value
		.trim()
		.replace(/[.;:,)]+$/g, "")
		.replace(/^\.\//, "");
	if (!path || path.startsWith("/") || path.startsWith("../")) return undefined;
	if (path.split("/").includes("..")) return undefined;
	if (path === "settings.json") return path;
	return /^(?:agents|extensions|docs|skills|themes|\.pi)\//.test(path)
		? path
		: undefined;
}

export function extractMentionedPaths(text: string): string[] {
	const paths = new Set<string>();
	for (const match of text.matchAll(PATH_PATTERN)) {
		const path = match[1] ? normalizeMentionedPath(match[1]) : undefined;
		if (path) paths.add(path);
	}
	return [...paths];
}

function taskPaths(task: PlanTask): string[] {
	return extractMentionedPaths(task.title);
}

function evidenceState(text: string): PlanTaskState | undefined {
	const textWithoutNegatedBlocked = text.replace(NEGATED_BLOCKED_WORDS, " ");
	if (BLOCKED_WORDS.test(textWithoutNegatedBlocked)) return "blocked";
	if (FAILED_WORDS.test(text) && !NEGATED_FAILED_WORDS.test(text))
		return "blocked";
	if (NEGATED_FAILED_WORDS.test(text)) return "done";
	if (DONE_WORDS.test(text)) return "done";
	if (IMPLEMENTED_WORDS.test(text)) return "implemented";
	if (ACTIVE_WORDS.test(text) || ACTIVE_TASK_CONTEXT_WORDS.test(text))
		return "active";
	return undefined;
}

function hasTaskScopeMarker(text: string): boolean {
	return (
		/^\s*(?:[-*]\s*)?\[[ xX!~/-]\]/.test(text) ||
		/^\s*(?:[-*]\s*)?(?:task|todo|step|item)\b/i.test(text) ||
		/\b(?:current|active|completed|done|next)\s+(?:task|todo|step|item)\b/i.test(
			text,
		) ||
		/\b(?:task|todo|step|item)\s*(?:\d+|[:#=-])/i.test(text)
	);
}

function exactTitleIndex(text: string, task: PlanTask): number {
	const title = normalize(task.title);
	if (title.length <= 8) return -1;
	return normalize(text).indexOf(title);
}

function stateAfterTitle(
	text: string,
	task: PlanTask,
): PlanTaskState | undefined {
	const titleIndex = exactTitleIndex(text, task);
	if (titleIndex < 0) return undefined;

	const normalizedText = normalize(text);
	const title = normalize(task.title);
	const afterTitle = normalizedText.slice(
		titleIndex + title.length,
		titleIndex + title.length + 80,
	);
	return evidenceState(afterTitle);
}

function statusTiedToTitle(text: string, task: PlanTask): boolean {
	const normalizedText = normalize(text);
	const title = normalize(task.title);
	if (title.length <= 8) return false;
	return (
		normalizedText.includes(`status ${title}`) ||
		normalizedText.includes(`${title} status`)
	);
}

function scopedEvidenceState(
	text: string,
	task: PlanTask,
): PlanTaskState | undefined {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		if (!titleMatches(line, task)) continue;

		if (hasTaskScopeMarker(line) || statusTiedToTitle(line, task)) {
			const state = evidenceState(line);
			if (state) return state;
		}

		const state = stateAfterTitle(line, task);
		if (state) return state;
	}

	return undefined;
}

function stateRank(state: PlanTaskState): number {
	switch (state) {
		case "blocked":
			return 5;
		case "done":
			return 4;
		case "implemented":
			return 3;
		case "active":
			return 2;
		case "pending":
			return 1;
	}
}

function bestEvidence(
	evidence: PlanTaskEvidence[],
): PlanTaskEvidence | undefined {
	return [...evidence].sort(
		(a, b) =>
			(b.timestamp ?? 0) - (a.timestamp ?? 0) ||
			stateRank(b.state) - stateRank(a.state),
	)[0];
}

function evidenceSummary(text: string): string {
	return text.replace(/\s+/g, " ").trim().slice(0, 160);
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
		const evidence: PlanTaskEvidence[] = task.evidence.map((item) => ({
			...item,
		}));

		for (const signal of signals) {
			if (!titleMatches(signal.text, task)) continue;
			const state = scopedEvidenceState(signal.text, task);
			if (!state) continue;

			evidence.push({
				source: signal.source,
				state,
				confidence: "high",
				summary: evidenceSummary(signal.text),
				timestamp: signal.timestamp,
			});
		}

		for (const path of taskPaths(task)) {
			const artifact = artifactByPath.get(path);
			if (!artifact?.exists) continue;

			evidence.push({
				source: "artifact",
				state: "implemented",
				confidence: "medium",
				summary: `${path} exists`,
				timestamp: artifact.mtimeMs,
				path,
			});
		}

		const best = bestEvidence(evidence);
		return { ...task, evidence, state: best?.state ?? task.state };
	});
}
