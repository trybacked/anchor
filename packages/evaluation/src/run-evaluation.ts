import { readWorkspaceModel, validateOntologyV2 } from "@trybacked/core";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { computeText2KgMetrics, negativeRejectionScore } from "./text2kg-metrics.js";

export type EvaluationReport = {
  schemaValid: boolean;
  competencyQuestions: number;
  competencyCoverage: number;
  text2kg: ReturnType<typeof computeText2KgMetrics>;
  negativeRejection: number;
  issues: string[];
};

function loadCompetencyQuestions(root: string): string[] {
  const filePath = path.join(root, "competency-questions.yaml");
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = parseYaml(readFileSync(filePath, "utf8")) as { questions?: { text?: string }[] };
  return (raw.questions ?? []).map((q) => q.text ?? "").filter((text) => text.length > 0);
}

export async function runEvaluation(options: {
  workspaceRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<EvaluationReport> {
  void options.env;
  const workspace = readWorkspaceModel(options.workspaceRoot);
  const issues: string[] = [];
  if (workspace.format !== "ontology_v2") {
    return {
      schemaValid: false,
      competencyQuestions: 0,
      competencyCoverage: 0,
      text2kg: {
        objectTypeCount: 0,
        linkTypeCount: 0,
        invalidLinks: 0,
        schemaConformance: 0,
        hallucinatedEdgeRate: 0,
      },
      negativeRejection: 0,
      issues: ["model.yaml is not OntologySpec v2"],
    };
  }
  const validation = validateOntologyV2(workspace.ontology);
  if (!validation.valid) {
    for (const issue of validation.issues) {
      issues.push(`${issue.code}: ${issue.message}`);
    }
  }
  const questions = loadCompetencyQuestions(options.workspaceRoot);
  const objectIds = new Set(workspace.ontology.objectTypes.map((object) => object.id));
  let covered = 0;
  for (const question of questions) {
    const lower = question.toLowerCase();
    if ([...objectIds].some((id) => lower.includes(id.replaceAll("_", " ")))) {
      covered += 1;
    }
  }
  const competencyCoverage = questions.length === 0 ? 1 : covered / questions.length;
  const text2kg = computeText2KgMetrics(workspace.ontology);
  if (text2kg.invalidLinks > 0) {
    issues.push(`text2kg: ${String(text2kg.invalidLinks)} link(s) reference missing object types`);
  }
  return {
    schemaValid: validation.valid,
    competencyQuestions: questions.length,
    competencyCoverage,
    text2kg,
    negativeRejection: negativeRejectionScore(
      competencyCoverage,
      workspace.ontology.objectTypes.length,
    ),
    issues,
  };
}
