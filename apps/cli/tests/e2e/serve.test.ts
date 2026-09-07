import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tokenResponseToCredentials } from "../../src/auth/api-client.js";
import { writeBackedCredentials } from "../../src/auth/credentials.js";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI_PATH = join(REPO_ROOT, "apps/cli/dist/cli.js");
const FIXTURE_ROOT = join(REPO_ROOT, "fixtures/pmi-minimal");
let authServer: Server;
let authBaseUrl: string;
let credentialsPath: string;
let tempDir: string;
async function startAuthApi(): Promise<string> {
    const pending = new Map<string, {
        approved: boolean;
        userCode: string;
    }>();
    const sessions = new Map<string, {
        user: {
            id: string;
            email: string;
        };
    }>();
    return new Promise((resolve, reject) => {
        authServer = createServer((request, response) => {
            void (async () => {
                const url = new URL(request.url ?? "/", "http://127.0.0.1");
                if (request.method === "GET" && url.pathname === "/health") {
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify({ ok: true }));
                    return;
                }
                if (request.method === "POST" && url.pathname === "/v1/auth/device") {
                    const deviceCode = "device-test";
                    pending.set(deviceCode, { approved: false, userCode: "ABCD-1234" });
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify({
                        device_code: deviceCode,
                        user_code: "ABCD-1234",
                        verification_uri: "http://127.0.0.1/activate",
                        expires_in: 900,
                        interval: 1,
                    }));
                    return;
                }
                if (request.method === "POST" && url.pathname === "/activate") {
                    const entry = pending.get("device-test");
                    if (entry !== undefined) {
                        entry.approved = true;
                    }
                    response.writeHead(200);
                    response.end("ok");
                    return;
                }
                if (request.method === "POST" && url.pathname === "/v1/auth/token") {
                    const entry = pending.get("device-test");
                    if (entry?.approved !== true) {
                        response.writeHead(428, { "Content-Type": "application/json" });
                        response.end(JSON.stringify({ error: "authorization_pending" }));
                        return;
                    }
                    const token = "access-test-token";
                    sessions.set(token, { user: { id: "test-user", email: "test@backed.local" } });
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify({
                        access_token: token,
                        token_type: "Bearer",
                        expires_in: 3600,
                        user: { id: "test-user", email: "test@backed.local" },
                    }));
                    return;
                }
                if (request.method === "GET" && url.pathname === "/v1/me") {
                    const header = request.headers.authorization ?? "";
                    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
                    const session = sessions.get(token);
                    if (session === undefined) {
                        response.writeHead(401, { "Content-Type": "application/json" });
                        response.end(JSON.stringify({ error: "unauthorized" }));
                        return;
                    }
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify({ user: session.user }));
                    return;
                }
                if (request.method === "POST" && url.pathname === "/v1/usage") {
                    response.writeHead(204);
                    response.end();
                    return;
                }
                response.writeHead(404);
                response.end();
            })().catch(() => {
                response.writeHead(500);
                response.end();
            });
        });
        authServer.listen(0, "127.0.0.1", () => {
            const address = authServer.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Unable to bind auth test server"));
                return;
            }
            authBaseUrl = `http://127.0.0.1:${String(address.port)}`;
            resolve(authBaseUrl);
        });
    });
}
async function loginViaDeviceFlow(apiUrl: string, credentialsFile: string): Promise<void> {
    const deviceResponse = await fetch(`${apiUrl}/v1/auth/device`, { method: "POST" });
    const device = (await deviceResponse.json()) as {
        device_code: string;
        user_code: string;
    };
    await fetch(`${apiUrl}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user_code: device.user_code }),
    });
    let tokenPayload: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const tokenResponse = await fetch(`${apiUrl}/v1/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: device.device_code,
            }),
        });
        if (tokenResponse.status === 200) {
            tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (tokenPayload === null) {
        throw new Error("Device login failed in e2e setup");
    }
    const credentials = tokenResponseToCredentials(apiUrl, {
        accessToken: String(tokenPayload["access_token"]),
        tokenType: "Bearer",
        user: { id: "test-user", email: "test@backed.local" },
    });
    process.env["BACKED_CREDENTIALS_PATH"] = credentialsFile;
    writeBackedCredentials(credentials);
}
function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
    const block = result.content[0];
    if (block === undefined || block.type !== "text") {
        throw new Error("Expected text MCP response");
    }
    return JSON.parse(block.text);
}
async function withMcpClient<T>(env: NodeJS.ProcessEnv, cwd: string, run: (client: Client) => Promise<T>): Promise<T> {
    const transport = new StdioClientTransport({
        command: "node",
        args: [CLI_PATH, "serve"],
        cwd,
        env,
    });
    const client = new Client({ name: "serve-e2e", version: "0.0.0" });
    await client.connect(transport);
    try {
        return await run(client);
    }
    finally {
        await client.close();
    }
}
function runServeAndCapture(cwd: string, env: NodeJS.ProcessEnv, timeoutMs = 3000): Promise<{
    exitCode: number | null;
    stderr: string;
}> {
    return new Promise((resolve) => {
        const child = spawn("node", [CLI_PATH, "serve"], { cwd, env });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
        }, timeoutMs);
        child.on("exit", (exitCode) => {
            clearTimeout(timer);
            resolve({ exitCode, stderr });
        });
    });
}
describe("backed serve e2e", () => {
    beforeAll(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "backed-serve-e2e-"));
        credentialsPath = join(tempDir, "credentials.json");
        authBaseUrl = await startAuthApi();
        await loginViaDeviceFlow(authBaseUrl, credentialsPath);
    });
    afterAll(async () => {
        await new Promise<void>((resolve) => {
            authServer.close(() => resolve());
        });
        await rm(tempDir, { recursive: true, force: true });
        delete process.env["BACKED_CREDENTIALS_PATH"];
        delete process.env["BACKED_API_URL"];
    });
    it("runs the five MCP operations on pmi-minimal", async () => {
        const env = {
            ...process.env,
            BACKED_API_URL: authBaseUrl,
            BACKED_CREDENTIALS_PATH: credentialsPath,
        };
        await withMcpClient(env, FIXTURE_ROOT, async (client) => {
            const entities = parseToolJson(await client.callTool({ name: "list_entities", arguments: {} }));
            expect(entities).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: "cliente", status: "confirmed" }),
            ]));
            const entity = parseToolJson(await client.callTool({ name: "get_entity", arguments: { id: "cliente" } }));
            expect(entity).toEqual(expect.objectContaining({
                id: "cliente",
                properties: expect.arrayContaining([
                    expect.objectContaining({ semanticType: "vat_number", role: "attribute" }),
                ]),
            }));
            const relations = parseToolJson(await client.callTool({ name: "list_relations", arguments: { entity_id: "fattura" } }));
            expect(relations).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: "fattura-cliente", cardinality: "one_to_many" }),
            ]));
            const search = parseToolJson(await client.callTool({ name: "search_model", arguments: { query: "cliente" } }));
            expect(search).toEqual(expect.arrayContaining([
                expect.objectContaining({ kind: "entity", id: "cliente" }),
            ]));
            const definition = parseToolJson(await client.callTool({ name: "get_definition", arguments: { term: "fattura scaduta" } }));
            expect(definition).toEqual(expect.objectContaining({
                found: true,
                id: "fattura-scaduta",
                status: "confirmed",
            }));
        });
    });
    it("refuses to start without credentials", async () => {
        const missingCredentialsPath = join(tempDir, "missing-credentials.json");
        const result = await runServeAndCapture(FIXTURE_ROOT, {
            ...process.env,
            BACKED_API_URL: authBaseUrl,
            BACKED_CREDENTIALS_PATH: missingCredentialsPath,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("backed login");
    });
});
