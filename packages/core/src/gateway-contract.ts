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
