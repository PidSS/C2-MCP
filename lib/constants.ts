export const APP_NAME = "c2-mcp";
export const APP_VERSION = "1.0.0";

export const CONTROL_CN = "c2-mcp-control";
export const CERT_VALIDITY_DAYS = 365;
export const DEFAULT_SHELL_TIMEOUT_S = 120;
export const COMMAND_TIMEOUT_MS = 310_000; // safety net: must exceed max shell timeout (300s)

export const DEFAULT_CONFIG_PATH = "./c2-mcp-config.yaml";
export const DEFAULT_MCP_LISTEN = "localhost:4661";
export const DEFAULT_CONTROL_LISTEN = "0.0.0.0:4662";

/** Max characters before truncation (head + tail). */
export const READFILE_MAX_CHARS = 120_000;

export const TELEGRAM_APPROVAL_TIMEOUT_MS = 60_000;
export const TELEGRAM_APPROVE_CALLBACK_PREFIX = "approve:";
export const TELEGRAM_REJECT_CALLBACK_PREFIX = "reject:";
export const TELEGRAM_CALLBACK_DATA_MAX_LENGTH = 64;
