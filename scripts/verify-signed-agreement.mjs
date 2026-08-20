#!/usr/bin/env node
// verify-signed-agreement.mjs — recompute WHAT YOU ARE SIGNING on your own
// machine, independent of any frontend origin.
//
// Settlement security is UI-independent, but presentation at the signing
// moment is not: a compromised page can DISPLAY agreement D while the wallet
// signs hash(D′). This script moves the trusted display off-origin — you feed
// it the agreement JSON you were shown and the EIP-712 typed data your wallet
// displayed, and it recomputes, from the SDK's canonical primitives alone:
//
//   1. every per-section merkle leaf (so you can see WHAT each hash covers),
//   2. the agreement merkle root (`computeAgreementHash`),
//   3. a MATCH/MISMATCH verdict against the `agreementHash` field inside the
//      typed data your wallet displayed,
//   4. optionally — given the buyer/seller signatures — whether each address
//      really signed the commitment struct hash (`verifyCommitmentSignature`).
//
// Everything cryptographic comes from @figaro-protocol/sdk (the same primitives the
// kernel mirrors); this script only reads files, calls them, and prints.
//
// Usage:
//   node scripts/verify-signed-agreement.mjs \
//     --agreement <agreement.json> --typed-data <typedData.json> \
//     [--buyer-sig 0x…] [--seller-sig 0x…]
//
//   <agreement.json>  The agreement you were shown: {version:"a1", buyer,
//                     seller, sections:[…]} — a pinned payload envelope
//                     carrying it under `.agreement` is also accepted.
//   <typedData.json>  The EIP-712 payload your wallet displayed:
//                     {domain, types, primaryType, message}.
//
// Exit code: 0 = every check passed; 1 = any MISMATCH or INVALID signature.
// Prereq:  sdk/dist built (`cd sdk && npm install && npm run build`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
    buildDomain,
    computeAgreementHash,
    computeOrderHash,
    computeSectionLeaf,
    hashCommitmentStruct,
    sectionDataHash,
    verifyCommitmentSignature,
} = await import(join(repoRoot, "sdk", "dist", "index.js"));

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        const value = argv[i + 1];
        if (!flag?.startsWith("--") || value === undefined) {
            usage(`unexpected argument: ${flag ?? "(none)"}`);
        }
        args[flag.slice(2)] = value;
    }
    return args;
}

function usage(problem) {
    console.error(`✖ ${problem}`);
    console.error(
        "usage: node scripts/verify-signed-agreement.mjs --agreement <file> --typed-data <file> [--buyer-sig 0x…] [--seller-sig 0x…]",
    );
    process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.agreement || !args["typed-data"]) usage("--agreement and --typed-data are required");
for (const sigFlag of ["buyer-sig", "seller-sig"]) {
    if (args[sigFlag] !== undefined && !/^0x[0-9a-fA-F]+$/.test(args[sigFlag])) {
        usage(`--${sigFlag} must be a 0x-prefixed hex signature`);
    }
}

// ── Load inputs ─────────────────────────────────────────────────────────────

function loadJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
        usage(`could not read ${path}: ${err.message}`);
    }
}

const agreementDoc = loadJson(args.agreement);
// Accept the raw Agreement or a pinned payload envelope carrying it inline.
const agreement = agreementDoc?.version === "a1" ? agreementDoc : agreementDoc?.agreement;
if (agreement?.version !== "a1" || !Array.isArray(agreement.sections)) {
    usage(`${args.agreement} is not an "a1" agreement (nor an envelope carrying one under .agreement)`);
}

const typedData = loadJson(args["typed-data"]);
const { domain, message } = typedData ?? {};
if (typedData?.primaryType !== "Commitment" || !domain || !message) {
    usage(`${args["typed-data"]} is not EIP-712 typed data with primaryType "Commitment"`);
}

// Wallets serialize uint256 fields as strings/numbers; the SDK takes bigints.
const commitment = {
    processId: message.processId,
    buyer: message.buyer,
    seller: message.seller,
    currency: message.currency,
    payment: BigInt(message.payment),
    expectedCumulativeValue: BigInt(message.expectedCumulativeValue),
    agreementHash: message.agreementHash,
    salt: BigInt(message.salt),
    deadline: BigInt(message.deadline),
};
const chainId = Number(domain.chainId);
const core = domain.verifyingContract;

let failed = false;
const lower = (h) => String(h).toLowerCase();

// ── 1+2. Per-section leaves + recomputed agreement root ─────────────────────

console.log("Agreement sections — the leaves the agreementHash commits to:");
for (const section of agreement.sections) {
    const withheld = section.data === undefined;
    console.log(`  ${section.clause}@${section.version}${withheld ? "  (content-withheld: fingerprint only)" : ""}`);
    console.log(`    data hash: ${sectionDataHash(section)}`);
    console.log(`    leaf:      ${computeSectionLeaf(section)}`);
}

const recomputedHash = computeAgreementHash(agreement);
console.log(`\nRecomputed agreementHash (merkle root): ${recomputedHash}`);
console.log(`Wallet-displayed agreementHash:         ${commitment.agreementHash}`);

// ── 3. Verdict ──────────────────────────────────────────────────────────────

if (lower(recomputedHash) === lower(commitment.agreementHash)) {
    console.log("VERDICT: MATCH — the hash your wallet displayed commits to exactly the agreement text above.");
} else {
    failed = true;
    console.log("VERDICT: MISMATCH — the hash your wallet displayed does NOT commit to this agreement.");
    console.log("         The page showed you one document and asked your wallet to bind another. Do not sign.");
}

// The canonical domain for this chain + kernel address — if the wallet showed
// a different one, the signature checks below would fail against the kernel too.
const canonicalDomain = buildDomain(chainId, core);
if (domain.name !== canonicalDomain.name || String(domain.version) !== canonicalDomain.version) {
    console.log(
        `note: displayed domain ${JSON.stringify({ name: domain.name, version: domain.version })} differs from the kernel's ` +
        `${JSON.stringify({ name: canonicalDomain.name, version: canonicalDomain.version })} — the kernel would reject these signatures.`,
    );
}

// ── 4. Signature verdicts (optional) ────────────────────────────────────────

const structHash = hashCommitmentStruct(commitment);
console.log(`\nCommitment struct hash (EIP-712 hashStruct): ${structHash}`);
console.log(`On-chain order hash:                         ${computeOrderHash(commitment, chainId, core)}`);

for (const [role, sig] of [["buyer", args["buyer-sig"]], ["seller", args["seller-sig"]]]) {
    const signer = commitment[role];
    if (sig === undefined) {
        console.log(`${role} signature: not provided — skipped (${signer})`);
        continue;
    }
    const valid = await verifyCommitmentSignature(commitment, sig, signer, { chainId, core });
    if (valid) {
        console.log(`${role} signature: VALID — ${signer} signed struct hash ${structHash}`);
    } else {
        failed = true;
        console.log(`${role} signature: INVALID — ${signer} did NOT sign struct hash ${structHash}`);
    }
}

process.exit(failed ? 1 : 0);
