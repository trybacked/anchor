import type { z } from "zod";
import type { PlatformHandlerContext } from "./platform-api-types.js";

export function documentErrorStatus(message: string): 400 | 404 | 503 {
  if (message.includes("not found")) {
    return 404;
  }
  if (message.includes("unavailable")) {
    return 503;
  }
  return 400;
}

export function serviceErrorStatus(message: string): 400 | 503 {
  return message.includes("unavailable") ? 503 : 400;
}

export async function readJsonBody<T extends z.ZodTypeAny>(
  c: PlatformHandlerContext,
  schema: T,
): Promise<z.output<T>> {
  const payload: unknown = await c.req.json();
  return schema.parse(payload) as z.output<T>;
}
