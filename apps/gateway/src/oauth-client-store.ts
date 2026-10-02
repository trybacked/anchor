import { createHash } from "node:crypto";
import type { GatewayConfig } from "./config.js";

export type RegisteredOAuthClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  corsOrigins: string[];
  clientSecretHash: string | null;
};

type InternalClientPayload = {
  clientId: string;
  name: string;
  redirectUris: string[];
  corsOrigins: string[];
  clientSecretHash: string | null;
};

type CacheEntry = {
  expiresAt: number;
  clients: RegisteredOAuthClient[];
  etag: string | undefined;
};

const CACHE_TTL_MS = 30_000;

let cache: CacheEntry | undefined;

function mapClient(raw: InternalClientPayload): RegisteredOAuthClient {
  return {
    clientId: raw.clientId,
    name: raw.name,
    redirectUris: raw.redirectUris,
    corsOrigins: raw.corsOrigins,
    clientSecretHash: raw.clientSecretHash,
  };
}

async function fetchClientsFromControlPlane(
  config: GatewayConfig,
): Promise<{ clients: RegisteredOAuthClient[]; etag: string | undefined }> {
  const baseUrl = config.controlPlaneUrl?.replace(/\/+$/, "");
  const token = config.controlPlaneInternalToken;
  if (baseUrl === undefined || token === undefined) {
    return { clients: [], etag: undefined };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (cache?.etag !== undefined) {
    headers["If-None-Match"] = cache.etag;
  }
  const response = await fetch(`${baseUrl}/v1/oauth-clients`, { headers });
  if (response.status === 304 && cache !== undefined) {
    return { clients: cache.clients, etag: cache.etag };
  }
  if (!response.ok) {
    console.error("Failed to load OAuth clients from control plane:", response.status);
    return cache !== undefined ? { clients: cache.clients, etag: cache.etag } : { clients: [], etag: undefined };
  }
  const payload = (await response.json()) as { clients?: InternalClientPayload[] };
  const clients = Array.isArray(payload.clients) ? payload.clients.map(mapClient) : [];
  const etag = response.headers.get("ETag") ?? undefined;
  return { clients, etag };
}

export async function listRegisteredOAuthClients(
  config: GatewayConfig,
): Promise<RegisteredOAuthClient[]> {
  const now = Date.now();
  if (cache !== undefined && cache.expiresAt > now) {
    return cache.clients;
  }
  const loaded = await fetchClientsFromControlPlane(config);
  cache = {
    clients: loaded.clients,
    etag: loaded.etag,
    expiresAt: now + CACHE_TTL_MS,
  };
  return loaded.clients;
}

export async function getRegisteredOAuthClient(
  config: GatewayConfig,
  clientId: string,
): Promise<RegisteredOAuthClient | undefined> {
  const clients = await listRegisteredOAuthClients(config);
  return clients.find((entry) => entry.clientId === clientId);
}

export function verifyRegisteredClientSecret(
  client: RegisteredOAuthClient,
  secret: string,
  pepper: string,
): boolean {
  if (client.clientSecretHash === null) {
    return false;
  }
  const hash = createHash("sha256").update(`${pepper}:${secret}`, "utf8").digest("hex");
  return hash === client.clientSecretHash;
}

export function invalidateOAuthClientCache(): void {
  cache = undefined;
}

export function collectCorsOrigins(clients: RegisteredOAuthClient[]): Set<string> {
  const origins = new Set<string>();
  for (const client of clients) {
    for (const origin of client.corsOrigins) {
      origins.add(origin);
    }
  }
  return origins;
}
