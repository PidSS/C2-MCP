import { logger } from "../../lib/logger.ts";
import type { ApprovalProvider } from "./types.ts";

export function createNoopApprovalProvider(): ApprovalProvider {
    logger.warn(
        "No approval provider configured; all commands will be auto-approved",
    );
    return {
        async approve() {
            return { approved: true };
        },
    };
}
