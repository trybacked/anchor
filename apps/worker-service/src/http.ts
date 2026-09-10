import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiErrorResponse } from "./api-types.js";

export async function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        request.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new PayloadTooLargeError(maxBytes));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            resolve(Buffer.concat(chunks));
        });
        request.on("error", reject);
    });
}

export class PayloadTooLargeError extends Error {
    constructor(public readonly maxBytes: number) {
        super(`Payload exceeds ${String(maxBytes)} bytes`);
        this.name = "PayloadTooLargeError";
    }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(body));
}

export function sendApiError(response: ServerResponse, status: number, body: ApiErrorResponse): void {
    sendJson(response, status, body);
}

export function sendYaml(response: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
    response.writeHead(status, {
        "Content-Type": "application/yaml; charset=utf-8",
        ...headers,
    });
    response.end(body);
}

export function parseBearerToken(headerValue: string | undefined): string | null {
    if (headerValue === undefined) {
        return null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
    return match?.[1]?.trim() ?? null;
}
