import type { BackedCredentials, BackedUser } from "./credentials.js";
import { BACKED_CREDENTIALS_VERSION } from "./credentials.js";
import { BACKED_API_PATHS, OAUTH_GRANT_TYPE_DEVICE_CODE } from "./config.js";
export class BackedApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "BackedApiError";
        this.status = status;
    }
}
export interface DeviceAuthorizationResponse {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresIn: number;
    interval: number;
}
export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType: string;
    user: BackedUser;
}
interface ApiErrorBody {
    error?: string;
    message?: string;
}
const DEVICE_AUTH_PENDING_STATUSES = new Set([400, 428]);
function parseBackedUser(user: unknown, context: string): BackedUser {
    if (user === null || typeof user !== "object") {
        throw new Error(`Invalid user payload in ${context}.`);
    }
    const userRecord = user as Record<string, unknown>;
    const id = userRecord["id"];
    const email = userRecord["email"];
    const name = userRecord["name"];
    if (typeof id !== "string" || typeof email !== "string") {
        throw new Error(`Invalid user payload in ${context}.`);
    }
    return {
        id,
        email,
        ...(typeof name === "string" && name.length > 0 ? { name } : {}),
    };
}
function parseApiErrorBody(raw: string): string | null {
    try {
        const body = JSON.parse(raw) as ApiErrorBody;
        return body.message ?? body.error ?? null;
    }
    catch {
        return raw.trim().length > 0 ? raw : null;
    }
}
async function readApiError(response: Response): Promise<string> {
    const raw = await response.text();
    return parseApiErrorBody(raw) ?? `Request failed (${String(response.status)})`;
}
function toDeviceAuthorizationResponse(body: Record<string, unknown>): DeviceAuthorizationResponse {
    const deviceCode = body["device_code"];
    const userCode = body["user_code"];
    const verificationUri = body["verification_uri"];
    const expiresIn = body["expires_in"];
    const interval = body["interval"];
    if (typeof deviceCode !== "string" ||
        typeof userCode !== "string" ||
        typeof verificationUri !== "string" ||
        typeof expiresIn !== "number" ||
        typeof interval !== "number") {
        throw new Error("Invalid device authorization response from Backed API.");
    }
    const verificationUriComplete = body["verification_uri_complete"];
    return {
        deviceCode,
        userCode,
        verificationUri,
        ...(typeof verificationUriComplete === "string" ? { verificationUriComplete } : {}),
        expiresIn,
        interval,
    };
}
function toTokenResponse(body: Record<string, unknown>): TokenResponse {
    const accessToken = body["access_token"];
    const tokenType = body["token_type"];
    const user = body["user"];
    if (typeof accessToken !== "string" || typeof tokenType !== "string") {
        throw new Error("Invalid token response from Backed API.");
    }
    const refreshToken = body["refresh_token"];
    const expiresIn = body["expires_in"];
    return {
        accessToken,
        tokenType,
        user: parseBackedUser(user, "token response"),
        ...(typeof refreshToken === "string" ? { refreshToken } : {}),
        ...(typeof expiresIn === "number" ? { expiresIn } : {}),
    };
}
export class BackedAuthClient {
    constructor(private readonly apiUrl: string) { }
    async startDeviceAuthorization(): Promise<DeviceAuthorizationResponse> {
        const response = await fetch(`${this.apiUrl}${BACKED_API_PATHS.AUTH_DEVICE}`, {
            method: "POST",
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            throw new BackedApiError(await readApiError(response), response.status);
        }
        return toDeviceAuthorizationResponse((await response.json()) as Record<string, unknown>);
    }
    async pollDeviceAuthorization(deviceCode: string): Promise<TokenResponse | "pending"> {
        const response = await fetch(`${this.apiUrl}${BACKED_API_PATHS.AUTH_TOKEN}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                grant_type: OAUTH_GRANT_TYPE_DEVICE_CODE,
                device_code: deviceCode,
            }),
        });
        if (DEVICE_AUTH_PENDING_STATUSES.has(response.status)) {
            const message = await readApiError(response);
            if (message.includes("authorization_pending") || message.includes("pending")) {
                return "pending";
            }
            throw new BackedApiError(message, response.status);
        }
        if (!response.ok) {
            throw new BackedApiError(await readApiError(response), response.status);
        }
        return toTokenResponse((await response.json()) as Record<string, unknown>);
    }
    async exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
        const response = await fetch(`${this.apiUrl}${BACKED_API_PATHS.AUTH_TOKEN}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            throw new BackedApiError(await readApiError(response), response.status);
        }
        return toTokenResponse((await response.json()) as Record<string, unknown>);
    }
    async fetchCurrentUser(accessToken: string): Promise<BackedUser> {
        const response = await fetch(`${this.apiUrl}${BACKED_API_PATHS.ME}`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (!response.ok) {
            throw new BackedApiError(await readApiError(response), response.status);
        }
        const body = (await response.json()) as Record<string, unknown>;
        return parseBackedUser(body["user"], `${BACKED_API_PATHS.ME} response`);
    }
    async recordMcpUsage(accessToken: string, operation: string): Promise<void> {
        const response = await fetch(`${this.apiUrl}${BACKED_API_PATHS.USAGE}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ operation }),
        });
        if (!response.ok) {
            throw new BackedApiError(await readApiError(response), response.status);
        }
    }
}
export function tokenResponseToCredentials(apiUrl: string, token: TokenResponse): BackedCredentials {
    const expiresAt = token.expiresIn !== undefined
        ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
        : undefined;
    return {
        version: BACKED_CREDENTIALS_VERSION,
        apiUrl,
        accessToken: token.accessToken,
        user: token.user,
        ...(token.refreshToken !== undefined ? { refreshToken: token.refreshToken } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
}
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
