/**
 * Test helper: a hydrated assembly from the AUTHORED shape the tests write
 * (`agreements[].clauses` keyed by clause key, `agreements[].follows` the
 * `agreement-<j>` labels of the entries it follows). Each authored agreement
 * becomes a registered agreement over its clauses, and its entry carries the
 * `follows` labels, as the seeding derives a reference assembly
 * (`composeAuthoredAgreement`, `assembleAuthored`) — with no mandatory pick,
 * so a test's clause set is the one it wrote.
 */
import type { Hex } from "viem";
import { agreementHashOf, assemblyHashOf, type RegisteredAgreement, type HydratedAssembly, type AssemblyAgreement } from "../src/assembly.js";
import type { MemberProfileReader } from "../src/memberProfile.js";

export interface AuthoredAssembly {
    name?: string;
    summary?: string;
    description?: string;
    faq?: { question: string; answer: string }[];
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    agreements: { id: string; clauses: Record<Hex, Record<string, unknown>>; follows?: string[] }[];
}

export function hydrateAuthored(authored: AuthoredAssembly): HydratedAssembly {
    const agreements: Record<Hex, RegisteredAgreement> = {};
    const entries: AssemblyAgreement[] = authored.agreements.map((entry) => {
        const clauses = { ...entry.clauses };
        const agreementHash = agreementHashOf({ clauses });
        agreements[agreementHash.toLowerCase() as Hex] = { clauses };
        return { id: entry.id, agreementHash, clauses: {}, follows: [...(entry.follows ?? [])] };
    });
    const { agreements: _authored, ...rest } = authored;
    return { assembly: { ...rest, agreements: entries }, agreements };
}

/** Test helper: a member-profile reader under which every member's profile
 *  binds exactly the given assemblies — what a seller's own profile,
 *  MembersRegistry → metadataURI → IPFS, returns once the seller has bound
 *  them. */
export function profileBinding(...hydrated: HydratedAssembly[]): MemberProfileReader {
    return async (member) => ({
        name: "Test member",
        assemblyBindings: hydrated.map((h, i) => ({
            bindingId: `test-${i}`,
            subjectAddress: member,
            assemblyHash: assemblyHashOf(h.assembly),
        })),
    });
}
