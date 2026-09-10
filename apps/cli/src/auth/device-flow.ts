import { spawn } from "node:child_process";
import { BackedAuthClient, sleep, tokenResponseToCredentials, type TokenResponse, } from "./api-client.js";
import type { BackedCredentials } from "./credentials.js";
export interface DeviceFlowCallbacks {
    onInstructions?: (browserUrl: string, userCode: string) => void;
    onPollStart?: () => void;
    onPollStop?: () => void;
}
export interface DeviceFlowOptions {
    apiUrl: string;
    openBrowser?: boolean;
    callbacks?: DeviceFlowCallbacks;
}
function openBrowser(url: string): void {
    const platform = process.platform;
    const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
        spawn(command, args, { stdio: "ignore", detached: true }).unref();
    }
    catch {
        // Opening the browser is best-effort; device flow still works via printed URL.
    }
}
export async function runDeviceLogin(options: DeviceFlowOptions): Promise<BackedCredentials> {
    const client = new BackedAuthClient(options.apiUrl);
    const device = await client.startDeviceAuthorization();
    const browserUrl = device.verificationUriComplete ?? device.verificationUri;
    options.callbacks?.onInstructions?.(browserUrl, device.userCode);
    if (options.openBrowser !== false) {
        openBrowser(browserUrl);
    }
    const deadline = Date.now() + device.expiresIn * 1000;
    const intervalMs = device.interval * 1000;
    options.callbacks?.onPollStart?.();
    try {
        while (Date.now() < deadline) {
            await sleep(intervalMs);
            const result = await client.pollDeviceAuthorization(device.deviceCode);
            if (result === "pending") {
                continue;
            }
            return tokenResponseToCredentials(options.apiUrl, result);
        }
        throw new Error("Device authorization timed out. Run backed login again.");
    }
    finally {
        options.callbacks?.onPollStop?.();
    }
}
export async function verifyAccessToken(apiUrl: string, accessToken: string): Promise<TokenResponse["user"]> {
    const client = new BackedAuthClient(apiUrl);
    return client.fetchCurrentUser(accessToken);
}
