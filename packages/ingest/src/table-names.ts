import { basename, extname } from "node:path";

export function toTableName(relativePath: string): string {
  const stem = basename(relativePath, extname(relativePath));
  const sanitized = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = sanitized === "" ? "dataset" : sanitized;
  return /^\d/.test(name) ? `t_${name}` : name;
}

export function uniqueTableName(base: string, usedNames: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${String(suffix)}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
