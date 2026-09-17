export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: string | number | boolean | undefined;
}

export interface Logger {
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

function writeLog(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    service: "backed-auth-api",
    ...fields,
  };
  console.error(JSON.stringify(entry));
}

let logger: Logger = {
  log: writeLog,
};

export function setLogger(customLogger: Logger): void {
  logger = customLogger;
}

export function resetLogger(): void {
  logger = { log: writeLog };
}

export function logDebug(event: string, fields?: LogFields): void {
  logger.log("debug", event, fields);
}

export function logInfo(event: string, fields?: LogFields): void {
  logger.log("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  logger.log("warn", event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  logger.log("error", event, fields);
}

export function logAuthEvent(event: string, message?: string, fields?: LogFields): void {
  logInfo(event, {
    ...(message !== undefined ? { message } : {}),
    ...fields,
  });
}

export function resetAuthLogger(): void {
  resetLogger();
}
