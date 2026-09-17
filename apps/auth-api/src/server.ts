import { createServer } from "node:http";
import { handleAuthRequest, handleAuthRequestError } from "./handlers.js";
import { BIND_HOST, RequestBodyTooLargeError, sendJson } from "./http.js";
import { logAuthEvent } from "./logger.js";

export interface AuthApiOptions {
  port?: number;
  host?: string;
}

export function startAuthApi(
  options: AuthApiOptions = {},
): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? BIND_HOST;
  const port = options.port ?? 0;
  const server = createServer((request, response) => {
    handleAuthRequest(request, response).catch((error: unknown) => {
      if (error instanceof RequestBodyTooLargeError) {
        sendJson(response, 413, { error: "payload_too_large", maxBytes: error.maxBytes });
        return;
      }
      handleAuthRequestError(request, response, error);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Unable to bind auth API"));
        return;
      }
      const url = `http://${host}:${String(address.port)}`;
      logAuthEvent("server.started", `Auth API listening on ${url}`);
      resolve({
        url,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}
