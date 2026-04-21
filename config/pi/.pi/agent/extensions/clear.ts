import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("clear", {
		description: "Start a fresh recoverable session in the current working directory",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const currentSessionFile = ctx.sessionManager.getSessionFile();
			const result = await ctx.newSession({
				parentSession: currentSessionFile,
			});
			if (result.cancelled) {
				ctx.ui.notify("Clear cancelled", "info");
				return;
			}

			ctx.ui.notify(
				currentSessionFile
					? "Started a fresh session. Previous session preserved for /sessions recovery."
					: "Started a fresh session",
				"success",
			);
		},
	});
}
