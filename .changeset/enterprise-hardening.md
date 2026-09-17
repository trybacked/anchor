---
"@trybacked/anchor": minor
"@trybacked/core": minor
---

Enterprise SDK hardening: HTTP timeouts and optional retries, unified error hierarchy, bounded `waitForRun`, and test coverage gates.

**Breaking:** `signWebhookPayload` and `verifyWebhookSignature` must be imported from `@trybacked/anchor/webhook` instead of the main entry. `parseRunCompletedWebhook` remains on `@trybacked/anchor`.
