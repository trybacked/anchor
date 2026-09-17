# @trybacked/anchor

## 0.2.0

### Minor Changes

- 4f3c348: Enterprise SDK hardening: HTTP timeouts and optional retries, unified error hierarchy, bounded `waitForRun`, and test coverage gates.

  **Breaking:** `signWebhookPayload` and `verifyWebhookSignature` must be imported from `@trybacked/anchor/webhook` instead of the main entry. `parseRunCompletedWebhook` remains on `@trybacked/anchor`.

### Patch Changes

- Updated dependencies [4f3c348]
  - @trybacked/core@0.2.0

## 0.1.4

### Patch Changes

- Initial tracked release via Changesets
