import type { AuthoringCommand } from "@trybacked/core";
import { buildCovSemanticModel } from "./cov-model.js";

export function covPackCommands(catalog: string): AuthoringCommand[] {
  const model = buildCovSemanticModel(catalog, {
    runId: "cov-pack",
    generatedAt: new Date().toISOString(),
  });
  const commands: AuthoringCommand[] = [];
  for (const term of model.semantics?.glossary ?? []) {
    commands.push({ type: "upsertGlossaryTerm", term });
  }
  for (const entity of model.entities) {
    commands.push({ type: "addEntity", entity });
  }
  for (const relation of model.relations) {
    commands.push({ type: "addRelation", relation });
  }
  return commands;
}

export { buildCovSemanticModel, COV_ONTOLOGY_URI } from "./cov-model.js";
