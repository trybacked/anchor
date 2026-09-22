/** Shared result type for ontology and model structural validation. */

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  path?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => result.issues);
  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

export function validationResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
