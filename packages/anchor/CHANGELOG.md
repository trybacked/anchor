# @trybacked/anchor

## 0.6.0

### Minor Changes

- 8622ba3: Add ontology authoring API (draft commands, publish worker, SDK modules) backed by control-plane Postgres; gateway proxies `/v1/authoring/*` to control plane.

### Patch Changes

- Updated dependencies
- Updated dependencies [8622ba3]
  - @trybacked/core@0.5.0
  - @trybacked/service@0.2.2

## 0.5.0

### Minor Changes

- Add scalable third-party OAuth: control-plane client registry, gateway authorization code + PKCE, Bearer session, and SDK authorize/token helpers.

### Patch Changes

- Updated dependencies
  - @trybacked/core@0.4.0
  - @trybacked/service@0.2.1

## 0.4.0

### Minor Changes

- edcec15: Add typed semantic ask and definition API responses. Anchor SDK exports index entrypoint, workshop types, cookie credentials, and onUnauthorized hook.
- c94dac9: Modular Anchor SDK (`createBackedClient`) with gateway auth, tenant-scoped model/query/search/documents/graph/ai/files modules. Platform API adds document upload, list, delete, and docs refresh job endpoints.

### Patch Changes

- Updated dependencies [edcec15]
- Updated dependencies [36f1c95]
- Updated dependencies [c94dac9]
- Updated dependencies [f6cb39e]
  - @trybacked/service@0.2.0
  - @trybacked/core@0.3.0
