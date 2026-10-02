# @trybacked/cli

## 0.3.1

### Patch Changes

- Updated dependencies
  - @trybacked/core@0.4.0
  - @trybacked/discovery@0.2.3
  - @trybacked/mcp@0.2.3
  - @trybacked/provider-databricks@0.3.1
  - @trybacked/registry@0.3.1
  - @trybacked/runtime@0.3.1
  - @trybacked/semantic-chat@0.1.2

## 0.3.0

### Minor Changes

- 36f1c95: Add cloud control plane (Postgres + HTTP registry), REST-only tenant provisioning package, WorkOS gateway auth mode, and CLI `--remote` for organization creation. Private deploy apps (control-plane, gateway, api-server) are versioned with the monorepo, not npm.

### Patch Changes

- Updated dependencies [36f1c95]
- Updated dependencies [c94dac9]
- Updated dependencies [f6cb39e]
  - @trybacked/core@0.3.0
  - @trybacked/registry@0.3.0
  - @trybacked/provider-databricks@0.3.0
  - @trybacked/runtime@0.3.0
  - @trybacked/mcp@0.2.2
  - @trybacked/semantic-chat@0.1.1
  - @trybacked/discovery@0.2.2

## 0.2.1

### Patch Changes

- Republish `@trybacked/core` with ontology exports (`OntologySchema`) so global CLI install works with `@trybacked/registry`.
- Updated dependencies
  - @trybacked/core@0.2.1
  - @trybacked/registry@0.2.1
  - @trybacked/runtime@0.2.1
  - @trybacked/discovery@0.2.1
  - @trybacked/provider-databricks@0.2.1
  - @trybacked/mcp@0.2.1

## 0.2.0

### Minor Changes

- Publish the `backed` CLI and npm libraries for the Anchor ontology engine.

### Patch Changes

- Updated dependencies
  - @trybacked/mcp@0.2.0
  - @trybacked/discovery@0.2.0
  - @trybacked/registry@0.2.0
  - @trybacked/runtime@0.2.0
  - @trybacked/provider-databricks@0.2.0
