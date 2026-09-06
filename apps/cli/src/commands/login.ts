import {
  BACKED_API_URL,
  backedCredentialsPath,
  readBackedCredentials,
  runDeviceLogin,
  tokenResponseToCredentials,
  verifyAccessToken,
  writeBackedCredentials,
} from "../auth/index.js";
import { getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";

interface LoginArgs {
  help: boolean;
  status: boolean;
  token?: string;
  noBrowser: boolean;
}

function parseLoginArgs(args: string[]): LoginArgs {
  let help = false;
  let status = false;
  let token: string | undefined;
  let noBrowser = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--status") {
      status = true;
      continue;
    }
    if (arg === "--no-browser") {
      noBrowser = true;
      continue;
    }
    if (arg === "--token") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("Missing value for --token");
      }
      token = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return {
    help,
    status,
    noBrowser,
    ...(token !== undefined ? { token } : {}),
  };
}

function printLoginHelp(): void {
  const ui = getUi();
  ui.log(`${ui.label("Usage:")} ${ui.command("backed login")} ${ui.dim("[options]")}`);
  ui.blank();
  ui.log(ui.label("Options:"));
  ui.log(`  ${ui.command("--status")}              Show the signed-in Backed account`);
  ui.log(`  ${ui.command("--token")} ${ui.dim("<token>")}       Save a personal access token (non-interactive)`);
  ui.log(`  ${ui.command("--no-browser")}           Do not open the browser automatically`);
  ui.log(`  ${ui.command("--help")}, ${ui.command("-h")}          Show this help`);
  ui.blank();
  ui.detail("Credentials are stored in ~/.config/backed/credentials.json");
  ui.detail("Use backed logout to sign out.");
}

function printSignedInStatus(): void {
  const ui = getUi();
  const credentials = readBackedCredentials();
  if (credentials === null) {
    ui.writeWarn("Not signed in to Backed.");
    ui.detail(`Run ${ui.command("backed login")} to authenticate.`);
    return;
  }

  ui.writeSuccess(`Signed in to Backed as ${ui.bold(credentials.user.email)}`);
  ui.detail(`API: ${BACKED_API_URL}`);
  ui.detail(`Credentials: ${backedCredentialsPath()}`);
}

export const loginCommand: CommandHandler = async (args) => {
  initUi();
  const ui = getUi();

  let parsed: LoginArgs;
  try {
    parsed = parseLoginArgs(args);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    ui.blank();
    printLoginHelp();
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    printLoginHelp();
    return;
  }

  if (parsed.status) {
    printSignedInStatus();
    return;
  }

  try {
    if (parsed.token !== undefined) {
      const trimmed = parsed.token.trim();
      if (trimmed.length === 0) {
        throw new Error("Token cannot be empty");
      }

      ui.step("Verifying access token…");
      const user = await verifyAccessToken(BACKED_API_URL, trimmed);
      const credentials = tokenResponseToCredentials(BACKED_API_URL, {
        accessToken: trimmed,
        tokenType: "Bearer",
        user,
      });
      const credentialsPath = writeBackedCredentials(credentials);
      ui.writeSuccess(`Signed in as ${ui.bold(user.email)}`);
      ui.detail(`Credentials saved to ${ui.path(credentialsPath)}`);
      return;
    }

    if (!process.stdin.isTTY) {
      throw new Error("Interactive login requires a terminal. Use --token for non-interactive auth.");
    }

    ui.step("Starting Backed device authorization…");
    let pollSpinner: { stop: () => void } | undefined;
    const credentials = await runDeviceLogin({
      apiUrl: BACKED_API_URL,
      openBrowser: !parsed.noBrowser,
      callbacks: {
        onInstructions: (browserUrl, userCode) => {
          ui.blank();
          ui.log(`Open ${ui.path(browserUrl)}`);
          ui.log(`  Code: ${ui.bold(userCode)}`);
          ui.blank();
        },
        onPollStart: () => {
          pollSpinner = ui.spinner("Waiting for authorization…");
        },
        onPollStop: () => {
          pollSpinner?.stop();
          pollSpinner = undefined;
        },
      },
    });

    const credentialsPath = writeBackedCredentials(credentials);
    ui.blank();
    ui.writeSuccess(`Signed in as ${ui.bold(credentials.user.email)}`);
    ui.detail(`Credentials saved to ${ui.path(credentialsPath)}`);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};
