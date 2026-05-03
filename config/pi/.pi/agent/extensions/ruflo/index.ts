import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function splitArgs(input: string): string[] {
  return input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => {
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
      return part.slice(1, -1);
    }
    return part;
  }) ?? [];
}

export default function rufloExtension(pi: ExtensionAPI) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const localBin = path.join(root, "node_modules", ".bin", "ruflo");
  const command = fs.existsSync(localBin) ? localBin : "ruflo";

  pi.on("resources_discover", async () => ({
    skillPaths: [path.join(root, "skills")],
    promptPaths: [path.join(root, "prompts")],
  }));

  pi.on("session_start", async (_event, ctx) => {
    const result = await pi.exec(command, ["--version"], { timeout: 5000 });
    const ok = result.code === 0;
    ctx.ui.setStatus("ruflo", ok ? `ruflo ${result.stdout.trim() || "ready"}` : "ruflo missing");
    if (!ok) ctx.ui.notify("Ruflo no disponible. Ejecuta npm install en extensions/ruflo.", "warning");
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n## Ruflo\nRuflo CLI is available through the ruflo tool and /ruflo command. Prefer it for Ruflo swarm, memory, hooks, and diagnostics workflows. Use conservative commands first: doctor, --help, init --wizard only when user asks.`,
  }));

  pi.registerCommand("ruflo", {
    description: "Run Ruflo CLI. Example: /ruflo doctor",
    handler: async (args, ctx) => {
      const argv = splitArgs(args ?? "");
      const result = await pi.exec(command, argv, { timeout: 120000 });
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      ctx.ui.notify(out || `ruflo exited ${result.code}`, result.code === 0 ? "info" : "error");
    },
  });

  pi.registerTool({
    name: "ruflo",
    label: "Ruflo",
    description: "Run Ruflo CLI commands for agent orchestration, swarms, memory, hooks, and diagnostics. Output is truncated by pi.exec if needed.",
    promptSnippet: "Run Ruflo CLI commands for orchestration, swarms, memory, hooks, and diagnostics",
    promptGuidelines: [
      "Use ruflo for Ruflo-specific diagnostics and orchestration only after checking harmless help/status commands first.",
      "Do not run ruflo init, install, mcp, swarm, or destructive commands without explicit user approval.",
    ],
    parameters: Type.Object({
      args: Type.Array(Type.String(), { description: "Ruflo CLI arguments, excluding the ruflo binary itself." }),
      timeoutMs: Type.Optional(Type.Number({ description: "Optional timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await pi.exec(command, params.args, { signal, timeout: params.timeoutMs ?? 120000 });
      const text = [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `ruflo exited ${result.code}`;
      return {
        content: [{ type: "text", text }],
        details: { code: result.code, killed: result.killed, args: params.args },
      };
    },
  });
}
