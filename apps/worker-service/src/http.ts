import type { IncomingMessage, ServerResponse } from "node:http";
import {
  parseBearerToken as parseBearerHeader,
  readRequestBody as readRequestBodyFromKernel,
  RequestBodyTooLargeError,
  sendJson,
} from "@backed/http-kernel";
import type { ApiErrorResponse } from "./api-types.js";

export class PayloadTooLargeError extends RequestBodyTooLargeError {
  override name = "PayloadTooLargeError";
}

export async function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  try {
    return await readRequestBodyFromKernel(request, { maxBytes });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new PayloadTooLargeError(error.maxBytes);
    }
    throw error;
  }
}

export { sendJson, parseBearerHeader as parseBearerToken };

export function sendApiError(
  response: ServerResponse,
  status: number,
  body: ApiErrorResponse,
): void {
  sendJson(response, status, body);
}

export function sendYaml(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": "application/yaml; charset=utf-8",
    ...headers,
  });
  response.end(body);
}
