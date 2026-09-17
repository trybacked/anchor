import { z } from "zod";

export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code" as const;
export const REFRESH_TOKEN_GRANT_TYPE = "refresh_token" as const;

export const DeviceCodeGrantSchema = z.object({
  grant_type: z.literal(DEVICE_CODE_GRANT_TYPE),
  device_code: z.string().min(1),
});

export const RefreshTokenGrantSchema = z.object({
  grant_type: z.literal(REFRESH_TOKEN_GRANT_TYPE),
  refresh_token: z.string().min(1),
});

export const TokenRequestSchema = z.union([DeviceCodeGrantSchema, RefreshTokenGrantSchema]);

export const UsageRequestSchema = z.object({
  operation: z.string().trim().min(1),
});

export type DeviceCodeGrant = z.infer<typeof DeviceCodeGrantSchema>;
export type RefreshTokenGrant = z.infer<typeof RefreshTokenGrantSchema>;
export type TokenRequest = z.infer<typeof TokenRequestSchema>;
export type UsageRequest = z.infer<typeof UsageRequestSchema>;
