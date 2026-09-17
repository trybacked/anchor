# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@trybacked/core` and `@trybacked/anchor`.

When your change should appear in the next npm release:

```bash
pnpm changeset
```

Select the affected public packages, choose semver bump (patch/minor/major), and write a short summary. Commit the generated markdown file with your PR.

On merge to `main`, the release workflow opens a "Version Packages" PR (or publishes if versions were already bumped).
