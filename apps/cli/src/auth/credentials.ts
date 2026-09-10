import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
export const BACKED_CREDENTIALS_VERSION = 1;
export const BackedUserSchema = z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1).optional(),
});
export const BackedCredentialsSchema = z.object({
    version: z.literal(BACKED_CREDENTIALS_VERSION),
    apiUrl: z.string().url(),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).optional(),
    expiresAt: z.string().datetime().optional(),
    user: BackedUserSchema,
});
export type BackedUser = z.infer<typeof BackedUserSchema>;
export type BackedCredentials = z.infer<typeof BackedCredentialsSchema>;
export function backedCredentialsPath(): string {
    const override = process.env["BACKED_CREDENTIALS_PATH"]?.trim();
    if (override !== undefined && override.length > 0) {
        return override;
    }
    const configHome = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
    return join(configHome, "backed", "credentials.json");
}
export function readBackedCredentials(): BackedCredentials | null {
    const credentialsPath = backedCredentialsPath();
    if (!existsSync(credentialsPath)) {
        return null;
    }
    const raw = readFileSync(credentialsPath, "utf8");
    return BackedCredentialsSchema.parse(JSON.parse(raw));
}
export function writeBackedCredentials(credentials: BackedCredentials): string {
    const credentialsPath = backedCredentialsPath();
    mkdirSync(dirname(credentialsPath), { recursive: true });
    const payload = `${JSON.stringify(BackedCredentialsSchema.parse(credentials), null, 2)}\n`;
    writeFileSync(credentialsPath, payload, { encoding: "utf8", mode: 0o600 });
    chmodSync(credentialsPath, 0o600);
    return credentialsPath;
}
export function clearBackedCredentials(): boolean {
    const credentialsPath = backedCredentialsPath();
    if (!existsSync(credentialsPath)) {
        return false;
    }
    unlinkSync(credentialsPath);
    return true;
}
