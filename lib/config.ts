import { YAML } from "bun";
import {
    DEFAULT_MCP_LISTEN,
    DEFAULT_CONTROL_LISTEN,
    DEFAULT_CONFIG_PATH,
} from "./constants.ts";

interface CliArgs {
    "mcp-listen"?: string;
    "control-listen"?: string;
    id?: string;
    "control-address"?: string;
    verbose?: boolean;
}

export interface Config {
    readonly mcpListen: string;
    readonly controlListen: string;
    readonly id: string | undefined;
    readonly controlAddress: string | undefined;
    readonly bootstrapSecret: string | undefined;
    readonly verbose: boolean;
}

function str(raw: Record<string, unknown>, key: string): string | undefined {
    const v = raw[key];
    return typeof v === "string" ? v : undefined;
}

function bool(raw: Record<string, unknown>, key: string): boolean | undefined {
    const v = raw[key];
    return typeof v === "boolean" ? v : undefined;
}

async function parseYaml(
    configPath?: string,
): Promise<Record<string, unknown>> {
    const path = configPath ?? DEFAULT_CONFIG_PATH;
    if (!configPath && !(await Bun.file(path).exists())) return {};
    const text = await Bun.file(path).text();
    const parsed = YAML.parse(text);
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error(`Config file must be a YAML mapping: ${path}`);
    }
    return parsed as Record<string, unknown>;
}

export async function loadConfig(
    cli: CliArgs,
    configPath?: string,
): Promise<Config> {
    const yaml = await parseYaml(configPath);

    return {
        get mcpListen() {
            return (
                cli["mcp-listen"] ??
                str(yaml, "mcp_listen") ??
                DEFAULT_MCP_LISTEN
            );
        },
        get controlListen() {
            return (
                cli["control-listen"] ??
                str(yaml, "control_listen") ??
                DEFAULT_CONTROL_LISTEN
            );
        },
        get id() {
            return cli.id ?? str(yaml, "id");
        },
        get controlAddress() {
            return cli["control-address"] ?? str(yaml, "control_address");
        },
        get bootstrapSecret() {
            return str(yaml, "bootstrap_secret");
        },
        get verbose() {
            return cli.verbose ?? bool(yaml, "verbose") ?? false;
        },
    };
}
