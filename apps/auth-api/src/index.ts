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

const DEFAULT_PORT = 8787;
const DEVICE_TTL_MS = 15 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;

const pendingDevices = new Map<string, PendingDevice>();
const sessionsByAccessToken = new Map<string, StoredSession>();
const accessTokenByRefreshToken = new Map<string, string>();

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

function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "not_found" });
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

function formatUserCode(raw: string): string {
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

function defaultDevUser(): BackedUser {
  return {
    id: "dev-user",
    email: "dev@backed.local",
    name: "Dev User",
  };
}

function publicBaseUrl(request: IncomingMessage): string {
  const configured = process.env["BACKED_AUTH_PUBLIC_URL"]?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }

  const host = request.headers.host ?? `127.0.0.1:${String(DEFAULT_PORT)}`;
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
  const normalized = userCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  for (const pending of pendingDevices.values()) {
    if (pending.userCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === normalized) {
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

function renderActivatePage(userCode: string | null, message: string | null): string {
  const value = userCode ?? "";
  const banner =
    message === null
      ? ""
      : `<p style="font-family: sans-serif; color: #333;">${message}</p>`;

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
    <form method="post" action="/activate">
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
    verification_uri: `${baseUrl}/activate`,
    verification_uri_complete: `${baseUrl}/activate?user_code=${encodeURIComponent(pending.userCode)}`,
    expires_in: Math.floor(DEVICE_TTL_MS / 1000),
    interval: 2,
  });
}

async function handleActivateGet(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
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

async function handleToken(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const raw = await readBody(request);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendJson(response, 400, { error: "invalid_json" });
    return;
  }

  const grantType = payload["grant_type"];
  if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
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
    return;
  }

  if (grantType === "refresh_token") {
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
    return;
  }

  sendJson(response, 400, { error: "unsupported_grant_type" });
}

async function handleMe(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const token = parseBearerToken(request);
  if (token === null) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const session = sessionsByAccessToken.get(token);
  if (session === undefined || session.expiresAt <= Date.now()) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  sendJson(response, 200, { user: session.user });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const baseUrl = publicBaseUrl(request);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/device") {
    await handleDeviceStart(request, response, baseUrl);
    return;
  }

  if (request.method === "GET" && url.pathname === "/activate") {
    await handleActivateGet(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/activate") {
    await handleActivatePost(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/token") {
    await handleToken(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/me") {
    await handleMe(request, response);
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
}).listen(port, "127.0.0.1", () => {
  console.error(`Backed auth API listening on http://127.0.0.1:${String(port)}`);
});
