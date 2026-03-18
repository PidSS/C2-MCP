import type { ToolDef } from "./types.ts";

export const infoTool: ToolDef = {
    name: "info",
    description:
        "Collect basic information about the device's runtime environment, including platform, architecture, OS version, hostname, and current time.",
    inputSchema: {},
    remote: true,
};

/** Execute info tool on the Beacon side. */
export async function executeInfo(): Promise<Record<string, string>> {
    const os = await import("node:os");
    return {
        platform: os.platform(),
        arch: os.arch(),
        osVersion: os.release(),
        hostname: os.hostname(),
        time: new Date().toISOString(),
    };
}
