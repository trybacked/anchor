import { existsSync, readFileSync } from "node:fs";

/** Parse `.env` for subprocess tests without mutating `process.env`. */
export function readDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }
  const variables: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    variables[key] = value;
  }
  return variables;
}
