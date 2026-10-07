/**
 * dependency-cruiser boundary rules — Plan Phase 0.
 *
 * Layers (outside-in):
 *   apps           → infrastructure → adapters → capabilities → packages
 *   packages/*     → ports + core only (no SDK adapters)
 *   core/ports     → no dependencies beyond zod/yaml (no IO, no SDKs)
 */
module.exports = {
  forbidden: [
    {
      name: "apps-cannot-import-adapters-directly",
      comment:
        "Apps must compose infrastructure via @trybacked/infrastructure, never wire adapters themselves.",
      severity: "error",
      from: { path: "^apps/[^/]+/src" },
      to: {
        path: "^packages/(adapter-[^/]+|provider-databricks)/src",
        pathNot: "^packages/infrastructure",
      },
    },
    {
      name: "engine-packages-cannot-import-adapters",
      comment: "Engine packages depend on ports, never on concrete adapters.",
      severity: "error",
      from: { path: "^packages/(core|compiler|runtime|registry|discovery|service|semantic-chat|mcp|diff)/src" },
      to: { path: "^packages/(adapter-[^/]+|provider-databricks)/src" },
    },
    {
      name: "core-no-sdk-deps",
      comment: "The kernel has no SDK/IO dependencies — pure schema + logic.",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: {
        dependencyTypes: ["npm"],
        pathNot: "node_modules/(.pnpm/)?(zod|yaml)(@|/|$)",
      },
    },
    {
      name: "ports-no-adapters",
      comment: "Ports define contracts; they must not import any adapter.",
      severity: "error",
      from: { path: "^packages/ports/src" },
      to: { path: "^packages/(adapter-[^/]+|provider-databricks|capability-[^/]+)/src" },
    },
    {
      name: "semantic-chat-no-capability-imports",
      comment:
        "Chat routes by capability data, not by importing capability implementations directly.",
      severity: "error",
      from: { path: "^packages/semantic-chat/src" },
      to: { path: "^packages/capability-[^/]+/src" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};