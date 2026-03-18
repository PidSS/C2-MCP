import { z } from "zod";
import type { ToolDef } from "./types.ts";

export const shellTool: ToolDef = {
    name: "shell",
    description:
        "Execute a shell command on the specified device. Returns stdout and stderr.",
    inputSchema: {
        device: z.string().describe("Target device ID"),
        cwd: z.string().describe("Working directory for the command"),
        command: z.string().describe("Shell command to execute"),
    },
    remote: true,
};

/** Execute shell on the Beacon side. */
export async function executeShell(args: {
    cwd: string;
    command: string;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["sh", "-c", args.command], {
        cwd: args.cwd,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
}
