import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ROUTES } from "./constants.js";
import {
  notFound,
  parseBearerToken,
  publicBaseUrl,
  readBody,
  requestUrl,
  sendHtml,
  sendJson,
  sendNoContent,
} from "./http.js";
import { logAuthEvent } from "./logger.js";
import {
  DEVICE_CODE_GRANT_TYPE,
  DeviceCodeGrantSchema,
  REFRESH_TOKEN_GRANT_TYPE,
  RefreshTokenGrantSchema,
  UsageRequestSchema,
} from "./schemas.js";
import {
  ACCESS_TTL_MS,
  authNow,
  defaultDevUser,
  DEVICE_POLL_INTERVAL_SEC,
  DEVICE_TTL_MS,
  getAccessTokenByRefreshToken,
  getPendingDevices,
  getSessionsByAccessToken,
  getUsageEvents,
  purgeExpiredDevices,
  type BackedUser,
  type PendingDevice,
  type StoredSession,
} from "./state.js";

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

function createDeviceAuthorization(): PendingDevice {
  purgeExpiredDevices();
  const pendingDevices = getPendingDevices();
  const deviceCode = randomToken(24);
  const userCode = formatUserCode(randomToken(4));
  const pending: PendingDevice = {
    deviceCode,
    userCode,
    expiresAt: authNow() + DEVICE_TTL_MS,
    approved: false,
    user: null,
  };
  pendingDevices.set(deviceCode, pending);
  return pending;
}

function findPendingByUserCode(userCode: string): PendingDevice | null {
  purgeExpiredDevices();
  const normalized = normalizeUserCode(userCode);
  for (const pending of getPendingDevices().values()) {
    if (normalizeUserCode(pending.userCode) === normalized) {
      return pending;
    }
  }
  return null;
}

function issueSession(user: BackedUser): StoredSession {
  const sessionsByAccessToken = getSessionsByAccessToken();
  const accessTokenByRefreshToken = getAccessTokenByRefreshToken();
  const session: StoredSession = {
    accessToken: randomToken(),
    refreshToken: randomToken(),
    user,
    expiresAt: authNow() + ACCESS_TTL_MS,
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
    expires_in: Math.max(1, Math.floor((session.expiresAt - authNow()) / 1000)),
    user: session.user,
  };
}

async function parseJsonBody(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<null | Record<string, unknown>> {
  const raw = await readBody(request);
  if (raw.length === 0) {
    sendJson(response, 400, { error: "invalid_json" });
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendJson(response, 400, { error: "invalid_json" });
    return null;
  }
}

function requireSession(request: IncomingMessage, response: ServerResponse): StoredSession | null {
  const token = parseBearerToken(request);
  if (token === null) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  const session = getSessionsByAccessToken().get(token);
  if (session === undefined || session.expiresAt <= authNow()) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function renderActivatePage(userCode: string | null, message: string | null): string {
  const value = escapeHtml(userCode ?? "");
  const banner =
    message === null
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

function handleDeviceStart(
  _request: IncomingMessage,
  response: ServerResponse,
  baseUrl: string,
): void {
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

function handleActivateGet(request: IncomingMessage, response: ServerResponse): void {
  const url = requestUrl(request);
  const userCode = url.searchParams.get("user_code");
  sendHtml(response, 200, renderActivatePage(userCode, null));
}

async function handleActivatePost(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const userCode = params.get("user_code")?.trim() ?? "";
  const pending = findPendingByUserCode(userCode);
  if (pending === null) {
    sendHtml(
      response,
      400,
      renderActivatePage(userCode, "Invalid or expired code. Run backed login again."),
    );
    return;
  }
  pending.approved = true;
  pending.user = defaultDevUser();
  sendHtml(
    response,
    200,
    renderActivatePage(userCode, "CLI authorized. You can return to the terminal."),
  );
}

function handleDeviceCodeGrant(response: ServerResponse, payload: unknown): void {
  const parsed = DeviceCodeGrantSchema.safeParse(payload);
  if (!parsed.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }
  const pending = getPendingDevices().get(parsed.data.device_code);
  if (pending === undefined || pending.expiresAt <= authNow()) {
    sendJson(response, 400, { error: "expired_token", message: "authorization_pending" });
    return;
  }
  if (!pending.approved || pending.user === null) {
    sendJson(response, 428, { error: "authorization_pending", message: "authorization_pending" });
    return;
  }
  const session = issueSession(pending.user);
  getPendingDevices().delete(parsed.data.device_code);
  sendJson(response, 200, tokenPayload(session));
}

function handleRefreshTokenGrant(response: ServerResponse, payload: unknown): void {
  const parsed = RefreshTokenGrantSchema.safeParse(payload);
  if (!parsed.success) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }
  const accessToken = getAccessTokenByRefreshToken().get(parsed.data.refresh_token);
  if (accessToken === undefined) {
    sendJson(response, 401, { error: "invalid_grant" });
    return;
  }
  const existing = getSessionsByAccessToken().get(accessToken);
  if (existing === undefined) {
    sendJson(response, 401, { error: "invalid_grant" });
    return;
  }
  getSessionsByAccessToken().delete(existing.accessToken);
  getAccessTokenByRefreshToken().delete(existing.refreshToken);
  const session = issueSession(existing.user);
  sendJson(response, 200, tokenPayload(session));
}

async function handleToken(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const payload = await parseJsonBody(request, response);
  if (payload === null) {
    return;
  }
  const grantType = "grant_type" in payload ? payload["grant_type"] : undefined;
  if (grantType === DEVICE_CODE_GRANT_TYPE) {
    handleDeviceCodeGrant(response, payload);
    return;
  }
  if (grantType === REFRESH_TOKEN_GRANT_TYPE) {
    handleRefreshTokenGrant(response, payload);
    return;
  }
  sendJson(response, 400, { error: "unsupported_grant_type" });
}

function handleMe(request: IncomingMessage, response: ServerResponse): void {
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
  const parsed = UsageRequestSchema.safeParse(payload);
  if (!parsed.success) {
    sendJson(response, 400, { error: "invalid_request", message: "operation is required" });
    return;
  }
  getUsageEvents().push({
    userId: session.user.id,
    operation: parsed.data.operation,
    recordedAt: new Date(authNow()).toISOString(),
  });
  sendNoContent(response);
}

export async function handleAuthRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = requestUrl(request);
  const baseUrl = publicBaseUrl(request);
  const method = request.method ?? "GET";
  const path = url.pathname;

  if (method === "GET" && path === ROUTES.HEALTH) {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (method === "POST" && path === ROUTES.DEVICE) {
    handleDeviceStart(request, response, baseUrl);
    return;
  }
  if (method === "GET" && path === ROUTES.ACTIVATE) {
    handleActivateGet(request, response);
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
    handleMe(request, response);
    return;
  }
  if (method === "POST" && path === ROUTES.USAGE) {
    await handleUsage(request, response);
    return;
  }
  notFound(response);
}

export function handleAuthRequestError(
  request: IncomingMessage,
  response: ServerResponse,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  logAuthEvent("request.error", message, {
    path: requestUrl(request).pathname,
    method: request.method ?? "GET",
    status: 500,
  });
  sendJson(response, 500, { error: "internal_error", message });
}
