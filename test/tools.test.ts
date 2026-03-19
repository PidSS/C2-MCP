import { test, expect, describe } from "bun:test";
import { executeDeviceInfo } from "../tools/info.ts";
import { executeReadFile } from "../tools/read_file.ts";
import { executeShell } from "../tools/shell.ts";

describe("executeDeviceInfo", () => {
    test("returns device info", async () => {
        const info = await executeDeviceInfo();
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

    test("wraps output in XML with line numbers", async () => {
        const content = await executeReadFile({ path: "package.json" });
        expect(content).toMatch(/^<file path="package\.json" lines="1-\d+">/);
        expect(content).toEndWith("</file>");
        // Line numbers present
        expect(content).toContain("1|");
    });

    test("reads specific line range", async () => {
        const content = await executeReadFile({
            path: "package.json",
            start_line: 2,
            end_line: 4,
        });
        expect(content).toMatch(/^<file path="package\.json" lines="2-4">/);
        expect(content).toContain("2|");
        expect(content).toContain("4|");
        // Should not contain line 1 or 5
        expect(content).not.toContain("1|");
        expect(content).not.toContain("5|");
    });

    test("throws when only start_line is provided", async () => {
        expect(
            executeReadFile({ path: "package.json", start_line: 1 }),
        ).rejects.toThrow("Both start_line and end_line must be provided");
    });

    test("throws when only end_line is provided", async () => {
        expect(
            executeReadFile({ path: "package.json", end_line: 5 }),
        ).rejects.toThrow("Both start_line and end_line must be provided");
    });

    test("throws on invalid line range", async () => {
        expect(
            executeReadFile({
                path: "package.json",
                start_line: 0,
                end_line: 5,
            }),
        ).rejects.toThrow("start_line must be >= 1");
    });

    test("throws when start_line exceeds file length", async () => {
        expect(
            executeReadFile({
                path: "package.json",
                start_line: 99999,
                end_line: 99999,
            }),
        ).rejects.toThrow("out of range");
    });

    test("throws on binary file", async () => {
        expect(executeReadFile({ path: "/bin/ls" })).rejects.toThrow(
            "Binary file cannot be displayed",
        );
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
