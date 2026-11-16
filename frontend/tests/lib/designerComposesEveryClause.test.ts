/**
 * designerComposesEveryClause.test.ts — an agreement carries exactly the
 * clauses its designer composed.
 *
 * No clause is written into an agreement by the canvas: `figaro-commerce` is
 * a clause like any other, composed or left out by the designer, and no
 * wallet's registration (the DAO's included) decides what an agreement
 * carries. A clause whose `block.design.article` is a word this reader has no
 * rule for — `mandatory` among them — is grouped under that word and composed
 * like any other clause.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";
import { projectSnapshotForReview } from "@/lib/designer/draftToAssembly";
import * as clauseSource from "@/lib/shared/clauseSpecSource";
import { groupClausesByArticle, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { createSyntheticRootOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");

/** One drawn order, composed with `clauses` (clause key → `{}`). */
function snapshotComposing(clauses: Record<string, Record<string, unknown>>): DesignSnapshot {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    return {
        slug: "asm-every-clause",
        name: "One order",
        processId: session.processId,
        nextOrderIndex: session.nextOrderIndex,
        nextSellerIndex: session.nextSellerIndex,
        orders: [root.order],
        createdAt: 1,
        updatedAt: 1,
        clausesByOrderId: { [root.order.orderHash]: clauses },
    };
}

/** The clause keys the one agreement of a review carries. */
function carried(snapshot: DesignSnapshot): string[] {
    const review = projectSnapshotForReview(snapshot);
    if (!review.ok) throw new Error(review.error);
    const [entry] = review.assembly.agreements;
    return Object.keys(review.hydrated.agreements[entry.agreementHash.toLowerCase() as `0x${string}`].clauses).sort();
}

describe("an agreement carries exactly the clauses its designer composed", () => {
    const dao = process.env.NEXT_PUBLIC_DAO_TREASURY;
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-schedule"]);
    });
    afterEach(() => {
        if (dao === undefined) delete process.env.NEXT_PUBLIC_DAO_TREASURY;
        else process.env.NEXT_PUBLIC_DAO_TREASURY = dao;
    });

    it("composes an agreement without the commerce clause, and nothing writes it in", () => {
        expect(carried(snapshotComposing({ [keyOf("figaro-schedule")]: {} }))).toEqual([keyOf("figaro-schedule")]);
    });

    it("composes the commerce clause as it composes any clause, and the review lists it among the designer's picks", () => {
        const snapshot = snapshotComposing({ [keyOf("figaro-commerce")]: {}, [keyOf("figaro-schedule")]: {} });
        expect(carried(snapshot)).toEqual([keyOf("figaro-commerce"), keyOf("figaro-schedule")].sort());
        const review = projectSnapshotForReview(snapshot);
        if (!review.ok) throw new Error(review.error);
        const order = snapshot.orders[0].orderHash;
        expect(Object.keys(review.composedByOrderId[order]).sort()).toEqual([keyOf("figaro-commerce"), keyOf("figaro-schedule")].sort());
        expect(review.withoutLineItems).toEqual([]);
    });

    it("builds the same assembly whatever DAO wallet the build names", () => {
        const snapshot = snapshotComposing({ [keyOf("figaro-schedule")]: {} });
        delete process.env.NEXT_PUBLIC_DAO_TREASURY;
        const unnamed = projectSnapshotForReview(snapshot);
        process.env.NEXT_PUBLIC_DAO_TREASURY = "0xFa648187d49B04fb093266DB0d49e57B3B2403A3";
        const named = projectSnapshotForReview(snapshot);
        if (!unnamed.ok || !named.ok) throw new Error("both compositions build");
        expect(named.assemblyHash).toBe(unnamed.assemblyHash);
    });
});

describe("no code path reads the DAO wallet to decide what an agreement carries", () => {
    it("the clause-spec source exports no rule that writes a clause in", () => {
        expect(Object.keys(clauseSource).filter((name) => name.toLowerCase().includes("mandatory"))).toEqual([]);
    });

    it("no file of the frontend's library, app or components reads the DAO wallet's address", () => {
        const root = path.resolve(process.cwd());
        const readers: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const file = path.join(dir, name);
                if (statSync(file).isDirectory()) walk(file);
                else if (/\.(ts|tsx)$/.test(name) && /daoTreasury|DAO_TREASURY/.test(readFileSync(file, "utf8"))) {
                    readers.push(path.relative(root, file));
                }
            }
        };
        for (const dir of ["lib", "app", "components"]) walk(path.join(root, dir));
        expect(readers).toEqual([]);
    });
});

describe("a stranger's clause whose article is `mandatory` is an ordinary clause", () => {
    let strangerKey: `0x${string}`;
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-schedule"]);
        const commerce = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-commerce.json"), "utf8")) as {
            block: { design: Record<string, unknown> };
        } & Record<string, unknown>;
        const theirs = {
            ...commerce,
            clauseId: "stranger-line-items",
            title: "A stranger's line items",
            block: { ...commerce.block, design: { ...commerce.block.design, article: "mandatory" } },
        };
        const { clauseKey, bytes } = pinSpec(theirs);
        strangerKey = clauseKey;
        const uri = "stranger://mandatory-article";
        setClauseSpecFetcher(async (u) => (u === uri ? bytes : canonicalFileBytes(u)));
        await loadClauseSpec(clauseKey, uri);
    });

    it("is grouped under its own article word, as any article the reader has no rule for", () => {
        const group = groupClausesByArticle().find((g) => g.article === "mandatory");
        expect(group?.clauses.map((c) => c.clauseKey)).toEqual([strangerKey]);
    });

    it("enters an agreement only when the designer composes it, and is then listed among the designer's picks", () => {
        expect(carried(snapshotComposing({ [keyOf("figaro-schedule")]: {} }))).toEqual([keyOf("figaro-schedule")]);
        const snapshot = snapshotComposing({ [strangerKey]: {} });
        expect(carried(snapshot)).toEqual([strangerKey]);
        const review = projectSnapshotForReview(snapshot);
        if (!review.ok) throw new Error(review.error);
        expect(review.composedClausesByOrderId[snapshot.orders[0].orderHash].map((c) => c.clauseKey)).toEqual([strangerKey]);
    });
});
