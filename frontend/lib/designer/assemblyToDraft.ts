/**
 * assemblyToDraft — hydrates a `DesignSnapshot` from a HYDRATED
 * assembly (the assembly pinned on AssemblyRegistry beside every agreement's
 * registered agreement, each verified). Powers the "Fork" button: a published
 * assembly is read, this helper turns it into a localStorage draft under a
 * new slug, and the canvas opens at /assemblies/designer/edit?slug=<new-slug>.
 *
 * The assembly carries structure (agreements + the topology parents in each
 * agreement's own fill) and, per agreement, the registered agreement it binds —
 * no payment (payment is a runtime value). Each agreement is reconstructed
 * into a display Order with a synthetic agreement (built from its clauses +
 * topology parents) seeded into the store so the canvas resolves it by hash.
 * Each agreement keeps binding its registered agreement (`registeredByOrderId`)
 * — unless the caller names its key among `composeKeys`, in which case the
 * agreement's clauses are carried into `clausesByOrderId` for the designer to
 * compose anew (an imported agreement no registry binds yet).
 */

import {
    anchorRegisteredAgreement,
    hydrateAssembly,
    isBytes32Hex,
    planAssemblyOrders,
    boundAgreement,
    type RegisteredAgreement,
    type Hex,
    type HydratedAssembly,
} from "@figaro-protocol/sdk";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { assemblyHashOf, type Assembly } from "@/lib/shared/assembly";
import { fetchRegisteredAgreement } from "@/lib/protocol/useAgreementRegistry";
import { safeJsonParse } from "@/lib/shared/safeJson";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { DesignSnapshot } from "./syntheticDesignStore";
import { Order } from "@/lib/kernel/store";
import { buildSyntheticOrder, syntheticAddress } from "./syntheticProcess";

/** 1.0 — display-only payment; the assembly itself carries none. */
const DISPLAY_PAYMENT = 1_000_000_000_000_000_000n;
const SYNTHETIC_PROCESS_ID = `0x${"00".repeat(32)}` as `0x${string}`;

/**
 * Reconstruct displayable orders from a assembly: each assembly order → a
 * synthetic agreement (from its clauses + topology parents) seeded into the store
 * so the canvas resolves it by hash. Used by the fork path and the read-only
 * `/view` resolver.
 */
export function assemblyToOrders(hydrated: HydratedAssembly): Order[] {
    // The assembly is party-agnostic. For DISPLAY (fork / read-only /view) we
    // reconstruct synthetic parties — one shared synthetic buyer (rootBuyer) +
    // a distinct synthetic seller per order. Real parties bind at
    // adoption/checkout, never from the assembly. The nodes come from the ONE
    // assembly walk (`planAssemblyOrders` — commit order, local parent edges);
    // per-order build→hash→save→assemble is the shared `buildSyntheticOrder`.
    return planAssemblyOrders(hydrated).map((planned) =>
        buildSyntheticOrder({
            orderId: planned.nodeId as `0x${string}`,
            processId: SYNTHETIC_PROCESS_ID,
            buyer: syntheticAddress(0),
            seller: syntheticAddress(planned.index + 1),
            currency: ZERO_ADDRESS,
            payment: DISPLAY_PAYMENT,
            salt: BigInt(planned.index + 1),
            clauseFields: planned.clauses as ClauseFields,
            follows: planned.parentLocalIds,
        }).order,
    );
}

