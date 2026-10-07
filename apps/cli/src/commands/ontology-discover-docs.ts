import { readControlPlaneEnv, controlPlaneFetch } from "../control-plane/client.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const ontologyDiscoverDocsCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const tenantId = args[0];
  const json = args.includes("--json");
  const client = readControlPlaneEnv();
  if (tenantId === undefined) {
    ui.writeError("Usage: backed ontology discover-docs <tenantId> [--json]");
    process.exitCode = 1;
    return;
  }
  if (client === undefined) {
    ui.writeError("Set BACKED_CONTROL_PLANE_URL and CONTROL_PLANE_INTERNAL_TOKEN.");
    process.exitCode = 1;
    return;
  }
  const response = await controlPlaneFetch(client, tenantId, "/authoring/discovery/docs/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
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
    missingTables: string[];
    emptyTables: string[];
    profileTableCount: number;
  };
  if (json) {
    ui.log(text);
    return;
  }
  ui.writeSuccess(`Discovery run ${payload.runId} (HTTP ${String(response.status)})`);
  ui.detail(
    `${String(payload.profileTableCount)} table(s) profiled → ${String(payload.entityCount)} entità, ${String(payload.relationCount)} relazioni, ${String(payload.questionCount)} domande review`,
  );
  if (payload.missingTables.length > 0) {
    ui.detail(`Mancanti in warehouse: ${payload.missingTables.join(", ")}`);
  }
  if (payload.emptyTables.length > 0) {
    ui.detail(`Senza righe (schema ok): ${payload.emptyTables.join(", ")}`);
  }
  ui.log(`Review: backed ontology discovery-review ${tenantId} ${payload.runId} --yes-all --apply`);
};
