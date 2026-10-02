# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@trybacked/core` and `@trybacked/anchor`.

When your change should appear in the next npm release:

```bash
pnpm changeset
```

Select the affected **public** packages, choose semver bump (patch/minor/major), and write a short summary. Commit the generated markdown file with your PR.

Do **not** list `private: true` apps (`@trybacked/gateway`, `@trybacked/api-server`, `@trybacked/control-plane`) in the same changeset as publishable packages — Changesets treats them as ignored and CI will fail with "mixed changeset".

On merge to `main`, the release workflow opens a "Version Packages" PR (or publishes if versions were already bumped).

## Release to npm

Publishing runs in [`.github/workflows/publish-npm.yml`](../.github/workflows/publish-npm.yml) on push to `main` (after a "Version Packages" PR is merged).

1. **Repository secret `NPM_TOKEN`** — required for publish. Use an [npm automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) for the `@trybacked` scope (Granular Access Token: read/write on the packages you publish, or classic token with publish permission).
2. Add it in GitHub: **Settings → Secrets and variables → Actions → New repository secret** (`NPM_TOKEN`). For org-wide releases, use an organization secret instead.
3. Re-run the failed **Release** workflow (or push an empty commit to `main`) after the secret is set.

Messages like `Package @trybacked/service was not found in the registry` are normal the **first** time a package is published. The hard failure is `ENEEDAUTH` / missing token — `pnpm release` now checks auth first and prints the same checklist.

Local dry-run (must be logged in): `pnpm build && pnpm exec changeset publish --dry-run`.
