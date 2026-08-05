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
import { buildSectionInclusionProof, computeClauseKey, sectionDataHash, type Agreement, type Commitment } from "@figaro/sdk";
import { encodeContentFromSpec, validateContent } from "@figaro/sdk/clauses";
import { OrderState, type Order } from "@/lib/kernel/store";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
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
    /** RPGF usage recording (permissionless; UsageCounter re-verifies every
     *  fact, so a revert is bookkeeping, not failure). Fired after resolve —
     *  count usage when it happens. */
    recordClauseUsage: (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]) => Promise<Hex | undefined>;
    recordAssemblyUsage: (order: Commitment, compositionHash: Hex, proof: readonly Hex[]) => Promise<Hex | undefined>;
    submitBuyerAttestation: (args: AttestationSubmitArgs) => Promise<Hex | undefined>;
    submitSellerAttestation: (args: AttestationSubmitArgs) => Promise<Hex | undefined>;
    registerMember: (metadataURI: string) => Promise<Hex | undefined | void>;
    updateMemberProfile: (metadataURI: string) => Promise<Hex | undefined | void>;
    withdrawMemberDeposit: () => Promise<Hex | undefined | void>;
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

        const resolveTx = await deps.resolveProcess(targetProcessId, commitments);

        // ── RPGF USAGE RECORDING (ruled 2026-07-28): count usage when it
        // happens — the buyer's app, holding every agreement and proof at
        // the moment of resolve, records each committed clause's or
        // assembly's use.
        // Spec-routed and name-free: every section records; a section whose
        // spec declares a `compositionHash` field additionally records
        // ASSEMBLY usage (once per process). Best-effort by design: the
        // resolve has already settled, recording is permissionless
        // bookkeeping anyone can redo, so a failed call logs and moves on.
        if (!deps.isE2EMock) {
            await waitForTransactionConfirmation(resolveTx as Hex | undefined);
            let assemblyRecorded = false;
            let recorded = 0;
            let attempted = 0;
            for (let i = 0; i < activeOrders.length; i++) {
                const agreementHash = activeOrders[i].agreementHash;
                const agreement = agreementHash ? deps.processAgreements.get(agreementHash) : undefined;
                if (!agreement) {
                    // Loud by doctrine (silent success is the enemy): a missing
                    // agreement means this order's clauses and assemblies go unrecorded.
                    console.error(`[usage-recording] no hydrated agreement for order ${activeOrders[i].orderHash} (hash ${agreementHash}) — skipping its clauses and assemblies`);
                    continue;
                }
                for (const section of agreement.sections) {
                    attempted++;
                    const { proof } = buildSectionInclusionProof(agreement, section.clause);

                    // CLAUSE leg. Excluded clauses/assemblies (the two order-mandatory
                    // clauses + assembly-provenance) revert ClauseOrAssemblyExcluded by
                    // design, so this leg failing is routine, not a fault.
                    try {
                        // Only the section FINGERPRINT reaches calldata — never
                        // the plaintext, so a private section stays off-chain.
                        const fingerprint = sectionDataHash(section);
                        const tx = await deps.recordClauseUsage(
                            commitments[i] as Commitment,
                            computeClauseKey(section.clause, section.version) as Hex,
                            fingerprint as Hex,
                            proof as readonly Hex[],
                        );
                        await waitForTransactionConfirmation(tx);
                        recorded++;
                    } catch (error) {
                        console.error(`[usage-recording] ${section.clause} on order ${activeOrders[i].orderHash}: ${error instanceof Error ? error.message : String(error)}`);
                    }

                    // ASSEMBLY leg — INDEPENDENT of the clause leg above, and
                    // that independence is the whole point. The section that
                    // carries a compositionHash is `figaro-assembly-provenance`,
                    // which is EXCLUDED from scoring, so its clause record always
                    // reverts. Sequencing the assembly credit after it (inside the
                    // same try) made the designer-credit leg unreachable for every
                    // assembly-composed process — dead end-to-end, silently.
                    const composition = (section.data as Record<string, unknown> | undefined)?.compositionHash;
                    if (assemblyRecorded || composition === undefined) continue;
                    if (typeof composition !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(composition)) {
                        // Loud: a committed compositionHash that fails the
                        // shape check means the assembly leg silently dies.
                        console.error(`[usage-recording] ${section.clause}: compositionHash present but malformed: ${JSON.stringify(composition)}`);
                        continue;
                    }
                    try {
                        // recordAssemblyUsage takes no section — the provenance
                        // content is derived on-chain from the compositionHash.
                        const atx = await deps.recordAssemblyUsage(
                            commitments[i] as Commitment,
                            composition as Hex,
                            proof as readonly Hex[],
                        );
                        await waitForTransactionConfirmation(atx);
                        assemblyRecorded = true;
                    } catch (error) {
                        console.error(`[usage-recording] assembly ${composition} on order ${activeOrders[i].orderHash}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            console.error(`[usage-recording] recorded ${recorded}/${attempted} sections${assemblyRecorded ? " + assembly" : ""} for process ${targetProcessId}`);
        }
        return resolveTx;
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
        // Custody is READER-DERIVED (ruled 2026-07-28): a diary event is one
        // custodian's own record, and any transfer-evidence witness (e.g. the
        // proximity clause's) is filed by a party through its OWN standalone
        // capability — the engine declares no pairing and reads no
        // presentation metadata at runtime.
        return submit(args);
    };

    /** The callback bag `executeTransactionCapabilityAction` dispatches on. */
    const executorCallbacks = {
        waitForTransactionConfirmation,
        resolveProcess: async (processId: string) => {
            if (!deps.confirmResolve()) return;
            return resolveActiveProcess(processId);
        },
        registerMember: deps.registerMember,
        updateMemberProfile: deps.updateMemberProfile,
        withdrawMemberDeposit: () => {
            if (!deps.confirmWithdraw()) return Promise.resolve(undefined);
            return deps.withdrawMemberDeposit();
        },
        submitClauseAttestation,
    };

    return { waitForTransactionConfirmation, resolveActiveProcess, executorCallbacks };
}
