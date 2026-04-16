/**
 * agent-selector.ts
 *
 * Extension for selecting a specific agent and assigning one of the
 * configured models from the agents/ tree.
 */

import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";

// ─── Types ──────────────────────────────────────────────────────────────────
type AgentSource = "user" | "project";

interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
}

// ─── Utility functions ──────────────────────────────────────────────────────
function parseTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return value.split(",").map((tool) => tool.trim()).filter(Boolean);
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

function findNearestProjectAgentsDir(cwd: string): string | null {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "agents");
		try {
			if (lstatSync(candidate).isDirectory()) return candidate;
		} catch {
			// keep walking up
		}
		const parentPath = dirname(current);
		if (parentPath === current) return null;
		current = parentPath;
	}
}

function discoverAgents(cwd: string, scope: "user" | "project" | "both" = "both"): AgentConfig[] {
	const userDir = join(getAgentDir(), "agents");
	const projectDir = findNearestProjectAgentsDir(cwd);
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectDir ? [] : loadAgentsFromDir(projectDir, "project");
	return mergeByName(userAgents, projectAgents, scope);
}

function findAgent(cwd: string, name: string, scope: "user" | "project" | "both"): AgentConfig | undefined {
	return discoverAgents(cwd, scope).find((agent) => agent.name === name);
}

function collectConfiguredAgentModels(ctx: ExtensionContext, preferredModel?: string): string[] {
	const models = new Set<string>();

	for (const model of ctx.modelRegistry.getAvailable()) {
		models.add(`${model.provider}/${model.id}`);
	}

	for (const agent of discoverAgents(ctx.cwd, "both")) {
		if (agent.model?.trim()) models.add(agent.model.trim());
	}

	if (preferredModel?.trim()) models.add(preferredModel.trim());
	return Array.from(models).sort((a, b) => a.localeCompare(b));
}

function upsertAgentModelFrontmatter(markdown: string, model: string): string {
	const normalizedModel = model.trim();
	const match = markdown.match(/^(---\n)([\s\S]*?)(\n---\n?)([\s\S]*)$/);
	if (!match) {
		return `---\nmodel: ${normalizedModel}\n---\n\n${markdown.trimStart()}`;
	}

	const [, opening, frontmatterBlock, closing, body] = match;
	const lines = frontmatterBlock.split("\n");
	const modelLineIndex = lines.findIndex((line) => /^model\s*:/i.test(line.trim()));

	if (modelLineIndex >= 0) lines[modelLineIndex] = `model: ${normalizedModel}`;
	else lines.push(`model: ${normalizedModel}`);

	return `${opening}${lines.join("\n")}${closing}${body}`;
}

function saveAgentModel(agent: AgentConfig, model: string): AgentConfig {
	const raw = readFileSync(agent.filePath, "utf8");
	const next = upsertAgentModelFrontmatter(raw, model);
	if (next !== raw) writeFileSync(agent.filePath, next, "utf8");
	return { ...agent, model: model.trim() };
}

// ─── Agent model selector palette ──────────────────────────────────────────
interface AgentModelPaletteState {
	agents: AgentConfig[];
	mode: "agents" | "models";
	agentIndex: number;
	modelIndex: number;
	modelItems: Array<{ value: string; label: string }>;
}

function buildAgentLabel(agent: AgentConfig): string {
	const scope = agent.source === "user" ? "(u)" : "(p)";
	return `${agent.name} ${scope} · ${agent.model || "no model"}`;
}

function buildAgentDescription(agent: AgentConfig): string {
	return agent.description || agent.name;
}

