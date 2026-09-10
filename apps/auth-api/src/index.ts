import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

interface BackedUser {
    id: string;
    email: string;
    name?: string;
}

interface PendingDevice {
    deviceCode: string;
    userCode: string;
    expiresAt: number;
    approved: boolean;
    user: BackedUser | null;
}

interface StoredSession {
    accessToken: string;
    refreshToken: string;
    user: BackedUser;
    expiresAt: number;
}

interface UsageEvent {
    userId: string;
    operation: string;
    recordedAt: string;
}

const DEFAULT_PORT = 8787;
const BIND_HOST = "127.0.0.1";
const URL_PLACEHOLDER = "http://localhost";
const DEVICE_TTL_MS = 15 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const DEVICE_POLL_INTERVAL_SEC = 2;

const ROUTES = {
    HEALTH: "/health",
    DEVICE: "/v1/auth/device",
    ACTIVATE: "/activate",
    TOKEN: "/v1/auth/token",
    ME: "/v1/me",
    USAGE: "/v1/usage",
} as const;

const GRANT_TYPE = {
    DEVICE_CODE: "urn:ietf:params:oauth:grant-type:device_code",
    REFRESH_TOKEN: "refresh_token",
} as const;

const pendingDevices = new Map<string, PendingDevice>();
const sessionsByAccessToken = new Map<string, StoredSession>();
const accessTokenByRefreshToken = new Map<string, string>();
const usageEvents: UsageEvent[] = [];

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        request.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        request.on("error", reject);
    });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
    response.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
    });
    response.end(html);
}

function sendNoContent(response: ServerResponse): void {
    response.writeHead(204);
    response.end();
}

function notFound(response: ServerResponse): void {
    sendJson(response, 404, { error: "not_found" });
}

function requestUrl(request: IncomingMessage): URL {
    return new URL(request.url ?? "/", URL_PLACEHOLDER);
}

function parseBearerToken(request: IncomingMessage): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ") !== true) {
        return null;
    }
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
}

function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
}

