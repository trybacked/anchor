import { BIND_HOST, DEFAULT_PORT } from "./constants.js";
import { logInfo } from "./logger.js";
import { startAuthApi } from "./server.js";

void startAuthApi({ port: DEFAULT_PORT, host: BIND_HOST }).then(({ url }) => {
  logInfo("auth.server.started", { url });
});
