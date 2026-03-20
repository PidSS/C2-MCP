import type { z } from "zod";

/** Unified tool definition shared by Control (MCP) and Beacon (executor). */
export interface ToolDef<T extends z.ZodRawShape = z.ZodRawShape> {
    name: string;
    description: string;
    /** Zod raw shape for input validation. */
    inputSchema: T;
    /** Format a call to this tool as a human-readable string for logging. */
    format: (args: Record<string, unknown>, colorful: boolean) => string;
}
