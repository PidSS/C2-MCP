import { test, expect, describe, afterEach } from "bun:test";
import { loadConfig } from "../lib/config.ts";
import {
    DEFAULT_MCP_LISTEN,
    DEFAULT_CONTROL_LISTEN,
} from "../lib/constants.ts";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const TMP_CONFIG = join(import.meta.dir, "c2-mcp-config.yaml");

function writeTempYaml(content: string, path = TMP_CONFIG): string {
    writeFileSync(path, content, "utf8");
    return path;
}

function cleanup(path = TMP_CONFIG) {
    if (existsSync(path)) unlinkSync(path);
}

describe("loadConfig", () => {
    afterEach(() => cleanup());

    test("all defaults when no config file and no CLI args", async () => {
        const cfg = await loadConfig({});
        expect(cfg.mcpListen).toBe(DEFAULT_MCP_LISTEN);
        expect(cfg.controlListen).toBe(DEFAULT_CONTROL_LISTEN);
        expect(cfg.id).toBeUndefined();
        expect(cfg.controlAddress).toBeUndefined();
        expect(cfg.bootstrapSecret).toBeUndefined();
        expect(cfg.verbose).toBe(false);
    });

    test("YAML values override defaults", async () => {
        writeTempYaml(`
mcp_listen: "0.0.0.0:9000"
control_listen: "0.0.0.0:9001"
id: "yaml-id"
control_address: "10.0.0.1:9001"
bootstrap_secret: "yaml-secret"
verbose: true
`);
        const cfg = await loadConfig({}, TMP_CONFIG);
        expect(cfg.mcpListen).toBe("0.0.0.0:9000");
        expect(cfg.controlListen).toBe("0.0.0.0:9001");
        expect(cfg.id).toBe("yaml-id");
        expect(cfg.controlAddress).toBe("10.0.0.1:9001");
        expect(cfg.bootstrapSecret).toBe("yaml-secret");
        expect(cfg.verbose).toBe(true);
    });

    test("CLI args override YAML values", async () => {
        writeTempYaml(`
mcp_listen: "0.0.0.0:9000"
control_listen: "0.0.0.0:9001"
id: "yaml-id"
control_address: "127.1:9001"
verbose: true
`);
        const cfg = await loadConfig(
            {
                "mcp-listen": "localhost:1234",
                "control-listen": "localhost:5678",
                id: "cli-id",
                "control-address": "192.168.1.1:4662",
                verbose: false,
            },
            TMP_CONFIG,
        );
        expect(cfg.mcpListen).toBe("localhost:1234");
        expect(cfg.controlListen).toBe("localhost:5678");
        expect(cfg.id).toBe("cli-id");
        expect(cfg.controlAddress).toBe("192.168.1.1:4662");
        // CLI false explicitly overrides YAML true
        expect(cfg.verbose).toBe(false);
    });

    test("CLI args override defaults when no YAML", async () => {
        const cfg = await loadConfig({
            "mcp-listen": "localhost:8888",
            id: "my-beacon",
        });
        expect(cfg.mcpListen).toBe("localhost:8888");
        expect(cfg.controlListen).toBe(DEFAULT_CONTROL_LISTEN);
        expect(cfg.id).toBe("my-beacon");
    });

    test("explicit config path is used", async () => {
        writeTempYaml(`mcp_listen: "localhost:7777"`);
        const cfg = await loadConfig({}, TMP_CONFIG);
        expect(cfg.mcpListen).toBe("localhost:7777");
    });

    test("explicit config path that does not exist throws", async () => {
        expect(() =>
            loadConfig({}, "/tmp/nonexistent-c2-config.yaml"),
        ).toThrow();
    });

    test("invalid YAML structure throws", async () => {
        writeTempYaml(`- item1\n- item2`);
        expect(() => loadConfig({}, TMP_CONFIG)).toThrow("YAML mapping");
    });
});
