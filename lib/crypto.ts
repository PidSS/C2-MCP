import { createHash, randomBytes, X509Certificate } from "node:crypto";
import * as x509 from "@peculiar/x509";
import { CONTROL_CN, CERT_VALIDITY_DAYS } from "./constants.ts";

export interface CryptoIdentity {
    cert: string; // PEM
    key: string; // PEM
    fingerprint: string; // hex SHA-256 of DER cert
    authToken: Buffer; // 32 bytes
}

const EC_ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

/** Generate ECDSA P-256 key pair + self-signed X.509 cert. All in-memory. */
export async function generateIdentity(): Promise<CryptoIdentity> {
    const keys = await crypto.subtle.generateKey(EC_ALG, true, [
        "sign",
        "verify",
    ]);

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `CN=${CONTROL_CN}`,
        keys,
        notAfter: new Date(
            Date.now() + CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
        ),
        signingAlgorithm: EC_ALG,
    });

    const certPem = cert.toString("pem");

    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    const keyPem = x509.PemConverter.encode(pkcs8, "PRIVATE KEY");

    const fingerprint = certFingerprint(certPem);
    const authToken = randomBytes(32);

    return { cert: certPem, key: keyPem, fingerprint, authToken };
}

/** SHA-256 fingerprint of a PEM certificate (hex string). */
export function certFingerprint(certPem: string): string {
    const c = new X509Certificate(certPem);
    return createHash("sha256").update(c.raw).digest("hex");
}

/**
 * Encode bootstrap_secret = base64url(authToken(32) + fingerprint_bytes(32))
 */
export function encodeBootstrapSecret(
    authToken: Buffer,
    fingerprint: string,
): string {
    const fpBytes = Buffer.from(fingerprint, "hex");
    return Buffer.concat([authToken, fpBytes]).toString("base64url");
}

/**
 * Decode bootstrap_secret → { authToken, fingerprint }
 */
export function decodeBootstrapSecret(secret: string): {
    authToken: Buffer;
    fingerprint: string;
} {
    const buf = Buffer.from(secret, "base64url");
    if (buf.length !== 64) {
        throw new Error("Invalid bootstrap_secret length");
    }
    return {
        authToken: buf.subarray(0, 32),
        fingerprint: buf.subarray(32).toString("hex"),
    };
}
