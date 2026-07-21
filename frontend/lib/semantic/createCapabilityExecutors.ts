/**
 * createCapabilityExecutors — the WRITE half of the semantic process
 * workspace, split from the model derivation along the authority axis: the
 * read side derives what a wallet CAN do (deriveProcessModelFromRuntime);
 * this factory builds what pressing a capability actually DOES — the
 * confirmation waiter, the atomic process resolver, and the ONE generic
 * attestation choreography (ladder / witness / re-assert + the hand-off
 * pairing), with every wallet action and UI dialog INJECTED. Nothing here
 * is React: the workspace hook wires it up; a test drives it with plain
 * stubs.
 *
 * Confirm dialogs stay at the UI edge by doctrine — the hook passes
 * `confirmResolve` / `confirmWithdraw` callbacks carrying the user-facing
 * copy; this factory only decides WHEN to ask.
 */
import { type Hex } from "viem";
import { computeClauseKey, type Agreement } from "@figaro/sdk";
import { encodeContentFromSpec, validateContent } from "@figaro/sdk/clauses";
import { OrderState, type Order } from "@/lib/kernel/store";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import {
    clauseHandoffStages,
    clauseWitnessStages,
    deriveStageValuesFromCommitted,
    getClauseSpec,
} from "@/lib/shared/clauseSpecSource";
import type { SubmitClauseAttestationCapabilityAction } from "@/lib/semantic/models";

/** The attestation submitter's argument shape (both parties share it). */
export interface AttestationSubmitArgs {
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    content?: Hex;
    failureMessage: string;
}

export interface CapabilityExecutorDeps {
    /** e2e mock sessions skip receipt waits (no chain). */
    isE2EMock: boolean;
    /** Receipt reader — undefined until the wallet client hydrates. */
    publicClient: { waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>; chain?: { id: number } } | undefined;
    processOrders: readonly Order[];
    processAgreements: Map<string, Agreement>;
    /** The kernel resolve — buyer dominance's single signature. */
    resolveProcess: (processId: string, commitments: ReturnType<typeof restoreSignedProcessId>[]) => Promise<Hex | undefined | void>;
    submitBuyerAttestation: (args: AttestationSubmitArgs) => Promise<Hex | undefined>;
    submitSellerAttestation: (args: AttestationSubmitArgs) => Promise<Hex | undefined>;
    registerSeller: (metadataURI: string) => Promise<Hex | undefined | void>;
    updateSellerProfile: (metadataURI: string) => Promise<Hex | undefined | void>;
    withdrawSellerDeposit: () => Promise<Hex | undefined | void>;
    /** UI-edge dialogs — the copy lives with the caller. */
    confirmResolve: () => boolean;
    confirmWithdraw: () => boolean;
}

