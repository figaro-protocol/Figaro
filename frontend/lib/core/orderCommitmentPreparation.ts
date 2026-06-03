import type { Hex } from "viem";
import { generateSalt, computeDeadline, type Commitment } from "@figaro/core";
import { saveAgreement, publishAgreement } from "@/lib/core/agreementStore";
import { buildOrderAgreement, type BuildOrderAgreementParams } from "@/lib/core/orderAgreement";
import type { Agreement } from "@/lib/core/agreement";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";



interface AgreementCommitmentMeta {
    agreement?: Agreement;
    agreementUri?: string;
}

export interface PreparedAgreementArtifact {
    agreement: Agreement;
    agreementHash: Hex;
    commitmentMeta: AgreementCommitmentMeta;
}

export interface BuildUnsignedOrderCommitmentParams {
    processId?: Hex;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency: `0x${string}`;
    payment: bigint;
    expectedCumulativeValue?: bigint;
    agreementHash: Hex;
    salt?: bigint;
    deadline?: bigint;
}

export interface PrepareOrderCommitmentParams extends BuildOrderAgreementParams {
    processId?: Hex;
    expectedCumulativeValue?: bigint;
    salt?: bigint;
    deadline?: bigint;
}

export async function persistAgreementArtifact(agreement: Agreement): Promise<PreparedAgreementArtifact> {
    const agreementHash = saveAgreement(agreement);

    try {
        const publication = await publishAgreement(agreement);
        return {
            agreement,
            agreementHash,
            commitmentMeta: { agreementUri: publication.uri },
        };
    } catch {
        return {
            agreement,
            agreementHash,
            commitmentMeta: { agreement },
        };
    }
}

export function buildUnsignedOrderCommitment(
    params: BuildUnsignedOrderCommitmentParams,
): Commitment {
    return {
        processId: params.processId ?? ZERO_PROCESS_ID,
        buyer: params.buyer,
        seller: params.seller,
        currency: params.currency,
        payment: params.payment,
        expectedCumulativeValue: params.expectedCumulativeValue ?? params.payment,
        agreementHash: params.agreementHash,
        salt: params.salt ?? generateSalt(),
        deadline: params.deadline ?? computeDeadline(),
    };
}

export async function prepareOrderCommitment(
    params: PrepareOrderCommitmentParams,
): Promise<PreparedAgreementArtifact & { commitment: Commitment }> {
    const agreement = buildOrderAgreement(params);
    const preparedAgreement = await persistAgreementArtifact(agreement);

    return {
        ...preparedAgreement,
        commitment: buildUnsignedOrderCommitment({
            processId: params.processId,
            buyer: params.buyer,
            seller: params.seller,
            currency: params.currency,
            payment: params.payment,
            expectedCumulativeValue: params.expectedCumulativeValue,
            agreementHash: preparedAgreement.agreementHash,
            salt: params.salt,
            deadline: params.deadline,
        }),
    };
}