export interface BackedUser {
  id: string;
  email: string;
  name?: string;
}

export interface PendingDevice {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  approved: boolean;
  user: BackedUser | null;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: BackedUser;
  expiresAt: number;
}

export interface UsageEvent {
  userId: string;
  operation: string;
  recordedAt: string;
}

export const DEVICE_TTL_MS = 15 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_SEC = 2;

const pendingDevices = new Map<string, PendingDevice>();
const sessionsByAccessToken = new Map<string, StoredSession>();
const accessTokenByRefreshToken = new Map<string, string>();
const usageEvents: UsageEvent[] = [];

let nowFn: () => number = () => Date.now();

export function setAuthClock(fn: () => number): void {
  nowFn = fn;
}

export function resetAuthClock(): void {
  nowFn = () => Date.now();
}

export function authNow(): number {
  return nowFn();
}

export function resetAuthState(): void {
  pendingDevices.clear();
  sessionsByAccessToken.clear();
  accessTokenByRefreshToken.clear();
  usageEvents.length = 0;
  resetAuthClock();
}

export function getPendingDevices(): Map<string, PendingDevice> {
  return pendingDevices;
}

export function getSessionsByAccessToken(): Map<string, StoredSession> {
  return sessionsByAccessToken;
}

export function getAccessTokenByRefreshToken(): Map<string, string> {
  return accessTokenByRefreshToken;
}

export function getUsageEvents(): UsageEvent[] {
  return usageEvents;
}

export function purgeExpiredDevices(): void {
  const now = authNow();
  for (const [deviceCode, pending] of pendingDevices.entries()) {
    if (pending.expiresAt <= now) {
      pendingDevices.delete(deviceCode);
    }
  }
}

export function defaultDevUser(): BackedUser {
  const id = process.env["BACKED_AUTH_DEV_USER_ID"]?.trim();
  const email = process.env["BACKED_AUTH_DEV_USER_EMAIL"]?.trim();
  const name = process.env["BACKED_AUTH_DEV_USER_NAME"]?.trim();
  return {
    id: id !== undefined && id.length > 0 ? id : "dev-user",
    email: email !== undefined && email.length > 0 ? email : "dev@backed.local",
    ...(name !== undefined && name.length > 0 ? { name } : { name: "Dev User" }),
  };
}
