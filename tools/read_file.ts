import { z } from "zod";
import type { ToolDef } from "./types.ts";

/** Max characters before truncation (head + tail). */
const READFILE_MAX_CHARS = 120_000;

export const readFileTool: ToolDef = {
    name: "read_file",
    description:
        `Read the contents of a file on the specified device. ` +
        `Returns line-numbered content wrapped in XML tags. ` +
        `For large files (>${READFILE_MAX_CHARS} chars), content is automatically truncated showing head and tail. ` +
        `Use start_line and end_line to read specific line ranges.`,
    inputSchema: {
        device: z.string().describe("Target device ID"),
        path: z.string().describe("Absolute or relative file path to read"),
        start_line: z
            .number()
            .int()
            .optional()
            .describe(
                "Start line number (1-indexed, inclusive). Must be used together with end_line.",
            ),
        end_line: z
            .number()
            .int()
            .optional()
            .describe(
                "End line number (1-indexed, inclusive). Must be used together with start_line.",
            ),
    },
    remote: true,
};

/**
 * Check if content looks like binary (contains control chars other than
 * tab, newline, carriage return).
 */
function isBinary(content: string): boolean {
    const binaryPattern = /[\x00-\x08\x0E-\x1F]/;
    return binaryPattern.test(content.slice(0, 8192));
}

/** Add line numbers to an array of lines. */
function addLineNumbers(lines: string[], startLine: number = 1): string {
    const width = String(startLine + lines.length - 1).length;
    return lines
        .map(
            (line, idx) =>
                `${String(startLine + idx).padStart(width, " ")}|${line}`,
        )
        .join("\n");
}

/** Wrap content in XML tags with path and line range metadata. */
function wrapXml(
    path: string,
    content: string,
    lines: [number, number],
): string {
    return `<file path="${path}" lines="${lines[0]}-${lines[1]}">\n${content}\n</file>`;
}

/**
 * Truncate content by keeping head and tail, inserting a separator in the
 * middle. Tries to break at line boundaries.
 */
function truncate(
    lines: string[],
    maxChars: number,
): { content: string; truncated: boolean } {
    const full = addLineNumbers(lines);
    if (full.length <= maxChars) {
        return { content: full, truncated: false };
    }

    const separator = "\n\n... [content truncated] ...\n\n";
    const half = Math.floor((maxChars - separator.length) / 2);

    // Head — try to break at a newline
    let headEnd = half;
    const headNl = full.lastIndexOf("\n", headEnd);
    if (headNl > half * 0.7) headEnd = headNl;

    // Tail — try to break at a newline
    let tailStart = full.length - half;
    const tailNl = full.indexOf("\n", tailStart);
    if (tailNl !== -1 && tailNl < tailStart + half * 0.3)
        tailStart = tailNl + 1;

    return {
        content: full.slice(0, headEnd) + separator + full.slice(tailStart),
        truncated: false,
    };
}

/** Execute read_file on the Beacon side. */
export async function executeReadFile(args: {
    path: string;
    start_line?: number;
    end_line?: number;
}): Promise<string> {
    const file = Bun.file(args.path);
    if (!(await file.exists())) {
        throw new Error(`File not found: ${args.path}`);
    }

    const content = await file.text();

    // Binary check
    if (isBinary(content)) {
        throw new Error(
            "Binary file cannot be displayed. " +
                "Use shell to inspect (e.g. `file <path>`, `strings <path>`, or `hexdump -C <path> | head`).",
        );
    }

    const lines = content.split("\n");
    const totalLines = lines.length;

    // Line range mode
    if (args.start_line !== undefined || args.end_line !== undefined) {
        if (args.start_line === undefined || args.end_line === undefined) {
            throw new Error(
                "Both start_line and end_line must be provided together",
            );
        }

        const start = args.start_line;
        const end = args.end_line;

        if (start < 1 || end < start) {
            throw new Error(
                "start_line must be >= 1 and end_line must be >= start_line",
            );
        }
        if (start > totalLines) {
            throw new Error(
                `Line ${start} is out of range: file only has ${totalLines} lines`,
            );
        }

        const startIdx = start - 1;
        const endIdx = Math.min(totalLines, end);
        const selected = lines.slice(startIdx, endIdx);
        const numbered = addLineNumbers(selected, start);

        return wrapXml(args.path, numbered, [start, endIdx]);
    }

    // Full file mode (with possible truncation)
    const { content: result } = truncate(lines, READFILE_MAX_CHARS);
    return wrapXml(args.path, result, [1, totalLines]);
}
