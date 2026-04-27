/**
 * Emissions extractor — pure projection of an order's GHG disclosure clause
 * (signed at commit, Category-2: standard + scope) + runtime measurement
 * attestations (Category-1: per-stage grams) into a single emissions
 * document for the audit bundle.
 *
 * Two layers:
 *
 *   • Committed disclosure — one of the 5 sister schemas
 *     (figaro-ghg-{protocol,iso-14064,pas-2050,en-16258,custom}-v1) names
 *     the accounting standard via its schemaKey. The data field is
 *     `(uint8 scope)` — 0=unset, 1=Scope 1, 2=Scope 2, 3=Scope 3.
 *
 *   • Runtime measurement — `figaro-ghg-measurement-v1` attestations carry
 *     the actual grams CO2e per stage. The on-chain Attestation event
 *     records contentRef = keccak256(content); the original `(uint256 grams)`
 *     value sits in the transaction calldata and is recoverable off-chain.
 *     This extractor records the receipt; calldata decoding is left to
 *     the caller.
 */

import {
    type Agreement,
    type AgreementSection,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    GHG_MEASUREMENT_SCHEMA_KEY,
    GHG_SCHEMA_TO_STANDARD,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { ExtractedDocument } from "./types";

const GHG_DISCLOSURE_SET = new Set<string>(GHG_DISCLOSURE_SCHEMA_KEYS);

function findGhgDisclosureSection(agreement: Agreement): AgreementSection | undefined {
    return agreement.sections.find((s) => GHG_DISCLOSURE_SET.has(s.schema));
}

export interface EmissionsMeasurementReceipt {
    /** keccak256 of the attestation content bytes. The original
     *  `(uint256 grams)` value is in the transaction calldata. */
    contentRef: string;
    attester: string;
    /** Lifecycle stage the measurement was attested at (uint8 0-4). */
    stage: number;
    blockNumber: number;
    transactionHash?: string;
}

export interface EmissionsDocument extends ExtractedDocument {
    /** True when an agreement clause from one of the GHG sister schemas
     *  is present. False when the parties did not commit to a GHG
     *  disclosure framework — the measurement attestations may still
     *  exist but they're untyped. */
    disclosed: boolean;
    /** Schema key of the chosen disclosure standard, e.g.
     *  "figaro-ghg-iso-14064-v1". */
    standardSchemaKey?: string;
    /** Human-readable label, e.g. "ISO-14064". */
    standardLabel?: string;
    /** Committed scope: 0 (unset) | 1 (Scope 1) | 2 (Scope 2) | 3 (Scope 3). */
    scope?: number;
    /** Runtime measurement receipts, in input order (typically commit-block
     *  order). */
    measurements: EmissionsMeasurementReceipt[];
}

function attestationMatchesMeasurementSchema(att: AttestationRecord): boolean {
    return att.schemaId === GHG_MEASUREMENT_SCHEMA_KEY;
}

export function extractEmissions(
    order: Order,
    agreement: Agreement,
    attestations: readonly AttestationRecord[],
): EmissionsDocument {
    const disclosure = findGhgDisclosureSection(agreement);
    const data = disclosure?.data as { scope?: unknown } | undefined;
    const scope = typeof data?.scope === "number" && data.scope >= 0 && data.scope <= 3
        ? data.scope
        : undefined;
    const standardSchemaKey = disclosure?.schema as
        | typeof GHG_DISCLOSURE_SCHEMA_KEYS[number]
        | undefined;
    const standardLabel = standardSchemaKey
        ? GHG_SCHEMA_TO_STANDARD[standardSchemaKey]
        : undefined;

    const measurements: EmissionsMeasurementReceipt[] = [];
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (!attestationMatchesMeasurementSchema(att)) continue;
        measurements.push({
            contentRef: att.contentRef,
            attester: att.attester,
            stage: att.stage,
            blockNumber: att.blockNumber,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Emissions disclosure",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        disclosed: disclosure !== undefined,
        standardSchemaKey,
        standardLabel,
        scope,
        measurements,
    };
}
