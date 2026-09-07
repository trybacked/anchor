import { BackedApiError, BackedAuthClient } from "./auth/api-client.js";
import type { BackedCredentials } from "./auth/credentials.js";
import { readBackedCredentials } from "./auth/credentials.js";
import { resolveBackedApiUrl, BACKED_API_PATHS } from "./auth/config.js";
import { verifyAccessToken } from "./auth/device-flow.js";
import { COMMANDS, formatCliCommand } from "./config.js";
export class ServeAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ServeAuthError";
    }
}
export interface ServeAuthContext {
    apiUrl: string;
    credentials: BackedCredentials;
    recordUsage: (operation: string) => Promise<void>;
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
export async function resolveServeAuthContext(): Promise<ServeAuthContext> {
    const apiUrl = resolveBackedApiUrl();
    const credentials = readBackedCredentials();
    if (credentials === null) {
        throw new ServeAuthError(`Authentication required. Run ${formatCliCommand(COMMANDS.LOGIN)} before ${formatCliCommand(COMMANDS.SERVE)}.`);
    }
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
        apiUrl,
        credentials,
        recordUsage: async (operation: string) => {
            await client.recordMcpUsage(credentials.accessToken, operation);
        },
    };
}
