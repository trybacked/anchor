import { afterEach, describe, expect, it, vi } from "vitest";
import { BackedApiError } from "../../src/auth/api-client.js";
import type { BackedCredentials } from "../../src/auth/credentials.js";
import { ensureValidCredentials } from "../../src/auth/session.js";

vi.mock("../../src/auth/device-flow.js", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("../../src/auth/api-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/api-client.js")>();
  return {
    ...actual,
    BackedAuthClient: vi.fn().mockImplementation(() => ({
      exchangeRefreshToken: vi.fn().mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        tokenType: "Bearer",
        user: { id: "u1", email: "a@example.com" },
      }),
    })),
  };
});

vi.mock("../../src/auth/credentials.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/credentials.js")>();
  return {
    ...actual,
    writeBackedCredentials: vi.fn(),
  };
});

const { verifyAccessToken } = await import("../../src/auth/device-flow.js");
const { writeBackedCredentials } = await import("../../src/auth/credentials.js");

const baseCredentials: BackedCredentials = {
  version: 1,
  apiUrl: "https://api.example.com",
  accessToken: "old-access",
  refreshToken: "old-refresh",
  user: { id: "u1", email: "a@example.com" },
};

describe("ensureValidCredentials", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns credentials when access token is valid", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(baseCredentials.user);
    await expect(ensureValidCredentials(baseCredentials.apiUrl, baseCredentials)).resolves.toEqual(
      baseCredentials,
    );
  });

  it("refreshes and persists credentials on 401 when refresh token exists", async () => {
    vi.mocked(verifyAccessToken).mockRejectedValue(new BackedApiError("expired", 401));
    const next = await ensureValidCredentials(baseCredentials.apiUrl, baseCredentials);
    expect(next.accessToken).toBe("new-access");
    expect(next.refreshToken).toBe("new-refresh");
    expect(writeBackedCredentials).toHaveBeenCalledOnce();
  });
});
