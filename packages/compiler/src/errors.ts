export type ObjectQueryCompileErrorCode =
  | "unknown_object"
  | "missing_dataset_mapping"
  | "unknown_property"
  | "invalid_filter"
  | "invalid_aggregation"
  | "invalid_order_by"
  | "unknown_relationship"
  | "invalid_join"
  | "unknown_join_object";
export class ObjectQueryCompileError extends Error {
  readonly code: ObjectQueryCompileErrorCode;
  constructor(code: ObjectQueryCompileErrorCode, message: string) {
    super(message);
    this.name = "ObjectQueryCompileError";
    this.code = code;
  }
}
