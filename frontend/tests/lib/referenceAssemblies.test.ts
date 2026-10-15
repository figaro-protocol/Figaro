/**
 * referenceAssemblies.test.ts — conformance for the user-onboarding set
 * (`assemblies/*.json`, the sibling of `clauses/`). Each reference assembly
 * is AUTHORED by clause name and derived at seed time into its order slots
 * (`slotsFromAuthoredAgreements` over `clauses/`: names resolved to keys,
 * parents lifted into each order slot, the mandatory clauses folded, each
 * order slot's agreement keyed); derived, it must parse, hash, resolve its
 * topology, compose only clauses that exist, carry the mandatory clauses on
 * every order, and carry the editorial
 * identity a stranger reads first. Affixed documents must reproduce their
 * committed keccak from the shipped bytes.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { canonicalize, planTemplateOrders, slotClauses, templateCompositionHash, type HydratedAssembly } from "@figaro-protocol/sdk";
import { parseAssemblyTemplateJson } from "@/lib/designer/assemblyTemplateToDraft";
import { authoredSpecSet, hydrateAuthored, primeClauseSpecs } from "./primeClauseSpecs";

const ASSEMBLIES_DIR = path.resolve(process.cwd(), "../assemblies");
const DOCUMENTS_DIR = path.join(ASSEMBLIES_DIR, "documents");

const referenceFiles = readdirSync(ASSEMBLIES_DIR).filter((f) => f.endsWith(".json")).sort();
const authored = authoredSpecSet().list();
const registeredClauseKeys = new Set<string>(authored.map((a) => a.clauseKey));
// Mandatory folds at the level its scope names:
// agreement-scoped mandatory on every ORDER; an assembly-scoped mandatory
// clause, when the registry holds one, once in the template's assemblyClauses.
type Design = { block?: { design?: { article?: string; scope?: string } } };
const mandatorySpecs = authored.filter((a) => (a.spec as Design).block?.design?.article === "mandatory");
const mandatoryClauseKeys = mandatorySpecs
    .filter((a) => (a.spec as Design).block?.design?.scope !== "assembly")
    .map((a) => a.clauseKey);
const assemblyMandatoryClauseKeys = mandatorySpecs
    .filter((a) => (a.spec as Design).block?.design?.scope === "assembly")
    .map((a) => a.clauseKey);
const consentKey = authored.find((a) => a.clauseId === "figaro-consent")?.clauseKey;

describe("reference assemblies — the onboarding set", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("the set exists and carries at least the four ruled scenarios", () => {
        expect(referenceFiles.length).toBeGreaterThanOrEqual(4);
        for (const name of ["pos.json", "local-commerce.json", "freelancer.json", "tradelens.json"]) {
            expect(referenceFiles, `${name} is part of the onboarding set`).toContain(name);
        }
    });

    for (const file of referenceFiles) {
        describe(file, () => {
            const authoredRaw = readFileSync(path.join(ASSEMBLIES_DIR, file), "utf8");
            // The seeding's derivation: names → keys over clauses/, order slots keyed.
            const hydrated = (): HydratedAssembly => hydrateAuthored(JSON.parse(authoredRaw) as object);

            it("parses as a sound AssemblyTemplate and its composition hashes", () => {
                const { template, agreements } = hydrated();
                const parsed = parseAssemblyTemplateJson(canonicalize({ template, agreements }));
                expect(parsed.ok, !parsed.ok ? (parsed as { error: string }).error : "").toBe(true);
                expect(templateCompositionHash(template)).toMatch(/^0x[0-9a-f]{64}$/);
            });

            it("resolves its topology in commit order", () => {
                const assembly = hydrated();
                expect(planTemplateOrders(assembly).length).toBe(assembly.template.agreements.length);
            });

            it("composes only clauses that exist, mandatory clauses on every order", () => {
                const assembly = hydrated();
                const template = assembly.template;
                for (const slot of template.agreements) {
                    const order = { id: slot.id, clauses: slotClauses(assembly, slot) };
                    for (const clauseKey of Object.keys(order.clauses)) {
                        expect(registeredClauseKeys.has(clauseKey), `${order.id} composes unknown clause ${clauseKey}`).toBe(true);
                    }
                    for (const mandatory of mandatoryClauseKeys) {
                        expect(order.clauses, `${order.id} carries mandatory ${mandatory}`).toHaveProperty(mandatory);
                    }
                }
                for (const mandatory of assemblyMandatoryClauseKeys) {
                    expect(
                        (template as { assemblyClauses?: Record<string, unknown> }).assemblyClauses ?? {},
                        `the template carries assembly-mandatory ${mandatory} once, at the assembly level`,
                    ).toHaveProperty(mandatory);
                }
            });

            it("carries the editorial identity a stranger reads first", () => {
                const template = hydrated().template as { name?: string; summary?: string; description?: string };
                for (const field of ["name", "summary", "description"] as const) {
                    expect((template[field] ?? "").trim().length, `${field} is onboarding prose, not blank`).toBeGreaterThan(0);
                }
            });

            it("every affixed document reproduces its committed hash from the shipped bytes", () => {
                const assembly = hydrated();
                for (const slot of assembly.template.agreements) {
                    const order = { clauses: slotClauses(assembly, slot) };
                    const documents = (consentKey ? order.clauses[consentKey as `0x${string}`] : undefined) as { documents?: Array<{ documentHash?: string; documentUri?: string }> } | undefined;
                    const consented = documents?.documents ?? [];
                    for (const doc of consented) {
                        // The affixed bytes ship beside the set so the pin —
                        // and therefore the composition — reproduces on any
                        // network.
                        expect(existsSync(DOCUMENTS_DIR), "assemblies/documents/ ships the affixed bytes").toBe(true);
                        const match = readdirSync(DOCUMENTS_DIR).some((f) =>
                            keccak256(new Uint8Array(readFileSync(path.join(DOCUMENTS_DIR, f)))) === doc.documentHash,
                        );
                        expect(match, `a shipped document reproduces ${doc.documentHash}`).toBe(true);
                    }
                }
            });
        });
    }
});
