import { AI_GATEWAY_API_KEY_ENV } from "@backed/semantic";
import { confirm, password } from "@inquirer/prompts";
import { commandErrorMessage, rejectUnexpectedArg, rejectUnknownFlag, requireFlagValue, wantsHeadlessCommand, } from "../args.js";
import { COMMANDS, FLAGS, formatCliCommand, GATEWAY_DOCS_URL, isHelpFlag, } from "../config.js";
import { findWorkspaceRoot, workspaceEnvPath } from "../env.js";
import { envVariableIsSet, upsertEnvVariable } from "../gateway-env.js";
import { createPromptTheme, getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";
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
        if (isHelpFlag(arg)) {
            help = true;
            continue;
        }
        if (arg === FLAGS.KEY || arg === FLAGS.KEY_SHORT) {
            const { value, nextIndex } = requireFlagValue(args, index, arg);
            key = value;
            index = nextIndex;
            continue;
        }
        if (arg.startsWith("-")) {
            rejectUnknownFlag(arg);
        }
        rejectUnexpectedArg(arg);
    }
    return {
        help,
        ...(key !== undefined ? { key } : {}),
    };
}
function printGatewayHelp(): void {
    const ui = getUi();
    ui.log(`${ui.label("Usage:")} ${ui.command(formatCliCommand(COMMANDS.GATEWAY))} ${ui.dim("[options]")}`);
    ui.blank();
    ui.log(ui.label("Options:"));
    ui.log(`  ${ui.command(FLAGS.KEY)}, ${ui.command(FLAGS.KEY_SHORT)} ${ui.dim("<key>")}   Set key without a prompt (CI / scripts)`);
    ui.log(`  ${ui.command(FLAGS.HELP)}, ${ui.command(FLAGS.HELP_SHORT)}          Show this help`);
    ui.blank();
    ui.detail(`Writes ${AI_GATEWAY_API_KEY_ENV} to .env in the workspace root.`);
    ui.detail(`Create a key at ${GATEWAY_DOCS_URL}`);
}
function validateApiKey(value: string): true | string {
    return value.trim().length > 0 ? true : "API key is required";
}
async function resolveApiKey(providedKey: string | undefined, envPath: string, theme: ReturnType<typeof createPromptTheme>): Promise<string | null> {
    if (providedKey !== undefined) {
        const trimmed = providedKey.trim();
        if (trimmed.length === 0) {
            throw new Error("API key cannot be empty");
        }
        return trimmed;
    }
    if (wantsHeadlessCommand()) {
        throw new Error(`Interactive prompt unavailable. Pass --key or set ${AI_GATEWAY_API_KEY_ENV} in the environment.`);
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
    }
    catch (error) {
        ui.writeError(commandErrorMessage(error));
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
    const envPath = workspaceEnvPath(root);
    const theme = createPromptTheme();
    let apiKey: string | null;
    try {
        apiKey = await resolveApiKey(parsed.key, envPath, theme);
    }
    catch (error) {
        ui.writeError(commandErrorMessage(error));
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
    }
    else if (result.updated) {
        ui.writeSuccess(`Updated ${AI_GATEWAY_API_KEY_ENV} in ${ui.path(envPath)}`);
    }
    else {
        ui.writeSuccess(`Added ${AI_GATEWAY_API_KEY_ENV} to ${ui.path(envPath)}`);
    }
    ui.detail(`Run ${ui.command(formatCliCommand(COMMANDS.MODEL))} to use semantic inference.`);
};
