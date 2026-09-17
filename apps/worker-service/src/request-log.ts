import type { IncomingMessage } from "node:http";

export type HttpLogEvent = "http.request" | "http.error";

export interface HttpLogEntry {
  event: HttpLogEvent;
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  tenantId?: string;
  error?: string;
}

export interface HttpLogger {
  emit(entry: HttpLogEntry): void;
}

function writeHttpLog(entry: HttpLogEntry): void {
  console.log(JSON.stringify(entry));
}

let logger: HttpLogger = { emit: writeHttpLog };

export function setHttpLogger(customLogger: HttpLogger): void {
  logger = customLogger;
}

export function resetHttpLogger(): void {
  logger = { emit: writeHttpLog };
}

export function logHttpRequest(input: {
  request: IncomingMessage;
  status: number;
  startedAtMs: number;
  tenantId?: string;
  error?: string;
}): void {
  const url = new URL(input.request.url ?? "/", "http://127.0.0.1");
  logger.emit({
    event: input.error === undefined ? "http.request" : "http.error",
    ts: new Date().toISOString(),
    method: input.request.method ?? "GET",
    path: url.pathname,
    status: input.status,
    durationMs: Math.max(0, Date.now() - input.startedAtMs),
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
  });
}
