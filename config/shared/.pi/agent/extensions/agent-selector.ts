/**
 * agent-selector.ts
 *
 * Extension for selecting a specific agent and assigning one of the
 * configured models from the agents/ tree.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import { discoverDeployableAgents, type AgentConfig } from "./lib/agent-discovery";

function collectConfiguredAgentModels(ctx: ExtensionContext, preferredModel?: string): string[] {
	const models = new Set<string>();

	for (const model of ctx.modelRegistry.getAvailable()) {
		models.add(`${model.provider}/${model.id}`);
	}

	for (const agent of discoverDeployableAgents(ctx.cwd, "both")) {
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
	agentFilter: string;
}

function buildAgentLabel(agent: AgentConfig): string {
	const scope = agent.source === "user" ? "(u)" : "(p)";
	return `${agent.displayName} ${scope} · ${agent.model || "no model"}`;
}

function buildAgentDescription(agent: AgentConfig): string {
	return agent.description || agent.displayName;
}

async function openAgentModelPalette(ctx: ExtensionContext): Promise<void> {
	const agents = discoverDeployableAgents(ctx.cwd, "both");
	if (agents.length === 0) {
		ctx.ui.notify("No deployable subagents found in agents/", "warning");
		return;
	}

	const state: AgentModelPaletteState = {
		agents,
		mode: "agents",
		agentIndex: 0,
		modelIndex: 0,
		modelItems: [],
		agentFilter: "",
	};

	let container: Container | null = null;
	let selectList: SelectList | null = null;

	const clampIndex = (value: number, length: number) => {
		if (length <= 0) return 0;
		return Math.max(0, Math.min(length - 1, value));
	};

	const getFilteredAgents = () => {
		const filter = state.agentFilter.trim().toLowerCase();
		if (!filter) return state.agents;
		return state.agents.filter((agent) => {
			const haystack = `${agent.name} ${agent.displayName}`.toLowerCase();
			return haystack.includes(filter);
		});
	};
	const getSelectedAgent = () => state.agents[clampIndex(state.agentIndex, state.agents.length)];
	const findAgentIndex = (name: string) => state.agents.findIndex((agent) => agent.name === name);
	const syncFilteredSelection = () => {
		const filteredAgents = getFilteredAgents();
		if (filteredAgents.length === 0) {
			state.agentIndex = 0;
			return;
		}
		const currentAgent = getSelectedAgent();
		const nextAgent = currentAgent && filteredAgents.some((agent) => agent.name === currentAgent.name)
			? currentAgent
			: filteredAgents[0];
		state.agentIndex = clampIndex(findAgentIndex(nextAgent.name), state.agents.length);
	};

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

		return getFilteredAgents().map((agent) => ({
			value: agent.name,
			label: buildAgentLabel(agent),
			description: buildAgentDescription(agent),
		}));
	};

	const renderUI = () => {
		if (!container) return;
		if (state.mode === "agents") syncFilteredSelection();
		const items = buildItems();
		selectList = new SelectList(items, Math.min(Math.max(items.length, 1), 12), {
			selectedPrefix: (text) => ctx.ui.theme.fg("accent", text),
			selectedText: (text) => ctx.ui.theme.fg("accent", text),
			description: (text) => ctx.ui.theme.fg("muted", text),
			scrollInfo: (text) => ctx.ui.theme.fg("dim", text),
			noMatch: (text) => ctx.ui.theme.fg("warning", text),
		});
		const selectedIndex = state.mode === "models"
			? clampIndex(state.modelIndex, items.length)
			: clampIndex(
				Math.max(0, items.findIndex((item) => item.value === getSelectedAgent()?.name)),
				items.length,
			);
		selectList.setSelectedIndex(selectedIndex);

		container.clear();
		container.addChild(new DynamicBorder((s) => ctx.ui.theme.fg("accent", s)));
		container.addChild(new Text(ctx.ui.theme.fg("accent", ctx.ui.theme.bold("Agent Model Selector"))));

		if (state.mode === "models") {
			const agent = getSelectedAgent();
			container.addChild(new Text(ctx.ui.theme.fg("text", `Agent: ${agent?.displayName || "unknown"}`)));
			container.addChild(new Text(ctx.ui.theme.fg("muted", "Select the model for this agent")));
			container.addChild(new Text(ctx.ui.theme.fg("dim", "↑↓ navigate · Enter save · Esc back")));
		} else {
			container.addChild(new Text(ctx.ui.theme.fg("text", "Select an agent, then press Enter to choose its model")));
			container.addChild(new Text(ctx.ui.theme.fg("muted", `Filter: ${state.agentFilter || "—"}`)));
			container.addChild(new Text(ctx.ui.theme.fg("dim", "type filter · ↑↓ navigate · Enter open models · Backspace delete · Esc clear/cancel")));
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
					const isArrowKey = key === "\u001b[A" || key === "\u001b[B" || key === "\u001b[C" || key === "\u001b[D";
					if (key === "\u001B" && !isArrowKey) {
						if (state.agentFilter) {
							state.agentFilter = "";
							renderUI();
							tui.requestRender();
							return;
						}
						done();
						return;
					}

					if (key === "\u007F") {
						state.agentFilter = state.agentFilter.slice(0, -1);
						syncFilteredSelection();
						renderUI();
						tui.requestRender();
						return;
					}

					if (key === "\u0015") {
						state.agentFilter = "";
						syncFilteredSelection();
						renderUI();
						tui.requestRender();
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

					const isPrintable = key.length === 1 && key >= " " && key !== "\u007F";
					if (isPrintable) {
						state.agentFilter += key;
						syncFilteredSelection();
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
					ctx.ui.notify(`Saved ${agent.displayName} → ${modelValue}`, "success");
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
		description: "Select a subagent from agents/ and choose its model",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Visual selector requires interactive mode", "error");
				return;
			}
			await openAgentModelPalette(ctx);
		},
	});

	pi.registerShortcut("alt+2", {
		description: "Open agent model selector",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			await openAgentModelPalette(ctx);
		},
	});
}
