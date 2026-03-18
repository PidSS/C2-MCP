import { z } from "zod";
import type { ToolDef } from "./types.ts";

export const readFileTool: ToolDef = {
    name: "read_file",
    description:
        "Read the contents of a file at the given path on the specified device.",
    inputSchema: {
        device: z.string().describe("Target device ID"),
        path: z.string().describe("Absolute or relative file path to read"),
    },
    remote: true,
};

/** Execute read_file on the Beacon side. */
export async function executeReadFile(args: { path: string }): Promise<string> {
    const file = Bun.file(args.path);
    if (!(await file.exists())) {
        throw new Error(`File not found: ${args.path}`);
    }
    return await file.text();
}
