import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { verifyPassword } from "./password.js";

const UserRecordSchema = z.object({
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  tenants: z.array(z.string().min(1)).default([]),
  roles: z.record(z.enum(["viewer", "editor", "publisher", "admin"])).optional(),
});

const UsersFileSchema = z.object({
  users: z.array(UserRecordSchema).min(1),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;

export function loadUsersFile(path: string): UserRecord[] {
  const raw = readFileSync(path, "utf8");
  const parsed = UsersFileSchema.parse(parseYaml(raw));
  const seen = new Set<string>();
  for (const user of parsed.users) {
    if (seen.has(user.username)) {
      throw new Error(`Duplicate username in users file: "${user.username}"`);
    }
    seen.add(user.username);
  }
  return parsed.users;
}

export function authenticateUser(
  users: UserRecord[],
  username: string,
  password: string,
): UserRecord | undefined {
  const record = users.find((user) => user.username === username);
  if (record === undefined) {
    return undefined;
  }
  if (!verifyPassword(password, record.passwordHash)) {
    return undefined;
  }
  return record;
}
