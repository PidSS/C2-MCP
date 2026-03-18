/** Message types exchanged between Control and Beacon over WSS. */

export interface CommandRequest {
    type: "command";
    id: string; // unique request ID for correlating responses
    tool: string;
    args: Record<string, unknown>;
}

export interface CommandResponse {
    type: "result";
    id: string; // matches CommandRequest.id
    ok: boolean;
    data?: unknown;
    error?: string;
}

/** Sent by Beacon immediately after WSS connection as auth. */
export interface AuthMessage {
    type: "auth";
    token: string; // hex-encoded auth token
    id: string; // beacon id
    info: DeviceInfo;
}

export interface AuthResult {
    type: "auth_result";
    ok: boolean;
    error?: string;
}

export interface DeviceInfo {
    platform: string;
    arch: string;
    osVersion: string;
    hostname: string;
    time: string;
}

export type BeaconMessage = AuthMessage | CommandResponse;
export type ControlMessage = AuthResult | CommandRequest;
