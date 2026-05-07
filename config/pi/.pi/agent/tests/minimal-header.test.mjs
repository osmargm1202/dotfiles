import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
	new URL("../extensions/minimal-header.ts", import.meta.url),
	"utf8",
);

test("minimal-header installs custom header only for UI sessions", () => {
	assert.match(source, /ctx\.ui\.setHeader\(/);
	assert.match(
		source,
		/pi\.on\("session_start"[\s\S]*if \(!ctx\.hasUI\) return;[\s\S]*installHeader\(ctx\)/,
	);
	assert.match(
		source,
		/pi\.on\("model_select"[\s\S]*if \(!ctx\.hasUI(?: \|\| !headerEnabled)?\) return;[\s\S]*installHeader\(ctx\)/,
	);
});

test("minimal-header tracks skill commands and skill file reads", () => {
	assert.match(source, /registerCommand\("minimal-header-clear"/);
	assert.match(source, /pi\.on\("input"[\s\S]*\/skill:/);
	assert.match(source, /pi\.on\("tool_call"[\s\S]*(?:isToolCallEventType\("read"|event\.toolName === "read")/);
	assert.match(source, /pi\.on\("tool_execution_end"[\s\S]*toolCallId/);
	assert.match(source, /pendingSkillReads/);
});

test("minimal-header uses safe width handling and restore command", () => {
	assert.match(source, /truncateToWidth/);
	assert.match(source, /visibleWidth/);
	assert.match(source, /registerCommand\("minimal-header"/);
	assert.match(source, /registerCommand\("minimal-header-builtin"/);
	assert.match(source, /ctx\.ui\.setHeader\(undefined\)/);
});
