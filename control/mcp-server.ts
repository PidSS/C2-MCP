import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { remoteTools } from "../tools/index.ts";
import type { DeviceInfo } from "../lib/protocol.ts";
import { getAllBeacons, sendCommand, updateBeaconInfo } from "./beacons.ts";
import { APP_NAME, APP_VERSION } from "../lib/constants.ts";
import { c, logger } from "../lib/logger.ts";

export function startMcpServer(host: string, port: number) {
    Bun.serve({
        hostname: host,
        port,
        async fetch(req) {
            const server = createMcpServer();
            const transport = new WebStandardStreamableHTTPServerTransport({
                enableJsonResponse: true,
            });
            await server.connect(transport);
            return transport.handleRequest(req);
        },
    });
}

function createMcpServer(): McpServer {
    const server = new McpServer({
        name: APP_NAME,
        version: APP_VERSION,
    });

    // list_devices — special tool, handled locally
    server.registerTool(
        "list_devices",
        {
            description:
                "List all connected devices (beacons) and their environment info.",
            inputSchema: {},
        },
        async () => {
            const beacons = getAllBeacons();
            const devices = beacons.map((b) => ({
                id: b.id,
                info: b.info,
            }));
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(devices, null, 2),
                    },
                ],
            };
        },
    );

    // Register all remote tools
    for (const tool of remoteTools) {
        server.registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            async (args: Record<string, unknown>) => {
                const device = args.device as string | undefined;
                if (!device) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: "Missing device parameter",
                            },
                        ],
                        isError: true,
                    };
                }

                try {
                    // Strip `device` from args before forwarding to Beacon
                    const { device: _device, ...toolArgs } = args; // eslint-disable-line @typescript-eslint/no-unused-vars
                    logger.debug(
                        `[${device}] ${tool.name} ${c.dim(JSON.stringify(toolArgs))}`,
                    );
                    const resp = await sendCommand(device, tool.name, toolArgs);

                    const status = resp.ok ? "ok" : "error";
                    logger.info(
                        `[${device}] ${tool.name} ${c.dim(resp.id)} → ${status}`,
                    );
                    if (!resp.ok) {
                        return {
                            content: [
                                {
                                    type: "text" as const,
                                    text: resp.error ?? "Unknown error",
                                },
                            ],
                            isError: true,
                        };
                    }

                    // Refresh cached device info on successful device_info call
                    if (tool.name === "device_info" && resp.data) {
                        updateBeaconInfo(device, resp.data as DeviceInfo);
                    }

                    const text =
                        typeof resp.data === "string"
                            ? resp.data
                            : JSON.stringify(resp.data, null, 2);
                    return {
                        content: [{ type: "text" as const, text }],
                    };
                } catch (err: unknown) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    logger.info(`[${device}] ${tool.name} → error`);
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: message,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );
    }

    return server;
}
