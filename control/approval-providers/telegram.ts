import { Bot, InlineKeyboard, Context } from "grammy";
import {
    TELEGRAM_APPROVAL_TIMEOUT_MS,
    TELEGRAM_APPROVE_CALLBACK_PREFIX,
    TELEGRAM_REJECT_CALLBACK_PREFIX,
    TELEGRAM_CALLBACK_DATA_MAX_LENGTH,
} from "../../lib/constants.ts";
import { logger } from "../../lib/logger.ts";
import type {
    ApprovalDecision,
    ApprovalRequest,
    ApprovalProvider,
} from "./types.ts";

interface PendingApproval {
    readonly request: ApprovalRequest;
    readonly resolve: (decision: ApprovalDecision) => void;
    readonly timer: ReturnType<typeof setTimeout>;
    chatId?: number;
    messageId?: number;
}

export interface TelegramApprovalProviderOptions {
    token?: string;
    targetUserId?: string | number;
    timeoutMs?: number;
    bot?: Bot;
}

export type ApprovalAction = "approve" | "reject";

export class PendingApprovalsRegistry {
    #pending = new Map<string, PendingApproval>();
    readonly timeoutMs: number;
    readonly onTimeout?: (approvalId: string, pending: PendingApproval) => void;

    constructor(
        timeoutMs: number,
        onTimeout?: (approvalId: string, pending: PendingApproval) => void,
    ) {
        this.timeoutMs = timeoutMs;
        this.onTimeout = onTimeout;
    }

    register(
        approvalId: string,
        request: ApprovalRequest,
    ): Promise<ApprovalDecision> {
        if (this.#pending.has(approvalId)) {
            throw new Error(`Duplicate approval id: ${approvalId}`);
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                const pending = this.#pending.get(approvalId);
                if (!pending) return;
                this.#pending.delete(approvalId);
                this.onTimeout?.(approvalId, pending);
                resolve({
                    approved: false,
                    reason: "Command approval timed out",
                });
            }, this.timeoutMs);

            this.#pending.set(approvalId, {
                request,
                resolve,
                timer,
            });
        });
    }

    settle(
        approvalId: string,
        decision: ApprovalDecision,
    ): PendingApproval | undefined {
        const pending = this.#pending.get(approvalId);
        if (!pending) return undefined;
        this.#pending.delete(approvalId);
        clearTimeout(pending.timer);
        pending.resolve(decision);
        return pending;
    }

    abort(approvalId: string): PendingApproval | undefined {
        const pending = this.#pending.get(approvalId);
        if (!pending) return undefined;
        this.#pending.delete(approvalId);
        clearTimeout(pending.timer);
        return pending;
    }

    attachMessage(
        approvalId: string,
        chatId: number,
        messageId: number,
    ): boolean {
        const pending = this.#pending.get(approvalId);
        if (!pending) return false;
        pending.chatId = chatId;
        pending.messageId = messageId;
        return true;
    }

    has(approvalId: string): boolean {
        return this.#pending.has(approvalId);
    }

    get size(): number {
        return this.#pending.size;
    }
}

export async function createTelegramApprovalProvider(
    options: TelegramApprovalProviderOptions = {},
): Promise<ApprovalProvider> {
    const token = options.token ?? requireEnv("TELEGRAM_BOT_TOKEN");
    const targetUserId = parseTelegramUserId(
        options.targetUserId ?? requireEnv("TELEGRAM_TARGET_USER_ID"),
    );
    const bot = options.bot ?? new Bot(token);
    const timeoutMs = options.timeoutMs ?? TELEGRAM_APPROVAL_TIMEOUT_MS;
    const pendingApprovals = new PendingApprovalsRegistry(
        timeoutMs,
        (approvalId, pending) => {
            logger.warn(
                `[telegram] Timed out (${approvalId.slice(-6)}) ${pending.request.formattedCall}`,
            );
            void updateApprovalMessage(
                bot,
                approvalId,
                pending,
                "⏳ Timed out",
            );
        },
    );

    bot.command("get_my_id", async (ctx) => {
        const userId = ctx.from?.id;
        if (userId === undefined) {
            await ctx.reply("Unable to determine your Telegram user id");
            return;
        }

        await ctx.reply(`Your Telegram user id is: <code>${userId}</code>`, {
            parse_mode: "HTML",
        });
    });

    bot.on("callback_query:data", async (ctx) => {
        const parsed = parseApprovalCallbackData(ctx.callbackQuery.data);
        if (!parsed) return;

        if (ctx.from.id !== targetUserId) {
            await safeAnswerCallbackQuery(ctx, "Unauthorized");
            return;
        }

        const decision: ApprovalDecision =
            parsed.action === "approve"
                ? { approved: true }
                : { approved: false, reason: "Command rejected" };
        const pending = pendingApprovals.settle(parsed.approvalId, decision);

        if (!pending) {
            await safeAnswerCallbackQuery(
                ctx,
                "Approval expired or already handled",
            );
            return;
        }

        const statusText =
            parsed.action === "approve" ? "✅ Approved" : "❌ Rejected";
        logger.debug(
            `[telegram] ${statusText.toLowerCase()} (${parsed.approvalId.slice(-6)}) ${pending.request.formattedCall}`,
        );
        await safeAnswerCallbackQuery(ctx, statusText);
        await updateApprovalMessage(
            bot,
            parsed.approvalId,
            pending,
            statusText,
        );
    });

    logger.debug("Testing Telegram bot connectivity...");
    await bot.api.getMe();
    bot.start();
    logger.debug(`Telegram provider initialized for user ${targetUserId}`);

    return {
        async approve(request) {
            const approvalId = request.commandId;
            const decisionPromise = pendingApprovals.register(
                approvalId,
                request,
            );

            try {
                const message = await bot.api.sendMessage(
                    targetUserId,
                    formatApprovalMessage(request),
                    {
                        parse_mode: "HTML",
                        reply_markup: new InlineKeyboard()
                            .text(
                                "Approve",
                                buildApprovalCallbackData(
                                    "approve",
                                    approvalId,
                                ),
                            )
                            .text(
                                "Reject",
                                buildApprovalCallbackData("reject", approvalId),
                            ),
                    },
                );
                pendingApprovals.attachMessage(
                    approvalId,
                    message.chat.id,
                    message.message_id,
                );
            } catch (error) {
                pendingApprovals.abort(approvalId);
                throw error;
            }

            return decisionPromise;
        },
        async shutdown() {
            bot.stop();
        },
    };
}