async function openAgentModelPalette(ctx: ExtensionContext): Promise<void> {
	const agents = discoverAgents(ctx.cwd, "both");
	if (agents.length === 0) {
		ctx.ui.notify("No deployable agents found in agents/", "warning");
		return;
	}

	const state: AgentModelPaletteState = {
		agents,
		mode: "agents",
		agentIndex: 0,
		modelIndex: 0,
		modelItems: [],
	};

	let container: Container | null = null;
	let selectList: SelectList | null = null;

	const clampIndex = (value: number, length: number) => {
		if (length <= 0) return 0;
		return Math.max(0, Math.min(length - 1, value));
	};

	const getSelectedAgent = () => state.agents[clampIndex(state.agentIndex, state.agents.length)];
	const findAgentIndex = (name: string) => state.agents.findIndex((agent) => agent.name === name);

	const ensureModelItems = (agent: AgentConfig) => {
		const models = collectConfiguredAgentModels(ctx, agent.model);
		state.modelItems = models.map((model) => ({
			value: model,
			label: model === agent.model ? `${model}  ✓ current` : model,
		}));
		state.modelIndex = clampIndex(
			Math.max(0, state.modelItems.findIndex((item) => item.value === agent.model)),
			state.modelItems.length,
		);
	};

	const buildItems = (): SelectItem[] => {
		if (state.mode === "models") {
			return state.modelItems.map((model, idx) => ({
				value: String(idx),
				label: model.label,
				description: idx === state.modelIndex ? "current selection" : undefined,
			}));
		}

		return state.agents.map((agent) => ({
			value: agent.name,
			label: buildAgentLabel(agent),
			description: buildAgentDescription(agent),
		}));
	};

	const renderUI = () => {
		if (!container) return;
		const items = buildItems();
		selectList = new SelectList(items, Math.min(Math.max(items.length, 1), 12), {
			selectedPrefix: (text) => ctx.ui.theme.fg("accent", text),
			selectedText: (text) => ctx.ui.theme.fg("accent", text),
			description: (text) => ctx.ui.theme.fg("muted", text),
			scrollInfo: (text) => ctx.ui.theme.fg("dim", text),
			noMatch: (text) => ctx.ui.theme.fg("warning", text),
		});
		selectList.setSelectedIndex(clampIndex(state.mode === "models" ? state.modelIndex : state.agentIndex, items.length));

		container.clear();
		container.addChild(new DynamicBorder((s) => ctx.ui.theme.fg("accent", s)));
		container.addChild(new Text(ctx.ui.theme.fg("accent", ctx.ui.theme.bold("Agent Model Selector"))));

		if (state.mode === "models") {
			const agent = getSelectedAgent();
			container.addChild(new Text(ctx.ui.theme.fg("text", `Agent: ${agent?.name || "unknown"}`)));
			container.addChild(new Text(ctx.ui.theme.fg("muted", "Select the model for this agent")));
			container.addChild(new Text(ctx.ui.theme.fg("dim", "↑↓ navigate · Enter save · Esc back")));
		} else {
			container.addChild(new Text(ctx.ui.theme.fg("text", "Select an agent, then press Enter to choose its model")));
			container.addChild(new Text(ctx.ui.theme.fg("dim", "↑↓ navigate · Enter open models · Esc cancel")));
		}

		container.addChild(selectList);
		container.invalidate();
	};

	await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
		container = new Container();
		renderUI();

		return {
			render: (w) => container!.render(w),
			invalidate: () => container?.invalidate(),
			handleInput: (key) => {
				if (state.mode === "agents") {
					if (key === "\u001B") {
						done();
						return;
					}

					if (key === "\n" || key === "\r") {
						const current = selectList?.getSelectedItem();
						if (!current) return;
						const idx = findAgentIndex(current.value);
						if (idx < 0) return;
						state.agentIndex = clampIndex(idx, state.agents.length);
						ensureModelItems(state.agents[state.agentIndex]);
						state.mode = "models";
						renderUI();
						tui.requestRender();
						return;
					}

					selectList?.handleInput(key);
					const current = selectList?.getSelectedItem();
					if (current) {
						const idx = findAgentIndex(current.value);
						if (idx >= 0) state.agentIndex = clampIndex(idx, state.agents.length);
					}
					renderUI();
					tui.requestRender();
					return;
				}

				if (key === "\u001B") {
					state.mode = "agents";
					renderUI();
					tui.requestRender();
					return;
				}

				if (key === "\n" || key === "\r") {
					const agent = getSelectedAgent();
					const current = selectList?.getSelectedItem();
					if (!agent || !current) return;

					const idx = Number(current.value);
					if (!Number.isFinite(idx)) return;

					const modelValue = state.modelItems[idx]?.value;
					if (!modelValue) return;

					saveAgentModel(agent, modelValue);
					agent.model = modelValue;
					ctx.ui.notify(`Saved ${agent.name} → ${modelValue}`, "success");
					ensureModelItems(agent);
					state.mode = "agents";
					renderUI();
					tui.requestRender();
					return;
				}

				selectList?.handleInput(key);
				const current = selectList?.getSelectedItem();
				if (current) {
					const idx = Number(current.value);
					if (Number.isFinite(idx)) state.modelIndex = clampIndex(idx, state.modelItems.length);
				}
				renderUI();
				tui.requestRender();
			},
		};
	}, { overlay: true });
}

// ─── Extension Registration ─────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
	// Use non-/model prefix. Avoid Enter/autocomplete conflict with built-in /model menu.
	pi.registerCommand("agents-model", {
		description: "Select an agent from agents/ and choose its model",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Visual selector requires interactive mode", "error");
				return;
			}
			await openAgentModelPalette(ctx);
		},
	});

	pi.registerShortcut("ctrl+shift+m", {
		description: "Open agent model selector",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			await openAgentModelPalette(ctx);
		},
	});
}
