import type { z } from "zod";

/** Unified tool definition shared by Control (MCP) and Beacon (executor). */
export interface ToolDef<T extends z.ZodRawShape = z.ZodRawShape> {
    name: string;
    description: string;
    /** Zod raw shape for input validation. */
    inputSchema: T;
    /** Whether this tool requires a `device` parameter (routed to Beacon). */
    remote: boolean;
}
