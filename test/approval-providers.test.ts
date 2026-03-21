import { afterEach, describe, expect, mock, test } from "bun:test";
import { createNoopApprovalProvider } from "../control/approval-providers/noop.ts";
import {
    buildApprovalCallbackData,
    createTelegramApprovalProvider,
    parseApprovalCallbackData,
    parseTelegramUserId,
    PendingApprovalsRegistry,
} from "../control/approval-providers/telegram.ts";
import type {
    ApprovalDecision,
    ApprovalRequest,
} from "../control/approval-providers/types.ts";

const request: ApprovalRequest = {
    device: "macbook",
    commandId: "018f0f55-4a63-7d08-b4b5-c7f8f1c2aa11",
    formattedCall: 'shell("ls")',
};

describe("approval providers", () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalUserId = process.env.TELEGRAM_TARGET_USER_ID;

    afterEach(() => {
        if (originalToken === undefined) {
            delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
            process.env.TELEGRAM_BOT_TOKEN = originalToken;
        }

        if (originalUserId === undefined) {
            delete process.env.TELEGRAM_TARGET_USER_ID;
        } else {
            process.env.TELEGRAM_TARGET_USER_ID = originalUserId;
        }
    });

    test("noop provider always approves", async () => {
        const provider = createNoopApprovalProvider();
        await expect(provider.approve(request)).resolves.toEqual({
            approved: true,
        });
    });

    test("telegram provider throws when env is missing", async () => {
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_TARGET_USER_ID;

        await expect(createTelegramApprovalProvider()).rejects.toThrow(
            "Missing required environment variable: TELEGRAM_BOT_TOKEN",
        );
    });

    test("parse telegram user id validates input", () => {
        expect(parseTelegramUserId("123456")).toBe(123456);
        expect(() => parseTelegramUserId("abc")).toThrow(
            "Invalid TELEGRAM_TARGET_USER_ID",
        );
    });

    test("callback data helpers round-trip", () => {
        const approve = buildApprovalCallbackData("approve", request.commandId);
        const reject = buildApprovalCallbackData("reject", request.commandId);

        expect(parseApprovalCallbackData(approve)).toEqual({
            action: "approve",
            approvalId: request.commandId,
        });
        expect(parseApprovalCallbackData(reject)).toEqual({
            action: "reject",
            approvalId: request.commandId,
        });
        expect(parseApprovalCallbackData("noop:test")).toBeNull();
    });

    test("pending approvals settle approve and clean up", async () => {
        const registry = new PendingApprovalsRegistry(1000);
        const pending = registry.register(request.commandId, request);

        expect(registry.has(request.commandId)).toBe(true);
        const item = registry.settle(request.commandId, { approved: true });

        expect(item).toBeDefined();
        expect(registry.has(request.commandId)).toBe(false);
        await expect(pending).resolves.toEqual({ approved: true });
    });

    test("pending approvals settle reject and clean up", async () => {
        const registry = new PendingApprovalsRegistry(1000);
        const pending = registry.register(request.commandId, request);
        const decision: ApprovalDecision = {
            approved: false,
            reason: "Command rejected",
        };

        registry.settle(request.commandId, decision);

        expect(registry.has(request.commandId)).toBe(false);
        await expect(pending).resolves.toEqual(decision);
    });

    test("pending approvals time out and clean up", async () => {
        const onTimeout = mock(() => {});
        const registry = new PendingApprovalsRegistry(10, onTimeout);
        const pending = registry.register(request.commandId, request);

        await expect(pending).resolves.toEqual({
            approved: false,
            reason: "Command approval timed out",
        });
        expect(registry.has(request.commandId)).toBe(false);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    test("stale approval cannot resolve twice", async () => {
        const registry = new PendingApprovalsRegistry(10);
        const pending = registry.register(request.commandId, request);

        await expect(pending).resolves.toEqual({
            approved: false,
            reason: "Command approval timed out",
        });
        expect(
            registry.settle(request.commandId, { approved: true }),
        ).toBeUndefined();
    });
});