export function buildApprovalCallbackData(
    action: ApprovalAction,
    approvalId: string,
): string {
    const prefix =
        action === "approve"
            ? TELEGRAM_APPROVE_CALLBACK_PREFIX
            : TELEGRAM_REJECT_CALLBACK_PREFIX;
    const data = `${prefix}${approvalId}`;
    if (data.length > TELEGRAM_CALLBACK_DATA_MAX_LENGTH) {
        throw new Error(`Approval callback data too long: ${data.length}`);
    }
    return data;
}

export function parseApprovalCallbackData(
    data: string,
): { action: ApprovalAction; approvalId: string } | null {
    if (data.startsWith(TELEGRAM_APPROVE_CALLBACK_PREFIX)) {
        return {
            action: "approve",
            approvalId: data.slice(TELEGRAM_APPROVE_CALLBACK_PREFIX.length),
        };
    }
    if (data.startsWith(TELEGRAM_REJECT_CALLBACK_PREFIX)) {
        return {
            action: "reject",
            approvalId: data.slice(TELEGRAM_REJECT_CALLBACK_PREFIX.length),
        };
    }
    return null;
}

export function parseTelegramUserId(value: string | number): number {
    const normalized = typeof value === "number" ? String(value) : value.trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error(`Invalid TELEGRAM_TARGET_USER_ID: ${value}`);
    }

    const userId = Number(normalized);
    if (!Number.isSafeInteger(userId)) {
        throw new Error(`Invalid TELEGRAM_TARGET_USER_ID: ${value}`);
    }

    return userId;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function formatApprovalMessage(request: ApprovalRequest): string {
    const shortId = request.commandId.slice(-6);
    return truncateTelegramMessage(
        [
            `<b>Command approval required</b> (<code>${Bun.escapeHTML(shortId)}</code>):`,
            `<pre><code class="language-lua">${Bun.escapeHTML(`${request.device}::${request.formattedCall}`)}</code></pre>`,
        ].join("\n"),
    );
}

function formatApprovalResultMessage(
    request: ApprovalRequest,
    statusText: string,
): string {
    return truncateTelegramMessage(
        `${formatApprovalMessage(request)}\n\n<b>${Bun.escapeHTML(statusText)}</b>`,
    );
}

function truncateTelegramMessage(text: string): string {
    const maxLength = 4096;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 16)}\n...[truncated]`;
}

async function safeAnswerCallbackQuery(
    ctx: Context,
    text: string,
): Promise<void> {
    try {
        await ctx.answerCallbackQuery({ text });
    } catch {}
}

async function updateApprovalMessage(
    bot: Bot,
    approvalId: string,
    pending: PendingApproval,
    statusText: string,
): Promise<void> {
    if (pending.chatId === undefined || pending.messageId === undefined) return;

    try {
        await bot.api.editMessageText(
            pending.chatId,
            pending.messageId,
            formatApprovalResultMessage(pending.request, statusText),
            {
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [] },
            },
        );
    } catch (error) {
        logger.debug(
            `[telegram] Failed to update Telegram message (${approvalId.slice(-6)}): ${error}`,
        );
    }
}
