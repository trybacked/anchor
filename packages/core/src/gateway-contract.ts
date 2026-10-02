import { z } from "zod";

export const GatewayAuthModeSchema = z.enum(["file", "workos"]);
export type GatewayAuthMode = z.infer<typeof GatewayAuthModeSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  username: z.string().min(1),
  tenants: z.array(z.string().min(1)),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const GatewaySessionSchema = z.object({
  username: z.string().min(1),
  tenants: z.array(z.string().min(1)),
});
export type GatewaySession = z.infer<typeof GatewaySessionSchema>;

export const GatewayHealthSchema = z.object({
  ok: z.literal(true),
  mode: z.literal("platform"),
  authMode: GatewayAuthModeSchema,
  tenants: z.number().int().nonnegative(),
});
export type GatewayHealth = z.infer<typeof GatewayHealthSchema>;

export const LogoutResponseSchema = z.object({
  ok: z.literal(true),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const OAuthTokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  client_secret: z.string().min(1).optional(),
  code_verifier: z.string().min(43).max(128).optional(),
});
export type OAuthTokenRequest = z.infer<typeof OAuthTokenRequestSchema>;

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
});
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
