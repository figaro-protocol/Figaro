/**
 * The anchor each hand-off ceremony's receiver waits for is the whole place
 * the sender files it at: the content reference, the panel's clause, the
 * stage the panel files at, and the sender. A content reference alone would
 * read an attestation anyone on the order filed, under any clause or stage,
 * as the sender's anchor.
 *
 * Proves: `ContentDeliveryPanel` and `AddressDetailPanel` hand the ceremony
 * an expectation bound to the sender, their clause and the stage their own
 * send files at (the completion stage, and stage 0 for the address detail),
 * and `attestationAnchorMatches` refuses a row carrying the same reference
 * from another wallet.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { PublicClient } from "viem";
import { COMPLETION_STAGE, completionEvidenceAnchor } from "@/lib/data/handoff/contentDelivery";
import { addressDetailAnchorRef } from "@/lib/data/handoff/addressDetail";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

const captured = vi.hoisted(() => ({ options: [] as Array<{ expectedAnchor: (d: unknown, blob: string, sender: string) => unknown }> }));
const chain = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/data/handoff/useCeremonyChannel", () => ({
    useCeremonyPanel: (options: { expectedAnchor: (d: unknown, blob: string, sender: string) => unknown }) => {
        captured.options.push(options);
        return { role: null };
    },
}));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByOrder: async () => chain.rows }));

import { ContentDeliveryPanel } from "@/components/runtime/ContentDeliveryPanel";
import { AddressDetailPanel } from "@/components/runtime/AddressDetailPanel";
import { attestationAnchorMatches } from "@/lib/data/handoff/handoffAnchorState";

const ORDER = `0x${"0a".repeat(32)}`;
const BUYER = "0x1111111111111111111111111111111111111111" as const;
const SELLER = "0x2222222222222222222222222222222222222222" as const;
const THIRD = "0x3333333333333333333333333333333333333333";
const CONTENT_HASH = `0x${"de".repeat(32)}` as const;
const BLOB = "c2VhbGVkLWJsb2I=";

let clauseKey: string;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-content-handoff"]);
    clauseKey = keyOf("figaro-content-handoff");
});

const lastExpectation = (decrypted: unknown) => captured.options[captured.options.length - 1].expectedAnchor(decrypted, BLOB, SELLER);

describe("a hand-off ceremony waits for the sender's anchor at its clause and stage", () => {
    it("the content delivery expects the sender's attestation under its clause at the completion stage", () => {
        render(<ContentDeliveryPanel processId="0xab" orderHash={ORDER} clauseKey={clauseKey} buyer={BUYER} seller={SELLER} />);
        const contentRef = completionEvidenceAnchor(getClauseSpec(clauseKey)!, { contentHash: CONTENT_HASH });
        expect(contentRef).not.toBeNull();
        expect(lastExpectation({ contentHash: CONTENT_HASH })).toEqual({ contentRef, clauseId: clauseKey, stage: COMPLETION_STAGE, attester: SELLER });
    });

    it("the address detail expects the sender's attestation under its clause at stage 0, where it files", () => {
        render(<AddressDetailPanel processId="0xab" orderHash={ORDER} clauseKey={clauseKey} buyer={BUYER} seller={SELLER} />);
        expect(lastExpectation({})).toEqual({ contentRef: addressDetailAnchorRef(BLOB), clauseId: clauseKey, stage: 0, attester: SELLER });
    });

    it("a row with the same reference filed by another wallet is no anchor; the sender's own is", async () => {
        render(<AddressDetailPanel processId="0xab" orderHash={ORDER} clauseKey={clauseKey} buyer={BUYER} seller={SELLER} />);
        const expected = lastExpectation({}) as Parameters<typeof attestationAnchorMatches>[3];
        const row = { orderHash: ORDER, clauseId: clauseKey, stage: 0, contentRef: addressDetailAnchorRef(BLOB), attester: THIRD };
        chain.rows = [row];
        expect(await attestationAnchorMatches({} as PublicClient, 31337, ORDER, expected)).toBe(false);
        chain.rows = [{ ...row, attester: SELLER }];
        expect(await attestationAnchorMatches({} as PublicClient, 31337, ORDER, expected)).toBe(true);
    });
});
