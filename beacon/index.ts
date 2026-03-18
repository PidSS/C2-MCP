import { defineCommand, runMain } from "citty";
import consola from "consola";
import { logger } from "../lib/logger.ts";
import { connectToControl } from "./connection.ts";

const main = defineCommand({
    meta: { name: "beacon", description: "C2-MCP Beacon agent" },
    args: {
        id: {
            type: "string",
            required: true,
            description: "Unique beacon ID for this device",
        },
        "control-address": {
            type: "string",
            required: true,
            description: "Control WSS address (host:port)",
        },
        verbose: {
            type: "boolean",
            alias: "v",
            default: false,
            description: "Enable verbose logging",
        },
    },
    async run({ args }) {
        if (args.verbose) {
            logger.level = 5;
        }

        logger.info(`Beacon ID: ${args.id}`);
        logger.info(`Control address: ${args["control-address"]}`);

        // Prompt for bootstrap_secret
        const secret = await consola
            .prompt("Enter bootstrap_secret:", {
                type: "text",
            })
            .then((input) => input.trim());

        if (typeof secret !== "string" || !secret) {
            logger.error("No bootstrap_secret provided, exiting.");
            process.exit(1);
        }

        try {
            await connectToControl(args["control-address"], args.id, secret);
            logger.info("Beacon is running. Waiting for commands...");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to connect: ${message}`);
            process.exit(1);
        }
    },
});

runMain(main);
