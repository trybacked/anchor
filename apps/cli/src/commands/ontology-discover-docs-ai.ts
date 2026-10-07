import { readControlPlaneEnv, controlPlaneFetch } from "../control-plane/client.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const ontologyDiscoverDocsAiCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const tenantId = args[0];
  const json = args.includes("--json");
  const localeArg = args.find((entry) => entry.startsWith("--locale="));
  const locale = localeArg?.slice("--locale=".length);
  const client = readControlPlaneEnv();
  if (tenantId === undefined) {
    ui.writeError("Usage: backed ontology discover-docs-ai <tenantId> [--locale=it] [--json]");
    process.exitCode = 1;
    return;
  }
  if (client === undefined) {
    ui.writeError("Set BACKED_CONTROL_PLANE_URL and CONTROL_PLANE_INTERNAL_TOKEN.");
    process.exitCode = 1;
    return;
  }
  const response = await controlPlaneFetch(
    client,
    tenantId,
    "/authoring/discovery/docs/propose-ai",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(locale !== undefined && locale.length > 0 ? { locale } : {}),
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    ui.writeError(text);
    process.exitCode = 1;
    return;
  }
  const payload = JSON.parse(text) as {
    runId: string;
    entityCount: number;
    relationCount: number;
    questionCount: number;
    sampleTableCount: number;
    aiUsage: { inputTokens: number; outputTokens: number };
  };
  if (json) {
    ui.log(text);
    return;
  }
  ui.writeSuccess(`AI discovery run ${payload.runId} (HTTP ${String(response.status)})`);
  ui.detail(
    `${String(payload.sampleTableCount)} table sample(s) → ${String(payload.entityCount)} entità, ${String(payload.relationCount)} relazioni, ${String(payload.questionCount)} domande review`,
  );
  ui.detail(
    `Token LLM: ${String(payload.aiUsage.inputTokens)} in / ${String(payload.aiUsage.outputTokens)} out`,
  );
  ui.log(`Review: backed ontology discovery-review ${tenantId} ${payload.runId} --yes-all --apply`);
};
