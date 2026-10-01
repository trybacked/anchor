import {
  isServiceErrorResult,
  serviceErrorHttpStatus,
  serviceErrorMessage,
  type ServiceErrorResult,
} from "@trybacked/service";
import type { z } from "zod";
import type { PlatformHandlerContext } from "./platform-api-types.js";

export function jsonServiceErrorResponse(
  c: PlatformHandlerContext,
  result: ServiceErrorResult,
): Response {
  return c.json({ error: serviceErrorMessage(result) }, serviceErrorHttpStatus(result.error.code));
}

export function respondIfServiceError(c: PlatformHandlerContext, result: unknown): Response | null {
  if (!isServiceErrorResult(result)) {
    return null;
  }
  return jsonServiceErrorResponse(c, result);
}

export async function readJsonBody<T extends z.ZodTypeAny>(
  c: PlatformHandlerContext,
  schema: T,
): Promise<z.output<T>> {
  const payload: unknown = await c.req.json();
  return schema.parse(payload) as z.output<T>;
}