export function assemblyToDraft(
    hydrated: HydratedAssembly,
    options: { slug: string; name?: string; composeKeys?: ReadonlySet<string> },
): DesignSnapshot {
    const { assembly } = hydrated;
    const orders = assemblyToOrders(hydrated);
    const compose = (key: Hex) => options.composeKeys?.has(key.toLowerCase()) ?? false;
    const registeredByOrderId: Record<string, Hex> = {};
    const clausesByOrderId: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const entry of assembly.agreements) {
        if (compose(entry.agreementHash)) clausesByOrderId[entry.id] = { ...boundAgreement(hydrated, entry).clauses };
        else registeredByOrderId[entry.id] = entry.agreementHash;
    }
    return {
        slug: options.slug,
        name: options.name ?? "Forked assembly",
        processId: SYNTHETIC_PROCESS_ID,
        nextOrderIndex: orders.length,
        nextSellerIndex: orders.length + 1,
        orders,
        clausesByOrderId,
        ...(Object.keys(registeredByOrderId).length > 0 ? { registeredByOrderId } : {}),
        // Assembly-scoped clauses travel as their own level — never smeared
        // onto an order (scope placement is verified at build/publish).
        ...(assembly.assemblyClauses && Object.keys(assembly.assemblyClauses).length > 0
            ? { assemblyClauses: assembly.assemblyClauses }
            : {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/** Result of reading pasted composition JSON (the composition-assist import). */
export type ParsedAssemblyResult =
    | { ok: true; assembly: Assembly; agreements: Record<string, unknown> }
    | { ok: false; error: string };

/**
 * Parse text pasted as a composition — the composition-assist import
 * surface, where the JSON comes from the designer's own agent rather than a
 * chain-anchored URI (so there is no assemblyHash to check integrity
 * against; soundness is the bar). Accepts the handoff shape
 * `{ assembly, agreements }` (the assembly and the agreements newly composed
 * for it, keyed by agreement hash) or a bare assembly. Shape-checks the order
 * entries, then probes the composition through `assemblyHashOf` — the
 * same walk the registry key uses — so anything it cannot hash is rejected
 * here with a message instead of failing later at publish.
 */
export function parseAssemblyJson(text: string): ParsedAssemblyResult {
    const parsed = safeJsonParse<unknown>(text);
    if (parsed === null) return { ok: false, error: "Not valid JSON." };
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "A composition is a JSON object: `{ assembly, agreements }`, or a assembly with an `agreements` array." };
    }
    const bundle = parsed as { assembly?: unknown; agreements?: unknown };
    const isBundle = typeof bundle.assembly === "object" && bundle.assembly !== null && !Array.isArray(bundle.agreements);
    const candidate = (isBundle ? bundle.assembly : parsed) as { agreements?: unknown; assemblyClauses?: unknown };
    const agreementDocs = isBundle && typeof bundle.agreements === "object" && bundle.agreements !== null
        ? bundle.agreements as Record<string, unknown>
        : {};
    const entries = candidate.agreements;
    if (!Array.isArray(entries) || entries.length === 0) {
        return { ok: false, error: "A assembly carries a non-empty `agreements` array — one agreement per order." };
    }
    for (const entry of entries) {
        const id = (entry as { id?: unknown } | null)?.id;
        const agreementHash = (entry as { agreementHash?: unknown } | null)?.agreementHash;
        const clauses = (entry as { clauses?: unknown } | null)?.clauses;
        if (typeof entry !== "object" || entry === null || typeof id !== "string" || !isBytes32Hex(agreementHash)
            || typeof clauses !== "object" || clauses === null || Array.isArray(clauses)) {
            return { ok: false, error: "Each agreement needs a string `id`, an `agreementHash` (the 32-byte key of a registered agreement) and a `clauses` object (the agreement's own fills)." };
        }
        const unkeyed = Object.keys(clauses).find((k) => !isBytes32Hex(k));
        if (unkeyed !== undefined) {
            return { ok: false, error: `Each clause is named by its clause key (the 32-byte hash of its pinned spec); "${unkeyed}" is not one.` };
        }
    }
    const assemblyClauses = candidate.assemblyClauses;
    if (assemblyClauses !== undefined && (typeof assemblyClauses !== "object" || assemblyClauses === null
        || Object.keys(assemblyClauses).some((k) => !isBytes32Hex(k)))) {
        return { ok: false, error: "`assemblyClauses` maps clause keys (the 32-byte hash of each pinned spec) to the designer's values." };
    }
    const assembly = candidate as Assembly;
    try {
        assemblyHashOf(assembly);
    } catch (cause) {
        return { ok: false, error: `The composition does not hash: ${extractErrorMessage(cause, "malformed assembly")}` };
    }
    return { ok: true, assembly, agreements: agreementDocs };
}

/**
 * Hydrate a parsed import: each agreement's agreement is read from the
 * pasted documents (verified against its key) or, when the paste does not
 * carry it, from `AgreementRegistry`. Every pasted agreement comes back among
 * `composeKeys` — the agent's composition lands on the canvas as composition
 * (publish registers it unless a registry already binds its key); an order
 * entry the paste names only by key binds that registered agreement. An
 * `error` says an agreement's agreement is absent from both.
 */
export async function hydrateImportedAssembly(
    parsed: Extract<ParsedAssemblyResult, { ok: true }>,
): Promise<{ hydrated: HydratedAssembly; composeKeys: Set<string> } | { error: string }> {
    const pasted = new Map<string, RegisteredAgreement>();
    for (const [key, raw] of Object.entries(parsed.agreements)) {
        if (!isBytes32Hex(key)) continue;
        const doc = anchorRegisteredAgreement(raw, key);
        if (doc) pasted.set(key.toLowerCase(), doc);
    }
    const composeKeys = new Set<string>();
    const hydrated = await hydrateAssembly(parsed.assembly, async (agreementHash) => {
        const key = agreementHash.toLowerCase();
        const local = pasted.get(key);
        if (local) {
            composeKeys.add(key);
            return local;
        }
        return fetchRegisteredAgreement(agreementHash);
    });
    if (!hydrated) {
        return { error: "An agreement binds an agreement that is neither in the pasted composition nor registered on this network's AgreementRegistry." };
    }
    return { hydrated, composeKeys };
}
