import { basename } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	CAVEMAN_STATE_EVENT,
	type CavemanLevel,
	formatCavemanStatus,
	loadCavemanConfig,
	resolveInitialCavemanState,
} from "./lib/caveman-state";
import {
	formatPrimaryLabel,
	PRIMARY_STATE_EVENT,
	restorePrimaryState,
	SYSTEM_AGENT,
} from "./lib/agent-discovery";

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

function getFolderLabel(cwd: string): string {
	const trimmed = cwd.replace(/[\\/]+$/, "");
	const folder = basename(trimmed) || trimmed || ".";
	return ` ${folder}`;
}

export default function (pi: ExtensionAPI) {
	let currentPrimary: string = SYSTEM_AGENT;
	let currentCaveman: CavemanLevel = "off";
	let showCavemanStatus = loadCavemanConfig().showStatus;

	const installFooter = (ctx: ExtensionContext) => {
		currentPrimary = restorePrimaryState(ctx.sessionManager.getEntries(), ctx.cwd, "both");
		currentCaveman = resolveInitialCavemanState(ctx.sessionManager.getEntries()).level;
		showCavemanStatus = loadCavemanConfig().showStatus;

		ctx.ui.setFooter((tui, theme, footerData) => {
			footerHandle = tui;
			const folderLabel = getFolderLabel(ctx.cwd);
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
					const primaryLabel = formatPrimaryLabel(currentPrimary);
					const cavemanStatus = formatCavemanStatus(currentCaveman);
					const cavemanStyled = currentCaveman === "off"
						? theme.fg("dim", cavemanStatus)
						: theme.fg("accent", cavemanStatus);

					const leftParts = [
						theme.fg("accent", contextText),
						theme.fg("text", modelName),
						theme.fg("muted", `${thinking} · ${primaryLabel}`),
					];
					const left = leftParts.join(theme.fg("muted", " · "));
					const centerRaw = folderLabel;
					const rightParts = [
						showCavemanStatus ? cavemanStyled : "",
						theme.fg("muted", tokenSummary),
						theme.fg("warning", formatCurrency(totalCost)),
					].filter(Boolean);
					const right = rightParts.join(theme.fg("muted", " · "));

					const minSpaces = 2;
					const leftWidth = visibleWidth(left);
					const rightWidth = visibleWidth(right);
					const reservedWidth = leftWidth + rightWidth + minSpaces * 2;
					const centerAvailable = width - reservedWidth;

					if (centerAvailable >= 1) {
						const centerText = truncateToWidth(centerRaw, centerAvailable);
						const centerWidth = visibleWidth(centerText);
						const extra = centerAvailable - centerWidth;
						const padBefore = " ".repeat(minSpaces + Math.floor(extra / 2));
						const padAfter = " ".repeat(minSpaces + Math.ceil(extra / 2));
						const center = theme.fg("text", centerText);
						return [left + padBefore + center + padAfter + right];
					}

					const compact = showCavemanStatus
						? `${contextText} ${modelName} · ${thinking} · ${primaryLabel} · ${folderLabel} · ${cavemanStatus} · ${tokenSummary} ${formatCurrency(totalCost)}`
						: `${contextText} ${modelName} · ${thinking} · ${primaryLabel} · ${folderLabel} · ${tokenSummary} ${formatCurrency(totalCost)}`;
					const styledCompact = showCavemanStatus
						? theme.fg("accent", `${contextText} `) +
							theme.fg("text", modelName) +
							theme.fg("muted", ` · ${thinking} · ${primaryLabel} · `) +
							theme.fg("text", folderLabel) +
							theme.fg("muted", " · ") +
							cavemanStyled +
							theme.fg("muted", ` · ${tokenSummary} `) +
							theme.fg("warning", formatCurrency(totalCost))
						: theme.fg("accent", `${contextText} `) +
							theme.fg("text", modelName) +
							theme.fg("muted", ` · ${thinking} · ${primaryLabel} · `) +
							theme.fg("text", folderLabel) +
							theme.fg("muted", ` · ${tokenSummary} `) +
							theme.fg("warning", formatCurrency(totalCost));

					if (visibleWidth(compact) <= width) {
						return [styledCompact];
					}

					const compactBar = theme.fg("accent", `${contextText} `);
					const compactTail = showCavemanStatus
						? theme.fg("text", modelName) +
							theme.fg("muted", ` · ${thinking} · ${primaryLabel} · `) +
							theme.fg("text", folderLabel) +
							theme.fg("muted", " · ") +
							cavemanStyled
						: theme.fg("text", modelName) +
							theme.fg("muted", ` · ${thinking} · ${primaryLabel} · `) +
							theme.fg("text", folderLabel);

					const availableTailWidth = Math.max(0, width - visibleWidth(compactBar));
					return [compactBar + truncateToWidth(compactTail, availableTailWidth)];
				},
			};
		});
	};

	// Listen for live primary agent changes from pdd-orgm.ts
	pi.events.on(PRIMARY_STATE_EVENT, (data: { selectedName: string }) => {
		currentPrimary = data?.selectedName ?? SYSTEM_AGENT;
		if (footerHandle) footerHandle.requestRender();
	});

	pi.events.on(CAVEMAN_STATE_EVENT, (data: { level?: CavemanLevel }) => {
		if (data?.level) currentCaveman = data.level;
		showCavemanStatus = loadCavemanConfig().showStatus;
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
