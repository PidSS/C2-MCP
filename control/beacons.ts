import type { ServerWebSocket } from "bun";
import type {
    DeviceInfo,
    CommandRequest,
    CommandResponse,
} from "../lib/protocol.ts";
import { logger } from "../lib/logger.ts";
import { randomUUID } from "node:crypto";
import { COMMAND_TIMEOUT_MS } from "../lib/constants.ts";

export interface BeaconConnection {
    id: string;
    ws: ServerWebSocket<BeaconWSData>;
    info: DeviceInfo;
}

export interface BeaconWSData {
    authenticated: boolean;
    beaconId?: string;
}

/** Pending command requests waiting for Beacon response. */
const pendingRequests = new Map<
    string,
    { resolve: (v: CommandResponse) => void; reject: (e: Error) => void }
>();

/** Connected beacons indexed by id. */
const beacons = new Map<string, BeaconConnection>();

export function getBeacon(id: string): BeaconConnection | undefined {
    return beacons.get(id);
}

export function getAllBeacons(): BeaconConnection[] {
    return [...beacons.values()];
}

export function registerBeacon(
    id: string,
    ws: ServerWebSocket<BeaconWSData>,
    info: DeviceInfo,
): boolean {
    if (beacons.has(id)) {
        return false; // id already taken
    }
    beacons.set(id, { id, ws, info });
    logger.info(`Beacon registered: ${id}`);
    return true;
}

export function removeBeacon(id: string): void {
    beacons.delete(id);
    logger.info(`Beacon removed: ${id}`);
}

export function updateBeaconInfo(id: string, info: DeviceInfo): void {
    const beacon = beacons.get(id);
    if (beacon) {
        beacon.info = info;
    }
}

/**
 * Send a command to a Beacon and wait for the response.
 * Returns a promise that resolves when the Beacon replies.
 */
export function sendCommand(
    beaconId: string,
    tool: string,
    args: Record<string, unknown>,
): Promise<CommandResponse> {
    const beacon = beacons.get(beaconId);
    if (!beacon) {
        return Promise.reject(new Error(`Device not found: ${beaconId}`));
    }

    const id = randomUUID();
    const request: CommandRequest = { type: "command", id, tool, args };

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Command timed out (${tool} on ${beaconId})`));
        }, COMMAND_TIMEOUT_MS);

        pendingRequests.set(id, {
            resolve: (resp) => {
                clearTimeout(timeout);
                resolve(resp);
            },
            reject: (err) => {
                clearTimeout(timeout);
                reject(err);
            },
        });

        beacon.ws.sendText(JSON.stringify(request));
    });
}

/** Handle an incoming message from a Beacon (after auth). */
export function handleBeaconResponse(data: string): void {
    let msg: CommandResponse;
    try {
        msg = JSON.parse(data);
    } catch {
        logger.warn("Invalid JSON from beacon");
        return;
    }
    if (msg.type !== "result" || !msg.id) return;

    const pending = pendingRequests.get(msg.id);
    if (pending) {
        pendingRequests.delete(msg.id);
        pending.resolve(msg);
    }
}
