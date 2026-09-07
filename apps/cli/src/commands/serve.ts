import { readModelYaml } from "@backed/core";
import { MCP_SURFACE_TOOLS, runStdioMcpServerUntilClose } from "@backed/mcp";
import { findWorkspaceRoot } from "../env.js";
import { MCP_SERVER_NAME } from "../config.js";
import { resolveServeAuthContext, ServeAuthError } from "../serve-auth.js";
import { getUi, initUi } from "../ui/index.js";
import { ANSI, wrap } from "../ui/ansi.js";
import type { CommandHandler } from "../types.js";

const SERVE_PRIVACY_NOTE = "Model data stays local — only auth and usage metadata pass through the gateway.";

function writeServeStderr(text: string, style: "dim" | "brand" = "dim"): void {
    console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

export const serveCommand: CommandHandler = async () => {
    initUi();
    const ui = getUi();
    const root = findWorkspaceRoot(process.cwd());
    const model = readModelYaml(root);
    let authContext;
    try {
        authContext = await resolveServeAuthContext();
    }
    catch (error) {
        if (error instanceof ServeAuthError) {
            ui.writeError(error.message);
            process.exitCode = 1;
            return;
        }
        throw error;
    }
    writeServeStderr(`MCP server "${MCP_SERVER_NAME}" on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations`, "brand");
    writeServeStderr(`Signed in as ${authContext.credentials.user.email}`);
    writeServeStderr(`Tools: ${MCP_SURFACE_TOOLS.join(", ")} · Ctrl+C to exit`);
    writeServeStderr(SERVE_PRIVACY_NOTE);
    await runStdioMcpServerUntilClose(model, {
        usageRecorder: {
            record: authContext.recordUsage,
        },
    });
};
