# @trybacked/core

## 0.2.1

### Patch Changes

- Republish `@trybacked/core` with ontology exports (`OntologySchema`) so global CLI install works with `@trybacked/registry`.

## 0.2.0

### Minor Changes

- 4f3c348: Enterprise SDK hardening: HTTP timeouts and optional retries, unified error hierarchy, bounded `waitForRun`, and test coverage gates.

  **Breaking:** `signWebhookPayload` and `verifyWebhookSignature` must be imported from `@trybacked/anchor/webhook` instead of the main entry. `parseRunCompletedWebhook` remains on `@trybacked/anchor`.

## 0.1.0

### Patch Changes

- Initial tracked release via Changesets
