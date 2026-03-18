import { test, expect, describe } from "bun:test";
import {
    registerBeacon,
    removeBeacon,
    getAllBeacons,
    getBeacon,
    sendCommand,
} from "../control/beacons.ts";
import type { DeviceInfo } from "../lib/protocol.ts";

describe("beacons manager", () => {
    const mockInfo: DeviceInfo = {
        platform: "test",
        arch: "x64",
        osVersion: "1.0",
        hostname: "test-host",
        time: new Date().toISOString(),
    };

    // Minimal mock WebSocket
    const mockWs = {
        sendText: () => {},
        close: () => {},
        data: { authenticated: true, beaconId: "test-beacon" },
    } as unknown as Parameters<typeof registerBeacon>[1];

    test("register and list beacons", () => {
        const ok = registerBeacon("test-beacon", mockWs, mockInfo);
        expect(ok).toBe(true);
        expect(getAllBeacons().length).toBeGreaterThanOrEqual(1);
        expect(getBeacon("test-beacon")).toBeTruthy();
    });

    test("reject duplicate id", () => {
        const ok = registerBeacon("test-beacon", mockWs, mockInfo);
        expect(ok).toBe(false);
    });

    test("remove beacon", () => {
        removeBeacon("test-beacon");
        expect(getBeacon("test-beacon")).toBeUndefined();
    });

    test("sendCommand rejects for unknown device", async () => {
        expect(sendCommand("nonexistent", "info", {})).rejects.toThrow(
            "Device not found",
        );
    });
});
