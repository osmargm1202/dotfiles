import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, type SelectItem, SelectList, Text, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

type DocKind = "spec" | "design" | "task" | "doc";

type SpecDoc = {
	path: string;
	relativePath: string;
	name: string;
	kind: DocKind;
	mtimeMs: number;
	modified: Date;
};

type Snapshot = Map<string, number>;

const EXTENSION_NAME = "spec-dis";
const MAX_SCAN_DEPTH = 8;
const MAX_SELECTOR_HEIGHT = 14;
const VIEWER_BODY_LINES = 28;
const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	".venv",
	"venv",
	"vendor",
	"dist",
	"build",
	"target",
	".cache",
	".next",
]);

function formatTimestamp(date: Date): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	} catch {
		return date.toISOString().replace("T", " ").slice(0, 16);
	}
}

function cleanTitle(text: string): string {
	return text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferKind(relativePath: string): DocKind {
	const lower = relativePath.toLowerCase();
	if (/(^|[/.\\_-])task(s)?([/.\\_-]|$)/.test(lower)) return "task";
	if (/(^|[/.\\_-])design([/.\\_-]|$)/.test(lower)) return "design";
	if (/(^|[/.\\_-])spec(s)?([/.\\_-]|$)/.test(lower)) return "spec";
	return "doc";
}

function isCandidateMarkdown(relativePath: string): boolean {
	const lower = relativePath.toLowerCase();
	if (extname(lower) !== ".md") return false;
	if (lower.startsWith("docs/superpowers/specs/")) return true;
	if (lower.startsWith("specs/")) return true;
	if (lower.startsWith("openspec/")) return true;
	if (lower.startsWith(".openspec/")) return true;
	if (lower.startsWith("sdd-orchestrator/") && /(^|[/.\\_-])(spec|specs|design|task|tasks)([/.\\_-]|$)/.test(lower)) return true;
	return /(^|[/.\\_-])(spec|specs|design|task|tasks)([/.\\_-]|$)/.test(lower);
}

function buildDocName(relativePath: string): string {
	const file = basename(relativePath, extname(relativePath));
	const parent = basename(dirname(relativePath));
	const title = cleanTitle(file) || cleanTitle(parent) || relativePath;
	return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

async function walkMarkdown(cwd: string, dir: string, depth: number, out: string[]): Promise<void> {
	if (depth > MAX_SCAN_DEPTH) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".") && entry.name !== ".openspec") {
			if (IGNORED_DIRS.has(entry.name)) continue;
		}
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (IGNORED_DIRS.has(entry.name)) continue;
			await walkMarkdown(cwd, fullPath, depth + 1, out);
			continue;
		}
		if (!entry.isFile()) continue;
		const relativePath = relative(cwd, fullPath).replace(/\\/g, "/");
		if (isCandidateMarkdown(relativePath)) out.push(fullPath);
	}
}

async function listSpecDocs(cwd: string): Promise<SpecDoc[]> {
	const paths: string[] = [];
	await walkMarkdown(cwd, cwd, 0, paths);
	const docs: SpecDoc[] = [];
	for (const path of paths) {
		try {
			const info = await stat(path);
			const relativePath = relative(cwd, path).replace(/\\/g, "/");
			docs.push({
				path,
				relativePath,
				name: buildDocName(relativePath),
				kind: inferKind(relativePath),
				mtimeMs: info.mtimeMs,
				modified: info.mtime,
			});
		} catch {
			// File disappeared between walk and stat; ignore it.
		}
	}
	return docs.sort((a, b) => b.mtimeMs - a.mtimeMs || a.relativePath.localeCompare(b.relativePath));
}

function createSnapshot(docs: SpecDoc[]): Snapshot {
	return new Map(docs.map((doc) => [doc.path, doc.mtimeMs]));
}

function changedSince(docs: SpecDoc[], baseline: Snapshot): SpecDoc[] {
	return docs.filter((doc) => (baseline.get(doc.path) ?? 0) < doc.mtimeMs);
}

export default function (pi: ExtensionAPI) {
	let baseline: Snapshot = new Map();

	pi.on("session_start", async (_event, ctx) => {
		baseline = createSnapshot(await listSpecDocs(ctx.cwd));
	});
}
