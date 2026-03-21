import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import {
    registerBeacon,
    removeBeacon,
    getAllBeacons,
    getBeacon,
    sendCommand,
} from "../control/beacons.ts";
import { executeRemoteToolCall } from "../control/mcp-server.ts";
import { createNoopApprovalProvider } from "../control/approval-providers/noop.ts";
import type { ApprovalProvider } from "../control/approval-providers/types.ts";
import { shellTool } from "../tools/shell.ts";
import type { DeviceInfo } from "../lib/protocol.ts";

describe("beacons manager", () => {
    let mockWs: Parameters<typeof registerBeacon>[1];

    const mockInfo: DeviceInfo = {
        platform: "test",
        arch: "x64",
        osVersion: "1.0",
        hostname: "test-host",
        time: new Date().toISOString(),
    };

    beforeEach(() => {
        mockWs = {
            sendText: mock(() => {}),
            close: mock(() => {}),
            data: { authenticated: true, beaconId: "test-beacon" },
        } as unknown as Parameters<typeof registerBeacon>[1];

        removeBeacon("test-beacon");
    });

    afterEach(() => {
        removeBeacon("test-beacon");
    });

    test("register and list beacons", () => {
        const ok = registerBeacon("test-beacon", mockWs, mockInfo);
        expect(ok).toBe(true);
        expect(getAllBeacons().length).toBeGreaterThanOrEqual(1);
        expect(getBeacon("test-beacon")).toBeTruthy();
    });

    test("reject duplicate id", () => {
        const first = registerBeacon("test-beacon", mockWs, mockInfo);
        const second = registerBeacon("test-beacon", mockWs, mockInfo);
        expect(first).toBe(true);
        expect(second).toBe(false);
    });

    test("remove beacon", () => {
        removeBeacon("test-beacon");
        expect(getBeacon("test-beacon")).toBeUndefined();
    });

    test("sendCommand rejects for unknown device", async () => {
        await expect(
            sendCommand("nonexistent", "info", {}, "cmd-1"),
        ).rejects.toThrow("Device not found");
    });

    test("approval rejection does not send command", async () => {
        registerBeacon("test-beacon", mockWs, mockInfo);
        const approve = mock(async () => ({
            approved: false,
            reason: "Command rejected",
        }));
        const provider: ApprovalProvider = { approve };
        const sendCommandFn = mock(async () => ({
            type: "result" as const,
            id: "ignored",
            ok: true,
            data: "ok",
        }));

        const result = await executeRemoteToolCall(
            "127.0.0.1",
            shellTool,
            { device: "test-beacon", command: "ls" },
            provider,
            sendCommandFn,
        );

        expect(result.isError).toBe(true);
        expect(result.content[0]).toMatchObject({
            type: "text",
            text: "Command rejected",
        });
        expect(approve).toHaveBeenCalledTimes(1);
        expect(sendCommandFn).not.toHaveBeenCalled();
        expect(mockWs.sendText).toHaveBeenCalledTimes(0);
    });

    test("approval provider errors are masked from MCP clients", async () => {
        registerBeacon("test-beacon", mockWs, mockInfo);
        const approve = mock(async () => {
            throw new Error("Network request for 'sendMessage' failed!");
        });
        const provider: ApprovalProvider = { approve };
        const sendCommandFn = mock(async () => ({
            type: "result" as const,
            id: "ignored",
            ok: true,
            data: "ok",
        }));

        const result = await executeRemoteToolCall(
            "127.0.0.1",
            shellTool,
            { device: "test-beacon", command: "ls" },
            provider,
            sendCommandFn,
        );

        expect(result.isError).toBe(true);
        expect(result.content[0]).toMatchObject({
            type: "text",
            text: "命令审批时出现未知错误",
        });
        expect(approve).toHaveBeenCalledTimes(1);
        expect(sendCommandFn).not.toHaveBeenCalled();
        expect(mockWs.sendText).toHaveBeenCalledTimes(0);
    });

    test("approval success still sends command", async () => {
        registerBeacon("test-beacon", mockWs, mockInfo);
        const provider = createNoopApprovalProvider();
        const sendCommandFn = mock(async () => ({
            type: "result" as const,
            id: "cmd-1",
            ok: true,
            data: "approved result",
        }));

        const result = await executeRemoteToolCall(
            "127.0.0.1",
            shellTool,
            { device: "test-beacon", command: "ls" },
            provider,
            sendCommandFn,
        );

        expect(result.isError).toBeUndefined();
        expect(result.content[0]).toMatchObject({
            type: "text",
            text: "approved result",
        });
        expect(sendCommandFn).toHaveBeenCalledTimes(1);
        expect(mockWs.sendText).toHaveBeenCalledTimes(0);
    });
});
