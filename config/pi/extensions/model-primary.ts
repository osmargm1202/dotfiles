import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, parse } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

const SYSTEM_AGENT = "pi";
const DEFAULT_PRIMARY_AGENT = "pdd-orgm";
const PRIMARY_STATE_ENTRY = "pdd-primary-agent";
const PRIMARY_STATE_EVENT = "pdd:primary-agent-changed";
const SUBAGENT_ENV_FLAG = "PI_PDD_SUBAGENT";
const IS_SUBAGENT_RUNTIME = process.env[SUBAGENT_ENV_FLAG] === "1";

interface PrimaryAgent {
	name: string;
	description: string;
	systemPrompt: string;
	filePath: string;
}

interface SelectorItem extends SelectItem {
	description: string;
}

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

function resolveDefaultPrimary(): string {
	const primaries = discoverPrimaryAgents();
	if (primaries.some((agent) => agent.name === DEFAULT_PRIMARY_AGENT)) return DEFAULT_PRIMARY_AGENT;
	return SYSTEM_AGENT;
}

function restorePrimaryState(entries: readonly any[]): string {
	for (let i = entries.length - 1; i >= 0; i -= 1) {
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
	return selectedName === SYSTEM_AGENT ? SYSTEM_AGENT : `primary:${selectedName}`;
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
	if (!ctx.hasUI) return null;

	try {
		return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
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
		}, { overlay: true });
	} catch (error) {
		console.error("openPrimaryPalette error:", error);
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	let currentPrimary = SYSTEM_AGENT;

	pi.on("session_start", async (_event, ctx) => {
		currentPrimary = restorePrimaryState(ctx.sessionManager.getEntries());
		pi.events.emit(PRIMARY_STATE_EVENT, { selectedName: currentPrimary });
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (IS_SUBAGENT_RUNTIME) return;
		if (currentPrimary === SYSTEM_AGENT) return;

		try {
			const primary = findPrimaryAgent(currentPrimary);
			if (!primary) {
				if (ctx.hasUI) ctx.ui.notify(`Primary agent not found: ${currentPrimary}, falling back to pi`, "warning");
				currentPrimary = SYSTEM_AGENT;
				return;
			}

			if (!primary.systemPrompt) return;
			return {
				systemPrompt: `${event.systemPrompt}

## Global User Instructions
Keep pi's built-in operational/tool instructions intact, but prioritize the following global behavior instructions loaded from \`${currentPrimary}\`.

${primary.systemPrompt}
`,
			};
		} catch (error) {
			console.error("before_agent_start error:", error);
			currentPrimary = SYSTEM_AGENT;
			return;
		}
	});

	pi.registerCommand("primary-agent", {
		description: "Open visual palette to select primary agent",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Visual selector requires interactive mode", "error");
				return;
			}

			const result = await openSelectPalette(
				ctx,
				"Select Primary Agent",
				`Active: ${getPrimaryStatusLabel(currentPrimary)}`,
				buildSelectorItems(currentPrimary),
			);

			if (result && result !== currentPrimary) {
				currentPrimary = result;
				setPrimaryAgent(pi, currentPrimary);
				ctx.ui.notify(`Primary agent: ${getPrimaryStatusLabel(currentPrimary)}`, "success");
			} else if (result === currentPrimary) {
				ctx.ui.notify(`Already active: ${getPrimaryStatusLabel(currentPrimary)}`, "info");
			}
		},
	});
}
