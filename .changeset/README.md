# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@trybacked/core` and `@trybacked/anchor`.

When your change should appear in the next npm release:

```bash
pnpm changeset
```

Select the affected **public** packages, choose semver bump (patch/minor/major), and write a short summary. Commit the generated markdown file with your PR.

Do **not** list `private: true` apps (`@trybacked/gateway`, `@trybacked/api-server`, `@trybacked/control-plane`) in the same changeset as publishable packages — Changesets treats them as ignored and CI will fail with "mixed changeset".

On merge to `main`, the release workflow opens a "Version Packages" PR (or publishes if versions were already bumped).
