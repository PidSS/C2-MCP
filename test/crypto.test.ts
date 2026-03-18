import { test, expect, describe } from "bun:test";
import {
    encodeBootstrapSecret,
    decodeBootstrapSecret,
    certFingerprint,
    generateIdentity,
} from "../lib/crypto.ts";
import { randomBytes } from "node:crypto";

describe("bootstrap_secret encode/decode", () => {
    test("round-trip", () => {
        const token = randomBytes(32);
        const fingerprint = randomBytes(32).toString("hex");
        const secret = encodeBootstrapSecret(token, fingerprint);
        const decoded = decodeBootstrapSecret(secret);
        expect(Buffer.compare(decoded.authToken, token)).toBe(0);
        expect(decoded.fingerprint).toBe(fingerprint);
    });

    test("rejects invalid length", () => {
        const bad = Buffer.from("tooshort").toString("base64url");
        expect(() => decodeBootstrapSecret(bad)).toThrow(
            "Invalid bootstrap_secret length",
        );
    });
});

describe("generateIdentity", () => {
    test("produces valid identity", async () => {
        const id = await generateIdentity();
        expect(id.cert).toContain("BEGIN CERTIFICATE");
        expect(id.key).toContain("BEGIN PRIVATE KEY");
        expect(id.fingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(id.authToken.length).toBe(32);
    });

    test("fingerprint matches cert", async () => {
        const id = await generateIdentity();
        const fp = certFingerprint(id.cert);
        expect(fp).toBe(id.fingerprint);
    });
});
