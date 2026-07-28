/**
 * referenceAssemblies.test.ts — conformance for the user-onboarding set
 * (`assemblies/*.json`, the sibling of `clauses/`). Each reference assembly
 * is a canonical AssemblyTemplate the populate path anchors at deploy: it
 * must parse, hash, resolve its topology, compose only clauses that exist,
 * carry the mandatory clauses on every order, and carry the editorial
 * identity a stranger reads first. Affixed documents must reproduce their
 * committed keccak from the shipped bytes.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { planTemplateOrders, templateCompositionHash } from "@figaro/sdk";
import { parseAssemblyTemplateJson } from "@/lib/designer/assemblyTemplateToDraft";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

const ASSEMBLIES_DIR = path.resolve(process.cwd(), "../assemblies");
const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
const DOCUMENTS_DIR = path.join(ASSEMBLIES_DIR, "documents");

const referenceFiles = readdirSync(ASSEMBLIES_DIR).filter((f) => f.endsWith(".json")).sort();
const registeredClauseIds = new Set(
    readdirSync(CLAUSES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/u, "")),
);
// Mandatory folds at the level its scope names (ruled 2026-07-28):
// agreement-scoped mandatory on every ORDER; assembly-scoped mandatory
// (assembly-provenance) once in the template's assemblyClauses.
const mandatorySpecs = readdirSync(CLAUSES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(CLAUSES_DIR, f), "utf8")) as { clauseId: string; block?: { design?: { article?: string; scope?: string } } })
    .filter((s) => s.block?.design?.article === "mandatory");
const mandatoryClauseIds = mandatorySpecs
    .filter((s) => s.block?.design?.scope !== "assembly")
    .map((s) => s.clauseId);
const assemblyMandatoryClauseIds = mandatorySpecs
    .filter((s) => s.block?.design?.scope === "assembly")
    .map((s) => s.clauseId);

describe("reference assemblies — the onboarding set", () => {
    it("the set exists and carries at least the four ruled scenarios", () => {
        expect(referenceFiles.length).toBeGreaterThanOrEqual(4);
        for (const name of ["pos.json", "local-delivery.json", "freelancer.json", "tradelens.json"]) {
            expect(referenceFiles, `${name} is part of the onboarding set`).toContain(name);
        }
    });

    for (const file of referenceFiles) {
        describe(file, () => {
            const raw = readFileSync(path.join(ASSEMBLIES_DIR, file), "utf8");

            it("parses as a sound AssemblyTemplate and its composition hashes", () => {
                const parsed = parseAssemblyTemplateJson(raw);
                expect(parsed.ok, !parsed.ok ? (parsed as { error: string }).error : "").toBe(true);
                expect(templateCompositionHash(JSON.parse(raw) as AssemblyTemplate)).toMatch(/^0x[0-9a-f]{64}$/);
            });

            it("resolves its topology in commit order", () => {
                const template = JSON.parse(raw) as AssemblyTemplate;
                expect(planTemplateOrders(template).length).toBe(template.agreements.length);
            });

            it("composes only clauses that exist, mandatory clauses on every order", () => {
                const template = JSON.parse(raw) as AssemblyTemplate;
                for (const order of template.agreements) {
                    for (const clauseId of Object.keys(order.clauses)) {
                        expect(registeredClauseIds.has(clauseId), `${order.id} composes unknown clause ${clauseId}`).toBe(true);
                    }
                    for (const mandatory of mandatoryClauseIds) {
                        expect(order.clauses, `${order.id} carries mandatory ${mandatory}`).toHaveProperty(mandatory);
                    }
                }
                for (const mandatory of assemblyMandatoryClauseIds) {
                    expect(
                        (template as { assemblyClauses?: Record<string, unknown> }).assemblyClauses ?? {},
                        `the template carries assembly-mandatory ${mandatory} once, at the assembly level`,
                    ).toHaveProperty(mandatory);
                }
            });

            it("carries the editorial identity a stranger reads first", () => {
                const template = JSON.parse(raw) as { name?: string; summary?: string; description?: string };
                for (const field of ["name", "summary", "description"] as const) {
                    expect((template[field] ?? "").trim().length, `${field} is onboarding prose, not blank`).toBeGreaterThan(0);
                }
            });

            it("every affixed document reproduces its committed hash from the shipped bytes", () => {
                const template = JSON.parse(raw) as AssemblyTemplate;
                for (const order of template.agreements) {
                    const documents = (order.clauses["figaro-consent"] as { documents?: Array<{ documentHash?: string; documentUri?: string }> } | undefined)?.documents ?? [];
                    for (const doc of documents) {
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
