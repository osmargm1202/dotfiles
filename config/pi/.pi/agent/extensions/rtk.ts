import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const PATH_SETUP = 'export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"';

const CONTROL_START_RE =
	/^(?:export|source|cd|pwd|printf|echo|test|if|for|while|case|function)\b|^(?:which\s+rtk|command\s+-v\s+rtk|\[|\[\[|\{|\()/;
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+/;
const PATH_SETUP_LINE_RE = /^(?:export\s+PATH=|PATH=)/;

function hasPathSetup(command: string): boolean {
	return command.includes(PATH_SETUP);
}

function stripLeadingPathSetup(command: string): string {
	return splitLeadingPathSetup(command).body.trimStart();
}

function splitLeadingEnvAssignments(command: string): {
	envAssignments: string;
	body: string;
} {
	let remaining = command;
	let envAssignments = "";

	while (true) {
		const match = remaining.match(ENV_ASSIGNMENT_RE);
		if (!match) return { envAssignments, body: remaining };
		envAssignments += match[0];
		remaining = remaining.slice(match[0].length);
	}
}

function stripLeadingEnvAssignments(command: string): string {
	return splitLeadingEnvAssignments(command.trimStart()).body;
}

function startsWithRtk(command: string): boolean {
	return /^rtk(?:\s|$)/.test(
		stripLeadingEnvAssignments(stripLeadingPathSetup(command)),
	);
}

function splitLeadingPathSetup(command: string): {
	prefix: string;
	body: string;
} {
	let remaining = command.trimStart();
	const leadingWhitespace = command.slice(0, command.length - remaining.length);
	let prefix = leadingWhitespace;

	while (true) {
		const newlineIndex = remaining.indexOf("\n");
		const firstLine =
			newlineIndex === -1 ? remaining : remaining.slice(0, newlineIndex);
		if (!PATH_SETUP_LINE_RE.test(firstLine.trimStart())) break;
		if (newlineIndex === -1)
			return { prefix: `${prefix}${remaining}`, body: "" };
		prefix += remaining.slice(0, newlineIndex + 1);
		remaining = remaining.slice(newlineIndex + 1);
	}

	return { prefix, body: remaining };
}

function isCompoundOrControlCommand(command: string): boolean {
	const body = stripLeadingEnvAssignments(
		stripLeadingPathSetup(command),
	).trim();
	if (!body) return true;
	if (body.includes("\n")) return true;
	if (body.includes("&&") || body.includes("||") || body.includes(";"))
		return true;
	if (
		body.includes("|") ||
		body.includes("<(") ||
		body.includes(">") ||
		body.includes("<<")
	)
		return true;
	return CONTROL_START_RE.test(body);
}

function withPathSetup(command: string): string {
	if (hasPathSetup(command)) return command;
	return `${PATH_SETUP}\n${command}`;
}

function insertRtkAfterLeadingPrefixes(command: string): string {
	const { prefix, body } = splitLeadingPathSetup(command);
	const trimmed = body.trimStart();
	const leadingWhitespace = body.slice(0, body.length - trimmed.length);
	const { envAssignments, body: commandBody } =
		splitLeadingEnvAssignments(trimmed);

	return `${prefix}${leadingWhitespace}${envAssignments}rtk ${commandBody}`;
}

function rewriteCommand(command: string): string {
	if (startsWithRtk(command) || isCompoundOrControlCommand(command)) {
		return withPathSetup(command);
	}

	return withPathSetup(insertRtkAfterLeadingPrefixes(command));
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		event.input.command = rewriteCommand(event.input.command);
	});
}
