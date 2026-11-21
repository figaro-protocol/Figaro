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
import {
    PROVENANCE_LEAF_KEY,
    buildUsageClaims,
    provenanceLeafBytes,
    usageClaimKindCode,
    usageKeyId,
    type Agreement,
    type ProcessDesign,
    type Commitment,
    type UsageClaimContext,
} from "@figaro-protocol/sdk";
import { prepareAttestationContent, type SequencerUsageClaim } from "@figaro-protocol/sdk/agent";
import { OrderState, type Order } from "@/lib/core/store";
import { restoreSignedProcessId } from "@/lib/core/signedCommitment";
import { attestationContentFields, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { isBytes32Hex } from "@/lib/shared/evm";
import type { UsageWrite } from "@/lib/rewards/useUsageRecorder";
import { planUsageRecords, type PlannedUsageWrite, type UsagePlanEntry } from "@/lib/semantic/planUsageRecords";
import type { AttestProvenanceLeafCapabilityAction, SubmitClauseAttestationCapabilityAction } from "@/lib/semantic/models";

/** The attestation submitter's argument shape (both parties share it). */
interface AttestationSubmitArgs {
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    content?: Hex;
    failureMessage: string;
}

export interface CapabilityExecutorDeps {
    /** e2e mock sessions plan and send no usage writes (no chain). */
    isE2EMock: boolean;
    /** The connected chain, whose id the commitments were signed under —
     *  undefined until the wallet client hydrates. Every write below returns
     *  only once its receipt succeeded (`simulateWriteVerify`), so nothing
     *  here waits on a receipt again. */
    publicClient: { chain?: { id: number } } | undefined;
    processOrders: readonly Order[];
    processAgreements: Map<string, Agreement>;
    /** FigaroCore resolve — buyer dominance's single signature. */
    resolveProcess: (processId: string, commitments: ReturnType<typeof restoreSignedProcessId>[]) => Promise<Hex | undefined | void>;
    /** The batch path's resolve: the buyer's `ResolveProcess` signed under
     *  the verifier's domain and sent to a relay (`useRelayActions`). Absent,
     *  a batched process's resolve is refused. */
    resolveOnBatchPath?: (processId: Hex, commitments: Commitment[]) => Promise<unknown>;
    /** Send a batched process's usage claims to that relay. Absent, none is
     *  sent, and the log says so. */
    submitUsageClaims?: (claims: readonly SequencerUsageClaim[]) => Promise<{ admitted: number; refused: string[] }>;
    /** Usage recording (permissionless; UsageCounter re-verifies every fact).
     *  Planned before the resolve from the counter's own facts, sent after it
     *  — count usage when it happens. Each write is simulated first and sent
     *  only if the simulation passes. */
    fetchUsageClaimContext: () => Promise<UsageClaimContext>;
    /** The assembly of the assembly a provenance names, read from
     *  `ProcessRegistry` by its assembly root (whatever its stake) and
     *  verified against it; null when absent. */
    readAssembly: (processDesignHash: Hex) => Promise<ProcessDesign | null>;
    simulateUsage: (write: UsageWrite) => Promise<void>;
    recordUsage: (write: UsageWrite) => Promise<Hex | undefined>;
    /** A transaction hash on the direct path, a relay's receipt on the batch
     *  path (`useAttestationCoordinatorActions`). */
    submitAttestation: (role: "buyer" | "seller", args: AttestationSubmitArgs) => Promise<unknown>;
    registerMember: (metadataURI: string) => Promise<Hex | undefined | void>;
    updateMemberProfile: (metadataURI: string) => Promise<Hex | undefined | void>;
    withdrawMemberDeposit: () => Promise<Hex | undefined | void>;
    /** UI-edge dialogs — the copy lives with the caller. `confirmResolve`
     *  receives how many usage writes the wallet signs after the resolve. */
    confirmResolve: (plannedUsageWrites: number) => boolean;
    confirmWithdraw: () => boolean;
}

/** A submission's transaction hash, or undefined where it has none: an act
 *  sent to a relay answers with the relay's receipt, which its caller keeps. */
function transactionHashOf(sent: unknown): Hex | undefined {
    return typeof sent === "string" ? (sent as Hex) : undefined;
}

export function createCapabilityExecutors(deps: CapabilityExecutorDeps) {
    const resolveActiveProcess = async (targetProcessId: string) => {
        const activeOrders = deps.processOrders.filter(
            (order) => order.processId === targetProcessId && order.state === OrderState.Active,
        );
        if (activeOrders.length === 0) throw new Error("No active orders are available to resolve.");

        // Reconstruct each order's Commitment from its indexed event —
        // resolveProcess needs the full Commitment[] to resolve the process
        // atomically. runningTotal is the order's committed runningTotal.
        // resolveProcess recomputes each order's hash from hashStruct(commitment),
        // so the SIGNED commitment is required — restore the root's processId 0
        // (the event/store carries the derived processId).
        // Under the connected chain's id, the domain the commitments were
        // signed in; with no connected chain, nothing is restored.
        const chainId = deps.publicClient?.chain?.id;
        if (chainId === undefined) throw new Error("No connected chain: connect a wallet to the order's chain to resolve.");
        // A process is on one path (the two share no state): its orders are
        // restored under that path's domain, and its resolve goes there.
        const onBatchPath = activeOrders.some((order) => order.path === "batch");
        const commitments = activeOrders.map((order) => restoreSignedProcessId({
            processId: order.processId as Hex,
            buyer: order.buyer as Hex,
            seller: order.seller as Hex,
            token: order.token as Hex,
            payment: order.payment,
            runningTotal: order.runningTotal,
            checkoutHash: order.checkoutHash as Hex,
            salt: order.salt,
            commitDeadline: order.commitDeadline,
        }, chainId, onBatchPath ? "batch" : "direct"));

        if (onBatchPath) {
            // The batch path: the buyer signs the resolve under the verifier's
            // domain and the relay has it proved. Its uses are counted by
            // usage claims sent to the same relay right after, which the
            // proof applies against the batch's post-state, so a claim rides
            // the batch that resolves its order. No wallet write follows.
            if (!deps.resolveOnBatchPath) throw new Error("This process is on the batch path, and no relay is known to send its resolve to.");
            if (!deps.confirmResolve(0)) return undefined;
            // The relay's receipt is the caller's to keep; the act has no
            // transaction hash.
            await deps.resolveOnBatchPath(targetProcessId as Hex, commitments);
            if (!deps.isE2EMock) await claimBatchUsage(activeOrders, commitments);
            return undefined;
        }

        // ── USAGE RECORDING, PLANNED BEFORE THE BUYER IS ASKED: the buyer's
        // app holds every agreement and proof at the moment of resolve, so it
        // plans the usage writes first (`planUsageRecords` — one per distinct
        // key across the process: every clause, and the registered
        // agreement and the assembly from each agreement's provenance leaf)
        // and the confirm says how many the wallet signs after.
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
            let recorded = 0;
            let skipped = 0;
            const recordedKinds = new Set<string>();
            for (const write of plan) {
                const label = write.kind === "clause" ? (getClauseSpec(write.key)?.title ?? `clause ${write.key}`) : `${write.kind} ${write.key}`;
                try {
                    await deps.simulateUsage(write);
                } catch (error) {
                    skipped++;
                    console.error(`[usage-recording] ${label} on order ${write.orderHash}: simulation reverted, not sent: ${error instanceof Error ? error.message : String(error)}`);
                    continue;
                }
                try {
                    await deps.recordUsage(write);
                    recorded++;
                    if (write.kind !== "clause") recordedKinds.add(write.kind);
                } catch (error) {
                    console.error(`[usage-recording] ${label} on order ${write.orderHash}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            console.error(`[usage-recording] recorded ${recorded}/${plan.length} planned (${skipped} skipped after a reverted simulation)${[...recordedKinds].map((k) => ` + ${k}`).join("")} for process ${targetProcessId}`);
        }
        return resolveTx;
    };

    /** The usage claims of a resolved batched process, sent to the relay
     *  that took its resolve: one per key and family across the process
     *  (`buildUsageClaims`, the SDK's own legs). Best-effort, as on the
     *  direct path: a refusal is logged, never thrown, since the resolve is
     *  already with the relay. */
    const claimBatchUsage = async (
        activeOrders: readonly Order[],
        commitments: readonly Commitment[],
    ): Promise<void> => {
        const entries = await usageEntries(activeOrders, commitments);
        const sent = new Set<string>();
        const claims: SequencerUsageClaim[] = [];
        for (const { orderHash, commitment, agreement, context, assembly } of entries) {
            let built: SequencerUsageClaim[];
            try {
                built = buildUsageClaims(commitment, agreement, context, assembly);
            } catch (error) {
                console.error(`[usage-claims] order ${orderHash}: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
            for (const claim of built) {
                const key = usageKeyId(usageClaimKindCode(claim), claim.clause_or_process);
                if (sent.has(key)) continue;
                sent.add(key);
                claims.push(claim);
            }
        }
        if (claims.length === 0) return;
        if (!deps.submitUsageClaims) {
            console.error(`[usage-claims] no relay is known to send ${claims.length} usage claims to`);
            return;
        }
        const { admitted, refused } = await deps.submitUsageClaims(claims);
        for (const reason of refused) console.error(`[usage-claims] refused by the relay: ${reason}`);
        console.error(`[usage-claims] the relay admitted ${admitted}/${claims.length} usage claims`);
    };

    /** Read the counter's fact once, then plan every hydrated agreement. A
     *  missing agreement or an unreadable counter stays loud (silent success
     *  is the enemy): the orders it costs go uncounted. */
    const planProcessUsage = async (
        activeOrders: readonly Order[],
        commitments: readonly Commitment[],
    ): Promise<PlannedUsageWrite[]> => {
        const entries = await usageEntries(activeOrders, commitments);
        const { writes, problems } = planUsageRecords(entries);
        for (const problem of problems) console.error(`[usage-recording] ${problem}`);
        return writes;
    };

    /** Each active order with its agreement, the counter's reserved leaves
     *  and the assembly its provenance names: the input of both the direct
     *  path's usage writes and the batch path's usage claims. */
    const usageEntries = async (
        activeOrders: readonly Order[],
        commitments: readonly Commitment[],
    ): Promise<UsagePlanEntry[]> => {
        let context: UsageClaimContext;
        try {
            context = await deps.fetchUsageClaimContext();
        } catch (error) {
            console.error(`[usage-recording] the UsageCounter's reserved leaves did not read — skipping every clause, agreement and assembly of this process: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
        // Each assembly a provenance names, read once by its assembly root.
        const assemblies = new Map<string, ProcessDesign | null>();
        const entries: UsagePlanEntry[] = [];
        for (let i = 0; i < activeOrders.length; i++) {
            const { orderHash, checkoutHash } = activeOrders[i];
            const agreement = checkoutHash ? deps.processAgreements.get(checkoutHash) : undefined;
            if (!agreement) {
                console.error(`[usage-recording] no hydrated agreement for order ${orderHash} (hash ${checkoutHash}) — skipping its clauses and assemblies`);
                continue;
            }
            let assembly: ProcessDesign | undefined;
            if (agreement.provenance && isBytes32Hex(agreement.provenance.processDesignHash)) {
                const key = agreement.provenance.processDesignHash.toLowerCase();
                if (!assemblies.has(key)) assemblies.set(key, await deps.readAssembly(agreement.provenance.processDesignHash).catch(() => null));
                assembly = assemblies.get(key) ?? undefined;
            }
            entries.push({ orderHash, commitment: commitments[i], agreement, context, assembly });
        }
        return entries;
    };

    // ONE generic attestation path — the clause spec drives the on-chain
    // content (enum ladder or a declared witness stage) and who attests
    // (party). Names no clause; a permissionless clause attests through
    // here unchanged.
    const submitClauseAttestation = async (
        action: SubmitClauseAttestationCapabilityAction,
        values?: Record<string, unknown>,
    ) => {
        // The exact spec the agreement committed — its key; another spec of
        // the same name is another key the signed agreement never committed.
        const spec = getClauseSpec(action.clauseKey);
        if (!spec) throw new Error(`Clause spec not loaded: ${action.clauseKey}`);
        const isLadder = action.ladderField !== undefined && action.eventCode !== undefined;
        // Every attestation's content is encoded over the set its stage
        // selects (`attestationContentFields`: `stages[stage]` where the spec
        // declares it, else the top-level fields), the rule the SDK and the
        // proof program apply; a ladder event is no exception.
        const encodeAt = { stage: action.stage };
        let content: Hex | undefined;
        if (action.reasserts) {
            // RE-ASSERT: content stays OMITTED — the coordinator
            // defaults it to the committed clauseData, the exact
            // bytes under the checkoutHash merkle binding.
            content = undefined;
        } else if (isLadder) {
            // LADDER: the event code, where the encoded set declares the
            // ladder field, plus the fills from the rail's generic form
            // (an evidence pointer, a reading), gated by the same off-chain
            // validator. The SDK's preflight draws the blinding value of a
            // private set, so two events of one private value carry two
            // content references.
            const declaresLadder = attestationContentFields(action.clauseKey, action.stage)?.some((f) => f.name === action.ladderField) === true;
            const ladderValues = declaresLadder ? { ...(values ?? {}), [action.ladderField!]: action.eventCode } : { ...(values ?? {}) };
            ({ content } = prepareAttestationContent(spec, ladderValues, encodeAt));
        } else {
            // WITNESS: values from the rail's generic form, gated by the
            // same off-chain validator that gates every sign point, with a
            // private stage's blinding value drawn here.
            ({ content } = prepareAttestationContent(spec, values ?? {}, encodeAt));
        }
        // A private set's content is kept by the attestation submitter
        // before anything is sent (`useAttestationCoordinatorActions`), the
        // one step every filing goes through. A re-assert's content is the
        // committed clause, already held with the agreement.
        const args: AttestationSubmitArgs = {
            orderHash: action.orderHash as Hex,
            clauseId: action.clauseKey as Hex,
            stage: action.stage,
            content,
            failureMessage: `${spec.title} ${action.eventCode ?? (action.reasserts ? "re-assert" : `stage-${action.stage}`)} attestation failed`,
        };
        // Chain of custody is READER-DERIVED: a diary event is one
        // holder's own entry, and any transfer-evidence witness (e.g. the
        // proximity clause's) is filed by a party through its OWN standalone
        // capability — the engine declares no pairing and reads no
        // presentation metadata at runtime.
        return transactionHashOf(await deps.submitAttestation(action.party, args));
    };

    // The agreement FORMAT's provenance leaf, attested by the buyer while the
    // process is open: the reserved key where a clause key goes, stage 0, and
    // the leaf's own bytes as the content — their hash is the leaf's clause
    // hash, so the content reference equals it and the bytes publish at it.
    // No spec: the bytes are the format's, reproducible from the hash.
    const attestProvenanceLeaf = async (action: AttestProvenanceLeafCapabilityAction) =>
        transactionHashOf(await deps.submitAttestation("buyer", {
            orderHash: action.orderHash as Hex,
            clauseId: PROVENANCE_LEAF_KEY,
            stage: 0,
            content: provenanceLeafBytes(action.agreementHash, action.processDesignHash),
            failureMessage: "provenance attestation failed",
        }));

    /** The callback bag `executeTransactionCapabilityAction` dispatches on. */
    const executorCallbacks = {
        // The confirm is asked inside, once the usage writes are planned.
        resolveProcess: (processId: string) => resolveActiveProcess(processId),
        registerMember: deps.registerMember,
        updateMemberProfile: deps.updateMemberProfile,
        withdrawMemberDeposit: () => {
            if (!deps.confirmWithdraw()) return Promise.resolve(undefined);
            return deps.withdrawMemberDeposit();
        },
        submitClauseAttestation,
        attestProvenanceLeaf,
    };

    return { resolveActiveProcess, executorCallbacks };
}
