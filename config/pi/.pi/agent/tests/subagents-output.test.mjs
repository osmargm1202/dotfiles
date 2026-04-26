import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
	new URL("../extensions/subagents.ts", import.meta.url),
	"utf8",
);

test("deploy_agent keeps final tool content compact", () => {
	assert.doesNotMatch(
		source,
		/content:\s*\[\{\s*type:\s*"text",\s*text:\s*run\.text\s*\}\]/,
		"deploy_agent must not place full subagent output in tool content",
	);
	assert.match(
		source,
		/function buildAgentContentText\(/,
		"deploy_agent should use a compact content builder",
	);
});

test("deploy_agent exposes full output only in expanded rendering", () => {
	assert.match(
		source,
		/options\.expanded[\s\S]*details\.fullOutput/,
		"deploy_agent expanded view should include details.fullOutput",
	);
	assert.match(
		source,
		/const summary =\s*details\.summary;/,
		"deploy_agent collapsed summary should use compact details.summary, not result.content",
	);
});

test("query_team expanded rendering includes per-member full output", () => {
	assert.match(
		source,
		/options\.expanded[\s\S]*item\.fullOutput/,
		"query_team expanded view should include each member fullOutput",
	);
});
