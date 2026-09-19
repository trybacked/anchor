import type { IncomingMessage, ServerResponse } from "node:http";

export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${String(maxBytes)} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export interface ReadRequestBodyOptions {
  maxBytes: number;
  timeoutMs?: number;
}

export async function readRequestBody(
  request: IncomingMessage,
  options: ReadRequestBodyOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let timeout: NodeJS.Timeout | undefined;
    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        reject(new Error("Request body read timed out"));
        request.destroy();
      }, options.timeoutMs);
    }

    const cleanup = (): void => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > options.maxBytes) {
        cleanup();
        reject(new RequestBodyTooLargeError(options.maxBytes));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    });
    request.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

export async function readRequestBodyUtf8(
  request: IncomingMessage,
  options: ReadRequestBodyOptions,
): Promise<string> {
  const body = await readRequestBody(request, options);
  return body.toString("utf8");
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

export function parseBearerToken(headerValue: string | undefined): string | null {
  if (headerValue === undefined) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  const token = match?.[1]?.trim();
  return token !== undefined && token.length > 0 ? token : null;
}

export function requestPathname(request: IncomingMessage, baseUrl: string): string {
  return new URL(request.url ?? "/", baseUrl).pathname;
}

export function requestUrl(request: IncomingMessage, baseUrl: string): URL {
  return new URL(request.url ?? "/", baseUrl);
}
