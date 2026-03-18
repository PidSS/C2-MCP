import { test, expect, describe } from "bun:test";
import { executeInfo } from "../tools/info.ts";
import { executeReadFile } from "../tools/read_file.ts";
import { executeShell } from "../tools/shell.ts";

describe("executeInfo", () => {
    test("returns device info", async () => {
        const info = await executeInfo();
        expect(info.platform).toBeTruthy();
        expect(info.arch).toBeTruthy();
        expect(info.osVersion).toBeTruthy();
        expect(info.hostname).toBeTruthy();
        expect(info.time).toBeTruthy();
    });
});

describe("executeReadFile", () => {
    test("reads existing file", async () => {
        const content = await executeReadFile({ path: "package.json" });
        expect(content).toContain("c2-mcp");
    });

    test("throws on missing file", async () => {
        expect(
            executeReadFile({ path: "/nonexistent_file_abc123" }),
        ).rejects.toThrow("File not found");
    });
});

describe("executeShell", () => {
    test("runs command and returns output", async () => {
        const result = await executeShell({ cwd: ".", command: "echo hello" });
        expect(result.stdout.trim()).toBe("hello");
        expect(result.exitCode).toBe(0);
    });

    test("captures stderr", async () => {
        const result = await executeShell({
            cwd: ".",
            command: "echo err >&2",
        });
        expect(result.stderr.trim()).toBe("err");
    });
});
