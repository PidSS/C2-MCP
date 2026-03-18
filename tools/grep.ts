import { z } from "zod";
import type { ToolDef } from "./types.ts";

export const grepTool: ToolDef = {
    name: "grep",
    description:
        "Search for a pattern in files under the given directory on the specified device. Uses grep -rn.",
    inputSchema: {
        device: z.string().describe("Target device ID"),
        cwd: z.string().describe("Directory to search in"),
        pattern: z.string().describe("Search pattern (regex)"),
    },
    remote: true,
};

/** Execute grep on the Beacon side. */
export async function executeGrep(args: {
    cwd: string;
    pattern: string;
}): Promise<string> {
    const proc = Bun.spawn(["grep", "-rn", args.pattern, "."], {
        cwd: args.cwd,
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    // grep returns 1 when no matches found — not an error
    if (exitCode > 1) {
        throw new Error(`grep failed: ${stderr}`);
    }
    return stdout || "(no matches)";
}
