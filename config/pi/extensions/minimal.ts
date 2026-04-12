import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// Must match the constants in pdd-orgm.ts
const PRIMARY_STATE_ENTRY = "pdd-primary-agent";
const SYSTEM_AGENT = "pi";
const DEFAULT_PRIMARY_AGENT = "pdd-orgm";

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
	} catch { return false; }
}

function resolveDefaultPrimary(): string {
	if (findPrimaryAgentName(DEFAULT_PRIMARY_AGENT)) return DEFAULT_PRIMARY_AGENT;
	return SYSTEM_AGENT;
}

function restorePrimaryName(entries: readonly any[]): string {
	for (let i = entries.length - 1; i >= 0; i--) {
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
	if (name === SYSTEM_AGENT) return "pi";
	return `primary:${name}`;
}

export default function (pi: ExtensionAPI) {
	let currentPrimary: string = SYSTEM_AGENT;

	const installFooter = (ctx: ExtensionContext) => {
		currentPrimary = restorePrimaryName(ctx.sessionManager.getEntries());

		ctx.ui.setFooter((tui, theme, footerData) => {
			footerHandle = tui;
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: () => { unsubscribeBranch(); footerHandle = null; },
				invalidate() {},
				render(width: number): string[] {
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
					const costSummary = `${tokenSummary} ${formatCurrency(totalCost)}`;
					const primaryLabel = formatPrimaryLabel(currentPrimary);

					const left = theme.fg("accent", contextText);
					const middle = theme.fg("text", modelName) + theme.fg("muted", ` · ${thinking} · ${primaryLabel}`);
					const right = theme.fg("muted", `${tokenSummary} `) + theme.fg("warning", formatCurrency(totalCost));

					const minSpaces = 2;
					const combinedWidth = visibleWidth(left) + visibleWidth(middle) + visibleWidth(right) + minSpaces * 2;

					if (combinedWidth <= width) {
						const free = width - combinedWidth;
						const padLeft = " ".repeat(minSpaces);
						const padMiddle = " ".repeat(minSpaces + free);
						return [left + padLeft + middle + padMiddle + right];
					}

					const compact = `${contextText} ${modelName} · ${thinking} · ${primaryLabel} ${costSummary}`;
					const styledCompact =
						theme.fg("accent", `${contextText} `) +
						theme.fg("text", modelName) +
						theme.fg("muted", ` · ${thinking} · ${primaryLabel} ${tokenSummary} `) +
						theme.fg("warning", formatCurrency(totalCost));

					if (visibleWidth(compact) <= width) {
						return [styledCompact];
					}

					const compactBar = theme.fg("accent", `${contextText} `);
					const compactTail =
						theme.fg("text", modelName) +
						theme.fg("muted", ` · ${thinking} · ${primaryLabel} `) +
						theme.fg("warning", formatCurrency(totalCost));

					const availableTailWidth = Math.max(0, width - visibleWidth(compactBar));
					return [compactBar + truncateToWidth(compactTail, availableTailWidth)];
				},
			};
		});
	};

	// Listen for live primary agent changes from pdd-orgm.ts
	pi.events.on("pdd:primary-agent-changed", (data: { selectedName: string }) => {
		currentPrimary = data?.selectedName ?? SYSTEM_AGENT;
		// Force footer rerender so label updates immediately
		if (footerHandle) footerHandle.requestRender();
	});

	let footerHandle: { requestRender: () => void } | null = null;

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		installFooter(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		installFooter(ctx);
	});

	pi.registerCommand("minimal-footer", {
		description: "Reapply the minimal custom footer",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			installFooter(ctx);
			ctx.ui.notify("Minimal footer applied", "success");
		},
	});
}
