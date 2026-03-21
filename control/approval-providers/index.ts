import type { ApprovalProvider } from "./types.ts";
import { createNoopApprovalProvider } from "./noop.ts";
import { createTelegramApprovalProvider } from "./telegram.ts";

export * from "./types.ts";
export * from "./noop.ts";
export * from "./telegram.ts";

export async function createApprovalProvider(
    providerName?: string,
): Promise<ApprovalProvider> {
    switch (providerName) {
        case undefined:
        case "":
            return createNoopApprovalProvider();
        case "telegram":
            return createTelegramApprovalProvider();
        default:
            throw new Error(`Unknown approval provider: ${providerName}`);
    }
}
