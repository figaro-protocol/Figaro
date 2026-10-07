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
import { computeClauseKey, type Agreement, type Commitment, type UsageClaimContext } from "@figaro-protocol/sdk";
import { encodeContentFromSpec, validateContent } from "@figaro-protocol/sdk/clauses";
import { OrderState, type Order } from "@/lib/kernel/store";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { planUsageRecords, type PlannedUsageWrite, type UsagePlanEntry } from "@/lib/semantic/planUsageRecords";
import type { SubmitClauseAttestationCapabilityAction } from "@/lib/semantic/models";

/** The attestation submitter's argument shape (both parties share it). */
interface AttestationSubmitArgs {
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
    /** FigaroCore resolve — buyer dominance's single signature. */
    resolveProcess: (processId: string, commitments: ReturnType<typeof restoreSignedProcessId>[]) => Promise<Hex | undefined | void>;
    /** Usage recording (permissionless; UsageCounter re-verifies every fact).
     *  Planned before the resolve from the counter's own facts, sent after it
     *  — count usage when it happens. Each write is simulated first and sent
     *  only if the simulation passes. */
    fetchUsageClaimContext: (agreement: Agreement) => Promise<UsageClaimContext>;
    simulateClauseUsage: (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]) => Promise<void>;
    simulateAssemblyUsage: (order: Commitment, compositionHash: Hex, proof: readonly Hex[]) => Promise<void>;
    recordClauseUsage: (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]) => Promise<Hex | undefined>;
    recordAssemblyUsage: (order: Commitment, compositionHash: Hex, proof: readonly Hex[]) => Promise<Hex | undefined>;
    submitAttestation: (role: "buyer" | "seller", args: AttestationSubmitArgs) => Promise<Hex | undefined>;
    registerMember: (metadataURI: string) => Promise<Hex | undefined | void>;
    updateMemberProfile: (metadataURI: string) => Promise<Hex | undefined | void>;
    withdrawMemberDeposit: () => Promise<Hex | undefined | void>;
    /** UI-edge dialogs — the copy lives with the caller. `confirmResolve`
     *  receives how many usage writes the wallet signs after the resolve. */
    confirmResolve: (plannedUsageWrites: number) => boolean;
    confirmWithdraw: () => boolean;
}

