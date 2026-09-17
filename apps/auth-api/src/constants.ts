export const DEFAULT_PORT = 8787;
export const BIND_HOST = "127.0.0.1";
export const URL_PLACEHOLDER = "http://localhost";
export const DEVICE_TTL_MS = 15 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_SEC = 2;

export const ROUTES = {
  HEALTH: "/health",
  DEVICE: "/v1/auth/device",
  ACTIVATE: "/activate",
  TOKEN: "/v1/auth/token",
  ME: "/v1/me",
  USAGE: "/v1/usage",
} as const;

export const GRANT_TYPE = {
  DEVICE_CODE: "urn:ietf:params:oauth:grant-type:device_code",
  REFRESH_TOKEN: "refresh_token",
} as const;
