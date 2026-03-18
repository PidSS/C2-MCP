import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { remoteTools } from "../tools/index.ts";
import type { DeviceInfo } from "../lib/protocol.ts";
import { getAllBeacons, sendCommand, updateBeaconInfo } from "./beacons.ts";
import { logger } from "../lib/logger.ts";
import { APP_NAME, APP_VERSION } from "../lib/constants.ts";

/** Handle an incoming MCP HTTP request. Stateless: each request gets a fresh transport. */
async function handleMcpRequest(req: Request): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport();
    await mcpServer.connect(transport);
    return transport.handleRequest(req);
}

const mcpServer = createMcpServer();

export function startMcpServer(host: string, port: number): void {
    Bun.serve({ hostname: host, port, fetch: handleMcpRequest });
    logger.info(`MCP server listening on http://${host}:${port}`);
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
                    const resp = await sendCommand(device, tool.name, toolArgs);
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

    logger.info("MCP server tools registered");
    return server;
}
