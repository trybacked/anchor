export type ObjectQueryCompileErrorCode =
  "unknown_object" | "missing_dataset_mapping" | "unknown_property" | "invalid_filter";

export class ObjectQueryCompileError extends Error {
  readonly code: ObjectQueryCompileErrorCode;

  constructor(code: ObjectQueryCompileErrorCode, message: string) {
    super(message);
    this.name = "ObjectQueryCompileError";
    this.code = code;
  }
}
