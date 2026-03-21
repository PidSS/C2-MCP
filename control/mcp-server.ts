import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { remoteTools } from "../tools/index.ts";
import type { ToolDef } from "../tools/types.ts";
import type { DeviceInfo } from "../lib/protocol.ts";
import { getAllBeacons, sendCommand, updateBeaconInfo } from "./beacons.ts";
import { APP_NAME, APP_VERSION } from "../lib/constants.ts";
import { c, logger } from "../lib/logger.ts";
import type {
    ApprovalProvider,
    ApprovalDecision,
} from "./approval-providers/index.ts";

type McpToolResult = CallToolResult;

export function startMcpServer(
    host: string,
    port: number,
    approvalProvider: ApprovalProvider,
) {
    Bun.serve({
        hostname: host,
        port,
        idleTimeout: 255,
        async fetch(req, server) {
            const clientIp = server.requestIP(req)?.address ?? "unknown";
            const mcpServer = createMcpServer(clientIp, approvalProvider);
            const transport = new WebStandardStreamableHTTPServerTransport({
                enableJsonResponse: true,
            });
            await mcpServer.connect(transport);
            return transport.handleRequest(req);
        },
    });
}

export function createMcpServer(
    clientIp: string,
    approvalProvider: ApprovalProvider,
): McpServer {
    const server = new McpServer({
        name: APP_NAME,
        version: APP_VERSION,
    });

    server.registerTool(
        "list_devices",
        {
            description:
                "List all connected devices (beacons) and their environment info.",
            inputSchema: {},
        },
        async () => {
            logger.debug(`[${clientIp} -> mcp] list_devices()`);
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

    for (const tool of remoteTools) {
        server.registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            async (args: Record<string, unknown>) =>
                executeRemoteToolCall(clientIp, tool, args, approvalProvider),
        );
    }

    return server;
}

export async function executeRemoteToolCall(
    clientIp: string,
    tool: ToolDef,
    args: Record<string, unknown>,
    approvalProvider: ApprovalProvider,
    sendCommandFn: typeof sendCommand = sendCommand,
    updateBeaconInfoFn: typeof updateBeaconInfo = updateBeaconInfo,
): Promise<McpToolResult> {
    logger.debug(`[${clientIp} -> mcp] ${tool.name}()`);

    const device = args.device as string | undefined;
    if (!device) {
        return errorResult("Missing device parameter");
    }

    const toolArgs = { ...args };
    delete toolArgs.device;
    const commandId = Bun.randomUUIDv7();
    const shortId = c.dim(`(${commandId.slice(-6)})`);
    const colorfulCall = tool.format(toolArgs, true);
    const formattedCall = tool.format(toolArgs, false);

    logger.debug(`[${clientIp} -> ${device}] ${shortId} ${colorfulCall}`);

    let decision: ApprovalDecision;
    try {
        decision = await approvalProvider.approve({
            device,
            commandId,
            formattedCall,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[approval] ${shortId} provider error: ${message}`);
        return errorResult("命令审批时出现未知错误");
    }

    try {
        if (!decision.approved) {
            const message = normalizeApprovalRejection(decision);
            logger.info(`[approval] ${shortId} command denied`);
            return errorResult(message);
        }

        logger.info(`[approval] ${shortId} command approved`);
        const resp = await sendCommandFn(
            device,
            tool.name,
            toolArgs,
            commandId,
        );

        const status = resp.ok ? "ok" : "error";
        logger.info(
            `[${clientIp} <- ${device}] ${shortId} ${tool.name} → ${status}`,
        );

        if (!resp.ok) {
            return errorResult(resp.error ?? "Unknown error");
        }

        if (tool.name === "device_info" && resp.data) {
            updateBeaconInfoFn(device, resp.data as DeviceInfo);
        }

        const text =
            typeof resp.data === "string"
                ? resp.data
                : JSON.stringify(resp.data, null, 2);
        return {
            content: [{ type: "text", text }],
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.info(
            `[${clientIp} <- ${device}] ${shortId} ${tool.name} → error`,
        );
        return errorResult(message);
    }
}

function normalizeApprovalRejection(decision: ApprovalDecision): string {
    return decision.reason ?? "Command rejected";
}

function errorResult(text: string): McpToolResult {
    return {
        content: [{ type: "text", text }],
        isError: true,
    };
}
