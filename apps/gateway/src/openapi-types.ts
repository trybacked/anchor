/** Minimal OpenAPI 3.1 shape for the gateway adapter; full typing lives in the platform generator later. */

export type OpenApiInfo = Record<string, unknown> & { description?: string };

export type OpenApiDocument = {
  paths?: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  info?: OpenApiInfo;
  components?: Record<string, unknown> & { securitySchemes?: Record<string, unknown> };
};

/** Platform liveness routes are public on platform-api but auth-gated under `/t/{tenant}` on the gateway. */
export const PLATFORM_PUBLIC_HEALTH_PREFIX = "/health";