function normalizeUserCode(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatUserCode(raw: string): string {
    const normalized = normalizeUserCode(raw);
    if (normalized.length <= 4) {
        return normalized;
    }
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function defaultDevUser(): BackedUser {
    const id = process.env["BACKED_AUTH_DEV_USER_ID"]?.trim();
    const email = process.env["BACKED_AUTH_DEV_USER_EMAIL"]?.trim();
    const name = process.env["BACKED_AUTH_DEV_USER_NAME"]?.trim();
    return {
        id: id !== undefined && id.length > 0 ? id : "dev-user",
        email: email !== undefined && email.length > 0 ? email : "dev@backed.local",
        ...(name !== undefined && name.length > 0 ? { name } : { name: "Dev User" }),
    };
}

function publicBaseUrl(request: IncomingMessage): string {
    const configured = process.env["BACKED_AUTH_PUBLIC_URL"]?.trim();
    if (configured !== undefined && configured.length > 0) {
        return configured.replace(/\/+$/, "");
    }
    const host = request.headers.host ?? `${BIND_HOST}:${String(DEFAULT_PORT)}`;
    return `http://${host}`;
}

function purgeExpiredDevices(): void {
    const now = Date.now();
    for (const [deviceCode, pending] of pendingDevices.entries()) {
        if (pending.expiresAt <= now) {
            pendingDevices.delete(deviceCode);
        }
    }
}

function createDeviceAuthorization(): PendingDevice {
    purgeExpiredDevices();
    const deviceCode = randomToken(24);
    const userCode = formatUserCode(randomToken(4));
    const pending: PendingDevice = {
        deviceCode,
        userCode,
        expiresAt: Date.now() + DEVICE_TTL_MS,
        approved: false,
        user: null,
    };
    pendingDevices.set(deviceCode, pending);
    return pending;
}

function findPendingByUserCode(userCode: string): PendingDevice | null {
    purgeExpiredDevices();
    const normalized = normalizeUserCode(userCode);
    for (const pending of pendingDevices.values()) {
        if (normalizeUserCode(pending.userCode) === normalized) {
            return pending;
        }
    }
    return null;
}

function issueSession(user: BackedUser): StoredSession {
    const session: StoredSession = {
        accessToken: randomToken(),
        refreshToken: randomToken(),
        user,
        expiresAt: Date.now() + ACCESS_TTL_MS,
    };
    sessionsByAccessToken.set(session.accessToken, session);
    accessTokenByRefreshToken.set(session.refreshToken, session.accessToken);
    return session;
}

function tokenPayload(session: StoredSession): Record<string, unknown> {
    return {
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        token_type: "Bearer",
        expires_in: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
        user: session.user,
    };
}

async function parseJsonBody(
    request: IncomingMessage,
    response: ServerResponse,
): Promise<Record<string, unknown> | null> {
    const raw = await readBody(request);
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    }
    catch {
        sendJson(response, 400, { error: "invalid_json" });
        return null;
    }
}

function requireSession(
    request: IncomingMessage,
    response: ServerResponse,
): StoredSession | null {
    const token = parseBearerToken(request);
    if (token === null) {
        sendJson(response, 401, { error: "unauthorized" });
        return null;
    }
    const session = sessionsByAccessToken.get(token);
    if (session === undefined || session.expiresAt <= Date.now()) {
        sendJson(response, 401, { error: "unauthorized" });
        return null;
    }
    return session;
}

function renderActivatePage(userCode: string | null, message: string | null): string {
    const value = escapeHtml(userCode ?? "");
    const banner = message === null
        ? ""
        : `<p style="font-family: sans-serif; color: #333;">${escapeHtml(message)}</p>`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Backed CLI authorization</title>
  </head>
  <body style="font-family: sans-serif; max-width: 32rem; margin: 3rem auto; color: #111;">
    <h1>Authorize Backed CLI</h1>
    <p>Confirm the code shown in your terminal, then authorize this machine.</p>
    ${banner}
    <form method="post" action="${ROUTES.ACTIVATE}">
      <label for="user_code">Device code</label><br />
      <input id="user_code" name="user_code" value="${value}" required style="font-size: 1.1rem; padding: 0.4rem;" /><br /><br />
      <button type="submit" style="font-size: 1rem; padding: 0.5rem 1rem;">Authorize CLI</button>
    </form>
  </body>
</html>`;
}

async function handleDeviceStart(_request: IncomingMessage, response: ServerResponse, baseUrl: string): Promise<void> {
    const pending = createDeviceAuthorization();
    sendJson(response, 200, {
        device_code: pending.deviceCode,
        user_code: pending.userCode,
        verification_uri: `${baseUrl}${ROUTES.ACTIVATE}`,
        verification_uri_complete: `${baseUrl}${ROUTES.ACTIVATE}?user_code=${encodeURIComponent(pending.userCode)}`,
        expires_in: Math.floor(DEVICE_TTL_MS / 1000),
        interval: DEVICE_POLL_INTERVAL_SEC,
    });
}

async function handleActivateGet(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = requestUrl(request);
    const userCode = url.searchParams.get("user_code");
    sendHtml(response, 200, renderActivatePage(userCode, null));
}

async function handleActivatePost(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readBody(request);
    const params = new URLSearchParams(body);
    const userCode = params.get("user_code")?.trim() ?? "";
    const pending = findPendingByUserCode(userCode);
    if (pending === null) {
        sendHtml(response, 400, renderActivatePage(userCode, "Invalid or expired code. Run backed login again."));
        return;
    }
    pending.approved = true;
    pending.user = defaultDevUser();
    sendHtml(response, 200, renderActivatePage(userCode, "CLI authorized. You can return to the terminal."));
}

async function handleDeviceCodeGrant(
    response: ServerResponse,
    payload: Record<string, unknown>,
): Promise<void> {
    const deviceCode = payload["device_code"];
    if (typeof deviceCode !== "string") {
        sendJson(response, 400, { error: "invalid_request" });
        return;
    }
    const pending = pendingDevices.get(deviceCode);
    if (pending === undefined || pending.expiresAt <= Date.now()) {
        sendJson(response, 400, { error: "expired_token", message: "authorization_pending" });
        return;
    }
    if (!pending.approved || pending.user === null) {
        sendJson(response, 428, { error: "authorization_pending", message: "authorization_pending" });
        return;
    }
    const session = issueSession(pending.user);
    pendingDevices.delete(deviceCode);
    sendJson(response, 200, tokenPayload(session));
}

async function handleRefreshTokenGrant(
    response: ServerResponse,
    payload: Record<string, unknown>,
): Promise<void> {
    const refreshToken = payload["refresh_token"];
    if (typeof refreshToken !== "string") {
        sendJson(response, 400, { error: "invalid_request" });
        return;
    }
    const accessToken = accessTokenByRefreshToken.get(refreshToken);
    if (accessToken === undefined) {
        sendJson(response, 401, { error: "invalid_grant" });
        return;
    }
    const existing = sessionsByAccessToken.get(accessToken);
    if (existing === undefined) {
        sendJson(response, 401, { error: "invalid_grant" });
        return;
    }
    sessionsByAccessToken.delete(existing.accessToken);
    accessTokenByRefreshToken.delete(existing.refreshToken);
    const session = issueSession(existing.user);
    sendJson(response, 200, tokenPayload(session));
}

async function handleToken(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const payload = await parseJsonBody(request, response);
    if (payload === null) {
        return;
    }
    const grantType = payload["grant_type"];
    if (grantType === GRANT_TYPE.DEVICE_CODE) {
        await handleDeviceCodeGrant(response, payload);
        return;
    }
    if (grantType === GRANT_TYPE.REFRESH_TOKEN) {
        await handleRefreshTokenGrant(response, payload);
        return;
    }
    sendJson(response, 400, { error: "unsupported_grant_type" });
}

async function handleMe(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = requireSession(request, response);
    if (session === null) {
        return;
    }
    sendJson(response, 200, { user: session.user });
}

async function handleUsage(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = requireSession(request, response);
    if (session === null) {
        return;
    }
    const payload = await parseJsonBody(request, response);
    if (payload === null) {
        return;
    }
    const operation = payload["operation"];
    if (typeof operation !== "string" || operation.trim().length === 0) {
        sendJson(response, 400, { error: "invalid_request", message: "operation is required" });
        return;
    }
    usageEvents.push({
        userId: session.user.id,
        operation: operation.trim(),
        recordedAt: new Date().toISOString(),
    });
    sendNoContent(response);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = requestUrl(request);
    const baseUrl = publicBaseUrl(request);
    const method = request.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === ROUTES.HEALTH) {
        sendJson(response, 200, { ok: true });
        return;
    }
    if (method === "POST" && path === ROUTES.DEVICE) {
        await handleDeviceStart(request, response, baseUrl);
        return;
    }
    if (method === "GET" && path === ROUTES.ACTIVATE) {
        await handleActivateGet(request, response);
        return;
    }
    if (method === "POST" && path === ROUTES.ACTIVATE) {
        await handleActivatePost(request, response);
        return;
    }
    if (method === "POST" && path === ROUTES.TOKEN) {
        await handleToken(request, response);
        return;
    }
    if (method === "GET" && path === ROUTES.ME) {
        await handleMe(request, response);
        return;
    }
    if (method === "POST" && path === ROUTES.USAGE) {
        await handleUsage(request, response);
        return;
    }
    notFound(response);
}

const port = Number(process.env["PORT"] ?? DEFAULT_PORT);

createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 500, { error: "internal_error", message });
    });
}).listen(port, BIND_HOST, () => {
    console.error(`Backed auth API listening on http://${BIND_HOST}:${String(port)}`);
});
