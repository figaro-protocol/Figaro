/**
 * Dispute-submission orchestration — the two pin-then-act sequences every
 * dispute surface runs against an arbitration forum:
 *
 *   1. pin MetaEvidence (JSON) → `createDispute` (pays the arbitration
 *      deposit, returns the proxy-local dispute id)
 *   2. pin Evidence (JSON) → `submitEvidence` against an existing dispute
 *
 * Shared by the consent-dispute page (which runs both back-to-back as one
 * ceremony) and the process DisputeStatusPanel (which runs them as two
 * independent participant actions). What VARIES per surface is the payload
 * building (consent claim vs audit-bundle envelope) — that stays with the
 * caller; the sequencing lives here once.
 */

import type { PublicClient, WalletClient } from "viem";
import { createDispute, submitEvidence } from "@/lib/dispute/klerosProxy";
import type { KlerosConfig } from "@/lib/dispute/klerosProxy";
import type { IpfsService } from "@/lib/shared/ipfsService";

type EvidencePinner = Pick<IpfsService, "pinJSON" | "buildPath">;

/** Pin the MetaEvidence document and create the dispute it contextualizes. */
export async function createDisputeWithMetaEvidence(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    klerosConfig: KlerosConfig;
    metaEvidence: unknown;
    evidenceTransport: EvidencePinner;
    rulingOptions?: number;
}): Promise<{ metaEvidenceCid: string; localDisputeId: bigint }> {
    const {
        walletClient, publicClient, klerosConfig,
        metaEvidence, evidenceTransport, rulingOptions = 2,
    } = params;
    const metaEvidenceCid = await evidenceTransport.pinJSON(metaEvidence);
    const metaEvidenceURI = evidenceTransport.buildPath(metaEvidenceCid);
    const localDisputeId = await createDispute(
        walletClient, publicClient, klerosConfig, metaEvidenceURI, rulingOptions,
    );
    return { metaEvidenceCid, localDisputeId };
}

/** Pin an Evidence document and submit it to an existing dispute. */
export async function submitDisputeEvidence(params: {
    walletClient: WalletClient;
    klerosConfig: KlerosConfig;
    localDisputeId: bigint;
    evidence: unknown;
    evidenceTransport: EvidencePinner;
}): Promise<{ evidenceCid: string; txHash: `0x${string}` }> {
    const { walletClient, klerosConfig, localDisputeId, evidence, evidenceTransport } = params;
    const evidenceCid = await evidenceTransport.pinJSON(evidence);
    const evidenceURI = evidenceTransport.buildPath(evidenceCid);
    const txHash = await submitEvidence(walletClient, klerosConfig, localDisputeId, evidenceURI);
    return { evidenceCid, txHash };
}
