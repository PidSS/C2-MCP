import { test, expect, describe } from "bun:test";
import type { BeaconMessage, CommandRequest } from "../lib/protocol.ts";

describe("protocol types", () => {
    test("CommandRequest serialization", () => {
        const req: CommandRequest = {
            type: "command",
            id: "abc-123",
            tool: "shell",
            args: { cwd: "/tmp", command: "ls" },
        };
        const json = JSON.parse(JSON.stringify(req));
        expect(json.type).toBe("command");
        expect(json.id).toBe("abc-123");
        expect(json.tool).toBe("shell");
        expect(json.args.cwd).toBe("/tmp");
    });

    test("AuthMessage shape", () => {
        const msg: BeaconMessage = {
            type: "auth",
            token: "deadbeef",
            id: "my-beacon",
            info: {
                platform: "darwin",
                arch: "arm64",
                osVersion: "24.0",
                hostname: "mac",
                time: "2026-01-01T00:00:00Z",
            },
        };
        expect(msg.type).toBe("auth");
    });
});
