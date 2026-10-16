/**
 * Test helper: a hydrated assembly from the AUTHORED shape the tests write
 * (`agreements[].clauses` keyed by clause key, the topology clause carrying
 * its parents as `order-<j>` labels). Each authored agreement becomes a
 * registered agreement with the `parentOrderHashes` values lifted into its
 * order slot's own fill (the clause stays composed, with `{}`), as the seeding
 * derives a reference assembly (`composeAuthoredAgreement`, `assembleAuthored`)
 * — without the mandatory fold, so a test's clause set is the one it wrote.
 */
import type { Hex } from "viem";
import { agreementKeyOf, type ComposedAgreement, type HydratedAssembly, type TemplateSlot } from "../src/assembly.js";

export interface AuthoredTemplate {
    name?: string;
    summary?: string;
    description?: string;
    faq?: { question: string; answer: string }[];
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    agreements: { id: string; clauses: Record<Hex, Record<string, unknown>> }[];
}

export function hydrateAuthored(authored: AuthoredTemplate): HydratedAssembly {
    const agreements: Record<Hex, ComposedAgreement> = {};
    const slots: TemplateSlot[] = authored.agreements.map((entry) => {
        const clauses: Record<Hex, Record<string, unknown>> = {};
        const fills: Record<Hex, Record<string, unknown>> = {};
        for (const [key, values] of Object.entries(entry.clauses) as [Hex, Record<string, unknown>][]) {
            const { parentOrderHashes, ...rest } = values;
            clauses[key] = rest;
            if (Array.isArray(parentOrderHashes)) fills[key] = { parentOrderHashes };
        }
        const agreementKey = agreementKeyOf({ clauses });
        agreements[agreementKey.toLowerCase() as Hex] = { clauses };
        return { id: entry.id, agreementKey, clauses: fills };
    });
    const { agreements: _authored, ...rest } = authored;
    return { template: { ...rest, agreements: slots }, agreements };
}
