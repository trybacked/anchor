import { readFileSync } from "node:fs";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const ontologyImportCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const tenantId = args[0];
  const filePath = args[1];
  const controlPlaneUrl = process.env["BACKED_CONTROL_PLANE_URL"]?.replace(/\/+$/, "");
  const internalToken = process.env["CONTROL_PLANE_INTERNAL_TOKEN"]?.trim();
  if (tenantId === undefined || filePath === undefined) {
    ui.writeError("Usage: backed ontology import <tenantId> <model.yaml>");
    process.exitCode = 1;
    return;
  }
  if (controlPlaneUrl === undefined || internalToken === undefined) {
    ui.writeError("Set BACKED_CONTROL_PLANE_URL and CONTROL_PLANE_INTERNAL_TOKEN.");
    process.exitCode = 1;
    return;
  }
  const content = readFileSync(filePath, "utf8");
  const response = await fetch(
    `${controlPlaneUrl}/v1/tenants/${encodeURIComponent(tenantId)}/authoring/ontology/import`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalToken}`,
        "Content-Type": "application/json",
        "X-Backed-User": "cli-import",
      },
      body: JSON.stringify({ format: "yaml", content }),
    },
  );
  if (!response.ok) {
    ui.writeError(await response.text());
    process.exitCode = 1;
    return;
  }
  ui.writeSuccess(`Imported draft for tenant "${tenantId}"`);
};
