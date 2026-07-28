/**
 * SDK-promotion golden vectors — Phase 0 of the promotion plan.
 *
 * Freezes the exact bytes the LIVE frontend implementations produce for every
 * hash/serialization surface the promotion moves into `@figaro/sdk`:
 *
 *   1. ECDH shared secrets + AES-GCM wrap (lib/handoff/ecdh.ts — direction-
 *      sensitive; the wrap blob is frozen once and proven through unwrap,
 *      since encryption draws a random IV),
 *   2. CommitmentPayload serialization (lib/kernel/signedCommitment.ts —
 *      bigint→hex replacer + prototype-pollution stripping on deserialize),
 *   3. agreement projection → agreementHash (since Phase 3: @figaro/sdk
 *      projection — spec-default injection, process-log skip, section sort),
 *   4. template composition → compositionHash (since Phase 3: @figaro/sdk
 *      projection — mandatory auto-fold, sparse-version normalization,
 *      editorial exclusion).
 *
 * The fixture lives in `sdk/tests/fixtures/promotion-golden-vectors.json` so
 * the SDK-side tests consume the SAME frozen bytes after each move phase.
 * Default mode ASSERTS the live code still reproduces the fixture; run with
 * `HARVEST_GOLDEN_VECTORS=1` to (re)record it — only legitimate before any
 * code has moved, never to paper over a post-move mismatch.
 *
 * This spec is deleted in the promotion's final phase, when the frontend
 * copies it pins are gone and the SDK tests own the fixture.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Agreement, Commitment } from "@figaro/sdk";
import {
    deriveSharedSecretAsReceiver,
    deriveSharedSecretAsSender,
    unwrapWithSharedSecret,
    wrapWithSharedSecret,
} from "@figaro/sdk/handoff";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro/sdk/agent";
import { buildOrderAgreement, buildAssemblyTemplate, serializeAssemblyTemplate } from "@figaro/sdk";
import { canonicalize } from "@/lib/shared/canonicalJson";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

const HARVEST = process.env.HARVEST_GOLDEN_VECTORS === "1";
// Vitest cwd = frontend/; the fixture is shared with sdk/tests.
const FIXTURE_PATH = path.resolve(
    process.cwd(),
    "../sdk/tests/fixtures/promotion-golden-vectors.json",
);

// ── Fixed inputs (never change these once harvested) ────────────────────────

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;

// Deterministic secp256k1 private keys (test-only, well below the curve order).
const PRIV_A = `0x${"11".repeat(32)}`;
const PRIV_B = `0x${"22".repeat(32)}`;
// A base64url plaintext of the shape the handoff wraps (an AES key).
const PLAINTEXT_KEY_B64 = "Zml4ZWQtaGFuZG9mZi1rZXktZm9yLXZlY3RvcnM";

function commerceData() {
    return {
        payment: "1",
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

/** The projection cases the fixture freezes: spec-default injection
 *  (applicable-law), and the process-log empty-anchor skip (merchant-process). */
function projectionCases() {
    return {
        defaults: buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-topology": { parentOrderHashes: [] },
            "figaro-applicable-law": { applicableLaw: "US-NY" },
        }, specSource()),
        processLog: buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-topology": { parentOrderHashes: [] },
            "figaro-merchant-process": {},
        }, specSource()),
    };
}

/** Two-node parent-edged design (root + child) exercising the mandatory
 *  auto-fold, the local relabeling, the sparse-version normalization, and the
 *  ASSEMBLY-SCOPE placement (applicable-law declares design.scope "assembly"
 *  — ruled 2026-07-28 — so it composes once at the assembly level and its
 *  typed value strips to {}). */
