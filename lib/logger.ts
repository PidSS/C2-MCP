import { createConsola, LogLevels } from "consola";
import { colors } from "consola/utils";
import type {
    ConsolaReporter,
    LogObject,
    ConsolaOptions,
    LogType,
} from "consola";
import { formatWithOptions } from "node:util";

export { colors as c } from "consola/utils";

type ColorFn = (s: string) => string;

const LEVEL_COLORS: Record<string, ColorFn> = {
    fatal: (s) => colors.bold(colors.red(s)),
    error: colors.red,
    warn: colors.yellow,
    info: colors.cyan,
    debug: colors.gray,
    trace: colors.gray,
    verbose: colors.gray,
};

const ICONS: Partial<Record<LogType, string>> = {
    error: "✖",
    warn: "⚠",
    info: "ℹ",
    success: "✔",
    fail: "✖",
    ready: "✔",
    start: "◐",
    debug: "⬡",
    trace: "→",
};

const reporter: ConsolaReporter = {
    log(logObj: LogObject, ctx: { options: ConsolaOptions }) {
        const opts = ctx.options.formatOptions;
        const args = logObj.args.map((a) =>
            a && typeof a.stack === "string" ? a.message + "\n" + a.stack : a,
        );
        const message = formatWithOptions(opts, ...args);
        const time = logObj.date.toLocaleTimeString();
        const colorFn = LEVEL_COLORS[logObj.type];
        const icon = ICONS[logObj.type] ?? "";
        const tag = logObj.tag ? `[${logObj.tag}] ` : "";
        const label = logObj.type.toUpperCase().padEnd(7);

        const line = `${colors.gray(time)} ${
            colorFn ? colorFn(label) : label
        } ${icon ? icon + " " : ""}${tag}${message}`;

        const stream =
            logObj.level < 2
                ? (ctx.options.stderr ?? process.stderr)
                : (ctx.options.stdout ?? process.stdout);
        stream.write(line + "\n");
    },
};

export const logger = createConsola({
    level: LogLevels.info,
    reporters: [reporter],
});

export function setVerbose(v: boolean) {
    logger.level = v ? LogLevels.debug : LogLevels.info;
}
