# Gerace albo fixture

| Path           | In git          | Purpose                                                                  |
| -------------- | --------------- | ------------------------------------------------------------------------ |
| `sources/`     | Yes             | CSV + atti text files for CI golden tests (`gerace-incremental.test.ts`) |
| `sources-pdf/` | No (local only) | Full PDF corpus for manual/live runs (`pnpm gerace:live`)                |

To run live inference locally, populate `sources-pdf/` from your organization export. CI only needs `sources/`.
