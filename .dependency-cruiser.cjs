/**
 * dependency-cruiser boundary rules — Plan Phase 0.
 *
 * Layers (outside-in):
 *   apps           → infrastructure (includes engine adapters) → capabilities → packages
 *   packages/*     → ports + core only (no SDK adapters)
 *   core/ports     → no dependencies beyond zod/yaml (no IO, no SDKs)
 */
module.exports = {
  forbidden: [
    {
      name: "apps-cannot-import-engine-adapters-directly",
      comment:
        "Apps must compose via @trybacked/infrastructure facade, not internal adapter modules.",
      severity: "error",
      from: { path: "^apps/[^/]+/src" },
      to: { path: "^packages/infrastructure/src/adapters/" },
    },
    {
      name: "engine-packages-cannot-import-engine-adapters",
      comment: "Engine packages depend on ports, never on concrete warehouse adapters.",
      severity: "error",
      from: {
        path: "^packages/(core|compiler|runtime|registry|discovery|service|semantic-chat|mcp)/src",
      },
      to: { path: "^packages/infrastructure/src/adapters/" },
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
      to: { path: "^packages/(infrastructure/src/adapters|capability-[^/]+)/src" },
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