export function createCapabilityExecutors(deps: CapabilityExecutorDeps) {
    const waitForTransactionConfirmation = async (txHash?: Hex) => {
        if (deps.isE2EMock || !deps.publicClient || !txHash) return;
        const receipt = await deps.publicClient.waitForTransactionReceipt({ hash: txHash });
        // A mined-but-reverted tx must surface as a failure, not flow on as
        // success — otherwise the capability sticks in its in-flight state
        // with no error (the publish-flow rule: receipt + status check).
        if (receipt.status !== "success") {
            throw new Error("Transaction reverted on-chain.");
        }
    };

    const resolveActiveProcess = async (targetProcessId: string) => {
        const activeOrders = deps.processOrders.filter(
            (order) => order.processId === targetProcessId && order.state === OrderState.Active,
        );
        if (activeOrders.length === 0) throw new Error("No active orders are available to resolve.");

        // Reconstruct each order's Commitment from its indexer event record —
        // resolveProcess needs the full Commitment[] to settle the process
        // atomically. expectedCumulativeValue is the order's committed cumulativeValue.
        // resolveProcess recomputes each order's hash from hashStruct(commitment),
        // so the SIGNED commitment is required — restore the root's processId 0
        // (the event/store carries the derived processId).
        const chainId = deps.publicClient?.chain?.id ?? 31337;
        const commitments = activeOrders.map((order) => restoreSignedProcessId({
            processId: order.processId as Hex,
            buyer: order.buyer as Hex,
            seller: order.seller as Hex,
            currency: order.currency as Hex,
            payment: order.payment,
            expectedCumulativeValue: order.cumulativeValue,
            agreementHash: order.agreementHash as Hex,
            salt: order.salt,
            deadline: order.deadline,
        }, chainId));

        return deps.resolveProcess(targetProcessId, commitments);
    };

    // ONE generic attestation path — the clause spec drives the on-chain
    // content (enum ladder or a declared witness stage) and who attests
    // (party). Names no clause; a permissionless clause attests through
    // here unchanged.
    const submitClauseAttestation = async (
        action: SubmitClauseAttestationCapabilityAction,
        values?: Record<string, unknown>,
    ) => {
        const spec = getClauseSpec(action.clauseId);
        if (!spec) throw new Error(`Clause spec not loaded: ${action.clauseId}`);
        const isLadder = action.ladderField !== undefined && action.eventCode !== undefined;
        let content: Hex | undefined;
        if (action.reasserts) {
            // RE-ASSERT: content stays OMITTED — the coordinator
            // defaults it to the committed sectionData, the exact
            // bytes under the agreementHash merkle binding.
            content = undefined;
        } else if (isLadder) {
            // LADDER: the event code plus any companion-field fills
            // from the rail's generic form (e.g. an evidence
            // pointer), gated by the same Layer-A validator.
            const ladderValues = { ...(values ?? {}), [action.ladderField!]: action.eventCode };
            const validation = validateContent(ladderValues, spec);
            if (!validation.ok) {
                throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
            }
            content = encodeContentFromSpec(spec, ladderValues);
        } else {
            // WITNESS: values from the rail's generic form, gated by the
            // same Layer-A validator that gates every sign point.
            const witnessValues = values ?? {};
            const validation = validateContent(witnessValues, spec, { stage: action.stage });
            if (!validation.ok) {
                throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
            }
            content = encodeContentFromSpec(spec, witnessValues, { stage: action.stage });
        }
        const args: AttestationSubmitArgs = {
            orderHash: action.orderHash as Hex,
            clauseId: computeClauseKey(action.clauseId, spec.version),
            stage: action.stage,
            content,
            failureMessage: `${action.clauseId} ${action.eventCode ?? (action.reasserts ? "re-assert" : `stage-${action.stage}`)} attestation failed`,
        };
        const submit = (a: AttestationSubmitArgs) => action.party === "buyer"
            ? deps.submitBuyerAttestation(a)
            : deps.submitSellerAttestation(a);
        const txHash = await submit(args);

        // HAND-OFF PAIRING (one action, two attestations): a ladder
        // stage the clause declares in block.handoffStages pairs the
        // witness stage of any co-composed clause nesting under
        // `handoff` on the SAME order — when the witness's required
        // values derive unambiguously from the committed content (a
        // single committed band). Ambiguous → the standalone witness
        // capability (with its form) carries the choice instead.
        let lastTx = txHash;
        if (isLadder && clauseHandoffStages(action.clauseId).includes(action.eventCode!)) {
            const order = deps.processOrders.find((o) => o.orderHash.toString() === action.orderHash);
            const agreement = order?.agreementHash ? deps.processAgreements.get(order.agreementHash) : undefined;
            for (const section of agreement?.sections ?? []) {
                const witnessSpec = getClauseSpec(section.clause, section.version);
                // Field-name vocabulary, not a clause name: the witness
                // clause declares it REFINES the `handoff` field.
                if (witnessSpec?.block?.nestsUnder !== "handoff") continue;
                for (const witness of clauseWitnessStages(section.clause, section.version)) {
                    const derived = deriveStageValuesFromCommitted(
                        section.clause,
                        witness.stage,
                        section.data as Record<string, unknown> | undefined,
                        section.version,
                    );
                    if (!derived) continue;
                    await waitForTransactionConfirmation(lastTx as Hex | undefined);
                    lastTx = await submit({
                        orderHash: action.orderHash as Hex,
                        clauseId: computeClauseKey(section.clause, witnessSpec.version),
                        stage: witness.stage,
                        content: encodeContentFromSpec(witnessSpec, derived, { stage: witness.stage }),
                        failureMessage: `${section.clause} stage-${witness.stage} paired witness failed`,
                    });
                }
            }
        }
        return lastTx;
    };

    /** The callback bag `executeTransactionCapabilityAction` dispatches on. */
    const executorCallbacks = {
        waitForTransactionConfirmation,
        resolveProcess: async (processId: string) => {
            if (!deps.confirmResolve()) return;
            return resolveActiveProcess(processId);
        },
        registerSeller: deps.registerSeller,
        updateSellerProfile: deps.updateSellerProfile,
        withdrawSellerDeposit: () => {
            if (!deps.confirmWithdraw()) return Promise.resolve(undefined);
            return deps.withdrawSellerDeposit();
        },
        submitClauseAttestation,
    };

    return { waitForTransactionConfirmation, resolveActiveProcess, executorCallbacks };
}
