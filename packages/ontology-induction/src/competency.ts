import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

/** Ontology 101 (Noy & McGuinness): competency questions drive scope and acceptance tests. */
export function loadCompetencyQuestions(workspaceRoot: string): string[] {
  const filePath = path.join(workspaceRoot, "competency-questions.yaml");
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = parseYaml(readFileSync(filePath, "utf8")) as {
    questions?: Array<{ text?: string; id?: string }>;
  };
  return (raw.questions ?? [])
    .map((question) => question.text?.trim() ?? "")
    .filter((text) => text.length > 0);
}

export function formatCompetencyBlock(questions: readonly string[]): string {
  if (questions.length === 0) {
    return "No competency questions provided; propose minimal object types justified by excerpts only.";
  }
  return questions.map((question, index) => `${String(index + 1)}. ${question}`).join("\n");
}
