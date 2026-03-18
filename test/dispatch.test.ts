import { test, expect, describe } from "bun:test";
import { dispatch } from "../beacon/executor.ts";

describe("dispatch", () => {
    test("dispatches info tool", async () => {
        const resp = await dispatch({
            type: "command",
            id: "test-1",
            tool: "info",
            args: {},
        });
        expect(resp.ok).toBe(true);
        expect(resp.id).toBe("test-1");
        expect((resp.data as Record<string, unknown>).platform).toBeTruthy();
    });

    test("dispatches shell tool", async () => {
        const resp = await dispatch({
            type: "command",
            id: "test-2",
            tool: "shell",
            args: { cwd: ".", command: "echo dispatch_test" },
        });
        expect(resp.ok).toBe(true);
        expect((resp.data as Record<string, unknown>).stdout).toContain(
            "dispatch_test",
        );
    });

    test("returns error for unknown tool", async () => {
        const resp = await dispatch({
            type: "command",
            id: "test-3",
            tool: "nonexistent",
            args: {},
        });
        expect(resp.ok).toBe(false);
        expect(resp.error).toContain("Unknown tool");
    });
});
