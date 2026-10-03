import {
  semanticModelToOntology,
  validateOntology,
  validateSemanticModel,
  type SemanticModel,
} from "@trybacked/core";

export function validateAuthoringModel(
  model: SemanticModel,
  ontologyId: string,
): ReturnType<typeof validateSemanticModel> {
  const semantic = validateSemanticModel(model);
  if (!semantic.valid) {
    return semantic;
  }
  const ontology = semanticModelToOntology(model, { ontologyId });
  const ontologyResult = validateOntology(ontology);
  const issues = [...semantic.issues, ...ontologyResult.issues];
  const valid = issues.every((issue) => issue.severity !== "error");
  return { valid, issues };
}
