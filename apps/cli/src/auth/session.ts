import {
  BackedApiError,
  BackedAuthClient,
  tokenResponseToCredentials,
} from "./api-client.js";
import type { BackedCredentials } from "./credentials.js";
import { writeBackedCredentials } from "./credentials.js";
import { verifyAccessToken } from "./device-flow.js";

/**
 * Verifies the access token and refreshes persisted credentials when a refresh token is available.
 */
export async function ensureValidCredentials(
  apiUrl: string,
  credentials: BackedCredentials,
): Promise<BackedCredentials> {
  try {
    await verifyAccessToken(apiUrl, credentials.accessToken);
    return credentials;
  } catch (error) {
    if (!(error instanceof BackedApiError && error.status === 401)) {
      throw error;
    }
    const refreshToken = credentials.refreshToken;
    if (refreshToken === undefined) {
      throw error;
    }
    const client = new BackedAuthClient(apiUrl);
    const token = await client.exchangeRefreshToken(refreshToken);
    const next = tokenResponseToCredentials(apiUrl, token);
    writeBackedCredentials(next);
    return next;
  }
}
