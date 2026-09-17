import type { IncomingMessage, ServerResponse } from "node:http";
import { BIND_HOST, DEFAULT_PORT, URL_PLACEHOLDER } from "./constants.js";

export { BIND_HOST } from "./constants.js";

const BODY_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 64 * 1024;

export class RequestBodyTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body exceeds ${String(maxBytes)} bytes`);
    this.name = "RequestBodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export function readBody(request: IncomingMessage, timeoutMs = BODY_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const timeout = setTimeout(() => {
      reject(new Error("Request body read timed out"));
      request.destroy();
    }, timeoutMs);

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        clearTimeout(timeout);
        reject(new RequestBodyTooLargeError(MAX_BODY_BYTES));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

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
  return new URL(request.url ?? "/", URL_PLACEHOLDER);
}

export function parseBearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
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
