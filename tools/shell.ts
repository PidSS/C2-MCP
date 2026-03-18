import { z } from "zod";
import { homedir } from "node:os";
import type { ToolDef } from "./types.ts";
import { DEFAULT_SHELL_TIMEOUT_S } from "../lib/constants.ts";

const SHELL_PRESETS: Record<string, string[]> = {
    sh: ["sh", "-c"],
    bash: ["bash", "-c"],
    cmd: ["cmd", "/c"],
    powershell: ["powershell", "-Command"],
};

function defaultShell(): string {
    return process.platform === "win32" ? "cmd" : "bash";
}

function defaultCwd(): string {
    try {
        const home = homedir();
        if (home) return home;
    } catch {}
    return process.platform === "win32" ? "C:\\" : "/";
}

export const shellTool: ToolDef = {
    name: "shell",
    description:
        "Execute a shell command on the specified device. " +
        "Returns stdout, stderr, and exit code. " +
        "The shell defaults to sh on Unix and cmd on Windows; " +
        "use the shell parameter to override (e.g. bash, powershell). " +
        "Check the platform field from list_devices to write " +
        "platform-appropriate commands. " +
        "Commands time out after 120 seconds by default.",
    inputSchema: {
        device: z
            .string()
            .describe(
                "Target device ID (use list_devices to discover available devices)",
            ),
        command: z
            .string()
            .describe(
                "Shell command to execute (passed to the selected shell)",
            ),
        cwd: z
            .string()
            .optional()
            .describe(
                "Working directory. Defaults to the user's home directory.",
            ),
        shell: z
            .enum(["sh", "bash", "cmd", "powershell"])
            .optional()
            .describe(
                "Shell to use. Defaults to sh (Unix) or cmd (Windows). " +
                    "Use powershell for PowerShell commands on Windows.",
            ),
        timeout: z
            .number()
            .int()
            .min(1)
            .max(300)
            .optional()
            .describe("Command timeout in seconds (1-300). Default: 120."),
    },
    remote: true,
};

/** Execute shell on the Beacon side. */
export async function executeShell(args: {
    command: string;
    cwd?: string;
    shell?: "sh" | "bash" | "cmd" | "powershell";
    timeout?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const shellName = args.shell ?? defaultShell();
    const shellCmd = SHELL_PRESETS[shellName];
    if (!shellCmd) {
        throw new Error(`Unsupported shell: ${shellName}`);
    }

    const cwd = args.cwd || defaultCwd();
    const timeoutS = args.timeout ?? DEFAULT_SHELL_TIMEOUT_S;

    const proc = Bun.spawn([...shellCmd, args.command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
    });

    const timer = setTimeout(() => {
        proc.kill();
    }, timeoutS * 1000);

    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    const timedOut = exitCode === 137 || exitCode === null;
    if (timedOut && args.timeout) {
        return {
            stdout,
            stderr:
                stderr + `\n[Process killed: exceeded ${timeoutS}s timeout]`,
            exitCode: exitCode ?? 137,
        };
    }

    return { stdout, stderr, exitCode };
}
