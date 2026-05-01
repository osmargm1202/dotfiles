import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "request-time";
const WIDGET_KEY = "request-time";

type TimerHandle = ReturnType<typeof setInterval>;

let startedAt = 0;
let timer: TimerHandle | undefined;
let turnCount = 0;
let lastElapsedMs = 0;

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function updateTimer(ctx: ExtensionContext, done = false) {
	if (startedAt === 0) return;

	lastElapsedMs = Date.now() - startedAt;
	const elapsed = formatDuration(lastElapsedMs);
	const theme = ctx.ui.theme;
	const icon = done ? theme.fg("success", "✓") : theme.fg("accent", "⏱");
	const text = done
		? theme.fg("dim", ` ${elapsed} total · ${turnCount} turn${turnCount === 1 ? "" : "s"}`)
		: theme.fg("dim", ` ${elapsed} · turn ${Math.max(turnCount, 1)}`);

	ctx.ui.setStatus(STATUS_KEY, icon + text);
	ctx.ui.setWidget(WIDGET_KEY, [`${done ? "✓" : "⏱"} Tiempo de trabajo: ${elapsed}`], {
		placement: "belowEditor",
	});
}

function stopTimer(ctx: ExtensionContext, clear = false) {
	if (timer) clearInterval(timer);
	timer = undefined;

	if (clear) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setWidget(WIDGET_KEY, undefined);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (_event, ctx) => {
		stopTimer(ctx);
		startedAt = Date.now();
		turnCount = 0;
		lastElapsedMs = 0;

		updateTimer(ctx);
		timer = setInterval(() => updateTimer(ctx), 1000);
	});

	pi.on("turn_start", async () => {
		turnCount++;
	});

	pi.on("agent_end", async (_event, ctx) => {
		stopTimer(ctx);
		updateTimer(ctx, true);
		ctx.ui.notify(`Trabajo completado en ${formatDuration(lastElapsedMs)}`, "info");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopTimer(ctx, true);
		startedAt = 0;
		turnCount = 0;
	});
}