export function createCapabilityExecutors(deps: CapabilityExecutorDeps) {
    const waitForTransactionConfirmation = async (txHash?: Hex) => {
        if (deps.isE2EMock || !deps.publicClient || !txHash) return;
        // A mined-but-reverted tx must surface as a failure, not flow on as
        // success — otherwise the capability sticks in its in-flight state
        // with no error (the publish-flow rule: receipt + status check).
        await verifyTxSuccess(deps.publicClient, txHash, "The capability's transaction did not complete.");
    };

    const resolveActiveProcess = async (targetProcessId: string) => {
        const activeOrders = deps.processOrders.filter(
            (order) => order.processId === targetProcessId && order.state === OrderState.Active,
        );
        if (activeOrders.length === 0) throw new Error("No active orders are available to resolve.");

        // Reconstruct each order's Commitment from its indexed event —
        // resolveProcess needs the full Commitment[] to resolve the process
        // atomically. expectedCumulativeValue is the order's committed cumulativeValue.
        // resolveProcess recomputes each order's hash from hashStruct(commitment),
        // so the SIGNED commitment is required — restore the root's processId 0
        // (the event/store carries the derived processId).
        const chainId = deps.publicClient?.chain?.id ?? DEVNET_CHAIN_ID;
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

        // ── USAGE RECORDING, PLANNED BEFORE THE BUYER IS ASKED: the buyer's
        // app holds every agreement and proof at the moment of resolve, so it
        // plans the usage writes first (`planUsageRecords` — one per distinct
        // key across the process, never an excluded key, the assembly write
        // independent) and the confirm says how many the wallet signs after.
        // Under the e2e mock there is no chain: nothing is planned or sent.
        const plan = deps.isE2EMock ? [] : await planProcessUsage(activeOrders, commitments);
        if (!deps.confirmResolve(plan.length)) return undefined;

        const resolveTx = await deps.resolveProcess(targetProcessId, commitments);

        // ── SENT AFTER THE RESOLVE CONFIRMS: count usage when it happens.
        // Each planned write is simulated first and sent only if the
        // simulation passes — a simulation that reverts (the live-stake gate,
        // a key another caller counted meanwhile) is logged and skipped,
        // never sent. Best-effort by design: the process has already
        // resolved, and recording is permissionless work anyone can redo.
        if (!deps.isE2EMock) {
            await waitForTransactionConfirmation(resolveTx as Hex | undefined);
            let recorded = 0;
            let skipped = 0;
            let assemblyRecorded = false;
            for (const write of plan) {
                const label = write.kind === "clause" ? write.clause : `assembly ${write.key}`;
                try {
                    if (write.kind === "clause") await deps.simulateClauseUsage(write.order, write.key, write.sectionHash, write.proof);
                    else await deps.simulateAssemblyUsage(write.order, write.key, write.proof);
                } catch (error) {
                    skipped++;
                    console.error(`[usage-recording] ${label} on order ${write.orderHash}: simulation reverted, not sent: ${error instanceof Error ? error.message : String(error)}`);
                    continue;
                }
                try {
                    const tx = write.kind === "clause"
                        ? await deps.recordClauseUsage(write.order, write.key, write.sectionHash, write.proof)
                        : await deps.recordAssemblyUsage(write.order, write.key, write.proof);
                    await waitForTransactionConfirmation(tx);
                    recorded++;
                    if (write.kind === "assembly") assemblyRecorded = true;
                } catch (error) {
                    console.error(`[usage-recording] ${label} on order ${write.orderHash}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            console.error(`[usage-recording] recorded ${recorded}/${plan.length} planned (${skipped} skipped after a reverted simulation)${assemblyRecorded ? " + assembly" : ""} for process ${targetProcessId}`);
        }
        return resolveTx;
    };

    /** Read the counter's facts per hydrated agreement, then plan. A missing
     *  agreement or an unreadable counter stays loud (silent success is the
     *  enemy): that order's clauses and assembly go uncounted. */
    const planProcessUsage = async (
        activeOrders: readonly Order[],
        commitments: readonly Commitment[],
    ): Promise<PlannedUsageWrite[]> => {
        const entries: UsagePlanEntry[] = [];
        for (let i = 0; i < activeOrders.length; i++) {
            const { orderHash, agreementHash } = activeOrders[i];
            const agreement = agreementHash ? deps.processAgreements.get(agreementHash) : undefined;
            if (!agreement) {
                console.error(`[usage-recording] no hydrated agreement for order ${orderHash} (hash ${agreementHash}) — skipping its clauses and assemblies`);
                continue;
            }
            try {
                const context = await deps.fetchUsageClaimContext(agreement);
                entries.push({ orderHash, commitment: commitments[i], agreement, context });
            } catch (error) {
                console.error(`[usage-recording] the UsageCounter's facts for order ${orderHash} did not read — skipping its clauses and assemblies: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const { writes, problems } = planUsageRecords(entries);
        for (const problem of problems) console.error(`[usage-recording] ${problem}`);
        return writes;
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
            // pointer), gated by the same off-chain validator.
            const ladderValues = { ...(values ?? {}), [action.ladderField!]: action.eventCode };
            const validation = validateContent(ladderValues, spec);
            if (!validation.ok) {
                throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
            }
            content = encodeContentFromSpec(spec, ladderValues);
        } else {
            // WITNESS: values from the rail's generic form, gated by the
            // same off-chain validator that gates every sign point.
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
        // Chain of custody is READER-DERIVED: a diary event is one
        // holder's own entry, and any transfer-evidence witness (e.g. the
        // proximity clause's) is filed by a party through its OWN standalone
        // capability — the engine declares no pairing and reads no
        // presentation metadata at runtime.
        return deps.submitAttestation(action.party, args);
    };

    /** The callback bag `executeTransactionCapabilityAction` dispatches on. */
    const executorCallbacks = {
        waitForTransactionConfirmation,
        // The confirm is asked inside, once the usage writes are planned.
        resolveProcess: (processId: string) => resolveActiveProcess(processId),
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
