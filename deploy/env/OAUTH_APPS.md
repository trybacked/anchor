# Third-party apps (OAuth authorization code + Bearer)

The gateway supports **registered OAuth clients** stored in the control-plane Postgres database. Any SPA, Next.js app, or partner integration can authenticate users via WorkOS on the gateway and receive a **Bearer access token** for API calls — no cross-site session cookies.

## Flow

1. Browser navigates to `GET /oauth/authorize` with standard parameters (`response_type=code`, `client_id`, `redirect_uri`, `state`, PKCE `code_challenge`).
2. Gateway validates the client (registry) and starts WorkOS AuthKit (`redirect_uri` on WorkOS remains `{gateway}/callback`).
3. After WorkOS, `GET /callback` issues a **short-lived authorization code** and redirects to the app's `redirect_uri` (`?code=…&state=…`).
4. App backend or browser calls `POST /oauth/token` with the code + PKCE verifier → `{ access_token, token_type: "Bearer", expires_in }`.
5. App calls `GET /me` and `GET /t/{tenant}/v1/...` with `Authorization: Bearer {access_token}`.

First-party docs on the gateway host still use `GET /login?next=/docs` and the `backed_session` cookie.

## Register a client (admin)

```bash
curl -sS -X POST "https://cloud.backed.app/v1/admin/oauth-clients" \
  -H "Authorization: Bearer $CONTROL_PLANE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "chiedi-prod",
    "name": "Chiedi",
    "redirectUris": ["https://chiedi.ai/login/complete"],
    "corsOrigins": ["https://chiedi.ai"]
  }'
```

Public clients (default) require **PKCE**. Set `"confidential": true` to receive a one-time `clientSecret` for server-side token exchange.

## SDK (`@trybacked/anchor`)

```ts
import { createBackedClient } from "@trybacked/anchor";

let accessToken: string | undefined;

const client = createBackedClient({
  mode: "gateway",
  baseUrl: "https://api.backed.app",
  accessToken: () => accessToken,
});

// Start login (browser redirect)
const url = client.auth.authorizeUrl({
  clientId: "chiedi-prod",
  redirectUri: "https://chiedi.ai/login/complete",
  state: crypto.randomUUID(),
  codeChallenge, // S256 of code_verifier
});

// On /login/complete
const tokens = await client.auth.exchangeAuthorizationCode({
  code,
  clientId: "chiedi-prod",
  redirectUri: "https://chiedi.ai/login/complete",
  codeVerifier,
});
accessToken = tokens.access_token;
```

## Deploy checklist

1. Deploy **control-plane** + **provisioner** (schema adds `oauth_clients`).
2. Deploy **gateway** (`api` on Railway).
3. Register clients via admin API (dev + prod redirect/CORS origins).
4. WorkOS redirect URI unchanged: `https://api.backed.app/callback`.

## Verification

```bash
curl -sSI -X OPTIONS "https://api.backed.app/me" \
  -H "Origin: https://chiedi.ai" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control
```
