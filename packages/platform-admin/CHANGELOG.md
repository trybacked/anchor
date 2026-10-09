# @trybacked/platform-admin

## 0.2.1

### Patch Changes

- Updated dependencies
  - @trybacked/core@0.4.0
  - @trybacked/registry@0.3.1

## 0.2.0

### Minor Changes

- 36f1c95: Add cloud control plane (Postgres + HTTP registry), REST-only tenant provisioning package, WorkOS gateway auth mode, and CLI `--remote` for organization creation. Private deploy apps (control-plane, gateway, api-server) are versioned with the monorepo, not npm.
- c94dac9: Modular Anchor SDK (`createBackedClient`) with gateway auth, tenant-scoped model/query/search/documents/graph/ai/files modules. Platform API adds document upload, list, delete, and docs refresh job endpoints.

### Patch Changes

- Updated dependencies [36f1c95]
- Updated dependencies [c94dac9]
- Updated dependencies [f6cb39e]
  - @trybacked/core@0.3.0
  - @trybacked/registry@0.3.0
