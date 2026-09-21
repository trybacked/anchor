import os from "node:os";

export function defaultReviewer(): string | undefined {
  const fromEnv = process.env["BACKED_REVIEWER"]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}
