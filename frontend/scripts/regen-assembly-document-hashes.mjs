#!/usr/bin/env node
/**
 * regen-assembly-document-hashes.mjs — recompute baked agreementHash fields in
 * the captured fixture assemblyDocs under frontend/scripts/fixtures/ using
 * the current SDK encoder. Run once after a Keystone-style byte-shape
 * change to the clause encoder (e.g. an enum reordering or a struct
 * change in a Category-2 clause).
 *
 * Reads each assemblyDoc, walks every cached Agreement in `agreements[]`,
 * recomputes its hash via `computeAgreementHash`, re-keys the map under
 * the new hash, and updates every order's `agreementHash` reference.
 * Writes the assemblyDoc back in place.
 *
 * Pure off-chain — no Anvil, no dev server. Run:
 *
 *   node frontend/scripts/regen-assembly-document-hashes.mjs
 *
 * Run from the repo root.
 */

import fs from "node:fs";
import path from "node:path";
import { computeAgreementHash } from "@figaro/core";

const FIXTURES_DIR = path.resolve("frontend/scripts/fixtures");

const manifestFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".assembly-document.json"))
    .map((f) => path.join(FIXTURES_DIR, f));

let totalManifests = 0;
let totalAgreements = 0;
let totalOrdersTouched = 0;
let totalHashesChanged = 0;

for (const file of manifestFiles) {
    totalManifests += 1;
    const assemblyDoc = JSON.parse(fs.readFileSync(file, "utf-8"));

    const oldToNew = new Map();
    const newAgreements = {};
    for (const [oldHash, agreement] of Object.entries(assemblyDoc.agreements ?? {})) {
        totalAgreements += 1;
        const newHash = computeAgreementHash(agreement);
        if (newHash.toLowerCase() !== oldHash.toLowerCase()) {
            totalHashesChanged += 1;
        }
        oldToNew.set(oldHash.toLowerCase(), newHash);
        newAgreements[newHash] = agreement;
    }
    assemblyDoc.agreements = newAgreements;

    for (const order of assemblyDoc.orders ?? []) {
        if (!order.agreementHash) continue;
        const remapped = oldToNew.get(order.agreementHash.toLowerCase());
        if (remapped && remapped !== order.agreementHash) {
            order.agreementHash = remapped;
            totalOrdersTouched += 1;
        }
    }

    // 2-space indent matches the live FIGARO_CAPTURE_FIXTURES e2e writer
    // (frontend/lib/designer/...). Stay byte-identical so a future
    // regen-then-capture round-trip produces zero diff.
    fs.writeFileSync(file, JSON.stringify(assemblyDoc, null, 2) + "\n");
    console.log(
        `  ${path.basename(file)}: ${Object.keys(newAgreements).length} agreement(s), ${
            (assemblyDoc.orders ?? []).length
        } order(s)`,
    );
}

console.log("");
console.log(
    `done: ${totalManifests} assemblyDoc(s), ${totalAgreements} agreement(s), ` +
        `${totalHashesChanged} hash change(s), ${totalOrdersTouched} order ref(s) updated.`,
);
