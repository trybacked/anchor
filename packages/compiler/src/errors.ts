export type ObjectQueryCompileErrorCode =
  | "unknown_object"
  | "missing_dataset_mapping"
  | "unknown_property"
  | "invalid_filter"
  | "invalid_aggregation"
  | "invalid_order_by"
  | "unknown_relationship"
  | "invalid_join"
  | "unknown_join_object"
  | "invalid_query"
  | "query_budget_exceeded";

export type QueryIssue = {
  code: ObjectQueryCompileErrorCode;
  message: string;

  path: string;

  invalidValue?: string;

  allowed?: readonly string[];

  suggestions?: readonly string[];
};

export type QueryIssueDetail = Partial<Omit<QueryIssue, "code" | "message">>;
const DEFAULT_ISSUE_PATH = "query";
export class ObjectQueryCompileError extends Error {
  readonly code: ObjectQueryCompileErrorCode;
  readonly issue: QueryIssue;
  constructor(code: ObjectQueryCompileErrorCode, message: string, detail: QueryIssueDetail = {}) {
    super(message);
    this.name = "ObjectQueryCompileError";
    this.code = code;
    this.issue = {
      code,
      message,
      path: detail.path ?? DEFAULT_ISSUE_PATH,
      ...(detail.invalidValue !== undefined ? { invalidValue: detail.invalidValue } : {}),
      ...(detail.allowed !== undefined ? { allowed: detail.allowed } : {}),
      ...(detail.suggestions !== undefined ? { suggestions: detail.suggestions } : {}),
    };
  }
}
