# @backed/auth-api

Reference OAuth 2.0 device-flow server backing `backed login`. It issues the device codes the CLI polls, serves the browser activation page, and mints access and refresh tokens.

This is a **development reference implementation**: all state lives in memory and is lost on restart. Production deployments are expected to replace it with a durable identity provider that honours the same routes.

## Endpoints

| Method | Path              | Purpose                                                           |
| ------ | ----------------- | ----------------------------------------------------------------- |
| `GET`  | `/health`         | Liveness probe                                                    |
| `POST` | `/v1/auth/device` | Start a device authorization; returns `device_code` + `user_code` |
| `GET`  | `/activate`       | Browser page where a user confirms the device code                |
| `POST` | `/activate`       | Approve the pending device                                        |
| `POST` | `/v1/auth/token`  | Exchange a device code or refresh token for a session             |
| `GET`  | `/v1/me`          | Current user for a bearer token                                   |
| `POST` | `/v1/usage`       | Record an opt-in MCP usage event                                  |

`/v1/auth/token` supports two grant types: `urn:ietf:params:oauth:grant-type:device_code` and `refresh_token`. Device authorizations expire after 15 minutes; access tokens after 1 hour.

## Running locally

```bash
pnpm --filter @backed/auth-api build
pnpm --filter @backed/auth-api start
```

The server binds to `127.0.0.1:8787` (see [`src/constants.ts`](./src/constants.ts)). Point the CLI at it:

```bash
export BACKED_API_URL=http://127.0.0.1:8787
backed login
```

## Configuration

Copy [`.env.example`](./.env.example). Every approved device resolves to the same dev identity, overridable via `BACKED_AUTH_DEV_USER_ID`, `BACKED_AUTH_DEV_USER_EMAIL`, and `BACKED_AUTH_DEV_USER_NAME`.

## Module layout

| File           | Role                                        |
| -------------- | ------------------------------------------- |
| `server.ts`    | HTTP server lifecycle                       |
| `handlers.ts`  | Route dispatch and device-flow logic        |
| `state.ts`     | In-memory device, session, and usage stores |
| `schemas.ts`   | Zod request validation                      |
| `constants.ts` | Routes, TTLs, bind host and port            |
| `http.ts`      | Request/response helpers                    |
| `logger.ts`    | Structured JSON logging                     |
