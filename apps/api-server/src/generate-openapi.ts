import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "./openapi-document.js";
const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi.json");
writeFileSync(outPath, `${JSON.stringify(buildOpenApiDocument(true), null, 2)}\n`, "utf8");
console.error(`Wrote ${outPath}`);
