export const DEFAULT_BACKED_API_URL = "https://api.backed.app";

export const BACKED_API_PATHS = {
    HEALTH: "/health",
    AUTH_DEVICE: "/v1/auth/device",
    AUTH_TOKEN: "/v1/auth/token",
    ME: "/v1/me",
    USAGE: "/v1/usage",
} as const;

export const OAUTH_GRANT_TYPE_DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";

export function resolveBackedApiUrl(): string {
    const configured = process.env["BACKED_API_URL"]?.trim();
    if (configured !== undefined && configured.length > 0) {
        return configured.replace(/\/+$/, "");
    }
    return DEFAULT_BACKED_API_URL;
}
