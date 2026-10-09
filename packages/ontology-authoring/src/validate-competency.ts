import {
  ObjectQueryCompileError,
  ObjectQuerySchema,
  compileObjectQuery,
} from "@trybacked/compiler";
import type { Ontology, SemanticModel, ValidationIssue, VerifiedExample } from "@trybacked/core";

const COMPETENCY_ISSUE_CODE = "invalid_competency_query";

function examplePath(index: number): string {
  return `semantics.examples[${String(index)}]`;
}

function competencyIssue(example: VerifiedExample, index: number, detail: string): ValidationIssue {
  return {
    code: COMPETENCY_ISSUE_CODE,
    severity: "error",
    message: `Competency example "${example.id}" has an expectedObjectQuery that does not compile: ${detail}`,
    path: `${examplePath(index)}.expectedObjectQuery`,
  };
}

export function validateCompetencyExamples(
  model: SemanticModel,
  ontology: Ontology,
): ValidationIssue[] {
  return (model.semantics?.examples ?? []).flatMap((example, index) =>
    validateCompetencyExample(example, index, ontology),
  );
}

function validateCompetencyExample(
  example: VerifiedExample,
  index: number,
  ontology: Ontology,
): ValidationIssue[] {
  const query = example.expectedObjectQuery;
  if (query === undefined) {
    return [];
  }
  const parsed = ObjectQuerySchema.safeParse(query);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue?.path.length
      ? `${issue.path.join(".")}: ${issue.message}`
      : (issue?.message ?? "invalid query shape");
    return [competencyIssue(example, index, detail)];
  }
  try {
    compileObjectQuery(ontology, parsed.data);
  } catch (error) {
    if (error instanceof ObjectQueryCompileError) {
      const suggestions = error.issue.suggestions ?? [];
      const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      return [competencyIssue(example, index, `${error.issue.message}.${hint}`)];
    }
    throw error;
  }
  return [];
}
