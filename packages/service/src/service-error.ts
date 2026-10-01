export const SERVICE_ERROR_CODES = ["not_found", "unavailable", "bad_request"] as const;

export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number];

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
};

export type ServiceErrorResult = { error: ServiceError };

export function serviceError(code: ServiceErrorCode, message: string): ServiceErrorResult {
  return { error: { code, message } };
}

function isServiceErrorCode(value: unknown): value is ServiceErrorCode {
  return typeof value === "string" && SERVICE_ERROR_CODES.some((code) => code === value);
}

export function isServiceErrorResult(value: unknown): value is ServiceErrorResult {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const candidate = value.error;
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  if (!("code" in candidate) || !("message" in candidate)) {
    return false;
  }
  return isServiceErrorCode(candidate.code) && typeof candidate.message === "string";
}

export function serviceErrorHttpStatus(code: ServiceErrorCode): 400 | 404 | 503 {
  switch (code) {
    case "not_found":
      return 404;
    case "unavailable":
      return 503;
    case "bad_request":
      return 400;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

export function serviceErrorMessage(result: ServiceErrorResult): string {
  return result.error.message;
}
