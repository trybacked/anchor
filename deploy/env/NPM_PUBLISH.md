# Publish `@trybacked/*` su npm

Monorepo: [trybacked/anchor](https://github.com/trybacked/anchor). Tooling: **Changesets** + workflow **Release** su `main`.

## Prerequisiti

- Permesso di **publish** sullo scope **`@trybacked`** (org npm).
- Token npm che **non** richiede OTP a ogni publish (consigliato: **Granular Access Token** o **Automation token** con publish sui pacchetti dello scope).

## Opzione A — CI (consigliata)

1. Crea il token su [npmjs.com](https://www.npmjs.com/) → Access Tokens → **Granular** (Publish) sui pacchetti `@trybacked/*`, oppure classic **Automation**.
2. GitHub → repo **trybacked/anchor** → **Settings → Secrets and variables → Actions** → **New repository secret**:
   - Nome: `NPM_TOKEN`
   - Valore: il token npm
3. Assicurati che su `main` ci siano i **version bump** nei `package.json` (PR “Version Packages” di Changesets, oppure merge già versionato).
4. Esegui il workflow:
   - Push su `main`, **oppure**
   - **Actions → Release → Run workflow**
5. Se fallisce, apri il job **Create Release Pull Request or Publish** e leggi l’errore (`ENEEDAUTH` = secret mancante/sbagliato).

Il workflow esegue: `pnpm install` → `pnpm release` (= build + `changeset publish`).

## Opzione B — Locale

```bash
cd anchor
pnpm install
npm login                    # account con publish su @trybacked
pnpm build
pnpm release                 # oppure: pnpm exec changeset publish
```

Se npm chiede **2FA (OTP)**, apri il link nel terminale e completa l’auth, **oppure** usa un automation token:

```bash
export NODE_AUTH_TOKEN=npm_xxxxxxxx   # automation token
pnpm release
```

Dry-run (nessuna publish):

```bash
pnpm build && pnpm exec changeset publish --dry-run
```

## Dopo una feature: bump versione

```bash
pnpm changeset          # scegli pacchetti + minor/patch + messaggio
git add .changeset/*.md && git commit -m "chore: changeset"
# merge su main → workflow apre PR version oppure publish
pnpm version-packages   # in locale: applica bump + CHANGELOG
```

## Pacchetti pubblici tipici

| Pacchetto           | Uso                                        |
| ------------------- | ------------------------------------------ |
| `@trybacked/anchor` | Client HTTP gateway/platform (Chiedi, app) |
| `@trybacked/core`   | Tipi e contratti condivisi                 |

App private (`gateway`, `api-server`, `control-plane`) **non** vanno su npm.

## Verifica

```bash
npm view @trybacked/anchor version
npm view @trybacked/core version
```

Vedi anche [`.changeset/README.md`](../../.changeset/README.md).
