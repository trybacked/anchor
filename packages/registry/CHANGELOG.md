# @trybacked/registry

## 0.3.0

### Minor Changes

- 36f1c95: Add cloud control plane (Postgres + HTTP registry), REST-only tenant provisioning package, WorkOS gateway auth mode, and CLI `--remote` for organization creation. Private deploy apps (control-plane, gateway, api-server) are versioned with the monorepo, not npm.
- f6cb39e: Platform mode: remote ontology store on UC volumes, single multi-tenant api-server, gateway platform upstream, CLI bootstrap/status, and two-service deploy stack.

### Patch Changes

- Updated dependencies [36f1c95]
- Updated dependencies [f6cb39e]
  - @trybacked/core@0.3.0

## 0.2.1

### Patch Changes

- Republish `@trybacked/core` with ontology exports (`OntologySchema`) so global CLI install works with `@trybacked/registry`.
- Updated dependencies
  - @trybacked/core@0.2.1

## 0.2.0

### Minor Changes

- Publish the `backed` CLI and npm libraries for the Anchor ontology engine.
