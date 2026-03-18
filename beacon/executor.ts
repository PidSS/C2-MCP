import { z } from "zod";
import { infoTool, executeInfo } from "../tools/info.ts";
import { readFileTool, executeReadFile } from "../tools/read_file.ts";
import { shellTool, executeShell } from "../tools/shell.ts";
import type { ToolDef } from "../tools/types.ts";
import type { CommandRequest, CommandResponse } from "../lib/protocol.ts";
import { logger } from "../lib/logger.ts";

interface ToolEntry {
    def: ToolDef;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const tools: Record<string, ToolEntry> = {
    info: { def: infoTool, execute: () => executeInfo() },
    read_file: {
        def: readFileTool,
        execute: (a) =>
            executeReadFile(a as Parameters<typeof executeReadFile>[0]),
    },
    shell: {
        def: shellTool,
        execute: (a) => executeShell(a as Parameters<typeof executeShell>[0]),
    },
};

/** Parse args using the tool's inputSchema, stripping the `device` field. */
function parseArgs(
    def: ToolDef,
    raw: Record<string, unknown>,
): Record<string, unknown> {
    const { device: _device, ...shape } = def.inputSchema; // eslint-disable-line @typescript-eslint/no-unused-vars
    return z.object(shape).parse(raw);
}

/** Dispatch a command request to the appropriate tool executor. */
export async function dispatch(req: CommandRequest): Promise<CommandResponse> {
    const tool = tools[req.tool];
    if (!tool) {
        return {
            type: "result",
            id: req.id,
            ok: false,
            error: `Unknown tool: ${req.tool}`,
        };
    }

    try {
        const args = parseArgs(tool.def, req.args);
        const data = await tool.execute(args);
        return { type: "result", id: req.id, ok: true, data };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Tool ${req.tool} failed: ${message}`);
        return {
            type: "result",
            id: req.id,
            ok: false,
            error: message,
        };
    }
}
