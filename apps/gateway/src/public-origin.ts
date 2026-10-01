import type { Context } from "hono";
import type { GatewayConfig } from "./config.js";

function firstHeaderValue(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const first = value.split(",")[0];
  return first?.trim();
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

/** HTTPS origin for OpenAPI / Scalar (avoids mixed content behind TLS-terminating proxies). */
export function resolvePublicOrigin(c: Context, config: GatewayConfig): string {
  if (config.publicOrigin !== undefined) {
    return config.publicOrigin.replace(/\/$/, "");
  }

  const forwardedHost = firstHeaderValue(c.req.header("x-forwarded-host"));
  const hostHeader = firstHeaderValue(c.req.header("host"));
  const host = forwardedHost ?? hostHeader;

  if (host !== undefined && host.length > 0) {
    const hostname = host.split(":")[0] ?? host;
    const forwardedProto = firstHeaderValue(c.req.header("x-forwarded-proto"));
    let proto = forwardedProto ?? "https";
    if (proto !== "http" && proto !== "https") {
      proto = "https";
    }
    if (proto === "http" && !isLocalHost(hostname)) {
      proto = "https";
    }
    return `${proto}://${host}`;
  }

  const url = new URL(c.req.url);
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
    return `https://${url.host}`;
  }
  return url.origin;
}
