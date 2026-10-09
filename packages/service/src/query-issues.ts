import type { ObjectQueryCompileErrorCode, QueryIssue } from "@trybacked/compiler";
import type { z } from "zod";
const MAX_SERVICE_QUERY_ISSUES = 5;
const ISSUE_PATH_MAX_CHARS = 120;

const SHAPE_ERROR_CODE: ObjectQueryCompileErrorCode = "invalid_query";
function truncate(value: string, max = ISSUE_PATH_MAX_CHARS): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}

function formatZodPath(path: (string | number | symbol)[]): string {
  if (path.length === 0) return "query";
  const [head, ...rest] = path;
  let formatted = String(head);
  for (const segment of rest) {
    formatted += typeof segment === "number" ? `[${String(segment)}]` : `.${String(segment)}`;
  }
  return truncate(formatted);
}

export function zodIssuesToQueryIssues(error: z.ZodError): QueryIssue[] {
  return error.issues.slice(0, MAX_SERVICE_QUERY_ISSUES).map((issue) => ({
    code: SHAPE_ERROR_CODE,
    message: issue.message,
    path: formatZodPath(issue.path),
  }));
}
