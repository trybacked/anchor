import { BackedApiError, BackedAuthClient } from "./auth/api-client.js";
import type { BackedCredentials } from "./auth/credentials.js";
import { readBackedCredentials } from "./auth/credentials.js";
import { resolveBackedApiUrl, BACKED_API_PATHS } from "./auth/config.js";
import { verifyAccessToken } from "./auth/device-flow.js";
import { COMMANDS, formatCliCommand } from "./config.js";
import type { ServeUsageRecorder } from "@backed/mcp";

export const BACKED_TELEMETRY_ENV = "BACKED_TELEMETRY";

export class ServeAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ServeAuthError";
    }
}

export interface ServeContext {
    mode: "local" | "telemetry";
    userEmail?: string;
    usageRecorder?: ServeUsageRecorder;
}

function isTelemetryEnabled(env: Record<string, string | undefined>): boolean {
    const raw = env[BACKED_TELEMETRY_ENV]?.trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
}

async function assertGatewayReachable(apiUrl: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`${apiUrl}${BACKED_API_PATHS.HEALTH}`, {
            headers: { Accept: "application/json" },
        });
    }
    catch {
        throw new ServeAuthError(`Backed gateway unreachable at ${apiUrl}. Check your network connection and try again.`);
    }
    if (!response.ok) {
        throw new ServeAuthError(`Backed gateway unreachable at ${apiUrl} (HTTP ${String(response.status)}).`);
    }
}

async function buildTelemetryRecorder(credentials: BackedCredentials): Promise<ServeContext> {
    const apiUrl = resolveBackedApiUrl();
    await assertGatewayReachable(apiUrl);
    try {
        await verifyAccessToken(apiUrl, credentials.accessToken);
    }
    catch (error) {
        if (error instanceof BackedApiError && error.status === 401) {
            throw new ServeAuthError(`Backed session expired or invalid. Run ${formatCliCommand(COMMANDS.LOGIN)} again.`);
        }
        const message = error instanceof Error ? error.message : "Unable to verify Backed credentials.";
        throw new ServeAuthError(message);
    }
    const client = new BackedAuthClient(apiUrl);
    return {
        mode: "telemetry",
        userEmail: credentials.user.email,
        usageRecorder: {
            record: async (operation: string) => {
                await client.recordMcpUsage(credentials.accessToken, operation);
            },
        },
    };
}

export async function resolveServeContext(env: Record<string, string | undefined> = process.env): Promise<ServeContext> {
    if (!isTelemetryEnabled(env)) {
        return { mode: "local" };
    }
    const credentials = readBackedCredentials();
    if (credentials === null) {
        return { mode: "local" };
    }
    return buildTelemetryRecorder(credentials);
}
