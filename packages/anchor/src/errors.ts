import type { ApiError } from "./types.js";

/**
 * Base class for all Anchor SDK errors.
 */
export class AnchorError extends Error {
  override name = "AnchorError";
}

/**
 * Thrown when client options or request input fail validation before a network call.
 */
export class AnchorValidationError extends AnchorError {
  override name = "AnchorValidationError";
}

/**
 * Thrown when polling for a run is aborted or exceeds {@link WaitForRunOptions.maxWaitMs}.
 */
export class AnchorWaitError extends AnchorError {
  override name = "AnchorWaitError";
}

/**
 * Thrown when a webhook payload cannot be parsed or verified.
 */
export class AnchorWebhookError extends AnchorError {
  override name = "AnchorWebhookError";
}

/**
 * HTTP error returned by the Anchor worker API or raised by the SDK transport layer.
 */
export class AnchorClientError extends AnchorError {
  override name = "AnchorClientError";

  /**
   * @param message - Human-readable error summary.
   * @param status - HTTP status code.
   * @param code - Machine-readable API error code when present.
   * @param body - Parsed API error body when available.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: ApiError,
  ) {
    super(message);
  }

  /**
   * Builds an {@link AnchorClientError} from a parsed API error body.
   */
  static fromApiError(
    body: ApiError,
    status: number,
    fallbackMessage = "Request failed",
  ): AnchorClientError {
    return new AnchorClientError(body.message ?? fallbackMessage, status, body.error, body);
  }

  /**
   * Reads and parses an error response body, falling back to a generic message when JSON is absent or invalid.
   */
  static async fromResponse(
    response: Response,
    fallbackMessage = "Request failed",
  ): Promise<AnchorClientError> {
    const body = parseApiError(await response.json().catch(() => undefined));
    if (body !== undefined) {
      return AnchorClientError.fromApiError(body, response.status, fallbackMessage);
    }
    return new AnchorClientError(fallbackMessage, response.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Defensively parses an unknown value into an {@link ApiError}.
 *
 * @returns The parsed error or `undefined` when the shape does not match.
 */
export function parseApiError(value: unknown): ApiError | undefined {
  if (!isRecord(value) || typeof value.error !== "string") {
    return undefined;
  }

  const result: ApiError = { error: value.error };

  if (typeof value.message === "string") {
    result.message = value.message;
  }
  if (typeof value.maxFiles === "number") {
    result.maxFiles = value.maxFiles;
  }
  if (typeof value.maxBytes === "number") {
    result.maxBytes = value.maxBytes;
  }
  if (typeof value.staleAnswerCount === "number") {
    result.staleAnswerCount = value.staleAnswerCount;
  }

  return result;
}

/**
 * Asserts an openapi-fetch result succeeded and returns typed response data.
 *
 * @throws {@link AnchorClientError} When the API returned an error or an empty body.
 */
export function assertApiSuccess<T>(data: T | undefined, error: unknown, response: Response): T {
  if (error !== undefined) {
    const parsed = parseApiError(error);
    if (parsed !== undefined) {
      throw AnchorClientError.fromApiError(parsed, response.status);
    }
    throw new AnchorClientError("Request failed.", response.status);
  }
  if (data === undefined) {
    throw new AnchorClientError("Empty response body.", response.status);
  }
  return data;
}
