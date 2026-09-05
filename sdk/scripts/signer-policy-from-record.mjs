#!/usr/bin/env node
// A signer policy for a LOCAL run, derived from that run's deployment record.
// The public reference policy (deployments/signer-policy.11155111.json) pairs
// each contract with the selectors an operated wallet may call; the pairing is
// by record KEY, so the same selectors carry to any record — only the
// addresses, the token, the chain id, the RPC, and the egress change.
//
//   node sdk/scripts/signer-policy-from-record.mjs .deployments/local.json > .deployments/signer-policy.31337.json
//
// The record's `tokenAddress` becomes the policy's token (the approve target);
// a local run's egress is its own RPC and Kubo API. Ceilings are copied from
// the reference policy: raise them in the output if your devnet trades larger.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const recordPath = process.argv[2];
if (!recordPath) { console.error("usage: signer-policy-from-record.mjs <deployment-record.json>"); process.exit(2); }

const reference = JSON.parse(fs.readFileSync(path.join(root, "deployments", "signer-policy.11155111.json"), "utf8"));
const referenceRecord = JSON.parse(fs.readFileSync(path.join(root, "deployments", "11155111.json"), "utf8"));
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

const lower = (a) => String(a).toLowerCase();
// address → record key, from the reference record
const keyOf = new Map(Object.entries(referenceRecord).filter(([, v]) => typeof v === "string" && v.startsWith("0x")).map(([k, v]) => [lower(v), k]));
const token = record.tokenAddress ?? record.token;
if (!token) { console.error("the record names no tokenAddress"); process.exit(1); }

const contracts = {};
const missing = [];
for (const [addr, selectors] of Object.entries(reference.contracts)) {
    if (lower(addr) === lower(reference.token)) { contracts[token] = selectors; continue; }
    const key = keyOf.get(lower(addr));
    if (!key) { missing.push(`${addr} (not in the reference record)`); continue; }
    if (!record[key]) { missing.push(`${key} (not in ${recordPath})`); continue; }
    contracts[record[key]] = selectors;
}
if (missing.length) { console.error(`cannot map: ${missing.join(", ")}`); process.exit(1); }
const verifyingContracts = reference.verifyingContracts.map((a) => record[keyOf.get(lower(a))]);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const policy = {
    chainId: Number(record.chainId ?? 31337),
    verifyingContracts,
    contracts,
    token,
    ceilings: reference.ceilings,
    egress: [rpcUrl, process.env.IPFS_API_URL ?? "http://127.0.0.1:5001"],
    rpcUrl,
};
process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
