# @trybacked/core

## 0.5.0

### Minor Changes

- 8622ba3: Add ontology authoring API (draft commands, publish worker, SDK modules) backed by control-plane Postgres; gateway proxies `/v1/authoring/*` to control plane.

### Patch Changes

- Foundry document ontology: init/extract/materialize-foundry CLI, DuckDB warehouse adapter for local `query_objects`, and ontology-extract materialize pipeline.

## 0.4.0

### Minor Changes

- Add scalable third-party OAuth: control-plane client registry, gateway authorization code + PKCE, Bearer session, and SDK authorize/token helpers.

## 0.3.0

### Minor Changes

- 36f1c95: Add cloud control plane (Postgres + HTTP registry), REST-only tenant provisioning package, WorkOS gateway auth mode, and CLI `--remote` for organization creation. Private deploy apps (control-plane, gateway, api-server) are versioned with the monorepo, not npm.
- c94dac9: Modular Anchor SDK (`createBackedClient`) with gateway auth, tenant-scoped model/query/search/documents/graph/ai/files modules. Platform API adds document upload, list, delete, and docs refresh job endpoints.
- f6cb39e: Platform mode: remote ontology store on UC volumes, single multi-tenant api-server, gateway platform upstream, CLI bootstrap/status, and two-service deploy stack.

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
