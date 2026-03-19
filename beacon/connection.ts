import { c, logger } from "../lib/logger.ts";
import { decodeBootstrapSecret } from "../lib/crypto.ts";
import type {
    AuthMessage,
    AuthResult,
    CommandRequest,
} from "../lib/protocol.ts";
import { dispatch } from "./executor.ts";
import { executeDeviceInfo } from "../tools/info.ts";
import { X509Certificate, createHash } from "node:crypto";

export type ConnectErrorKind = "network" | "secret";

export class ConnectError extends Error {
    constructor(
        public readonly kind: ConnectErrorKind,
        message: string,
    ) {
        super(message);
        this.name = "ConnectError";
    }
}

/**
 * Two-phase connection to Control.
 * Phase 1: HTTPS fetch /cert (rejectUnauthorized:false), verify body PEM fingerprint.
 * Phase 2: WSS connect using the fetched PEM as ca — pins the exact certificate.
 *
 * Security: attacker cannot win either way —
 *   - return their own PEM → fingerprint mismatch → rejected in Phase 1
 *   - return legit PEM    → Phase 2 ca rejects attacker's TLS cert
 */
export async function connectToControl(
    address: string,
    beaconId: string,
    bootstrapSecret: string,
): Promise<void> {
    const { authToken, fingerprint } = decodeBootstrapSecret(bootstrapSecret);

    // --- Phase 1: Fetch certificate, verify fingerprint ---
    logger.debug("Fetching Control certificate...");

    const certUrl = `https://${address}/cert`;
    const certResp = await fetch(certUrl, {
        tls: { rejectUnauthorized: false },
    }).catch((e) => {
        throw new ConnectError("network", e.message);
    });

    if (!certResp.ok) {
        throw new ConnectError(
            "network",
            `Failed to fetch certificate: ${certResp.status}`,
        );
    }

    const certPem = await certResp.text();
    const x509 = new X509Certificate(certPem);
    const hash = createHash("sha256").update(x509.raw).digest("hex");
    if (hash !== fingerprint) {
        throw new ConnectError(
            "secret",
            `Certificate fingerprint mismatch: expected ${fingerprint}, got ${hash}`,
        );
    }
    logger.debug("Certificate verified");

    // --- Phase 2: WSS connection, pinned to the fetched certificate ---
    logger.debug("Connecting to Control...");

    const info = await executeDeviceInfo();

    return new Promise<void>((resolve, reject) => {
        const wsUrl = `wss://${address}/ws`;
        const ws = new WebSocket(wsUrl, {
            tls: { ca: certPem },
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
        let authFailed = false;

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
                        logger.success("Authenticated with Control");
                        resolve();
                    } else {
                        authFailed = true;
                        reject(
                            new ConnectError(
                                "secret",
                                `Auth token rejected: ${resp.error}`,
                            ),
                        );
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
                const { tool, args } = req;
                logger.debug(`${tool} ${c.dim(JSON.stringify(args))}`);
                const result = await dispatch(req);
                const status = result.ok ? "ok" : "error";
                logger.info(`${tool} ${c.dim(req.id)} → ${status}`);
                ws.send(JSON.stringify(result));
            }
        });

        ws.addEventListener("close", (event) => {
            if (authenticated || authFailed) return;
            reject(
                new ConnectError(
                    "network",
                    `Connection closed before auth: ${event.code} ${event.reason}`,
                ),
            );
        });

        ws.addEventListener("error", () => {
            if (!authenticated) {
                reject(
                    new ConnectError("network", "WebSocket connection error"),
                );
            }
        });
    });
}
