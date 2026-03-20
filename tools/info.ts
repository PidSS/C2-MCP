import { z } from "zod";
import type { ToolDef } from "./types.ts";
import type { DeviceInfo } from "../lib/protocol.ts";
import { c } from "../lib/logger.ts";

export const deviceInfoTool: ToolDef = {
    name: "device_info",
    format(_args, colorful) {
        const colorFn = colorful ? c.dim : String;
        return `device_info${colorFn("()")}`;
    },
    description:
        "Collect current runtime environment info from the specified device, " +
        "including platform, architecture, OS version, hostname, and time. " +
        "Also refreshes the cached info returned by list_devices.",
    inputSchema: {
        device: z
            .string()
            .describe(
                "Target device ID (use list_devices to discover available devices)",
            ),
    },
};

/** Collect device info. Used by both the tool and beacon auth. */
export async function executeDeviceInfo(): Promise<DeviceInfo> {
    const os = await import("node:os");
    return {
        platform: os.platform(),
        arch: os.arch(),
        osVersion: os.release(),
        hostname: os.hostname(),
        time: new Date().toISOString(),
    };
}
