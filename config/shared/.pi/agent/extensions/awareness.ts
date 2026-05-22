import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);
const CUSTOM_TYPE = "awareness";

async function runGit(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd, timeout: 2000 });
		return stdout.trim();
	} catch {
		return "";
	}
}

function readOsPrettyName(): string {
	try {
		const raw = readFileSync("/etc/os-release", "utf8");
		const match = raw.match(/^PRETTY_NAME=(.*)$/m);
		if (!match) return "unknown";
		return match[1]!.replace(/^[\'"]|[\'"]$/g, "");
	} catch {
		return "unknown";
	}
}

function containerMarker(): string {
	if (existsSync("/.dockerenv")) return "docker";
	return process.env.container || "none";
}

export async function buildAwarenessText(ctx: Pick<ExtensionContext, "cwd">): Promise<string> {
	const gitRoot = (await runGit(["rev-parse", "--show-toplevel"], ctx.cwd)) || "no git";
	const branch = await runGit(["branch", "--show-current"], ctx.cwd);
	return [
		`pwd: ${ctx.cwd}`,
		`git: ${gitRoot}`,
		`branch: ${branch}`,
		`tmux: ${process.env.TMUX ? "yes" : "no"}`,
		`nix-shell: ${process.env.IN_NIX_SHELL ? "yes" : "no"}`,
		`container markers: ${containerMarker()}`,
		`os: ${readOsPrettyName()}`,
	].join("\n");
}

function alreadyInjected(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => "customType" in entry && entry.customType === CUSTOM_TYPE);
}

function hasConversationEntries(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => {
		if (entry.type !== "message") return false;
		return ["user", "assistant", "toolResult"].includes(entry.message.role);
	});
}

function shouldInjectAwareness(reason: SessionStartEvent["reason"], ctx: ExtensionContext): boolean {
	if (alreadyInjected(ctx)) return false;
	if (reason === "new") return true;
	if (reason === "startup") return !hasConversationEntries(ctx);
	return false;
}

export default function (pi: ExtensionAPI) {
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, _options, theme) => {
		return new Text(theme.fg("muted", "awareness\n") + String(message.content ?? ""), 0, 0);
	});

	pi.on("session_start", async (event, ctx) => {
		if (!shouldInjectAwareness(event.reason, ctx)) return;

		const content = await buildAwarenessText(ctx);
		pi.sendMessage(
			{
				customType: CUSTOM_TYPE,
				content,
				display: true,
				details: { source: "startup-awareness" },
			},
			{ deliverAs: "nextTurn" },
		);
	});
}
