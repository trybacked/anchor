import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_TTL_MS,
  authNow,
  DEVICE_TTL_MS,
  getPendingDevices,
  getUsageEvents,
  resetAuthState,
  setAuthClock,
} from "../src/state.js";
import { startAuthApi } from "../src/server.js";
import { resetAuthLogger } from "../src/logger.js";

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: { id: string; email: string; name?: string };
}

describe("auth-api", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let currentTime = Date.now();

  beforeEach(async () => {
    resetAuthState();
    resetAuthLogger();
    currentTime = Date.now();
    setAuthClock(() => currentTime);
    const service = await startAuthApi({ port: 0 });
    baseUrl = service.url;
    close = service.close;
  });

  afterEach(async () => {
    await close();
  });

  async function startDeviceFlow(): Promise<DeviceAuthorizationResponse> {
    const response = await fetch(`${baseUrl}/v1/auth/device`, { method: "POST" });
    expect(response.status).toBe(200);
    return (await response.json()) as DeviceAuthorizationResponse;
  }

  async function activateDevice(userCode: string): Promise<void> {
    const response = await fetch(`${baseUrl}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_code: userCode }).toString(),
    });
    expect(response.status).toBe(200);
  }

  async function exchangeDeviceCode(deviceCode: string): Promise<TokenResponse> {
    const response = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as TokenResponse;
  }

  it("returns health status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("completes the device authorization flow", async () => {
    const device = await startDeviceFlow();
    expect(device.device_code).toBeTruthy();
    expect(device.user_code).toMatch(/^[A-Z0-9-]+$/);
    expect(device.expires_in).toBe(Math.floor(DEVICE_TTL_MS / 1000));

    const pendingResponse = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    });
    expect(pendingResponse.status).toBe(428);
    expect(await pendingResponse.json()).toEqual({
      error: "authorization_pending",
      message: "authorization_pending",
    });

    await activateDevice(device.user_code);
    const tokens = await exchangeDeviceCode(device.device_code);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.user.email).toBe("dev@backed.local");

    const me = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(me.status).toBe(200);
    const mePayload = (await me.json()) as { user: { id: string } };
    expect(mePayload.user.id).toBe("dev-user");

    const usage = await fetch(`${baseUrl}/v1/usage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "backed run" }),
    });
    expect(usage.status).toBe(204);
    expect(getUsageEvents()).toEqual([
      expect.objectContaining({
        userId: "dev-user",
        operation: "backed run",
      }),
    ]);
  });

  it("refreshes access tokens", async () => {
    const device = await startDeviceFlow();
    await activateDevice(device.user_code);
    const initial = await exchangeDeviceCode(device.device_code);

    const refreshed = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: initial.refresh_token,
      }),
    });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as TokenResponse;
    expect(next.access_token).not.toBe(initial.access_token);
    expect(next.refresh_token).not.toBe(initial.refresh_token);

    const stale = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${initial.access_token}` },
    });
    expect(stale.status).toBe(401);
  });

  it("rejects expired device codes", async () => {
    const device = await startDeviceFlow();
    await activateDevice(device.user_code);
    currentTime += DEVICE_TTL_MS + 1;

    const response = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "expired_token",
      message: "authorization_pending",
    });
  });

  it("rejects expired access tokens", async () => {
    const device = await startDeviceFlow();
    await activateDevice(device.user_code);
    const tokens = await exchangeDeviceCode(device.device_code);
    currentTime += ACCESS_TTL_MS + 1;

    const response = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status).toBe(401);
  });

  it("validates token request payloads", async () => {
    const invalidJson = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: "invalid_json" });

    const unsupportedGrant = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "password" }),
    });
    expect(unsupportedGrant.status).toBe(400);
    expect(await unsupportedGrant.json()).toEqual({ error: "unsupported_grant_type" });

    const missingDeviceCode = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    expect(missingDeviceCode.status).toBe(400);
    expect(await missingDeviceCode.json()).toEqual({ error: "invalid_request" });

    const invalidRefresh = await fetch(`${baseUrl}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: "missing",
      }),
    });
    expect(invalidRefresh.status).toBe(401);
    expect(await invalidRefresh.json()).toEqual({ error: "invalid_grant" });
  });

  it("requires auth for protected routes", async () => {
    const me = await fetch(`${baseUrl}/v1/me`);
    expect(me.status).toBe(401);

    const usage = await fetch(`${baseUrl}/v1/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "x" }),
    });
    expect(usage.status).toBe(401);
  });

  it("validates usage operation input", async () => {
    const device = await startDeviceFlow();
    await activateDevice(device.user_code);
    const tokens = await exchangeDeviceCode(device.device_code);

    const missingOperation = await fetch(`${baseUrl}/v1/usage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation: "   " }),
    });
    expect(missingOperation.status).toBe(400);

    const invalidUsageJson = await fetch(`${baseUrl}/v1/usage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: "not-json",
    });
    expect(invalidUsageJson.status).toBe(400);
  });

  it("rejects invalid activation codes", async () => {
    const response = await fetch(`${baseUrl}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_code: "ZZZZ-ZZZZ" }).toString(),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid or expired code");
  });

  it("returns not found for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("normalizes user codes with punctuation during activation", async () => {
    const device = await startDeviceFlow();
    const pending = [...getPendingDevices().values()][0];
    expect(pending).toBeDefined();

    const response = await fetch(`${baseUrl}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user_code: device.user_code.replace("-", " "),
      }).toString(),
    });
    expect(response.status).toBe(200);
    expect(pending?.approved).toBe(true);
  });

  it("does not expose secrets in responses", async () => {
    const device = await startDeviceFlow();
    const body = JSON.stringify(device);
    expect(body).not.toContain("secret");
    expect(device.device_code.length).toBeGreaterThan(20);
    expect(authNow()).toBe(currentTime);
  });
});
