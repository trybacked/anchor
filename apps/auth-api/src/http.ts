import {
  parseBearerToken as parseBearerHeader,
  readRequestBodyUtf8,
  requestUrl as buildRequestUrl,
  sendJson,
} from "@backed/http-kernel";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BIND_HOST, DEFAULT_PORT, URL_PLACEHOLDER } from "./constants.js";

export { BIND_HOST } from "./constants.js";
export { RequestBodyTooLargeError } from "@backed/http-kernel";

const BODY_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 64 * 1024;

export function readBody(request: IncomingMessage, timeoutMs = BODY_TIMEOUT_MS): Promise<string> {
  return readRequestBodyUtf8(request, {
    maxBytes: MAX_BODY_BYTES,
    timeoutMs,
  });
}

export { sendJson };

export function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html);
}

export function sendNoContent(response: ServerResponse): void {
  response.writeHead(204);
  response.end();
}

export function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "not_found" });
}

export function requestUrl(request: IncomingMessage): URL {
  return buildRequestUrl(request, URL_PLACEHOLDER);
}

export function parseBearerToken(request: IncomingMessage): string | null {
  return parseBearerHeader(request.headers.authorization);
}

export function publicBaseUrl(request: IncomingMessage): string {
  const host = request.headers.host ?? `${BIND_HOST}:${String(DEFAULT_PORT)}`;
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string" && forwardedProto.length > 0
      ? (forwardedProto.split(",")[0]?.trim() ?? "http")
      : "http";
  return `${proto}://${host}`;
}
