export { infoTool, executeInfo } from "./info.ts";
export { readFileTool, executeReadFile } from "./read_file.ts";
export { shellTool, executeShell } from "./shell.ts";
export type { ToolDef } from "./types.ts";

import { infoTool } from "./info.ts";
import { readFileTool } from "./read_file.ts";
import { shellTool } from "./shell.ts";
import type { ToolDef } from "./types.ts";

/** All remote tools (executed on Beacon). */
export const remoteTools: ToolDef[] = [infoTool, readFileTool, shellTool];
