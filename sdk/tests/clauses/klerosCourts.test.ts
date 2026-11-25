/**
 * The clause `figaro-arbitration-kleros` against Kleros's court list on each
 * chain the stack deploys to (`test/fixtures/kleros-courts.json`, read from
 * the KlerosLiquid arbitrator and its PolicyRegistry; the fixture's `holds`
 * and `sources` say how). A court value names a Kleros court by its policy
 * name, never by a court number, so the clause stays the same on every chain
 * and the number is read on the chain where a dispute is raised.
 *
 * What this test holds: the clause against the capture. The fixture is a
 * one-time read of the chains, and nothing in the repository refreshes it,
 * so a court Kleros adds, renames or renumbers after the capture is not seen
 * here until the fixture is read again by hand.
 */
import { describe, expect, it } from "vitest";
import { parseClauseSpec, type EnumFieldSpec, type IntegerFieldSpec } from "../../src/clauses/spec.js";
import klerosSpecRaw from "../../../clauses/figaro-arbitration-kleros.json" with { type: "json" };
import courtList from "../../../test/fixtures/kleros-courts.json" with { type: "json" };

interface Court { id: number; parent: number; name: string; policy: string }
interface Chain { chain: string; chainId: number; minJurorsDefault: number; courts: Court[] }

/** Each court value, as the clause's field description names it: the court's
 *  policy name, after the names of the courts above it (the General Court, the
 *  root, is named alone). */
const NAMED: Record<string, readonly string[]> = {
    general: ["General Court"],
    "blockchain-nontechnical": ["Blockchain", "Non-Technical"],
    "blockchain-technical": ["Blockchain", "Technical"],
    "english-language": ["English Language"],
};

/** The court numbers whose names, read from the root down, are `path` on one chain. */
function courtsNamed(chain: Chain, path: readonly string[]): number[] {
    const byId = new Map(chain.courts.map((c) => [c.id, c]));
    const pathOf = (court: Court): string[] => {
        if (court.id === 0) return [court.name];
        const names: string[] = [];
        for (let c: Court | undefined = court; c && c.id !== 0; c = byId.get(c.parent)) names.unshift(c.name);
        return names;
    };
    return chain.courts.filter((c) => JSON.stringify(pathOf(c)) === JSON.stringify(path)).map((c) => c.id);
}

const parsed = parseClauseSpec(klerosSpecRaw);
if (!parsed.ok) throw new Error("figaro-arbitration-kleros does not parse");
const spec = parsed.spec;
const court = spec.fields.find((f) => f.name === "klerosCourt") as EnumFieldSpec;
const jurors = spec.fields.find((f) => f.name === "klerosMinJurors") as IntegerFieldSpec;
const chains = courtList.chains as Chain[];
const chain = (chainId: number) => chains.find((c) => c.chainId === chainId)!;

describe("figaro-arbitration-kleros — Kleros's published court list", () => {
    it("names every court value, and only those, by its Kleros policy name in the field's description", () => {
        expect([...court.values].sort()).toEqual(Object.keys(NAMED).sort());
        for (const [value, path] of Object.entries(NAMED)) {
            const leaf = `"${path[path.length - 1]}"`;
            const named = path.length === 1 ? `${value} = ${leaf}` : `${value} = ${leaf} under "${path[0]}"`;
            expect(court.description).toContain(named);
        }
        expect(court.description).not.toMatch(/position-as-index/);
    });

    it("on Ethereum mainnet, each court value names exactly one Kleros court", () => {
        const mainnet = chain(1);
        for (const path of Object.values(NAMED)) expect(courtsNamed(mainnet, path)).toHaveLength(1);
    });

    it("a court value's position is not its court number on every chain, so the clause pins no number", () => {
        const mismatched = chains.some((c) =>
            court.values.some((value, position) => courtsNamed(c, NAMED[value]!)[0] !== position),
        );
        expect(mismatched).toBe(true);
    });

    it("on Ethereum Sepolia, only the General Court of the four exists", () => {
        const sepolia = chain(11155111);
        const present = court.values.filter((value) => courtsNamed(sepolia, NAMED[value]!).length === 1);
        expect(present).toEqual(["general"]);
    });

    it("the juror bound lies in what the arbitrator reads, and the default is the arbitrator's own", () => {
        // KlerosLiquid reads a minimum juror count of 0 as MIN_JURORS, so 0 cannot mean 0.
        expect(jurors.min).toBeGreaterThanOrEqual(1);
        for (const c of chains) expect(jurors.default).toBe(c.minJurorsDefault);
    });

    it("the checkout hint names each court as the field's description does, and each chain's arbitrator and PolicyRegistry as Kleros publishes them", () => {
        const hint = klerosSpecRaw.block.checkout.heldValues.klerosCourt;
        expect(hint.reader).toBe("kleros-liquid-policy-courts");
        expect(hint.values).toEqual(NAMED);
        const contracts = hint.contracts as Record<string, { arbitrator: string; policyRegistry: string }>;
        expect(Object.keys(contracts).map(Number).sort()).toEqual(chains.map((c) => c.chainId).sort());
        for (const c of courtList.chains) {
            expect(contracts[String(c.chainId)]!.arbitrator.toLowerCase()).toBe(c.arbitrator.toLowerCase());
            expect(contracts[String(c.chainId)]!.policyRegistry.toLowerCase()).toBe(c.policyRegistry.toLowerCase());
        }
    });

    it("the forum link is Kleros's Dispute Resolver, which serves every chain in the list", () => {
        expect(klerosSpecRaw.block.design.composes.forumUrl).toBe(courtList.forum.url);
        for (const c of chains) expect(courtList.forum.chainIds).toContain(c.chainId);
    });
});
