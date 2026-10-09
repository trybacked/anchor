import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import type { AuthoringVariables } from "./context.js";

export type AuthoringEnv = {
  Variables: {
    authoring: AuthoringVariables;
  };
};

export type AuthoringRouteDeps = {
  config: ControlPlaneConfig;
  pool: pg.Pool;
};
