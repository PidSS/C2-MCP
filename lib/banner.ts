import { c } from "./logger.ts";

const C2MCP = [
    "    ___ ___    __  __  ___ ___ ",
    "   / __|_  )__|  \\/  |/ __| _ \\",
    "  | (__ / /___| |\\/| | (__|  _/",
    "   \\___/___|  |_|  |_|\\___|_|  ",
]
    .map((l) => c.bold(c.cyan(l)))
    .join("\n");

const ROLE_ASCII = {
    control: [
        "               _           _ ",
        "    __ ___ _ _| |_ _ _ ___| |  ",
        "   / _/ _ \\ ' \\  _| '_/ _ \\ |  ",
        "   \\__\\___/_||_\\__|_| \\___/_|  ",
        "                               ",
    ]
        .map((l) => c.bold(c.magenta(l)))
        .join("\n"),

    beacon: [
        "    _",
        "   | |__  ___ __ _ __ ___ _ _  ",
        "   | '_ \\/ -_) _` / _/ _ \\ ' \\ ",
        "   |_.__/\\___\\__,_\\__\\___/_||_|",
        "                               ",
    ]
        .map((l) => c.bold(c.green(l)))
        .join("\n"),
};

export interface BannerInfo {
    role: "control" | "beacon";
    lines?: string[];
}

export function printBanner({ role, lines = [] }: BannerInfo) {
    const parts = [
        "",
        C2MCP,
        ROLE_ASCII[role],
        ...lines.map((l) => `  ${l}`),
        "",
    ];
    process.stdout.write(parts.join("\n") + "\n");
}
