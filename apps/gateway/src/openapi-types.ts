export type OpenApiInfo = Record<string, unknown> & {
  description?: string;
};
export type OpenApiDocument = {
  paths?: Record<string, unknown>;
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  info?: OpenApiInfo;
  components?: Record<string, unknown> & {
    securitySchemes?: Record<string, unknown>;
  };
};
export const PLATFORM_PUBLIC_HEALTH_PREFIX = "/health";
