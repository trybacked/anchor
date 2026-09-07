import { existsSync, readFileSync, writeFileSync } from "node:fs";
const ENV_LINE_PATTERN = /^(\s*export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
function formatEnvValue(value: string): string {
    if (/[\s#'"\\]/.test(value)) {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return value;
}
export function upsertEnvVariable(envPath: string, key: string, value: string): {
    created: boolean;
    updated: boolean;
} {
    const fileExists = existsSync(envPath);
    const raw = fileExists ? readFileSync(envPath, "utf8") : "";
    const hadTrailingNewline = raw.endsWith("\n");
    const lines = raw.length === 0 ? [] : raw.split("\n");
    let found = false;
    const nextLines = lines.map((line) => {
        const match = line.match(ENV_LINE_PATTERN);
        if (match?.[2] === key) {
            found = true;
            const exportPrefix = match[1] ?? "";
            return `${exportPrefix}${key}=${formatEnvValue(value)}`;
        }
        return line;
    });
    if (!found) {
        if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
            nextLines.push("");
        }
        nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
    let output = nextLines.join("\n");
    if (hadTrailingNewline && !output.endsWith("\n")) {
        output += "\n";
    }
    writeFileSync(envPath, output, "utf8");
    return {
        created: !fileExists,
        updated: found,
    };
}
export function envVariableIsSet(envPath: string, key: string): boolean {
    if (!existsSync(envPath)) {
        return false;
    }
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const match = line.match(ENV_LINE_PATTERN);
        if (match?.[2] === key) {
            return true;
        }
    }
    return false;
}
