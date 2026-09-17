import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Computes the HMAC-SHA256 hex digest for a webhook body using the shared secret.
 */
export function signWebhookPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Verifies a webhook signature using a constant-time comparison.
 */
export function verifyWebhookSignature(body: string, secret: string, signature: string): boolean {
  const expected = signWebhookPayload(body, secret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
