import { defineCommand, runMain } from "citty";
import consola from "consola";
import { c, logger, setVerbose } from "../lib/logger.ts";
import { printBanner } from "../lib/banner.ts";
import { connectToControl } from "./connection.ts";
import { loadConfig } from "../lib/config.ts";

const main = defineCommand({
    meta: { name: "beacon", description: "C2-MCP Beacon agent" },
    args: {
        config: {
            type: "string",
            description: "Path to YAML config file",
        },
        id: {
            type: "string",
            description: "Unique beacon ID for this device",
        },
        "control-address": {
            type: "string",
            description: "Control WSS address (host:port)",
        },
        verbose: {
            type: "boolean",
            alias: "v",
            description: "Enable verbose logging",
        },
    },
    async run({ args }) {
        const cfg = await loadConfig(args, args.config);
        setVerbose(cfg.verbose);

        if (!cfg.id) {
            logger.error("Missing required: --id");
            process.exit(1);
        }
        if (!cfg.controlAddress) {
            logger.error("Missing required: --control-address");
            process.exit(1);
        }

        printBanner({
            role: "beacon",
            lines: [
                `Beacon ID        ${c.bold(cfg.id)}`,
                `Control Address  ${c.bold(cfg.controlAddress)}`,
            ],
        });

        let secret: string;
        if (cfg.bootstrapSecret) {
            secret = cfg.bootstrapSecret;
        } else {
            secret = await consola
                .prompt("Enter Bootstrap Secret:", { type: "text" })
                .then((input) => input.trim());
            process.stdout.write("\n");
            if (typeof secret !== "string" || !secret) {
                logger.error("No bootstrap_secret provided, exiting.");
                process.exit(1);
            }
        }

        try {
            await connectToControl(cfg.controlAddress, cfg.id, secret);
            logger.info("Beacon is running. Waiting for commands...");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to connect: ${message}`);
            process.exit(1);
        }
    },
});

runMain(main);
