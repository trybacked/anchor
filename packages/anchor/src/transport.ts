import { AnchorApiError } from "@trybacked/service";

export type TransportOptions = {
  fetch?: typeof fetch | undefined;
  headers?: Record<string, string> | undefined;
  credentials?: RequestCredentials | undefined;
  accessToken?: (() => string | undefined | Promise<string | undefined>) | undefined;
  onUnauthorized?: ((error: AnchorApiError) => void) | undefined;
};

export type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string> | undefined;
  formData?: FormData;
};

export type Transport = {
  requestJson: <T>(method: string, url: string, options?: RequestOptions) => Promise<T>;
  requestRaw: (method: string, url: string, options?: RequestOptions) => Promise<Response>;
  buildUrl: (path: string) => string;
};

export function createTransport(baseUrl: string, options: TransportOptions): Transport {
  const fetchFn = options.fetch ?? fetch;
  const root = baseUrl.replace(/\/$/, "");

  async function authHeaders(): Promise<Record<string, string>> {
    if (options.accessToken === undefined) {
      return {};
    }
    const token = await options.accessToken();
    if (token === undefined || token.length === 0) {
      return {};
    }
    return { Authorization: `Bearer ${token}` };
  }

  async function handleResponse(response: Response): Promise<Response> {
    if (response.ok) {
      return response;
    }
    let message = `HTTP ${String(response.status)}`;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        message = payload.error;
      }
    } catch {
      // non-JSON error body
    }
    const error = new AnchorApiError(response.status, message);
    if (
      (response.status === 401 || response.status === 403) &&
      options.onUnauthorized !== undefined
    ) {
      options.onUnauthorized(error);
    }
    throw error;
  }

  return {
    buildUrl: (path) => `${root}${path.startsWith("/") ? path : `/${path}`}`,

    requestJson: async <T>(method: string, url: string, req: RequestOptions = {}): Promise<T> => {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...options.headers,
        ...(await authHeaders()),
        ...req.headers,
      };
      let body: BodyInit | undefined;
      if (req.formData !== undefined) {
        body = req.formData;
      } else if (req.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(req.body);
      }
      const init: RequestInit = {
        method,
        headers,
        ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
        ...(body !== undefined ? { body } : {}),
      };
      const response = await fetchFn(url, init);
      const ok = await handleResponse(response);
      const payload: unknown = await ok.json();
      return payload as T;
    },

    requestRaw: async (method: string, url: string, req: RequestOptions = {}) => {
      const headers: Record<string, string> = {
        ...options.headers,
        ...(await authHeaders()),
        ...req.headers,
      };
      let body: BodyInit | undefined;
      if (req.formData !== undefined) {
        body = req.formData;
      } else if (req.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(req.body);
      }
      const response = await fetchFn(url, {
        method,
        headers,
        ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
        ...(body !== undefined ? { body } : {}),
      });
      return handleResponse(response);
    },
  };
}
