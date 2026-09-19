import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentedHttpRoute } from "./http-routes.js";
import { DOCUMENTED_HTTP_ROUTES } from "./http-routes.js";

export type { DocumentedHttpRoute } from "./http-routes.js";
export { DOCUMENTED_HTTP_ROUTES } from "./http-routes.js";

let cachedSpec: string | undefined;

export function resolveOpenApiSpecPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packaged = path.join(moduleDir, "openapi.yaml");
  if (existsSync(packaged)) {
    return packaged;
  }
  return path.join(moduleDir, "..", "openapi.yaml");
}

export function loadOpenApiSpec(): string {
  if (cachedSpec === undefined) {
    cachedSpec = readFileSync(resolveOpenApiSpecPath(), "utf8");
  }
  return cachedSpec;
}

export function assertOpenApiDocumentsRoutes(
  spec: string,
  routes: DocumentedHttpRoute[] = DOCUMENTED_HTTP_ROUTES,
): void {
  for (const route of routes) {
    const pathKey = `${route.path}:`;
    if (!spec.includes(pathKey)) {
      throw new Error(`OpenAPI spec missing path ${route.path}`);
    }
    const pathSection = spec.slice(spec.indexOf(pathKey));
    const methodPrefix = `\n    ${route.method.toLowerCase()}:`;
    if (!pathSection.includes(methodPrefix)) {
      throw new Error(`OpenAPI spec missing ${route.method} for ${route.path}`);
    }
  }
}
