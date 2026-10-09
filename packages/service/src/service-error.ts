import type { QueryIssue } from "@trybacked/compiler";
export const SERVICE_ERROR_CODES = ["not_found", "unavailable", "bad_request", "conflict"] as const;
export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number];
export type ServiceError = {
  code: ServiceErrorCode;
  message: string;

  issues?: QueryIssue[];
};
export type ServiceErrorResult = {
  error: ServiceError;
};
export function serviceError(
  code: ServiceErrorCode,
  message: string,
  issues?: QueryIssue[],
): ServiceErrorResult {
  return {
    error: {
      code,
      message,
      ...(issues !== undefined && issues.length > 0 ? { issues } : {}),
    },
  };
}
function isServiceErrorCode(value: unknown): value is ServiceErrorCode {
  return typeof value === "string" && SERVICE_ERROR_CODES.some((code) => code === value);
}
function isValidQueryIssue(value: unknown): value is QueryIssue {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<QueryIssue>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.path === "string"
  );
}
export function isServiceErrorResult(value: unknown): value is ServiceErrorResult {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const candidate = value.error;
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const error = candidate as Partial<ServiceError>;
  if (!isServiceErrorCode(error.code) || typeof error.message !== "string") {
    return false;
  }
  return (
    error.issues === undefined ||
    (Array.isArray(error.issues) && error.issues.every(isValidQueryIssue))
  );
}
export function serviceErrorHttpStatus(code: ServiceErrorCode): 400 | 404 | 409 | 503 {
  switch (code) {
    case "not_found":
      return 404;
    case "unavailable":
      return 503;
    case "bad_request":
      return 400;
    case "conflict":
      return 409;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
