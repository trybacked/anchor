import { join } from "node:path";

import { AI_GATEWAY_API_KEY_ENV } from "@backed/semantic";
import { confirm, password } from "@inquirer/prompts";

import { findWorkspaceRoot } from "../env.js";
import { envVariableIsSet, upsertEnvVariable } from "../gateway-env.js";
import { createPromptTheme, getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";

const GATEWAY_DOCS_URL = "https://vercel.com/ai-gateway";

interface GatewayArgs {
  key?: string;
  help: boolean;
}

function parseGatewayArgs(args: string[]): GatewayArgs {
  let key: string | undefined;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--key" || arg === "-k") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      key = value;
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
    ...(key !== undefined ? { key } : {}),
  };
}

function printGatewayHelp(): void {
  const ui = getUi();
  ui.log(`${ui.label("Usage:")} ${ui.command("backed gateway")} ${ui.dim("[options]")}`);
  ui.blank();
  ui.log(ui.label("Options:"));
  ui.log(`  ${ui.command("--key")}, ${ui.command("-k")} ${ui.dim("<key>")}   Set key without a prompt (CI / scripts)`);
  ui.log(`  ${ui.command("--help")}, ${ui.command("-h")}          Show this help`);
  ui.blank();
  ui.detail(`Writes ${AI_GATEWAY_API_KEY_ENV} to .env in the workspace root.`);
  ui.detail(`Create a key at ${GATEWAY_DOCS_URL}`);
}

function validateApiKey(value: string): true | string {
  return value.trim().length > 0 ? true : "API key is required";
}

async function resolveApiKey(
  providedKey: string | undefined,
  envPath: string,
  theme: ReturnType<typeof createPromptTheme>,
): Promise<string | null> {
  if (providedKey !== undefined) {
    const trimmed = providedKey.trim();
    if (trimmed.length === 0) {
      throw new Error("API key cannot be empty");
    }
    return trimmed;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Interactive prompt unavailable. Pass --key or set ${AI_GATEWAY_API_KEY_ENV} in the environment.`,
    );
  }

  if (envVariableIsSet(envPath, AI_GATEWAY_API_KEY_ENV)) {
    const overwrite = await confirm({
      message: `${AI_GATEWAY_API_KEY_ENV} is already set in .env. Overwrite?`,
      default: false,
      theme,
    });
    if (!overwrite) {
      return null;
    }
  }

  const apiKey = await password({
    message: "Vercel AI Gateway API key:",
    validate: validateApiKey,
    theme,
  });

  return apiKey.trim();
}

export const gatewayCommand: CommandHandler = async (args) => {
  initUi();
  const ui = getUi();

  let parsed: GatewayArgs;
  try {
    parsed = parseGatewayArgs(args);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    ui.blank();
    printGatewayHelp();
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    printGatewayHelp();
    return;
  }

  const root = findWorkspaceRoot(process.cwd());
  const envPath = join(root, ".env");
  const theme = createPromptTheme();

  let apiKey: string | null;
  try {
    apiKey = await resolveApiKey(parsed.key, envPath, theme);
  } catch (error) {
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (apiKey === null) {
    ui.writeWarn("No changes made.");
    return;
  }

  const result = upsertEnvVariable(envPath, AI_GATEWAY_API_KEY_ENV, apiKey);

  if (result.created) {
    ui.writeSuccess(`Created ${ui.path(envPath)}`);
  } else if (result.updated) {
    ui.writeSuccess(`Updated ${AI_GATEWAY_API_KEY_ENV} in ${ui.path(envPath)}`);
  } else {
    ui.writeSuccess(`Added ${AI_GATEWAY_API_KEY_ENV} to ${ui.path(envPath)}`);
  }

  ui.detail(`Run ${ui.command("backed model")} to use semantic inference.`);
};
