import { logger } from "../lib/logger.ts";
import { decodeBootstrapSecret } from "../lib/crypto.ts";
import { CONTROL_CN } from "../lib/constants.ts";
import type {
    AuthMessage,
    AuthResult,
    CommandRequest,
    DeviceInfo,
} from "../lib/protocol.ts";
import { dispatch } from "./executor.ts";
import { X509Certificate } from "node:crypto";

/**
 * Two-phase connection to Control.
 * Phase 1: HTTPS fetch /cert, verify fingerprint via checkServerIdentity.
 * Phase 2: WSS connect using fetched cert as CA.
 */
export async function connectToControl(
    address: string,
    beaconId: string,
    bootstrapSecret: string,
): Promise<void> {
    const { authToken, fingerprint } = decodeBootstrapSecret(bootstrapSecret);

    // --- Phase 1: Fetch certificate, verify fingerprint ---
    logger.info("Phase 1: Fetching and verifying Control certificate...");

    const certUrl = `https://${address}/cert`;
    const certResp = await fetch(certUrl, {
        tls: {
            rejectUnauthorized: false,
            checkServerIdentity(_hostname, cert) {
                const x509 = new X509Certificate(cert.raw);
                const hash = new Bun.CryptoHasher("sha256")
                    .update(x509.raw)
                    .digest("hex");
                if (hash !== fingerprint) {
                    return new Error(
                        `Certificate fingerprint mismatch: expected ${fingerprint}, got ${hash}`,
                    );
                }
            },
        },
    });

    if (!certResp.ok) {
        throw new Error(`Failed to fetch certificate: ${certResp.status}`);
    }
    const certPem = await certResp.text();
    logger.info("Phase 1 complete: certificate verified");

    // --- Phase 2: WSS connection using cert as CA ---
    logger.info("Phase 2: Establishing WSS connection...");

    // Collect device info for auth message
    const os = await import("node:os");
    const info: DeviceInfo = {
        platform: os.platform(),
        arch: os.arch(),
        osVersion: os.release(),
        hostname: os.hostname(),
        time: new Date().toISOString(),
    };

    return new Promise<void>((resolve, reject) => {
        const wsUrl = `wss://${address}/ws`;
        const ws = new WebSocket(wsUrl, {
            tls: {
                ca: certPem,
                serverName: CONTROL_CN,
            },
        });

        ws.addEventListener("open", () => {
            logger.debug("WSS connected, sending auth...");
            const authMsg: AuthMessage = {
                type: "auth",
                token: authToken.toString("hex"),
                id: beaconId,
                info,
            };
            ws.send(JSON.stringify(authMsg));
        });

        let authenticated = false;

        ws.addEventListener("message", async (event) => {
            const raw =
                typeof event.data === "string"
                    ? event.data
                    : new TextDecoder().decode(event.data as ArrayBuffer);

            if (!authenticated) {
                const resp: AuthResult = JSON.parse(raw);
                if (resp.type === "auth_result") {
                    if (resp.ok) {
                        authenticated = true;
                        logger.info("Authenticated with Control");
                        resolve();
                    } else {
                        reject(new Error(`Auth failed: ${resp.error}`));
                        ws.close();
                    }
                }
                return;
            }

            // Handle command requests from Control
            let req: CommandRequest;
            try {
                req = JSON.parse(raw);
            } catch {
                logger.warn("Invalid message from Control");
                return;
            }

            if (req.type === "command") {
                logger.debug(`Executing tool: ${req.tool} (${req.id})`);
                const result = await dispatch(req);
                ws.send(JSON.stringify(result));
            }
        });

        ws.addEventListener("close", (event) => {
            logger.warn(
                `Connection to Control closed: ${event.code} ${event.reason}`,
            );
            if (!authenticated) {
                reject(new Error("Connection closed before auth"));
            }
        });

        ws.addEventListener("error", (event) => {
            logger.error(`WebSocket error: ${event}`);
            if (!authenticated) {
                reject(new Error("WebSocket connection error"));
            }
        });
    });
}
