/**
 * assemblyTemplateToDraft — hydrates a `DesignSnapshot` from a published
 * assembly TEMPLATE (the no-hash JSON pinned on AssemblyRegistry). Powers the
 * "Fork" button: a published template is fetched, this helper turns it into a
 * localStorage draft under a new slug, and the canvas opens at
 * /assemblies/designer/edit?slug=<new-slug>.
 *
 * The template carries structure (orders + topology parents) + the per-order clause
 * choices, but no agreements and no payment (payment is a runtime value). So
 * each template order is reconstructed into a display Order with a synthetic
 * agreement (built from its clauses + topology parents) seeded into the store so the
 * canvas resolves it by hash; the clause choices are carried into the draft's
 * `clausesByOrderId` so re-opening the fork shows them.
 */

import { planTemplateOrders } from "@figaro-protocol/sdk";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { templateCompositionHash, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { DesignSnapshot } from "./syntheticDesignStore";
import { Order } from "@/lib/kernel/store";
import { buildSyntheticOrder, syntheticAddress } from "./syntheticProcess";

/** 1.0 — display-only payment; the template itself carries none. */
const DISPLAY_PAYMENT = 1_000_000_000_000_000_000n;
const SYNTHETIC_PROCESS_ID = `0x${"00".repeat(32)}` as `0x${string}`;

/**
 * Reconstruct displayable orders from a template: each template order → a
 * synthetic agreement (from its clauses + topology parents) seeded into the store
 * so the canvas resolves it by hash. Used by the fork path and the read-only
 * `/view` resolver.
 */
export function templateToOrders(template: AssemblyTemplate): Order[] {
    // The template is party-agnostic. For DISPLAY (fork / read-only /view) we
    // reconstruct synthetic parties — one shared synthetic buyer (rootBuyer) +
    // a distinct synthetic seller per order. Real parties bind at
    // adoption/checkout, never from the template. The nodes come from the ONE
    // template walk (`planTemplateOrders` — commit order, local parent edges);
    // per-order build→hash→save→assemble is the shared `buildSyntheticOrder`.
    return planTemplateOrders(template).map((planned) =>
        buildSyntheticOrder({
            orderId: planned.nodeId as `0x${string}`,
            processId: SYNTHETIC_PROCESS_ID,
            buyer: syntheticAddress(0),
            seller: syntheticAddress(planned.index + 1),
            currency: ZERO_ADDRESS,
            payment: DISPLAY_PAYMENT,
            salt: BigInt(planned.index + 1),
            clauseFields: planned.clauses as ClauseFields,
            parentOrderHashes: planned.parentLocalIds,
        }).order,
    );
}

export function assemblyTemplateToDraft(
    template: AssemblyTemplate,
    options: { slug: string; name?: string },
): DesignSnapshot {
    const orders = templateToOrders(template);
    return {
        slug: options.slug,
        name: options.name ?? "Forked assembly",
        processId: SYNTHETIC_PROCESS_ID,
        nextOrderIndex: orders.length,
        nextSellerIndex: orders.length + 1,
        orders,
        clausesByOrderId: Object.fromEntries(
            template.agreements.map((to) => [to.id, to.clauses]),
        ),
        // The template's sparse non-1 version picks are part of the clause's
        // identity — a draft that dropped them would silently re-compose
        // against v1.
        clauseVersionsByOrderId: Object.fromEntries(
            template.agreements
                .filter((to) => to.clauseVersions && Object.keys(to.clauseVersions).length > 0)
                .map((to) => [to.id, to.clauseVersions as Record<string, number>]),
        ),
        // Assembly-scoped sections travel as their own level — never smeared
        // onto an order (scope placement is verified at build/publish).
        ...(template.assemblyClauses && Object.keys(template.assemblyClauses).length > 0
            ? { assemblyClauses: template.assemblyClauses }
            : {}),
        ...(template.assemblyClauseVersions && Object.keys(template.assemblyClauseVersions).length > 0
            ? { assemblyClauseVersions: template.assemblyClauseVersions }
            : {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/** Result of parsing pasted template JSON (the composition-assist import). */
export type ParsedTemplateResult =
    | { ok: true; template: AssemblyTemplate }
    | { ok: false; error: string };

/**
 * Parse text pasted as an `AssemblyTemplate` — the composition-assist import
 * surface, where the JSON comes from the designer's own agent rather than a
 * chain-anchored URI (so there is no compositionHash to check integrity
 * against; soundness is the bar). Shape-checks the agreements array, then
 * probes the composition through `templateCompositionHash` — the same walk
 * the registry key uses — so anything it cannot hash is rejected here with a
 * message instead of failing later at publish.
 */
export function parseAssemblyTemplateJson(text: string): ParsedTemplateResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: "Not valid JSON." };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: "A template is a JSON object with an `agreements` array." };
    }
    const agreements = (parsed as { agreements?: unknown }).agreements;
    if (!Array.isArray(agreements) || agreements.length === 0) {
        return { ok: false, error: "A template carries a non-empty `agreements` array — one entry per order." };
    }
    for (const entry of agreements) {
        const id = (entry as { id?: unknown } | null)?.id;
        const clauses = (entry as { clauses?: unknown } | null)?.clauses;
        if (typeof entry !== "object" || entry === null || typeof id !== "string"
            || typeof clauses !== "object" || clauses === null || Array.isArray(clauses)) {
            return { ok: false, error: "Each agreement needs a string `id` and a `clauses` object (clauseId → fields)." };
        }
    }
    const template = parsed as AssemblyTemplate;
    try {
        templateCompositionHash(template);
    } catch (cause) {
        return { ok: false, error: `The composition does not hash: ${extractErrorMessage(cause, "malformed template")}` };
    }
    return { ok: true, template };
}