function templateCase() {
    const orders = [
        { orderHash: "synthetic-root", parentOrderHashes: [] },
        { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
    ];
    return serializeAssemblyTemplate(
        buildAssemblyTemplate({
            name: "Golden Vector Chain",
            orders,
            clausesByOrderId: {},
            assemblyClauses: { "figaro-applicable-law": { applicableLaw: "US-NY" } },
            specs: specSource(),
        }),
    );
}

function payloadCase(agreement: Agreement, agreementHash: `0x${string}`): CommitmentPayload {
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}`,
        buyer: BUYER,
        seller: SELLER,
        currency: "0x0000000000000000000000000000000000000001",
        payment: 25_000000000000000000n,
        expectedCumulativeValue: 25_000000000000000000n,
        agreementHash,
        salt: 0x1234n,
        deadline: 1770000000n,
    };
    return { commitment, agreement, buyerSig: `0x${"ab".repeat(65)}` };
}

interface GoldenVectors {
    ecdh: {
        privA: string;
        privB: string;
        pubA: string;
        pubB: string;
        /** A→B: A encapsulates toward B's pub; B decapsulates from A's pub. */
        sharedSecretAtoB: string;
        /** B→A: the REVERSE direction — must differ (sender pub enters the KDF). */
        sharedSecretBtoA: string;
        plaintextKeyB64: string;
        /** Frozen once (random IV); proven through unwrap forever after. */
        wrappedBlobB64: string;
    };
    commitmentPayload: { serialized: string };
    agreementProjection: {
        defaults: { canonicalAgreement: string; agreementHash: string };
        processLog: { canonicalAgreement: string; agreementHash: string };
    };
    assemblyTemplate: { canonicalJson: string; compositionHash: string };
}

beforeAll(async () => {
    await primeClauseSpecs([
        "figaro-commerce",
        "figaro-topology",
        "figaro-applicable-law",
        "figaro-merchant-process",
    ]);

    if (HARVEST) {
        // The ECDH vectors were originally recorded from eciesjs (see the
        // handoff.test.ts fixture note); since Phase 2 the SDK owns the
        // implementation, so a re-harvest derives from it.
        const { secp256k1 } = await import("@noble/curves/secp256k1");
        const { hexToBytes } = await import("@/lib/shared/evm");
        const { bytesToHex } = await import("@/lib/shared/evm");
        const pubA = bytesToHex(secp256k1.getPublicKey(hexToBytes(PRIV_A), true));
        const pubB = bytesToHex(secp256k1.getPublicKey(hexToBytes(PRIV_B), true));
        const sharedSecretAtoB = deriveSharedSecretAsSender(PRIV_A, pubB);
        const { defaults, processLog } = projectionCases();
        const template = templateCase();
        const vectors: GoldenVectors = {
            ecdh: {
                privA: PRIV_A,
                privB: PRIV_B,
                pubA,
                pubB,
                sharedSecretAtoB,
                sharedSecretBtoA: deriveSharedSecretAsSender(PRIV_B, pubA),
                plaintextKeyB64: PLAINTEXT_KEY_B64,
                wrappedBlobB64: await wrapWithSharedSecret(PLAINTEXT_KEY_B64, sharedSecretAtoB),
            },
            commitmentPayload: {
                serialized: serializeCommitmentPayload(
                    payloadCase(defaults.agreement, defaults.agreementHash),
                ),
            },
            agreementProjection: {
                defaults: {
                    canonicalAgreement: canonicalize(defaults.agreement),
                    agreementHash: defaults.agreementHash,
                },
                processLog: {
                    canonicalAgreement: canonicalize(processLog.agreement),
                    agreementHash: processLog.agreementHash,
                },
            },
            assemblyTemplate: {
                canonicalJson: template.json,
                compositionHash: template.compositionHash,
            },
        };
        mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
        writeFileSync(FIXTURE_PATH, `${JSON.stringify(vectors, null, 2)}\n`);
    }
});

function loadVectors(): GoldenVectors {
    expect(
        existsSync(FIXTURE_PATH),
        "fixture missing — record it once with HARVEST_GOLDEN_VECTORS=1",
    ).toBe(true);
    return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as GoldenVectors;
}

describe("SDK-promotion golden vectors — the live bytes, frozen", () => {
    it("ECDH: both directions reproduce the frozen shared secrets", () => {
        const v = loadVectors().ecdh;
        expect(deriveSharedSecretAsSender(v.privA, v.pubB)).toBe(v.sharedSecretAtoB);
        expect(deriveSharedSecretAsReceiver(v.pubA, v.privB)).toBe(v.sharedSecretAtoB);
        // Direction-sensitivity pin: the sender's pub enters the KDF, so the
        // reverse pairing derives a DIFFERENT secret (the past symmetric-call bug).
        expect(deriveSharedSecretAsSender(v.privB, v.pubA)).toBe(v.sharedSecretBtoA);
        expect(v.sharedSecretBtoA).not.toBe(v.sharedSecretAtoB);
    });

    it("ECDH: the frozen wrapped blob unwraps to the plaintext, and a fresh wrap round-trips", async () => {
        const v = loadVectors().ecdh;
        expect(await unwrapWithSharedSecret(v.wrappedBlobB64, v.sharedSecretAtoB)).toBe(
            v.plaintextKeyB64,
        );
        const fresh = await wrapWithSharedSecret(v.plaintextKeyB64, v.sharedSecretAtoB);
        expect(await unwrapWithSharedSecret(fresh, v.sharedSecretAtoB)).toBe(v.plaintextKeyB64);
    });

    it("CommitmentPayload: serialization reproduces the frozen envelope and round-trips", () => {
        const v = loadVectors();
        const { defaults } = projectionCases();
        const payload = payloadCase(defaults.agreement, defaults.agreementHash);
        expect(serializeCommitmentPayload(payload)).toBe(v.commitmentPayload.serialized);
        expect(deserializeCommitmentPayload(v.commitmentPayload.serialized)).toEqual(payload);
    });

    it("CommitmentPayload: deserialize strips prototype-pollution keys", () => {
        const v = loadVectors();
        const malicious = v.commitmentPayload.serialized.replace(
            '"buyerSig"',
            '"__proto__":{"polluted":true},"buyerSig"',
        );
        const parsed = deserializeCommitmentPayload(malicious);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false);
    });

    it("agreement projection: spec-default injection reproduces the frozen agreement + hash", () => {
        const v = loadVectors().agreementProjection.defaults;
        const { agreement, agreementHash } = projectionCases().defaults;
        expect(canonicalize(agreement)).toBe(v.canonicalAgreement);
        expect(agreementHash).toBe(v.agreementHash);
    });

    it("agreement projection: the process-log empty anchor reproduces the frozen agreement + hash", () => {
        const v = loadVectors().agreementProjection.processLog;
        const { agreement, agreementHash } = projectionCases().processLog;
        expect(canonicalize(agreement)).toBe(v.canonicalAgreement);
        expect(agreementHash).toBe(v.agreementHash);
    });

    it("assembly template: mandatory fold + relabeling reproduce the frozen template + compositionHash", () => {
        const v = loadVectors().assemblyTemplate;
        const template = templateCase();
        expect(template.json).toBe(v.canonicalJson);
        expect(template.compositionHash).toBe(v.compositionHash);
    });
});
