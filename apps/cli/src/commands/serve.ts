import { readModelYaml } from "@backed/core";
import { MCP_SURFACE_TOOLS, runStdioMcpServerUntilClose } from "@backed/mcp";
import { findWorkspaceRoot } from "../env.js";
import { createServeSearchModelOptions } from "../serve-model-search.js";
import { MCP_SERVER_NAME } from "../config.js";
import { BACKED_TELEMETRY_ENV, resolveServeContext, ServeAuthError } from "../serve-auth.js";
import { getUi, initUi } from "../ui/index.js";
import { ANSI, wrap } from "../ui/ansi.js";
import type { CommandHandler } from "../types.js";

const SERVE_PRIVACY_NOTE = "Model data stays local — MCP reads model.yaml and DuckDB on this machine only.";

function writeServeStderr(text: string, style: "dim" | "brand" = "dim"): void {
    console.error(wrap(style === "brand" ? ANSI.brand : ANSI.dim, text));
}

export const serveCommand: CommandHandler = async () => {
    initUi();
    const ui = getUi();
    const root = findWorkspaceRoot(process.cwd());
    const model = readModelYaml(root);
    let serveContext;
    try {
        serveContext = await resolveServeContext();
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
    if (serveContext.mode === "telemetry" && serveContext.userEmail !== undefined) {
        writeServeStderr(`Telemetry on · signed in as ${serveContext.userEmail}`);
    }
    else {
        writeServeStderr(`Local mode · no telemetry (set ${BACKED_TELEMETRY_ENV}=1 after ${"backed login"} to opt in)`);
    }
    writeServeStderr(`Tools: ${MCP_SURFACE_TOOLS.join(", ")} · Ctrl+C to exit`);
    writeServeStderr(SERVE_PRIVACY_NOTE);
    const searchModelOptions = await createServeSearchModelOptions(root, model);
    await runStdioMcpServerUntilClose(model, {
        ...(serveContext.usageRecorder !== undefined ? { usageRecorder: serveContext.usageRecorder } : {}),
        ...(searchModelOptions !== undefined ? { searchModelOptions } : {}),
    });
};
