import { createHash } from "node:crypto";
import type {
	ParsedPlan,
	PlanTask,
	PlanTaskEvidence,
	PlanTaskState,
} from "./types";

const CHECKBOX_RE = /^(\s*)- \[( |x|X)\]\s+(.+)$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSING_FENCE_RE = /^ {0,3}(`+|~+) *$/;

type FenceMarker = "`" | "~";

interface FenceInfo {
	marker: FenceMarker;
	length: number;
}

function parseOpeningFence(line: string): FenceInfo | undefined {
	const fenceRun = line.match(FENCE_RE)?.[1] ?? "";
	const marker = fenceRun[0];
	if (marker !== "`" && marker !== "~") return undefined;

	return { marker, length: fenceRun.length };
}

function isClosingFence(
	line: string,
	marker: FenceMarker,
	minimumLength: number,
): boolean {
	const fenceRun = line.match(CLOSING_FENCE_RE)?.[1] ?? "";
	return fenceRun[0] === marker && fenceRun.length >= minimumLength;
}

function normalizedTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function indentationWidth(indent: string): number {
	let width = 0;
	for (const char of indent) {
		width += char === "\t" ? 4 : 1;
	}
	return width;
}

function taskId(
	planPath: string,
	line: number,
	title: string,
	section?: string,
): string {
	const normalizedSection = section ?? "";
	const hash = createHash("sha1")
		.update(planPath)
		.update("\0")
		.update(String(line))
		.update("\0")
		.update(normalizedTitle(title))
		.update("\0")
		.update(normalizedSection)
		.digest("hex");

	return `line-${line}-${hash}`;
}

function taskEvidence(
	state: PlanTaskState,
	planPath: string,
): PlanTaskEvidence {
	return {
		source: "markdown",
		state,
		confidence: "high",
		summary: state === "done" ? "markdown checked" : "markdown open",
		path: planPath,
	};
}

function stripClosingHeadingHashes(text: string): string {
	return text.replace(/\s+#+\s*$/, "").trim();
}

export function parsePlanMarkdown(
	planPath: string,
	content: string,
	mtimeMs = 0,
): ParsedPlan {
	const tasks: PlanTask[] = [];
	const headings: string[] = [];
	let fenceMarker: FenceMarker | undefined;
	let fenceLength = 0;

	const lines = content.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const rawLine = lines[index] ?? "";
		const lineNumber = index + 1;

		if (fenceMarker) {
			if (isClosingFence(rawLine, fenceMarker, fenceLength)) {
				fenceMarker = undefined;
				fenceLength = 0;
			}
			continue;
		}

		const openingFence = parseOpeningFence(rawLine);
		if (openingFence) {
			fenceMarker = openingFence.marker;
			fenceLength = openingFence.length;
			continue;
		}

		if (/^\s*>/.test(rawLine)) continue;

		const headingMatch = rawLine.match(HEADING_RE);
		const headingMarker = headingMatch?.[1] ?? "";
		const headingText = headingMatch?.[2] ?? "";
		if (headingMarker && headingText) {
			const level = headingMarker.length;
			headings.length = level - 1;
			headings[level - 1] = stripClosingHeadingHashes(headingText);
			continue;
		}

		const checkboxMatch = rawLine.match(CHECKBOX_RE);
		if (!checkboxMatch) continue;

		const indent = checkboxMatch[1] ?? "";
		const checkboxState = checkboxMatch[2] ?? "";
		const title = (checkboxMatch[3] ?? "").trim();
		const section = headings.filter(Boolean).join(" > ") || undefined;
		const state: PlanTaskState = checkboxState === " " ? "pending" : "done";
		const depth = Math.floor(indentationWidth(indent) / 2);

		tasks.push({
			id: taskId(planPath, lineNumber, title, section),
			planPath,
			line: lineNumber,
			depth,
			title,
			section,
			state,
			evidence: [taskEvidence(state, planPath)],
		});
	}

	return { path: planPath, tasks, mtimeMs };
}
