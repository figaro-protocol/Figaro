#!/usr/bin/env node
/**
 * drive-live-batch.mjs — drive ONE full batch lifecycle against a PUBLIC
 * chain's deployed stack, through a running sequencer (RELEASE_READINESS
 * Task 7.3(b): one real Groth16 batch settling is the genesis-root +
 * SP1-routing proof).
 *
 * The batch sibling of the direct-path Sepolia smoke: where
 * `sdk/tests/batch-e2e.test.ts` deploys its own mock stack on a devnet anvil,
 * this script deploys NOTHING — every address comes from the committed
 * deployment record, the settlement token is the chain's real one, and the
 * signers are explicitly-passed funded keys. The same invocation runs against
 * a fork of the public chain (layer 2 — the rehearsal; the fork inherits the
 * live balances, so nothing is dealt or mocked) and against the public chain
 * itself (layer 3 — the live settle).
 *
 * Flow (all submissions are signed messages POSTed to the sequencer; the only
 * transactions this script sends are the two token approvals, skipped when the
 * allowance already suffices):
 *   1. Preflight — chain id vs record, sequencer mirror vs on-chain state
 *      root, canonical spec bytes vs the ClauseRegistry anchor, seller's
 *      members stake, balances, exclusion — name every gap and stop before
 *      spending.
 *   2. Approve bonds to FigaroBatchVerifier (buyer 2×payment, seller
 *      2×cumulativeValue).
 *   3. Sign + submit Commit and the RuntimeWitness seller attestation
 *      (EIP-712 over the VERIFIER's domain — the batch universe's domain,
 *      never FigaroCore's).
 *   4. Wait for batch N+1 to settle (a real Groth16 proof: minutes), then
 *      verify the CHAIN facts — bonds pulled, Attestation re-emitted.
 *   5. Sign + submit Resolve + the RPGF usage claim; wait for batch N+2.
 *   6. Verify the chain facts: payout deltas, state root advanced, batch
 *      count, and the usage accrual on the COUNTER's own storage.
 *
 * Env:
 *   RPC_URL               — chain RPC (fork or live) — required
 *   SEQUENCER_URL         — the running sequencer's HTTP API — required
 *   BATCH_BUYER_KEY       — buyer signer (explicit, funded) — required
 *   BATCH_SELLER_KEY      — seller signer (explicit, funded, a registered
 *                           member so the usage claim credits) — required
 *   DEPLOYMENT_RECORD     — path to the deployment record JSON
 *                           (default ../../deployments/11155111.json)
 *   SETTLEMENT_TOKEN      — ERC-20 the order settles in (defaults to Circle's
 *                           Sepolia USDC when the record says 11155111)
 *   PAYMENT               — payment in the token's base units (default 1000000)
 *   WITNESS_CLAUSE        — clause id for the witness attestation
 *                           (default figaro-modalities)
 *   BATCH_WAIT_TIMEOUT_MS — per-batch settle timeout (default 7200000 — a
 *                           local CPU Groth16 proof takes minutes to tens of
 *                           minutes)
 *   RECORDS_DIR           — where the signed records persist (default
 *                           ../batch-records, gitignored). Party custody: the
 *                           relay is a convenience publisher, never the sole
 *                           custodian — the parties keep the struct exactly as
 *                           signed, every signature, and the domain, enough to
 *                           re-verify or re-publish if every relay's archive
 *                           dies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient, createWalletClient, defineChain, http,
    keccak256, hashTypedData, toHex, parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    BATCH_VERIFIER_ABI, CLAUSE_REGISTRY_ABI, ERC20_ABI,
    MEMBERS_REGISTRY_ABI, USAGE_COUNTER_ABI,
    buildCommitment, buildDomain, calculateBonds, computeOrderHash,
    computeAgreementHash, computeClauseKey, canonicalize,
    fetchUsageClaimContext, buildUsageClaims,
} from '@figaro-protocol/sdk';
import { parseClauseSpec, encodeContentFromSpec } from '@figaro-protocol/sdk/clauses';
import { SequencerClient } from '@figaro-protocol/sdk/agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env ─────────────────────────────────────────────────────────────────────

function requireEnv(name) {
    const v = process.env[name];
    if (!v) { console.error(`Missing required env: ${name}`); process.exit(1); }
    return v;
}

const RPC_URL = requireEnv('RPC_URL');
const SEQUENCER_URL = requireEnv('SEQUENCER_URL');
const BUYER_KEY = requireEnv('BATCH_BUYER_KEY');
const SELLER_KEY = requireEnv('BATCH_SELLER_KEY');
const RECORD_PATH = process.env.DEPLOYMENT_RECORD
    ?? path.resolve(__dirname, '../../deployments/11155111.json');
const PAYMENT = BigInt(process.env.PAYMENT ?? '1000000');
const WITNESS_CLAUSE = process.env.WITNESS_CLAUSE ?? 'figaro-modalities';
const BATCH_WAIT_TIMEOUT_MS = Number(process.env.BATCH_WAIT_TIMEOUT_MS ?? 7_200_000);

// Circle's canonical Sepolia USDC — the reference-assembly settlement fill.
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const record = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf-8'));
const TOKEN = process.env.SETTLEMENT_TOKEN
    ?? (record.chainId === 11155111 ? SEPOLIA_USDC : null);
if (!TOKEN) {
    console.error('SETTLEMENT_TOKEN is required for a non-Sepolia record.');
    process.exit(1);
}

// ── Clients ─────────────────────────────────────────────────────────────────

const probe = createPublicClient({ transport: http(RPC_URL) });
const chainId = await probe.getChainId();
const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);
const buyerWallet = createWalletClient({ account: buyerAccount, chain, transport: http(RPC_URL) });
const sellerWallet = createWalletClient({ account: sellerAccount, chain, transport: http(RPC_URL) });
const sequencer = new SequencerClient({ url: SEQUENCER_URL });

const verifier = record.batchVerifier;
const bonds = calculateBonds(PAYMENT, PAYMENT);

// The spec-binding anchor read; not part of the SDK's CLAUSE_REGISTRY_ABI.
const CONTENT_HASH_ABI = parseAbi([
    'function contentHashOf(bytes32 idHash) view returns (bytes32)',
]);

// ── The witness clause: canonical bytes, exactly as anchored ────────────────
// The registry anchors `canonicalContentHash(spec)` — keccak over the
// CANONICAL serialization, not the raw file bytes — so the witness proof must
// carry that same canonical string for the guest's hash to meet the anchor.

const specObject = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, `../../clauses/${WITNESS_CLAUSE}.json`), 'utf-8'));
const specJson = canonicalize(specObject);
const parseResult = parseClauseSpec(specObject);
if (!parseResult.ok) {
    console.error(`spec parse failed: ${JSON.stringify(parseResult.errors)}`);
    process.exit(1);
}
const spec = parseResult.spec;
const clauseKey = computeClauseKey(spec.clauseId, spec.version);

const sectionObject = { modality: 'delivery' };
const sectionData = canonicalize(sectionObject);
const contentRef = keccak256(encodeContentFromSpec(spec, sectionObject, { stage: 0 }));

const agreement = {
    version: 'a1',
    buyer: buyerAccount.address,
    seller: sellerAccount.address,
    sections: [{ clause: spec.clauseId, version: spec.version, data: sectionObject }],
};
const agreementHash = computeAgreementHash(agreement);

const witnessProof = {
    spec_json: specJson,
    content_json: sectionData,
    section_data: sectionData,
    inclusion_proof: [],
    content_kind: 'RuntimeWitness',
};

// ── Preflight — name every gap, stop before spending ────────────────────────

const read = (address, abi, functionName, args = []) =>
    publicClient.readContract({ address, abi, functionName, args });

console.log(`\n── Preflight against ${RPC_URL} (chain ${chainId}) ──`);
const gaps = [];

if (chainId !== record.chainId) {
    gaps.push(`chain id mismatch: RPC says ${chainId}, record says ${record.chainId}`);
}

let status;
try {
    status = await sequencer.status();
} catch (e) {
    console.error(`sequencer unreachable at ${SEQUENCER_URL}: ${e.message ?? e}`);
    process.exit(1);
}

const [stateRoot, batchCount, anchored, deposit, sellerRegistered, excluded,
    currentPeriod, minSellers, tokenDecimals, tokenSymbol] = await Promise.all([
    read(verifier, BATCH_VERIFIER_ABI, 'stateRoot'),
    read(verifier, BATCH_VERIFIER_ABI, 'batchCount'),
    read(record.clauseRegistry, CONTENT_HASH_ABI, 'contentHashOf', [clauseKey]),
    read(record.clauseRegistry, CLAUSE_REGISTRY_ABI, 'depositOf', [clauseKey]),
    read(record.membersRegistry, MEMBERS_REGISTRY_ABI, 'registered', [sellerAccount.address]),
    read(record.usageCounter, USAGE_COUNTER_ABI, 'excludedClauseOrAssembly', [clauseKey]),
    read(record.usageCounter, USAGE_COUNTER_ABI, 'currentPeriod'),
    read(record.usageCounter, USAGE_COUNTER_ABI, 'minSellers'),
    read(TOKEN, ERC20_ABI, 'decimals'),
    read(TOKEN, ERC20_ABI, 'symbol'),
]);

const specHash = keccak256(toHex(specJson));
if (anchored !== specHash) {
    gaps.push(`witness spec drift: registry anchors ${anchored}, canonical local bytes hash ${specHash}`);
}
if (deposit[1] === true || deposit[0] === '0x0000000000000000000000000000000000000000') {
    gaps.push(`${WITNESS_CLAUSE} has no live registry deposit — the usage pre-filter drops the claim`);
}
if (!sellerRegistered) {
    gaps.push(`seller ${sellerAccount.address} holds no live MembersRegistry stake — the usage claim will not credit`);
}
if (excluded) gaps.push(`${WITNESS_CLAUSE} is on the counter's exclusion list`);
if (status.state_root !== stateRoot) {
    gaps.push(`sequencer state-root mirror ${status.state_root} != on-chain ${stateRoot} — stale archive? start it with a fresh ARCHIVE_PATH`);
}

const [buyerToken, sellerToken, buyerEth, sellerEth, verifierToken,
    buyerAllowance, sellerAllowance] = await Promise.all([
    read(TOKEN, ERC20_ABI, 'balanceOf', [buyerAccount.address]),
    read(TOKEN, ERC20_ABI, 'balanceOf', [sellerAccount.address]),
    publicClient.getBalance({ address: buyerAccount.address }),
    publicClient.getBalance({ address: sellerAccount.address }),
    read(TOKEN, ERC20_ABI, 'balanceOf', [verifier]),
    read(TOKEN, ERC20_ABI, 'allowance', [buyerAccount.address, verifier]),
    read(TOKEN, ERC20_ABI, 'allowance', [sellerAccount.address, verifier]),
]);

if (buyerToken < bonds.buyerBond) {
    gaps.push(`buyer holds ${buyerToken} ${tokenSymbol} base units, bond needs ${bonds.buyerBond}`);
}
if (sellerToken < bonds.sellerBond) {
    gaps.push(`seller holds ${sellerToken} ${tokenSymbol} base units, bond needs ${bonds.sellerBond}`);
}
const GAS_FLOOR = 2_000_000_000_000_000n; // 0.002 ETH — one approval + margin
if (buyerEth < GAS_FLOOR) gaps.push(`buyer ETH ${buyerEth} below the ~0.002 approval-gas floor`);
if (sellerEth < GAS_FLOOR) gaps.push(`seller ETH ${sellerEth} below the ~0.002 approval-gas floor`);

const fmt = (v) => `${v} (${Number(v) / 10 ** Number(tokenDecimals)} ${tokenSymbol})`;
console.log(`record:            ${RECORD_PATH}`);
console.log(`verifier:          ${verifier}`);
console.log(`state root:        ${stateRoot}  (batchCount ${batchCount})`);
console.log(`sequencer:         ${SEQUENCER_URL}  (mirror ${status.state_root}, settled ${status.batches_settled}, pending ${status.pending_ops})`);
console.log(`witness clause:    ${spec.clauseId} v${spec.version}  key ${clauseKey}`);
console.log(`buyer:             ${buyerAccount.address}  ${fmt(buyerToken)}`);
console.log(`seller:            ${sellerAccount.address}  ${fmt(sellerToken)}  member=${sellerRegistered}`);
console.log(`payment:           ${fmt(PAYMENT)}  bonds: buyer ${fmt(bonds.buyerBond)}, seller ${fmt(bonds.sellerBond)}`);
console.log(`counter period:    ${currentPeriod}  (minSellers floor ${minSellers})`);
if (batchCount === 0n) {
    console.log('NOTE: batchCount is 0 — no batch has ever settled here; this run is the genesis-root proof.');
}

if (gaps.length > 0) {
    console.error(`\nPreflight found ${gaps.length} gap(s); nothing was spent:`);
    for (const g of gaps) console.error(`  ✗ ${g}`);
    process.exit(1);
}
console.log('preflight:         all checks pass\n');

// ── Approvals (only where the standing allowance falls short) ───────────────

async function approveIfNeeded(wallet, who, allowance, bond) {
    if (allowance >= bond) {
        console.log(`${who} allowance ${allowance} already covers the bond — skipping approve`);
        return;
    }
    const hash = await wallet.writeContract({
        address: TOKEN, abi: ERC20_ABI, functionName: 'approve', args: [verifier, bond],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${who} approve reverted: ${hash}`);
    console.log(`${who} approved ${bond} to the verifier (${hash})`);
}

await approveIfNeeded(buyerWallet, 'buyer', buyerAllowance, bonds.buyerBond);
await approveIfNeeded(sellerWallet, 'seller', sellerAllowance, bonds.sellerBond);

// ── Commit + witness attestation ────────────────────────────────────────────
// Batch-path signatures are over the VERIFIER's EIP-712 domain.

const domain = buildDomain(chainId, verifier);
const chainNow = (await publicClient.getBlock()).timestamp; // chain time, never local
const salt = BigInt(`0x${randomBytes(32).toString('hex')}`);

const { commitment, typedData } = buildCommitment({
    processId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    buyer: buyerAccount.address,
    seller: sellerAccount.address,
    currency: TOKEN,
    payment: PAYMENT,
    expectedCumulativeValue: PAYMENT,
    agreementHash,
    salt,
    deadline: chainNow + 7200n,
}, domain);

const buyerSig = await buyerWallet.signTypedData(typedData);
const sellerSig = await sellerWallet.signTypedData(typedData);
const processId = hashTypedData(typedData); // root order: processId = the signed digest
const orderHash = computeOrderHash(commitment, chainId, verifier);
const startBlock = await publicClient.getBlockNumber();

// Party custody — persisted BEFORE anything reaches the relay, updated as
// each signature is produced. Batch-path signatures are over the VERIFIER's
// domain; the record carries it so a reader verifies against the right one.
const RECORDS_DIR = process.env.RECORDS_DIR ?? path.resolve(__dirname, '../batch-records');
const recordFile = path.join(RECORDS_DIR, `${orderHash}.json`);
const signedRecord = {
    domain: { chainId, verifyingContract: verifier },
    orderHash,
    processId,
    commitment,
    buyerSig,
    sellerSig,
    agreement,
};
function saveRecord(patch) {
    Object.assign(signedRecord, patch);
    fs.mkdirSync(RECORDS_DIR, { recursive: true });
    fs.writeFileSync(recordFile, `${JSON.stringify(
        signedRecord,
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
        2,
    )}\n`);
}
saveRecord({});

const commitResult = await sequencer.submitCommit(commitment, buyerSig, sellerSig);
console.log(`\nsubmitted Commit (op ${commitResult.id})  order ${orderHash}  process ${processId}`);

const attestSig = await sellerWallet.signTypedData({
    domain,
    types: {
        AttestSeller: [
            { name: 'orderHash', type: 'bytes32' },
            { name: 'clauseId', type: 'bytes32' },
            { name: 'stage', type: 'uint8' },
            { name: 'contentRef', type: 'bytes32' },
        ],
    },
    primaryType: 'AttestSeller',
    message: { orderHash, clauseId: clauseKey, stage: 0, contentRef },
});
saveRecord({
    attestation: { clauseId: clauseKey, stage: 0, contentRef, sectionData, sellerSig: attestSig },
});
const attestResult = await sequencer.submitAttestAsSeller({
    role: commitment, target: commitment,
    clauseId: clauseKey, stage: 0, contentRef,
    sellerSig: attestSig, proof: witnessProof,
});
console.log(`submitted AttestAsSeller (op ${attestResult.id})  contentRef ${contentRef}`);

// ── Wait for a batch to settle (real proof: minutes) ────────────────────────

async function waitForSettled(minSettled) {
    const deadline = Date.now() + BATCH_WAIT_TIMEOUT_MS;
    const baseDead = (await sequencer.status()).dead_lettered_ops ?? 0;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const s = await sequencer.status();
            const line = `settled ${s.batches_settled}, pending ${s.pending_ops}, dead ${s.dead_lettered_ops ?? 0}, root ${s.state_root}`;
            if (line !== last) { console.log(`  [${new Date().toISOString()}] ${line}`); last = line; }
            if (s.batches_settled >= minSettled) return s;
            // A death is final — the sequencer dead-letters only failures it
            // classified as deterministic, so waiting out the window would
            // wait on a batch that can never come.
            if ((s.dead_lettered_ops ?? 0) > baseDead) {
                throw new Error(`the sequencer dead-lettered our ops: ${s.last_settle_error ?? '(no reason surfaced)'}`);
            }
        } catch (e) {
            if (/dead-lettered our ops/.test(String(e?.message))) throw e;
            console.log(`  [batch-wait] ${e.message ?? e}`);
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`sequencer did not reach ${minSettled} settled batches within ${BATCH_WAIT_TIMEOUT_MS}ms`);
}

const settledBase = status.batches_settled;
console.log(`\nwaiting for batch ${settledBase + 1} (Groth16 proof — this takes minutes)…`);
await waitForSettled(settledBase + 1);

// ── Chain facts after the commit batch ──────────────────────────────────────

const verifierAfterCommit = await read(TOKEN, ERC20_ABI, 'balanceOf', [verifier]);
const pulled = verifierAfterCommit - verifierToken;
if (pulled !== bonds.buyerBond + bonds.sellerBond) {
    throw new Error(`bond pull mismatch: verifier balance moved ${pulled}, expected ${bonds.buyerBond + bonds.sellerBond}`);
}
console.log(`✓ bonds pulled: verifier holds +${fmt(pulled)}`);

const attestations = await publicClient.getContractEvents({
    address: verifier, abi: BATCH_VERIFIER_ABI, eventName: 'Attestation',
    fromBlock: startBlock,
});
const ours = attestations.filter((l) => l.args.orderHash === orderHash);
if (ours.length !== 1) {
    throw new Error(`expected 1 re-emitted Attestation for ${orderHash} since block ${startBlock}, saw ${ours.length}`);
}
console.log(`✓ Attestation re-emitted on-chain (block ${ours[0].blockNumber}, attester ${ours[0].args.attester})`);

// ── Resolve + RPGF usage claim ──────────────────────────────────────────────

const buyerResolveSig = await buyerWallet.signTypedData({
    domain,
    types: { ResolveProcess: [{ name: 'processId', type: 'bytes32' }] },
    primaryType: 'ResolveProcess',
    message: { processId },
});
saveRecord({ resolution: { processId, buyerSig: buyerResolveSig } });
const resolveResult = await sequencer.submitResolve(processId, [commitment], buyerResolveSig);
console.log(`\nsubmitted Resolve (op ${resolveResult.id})`);

const claimContext = await fetchUsageClaimContext(publicClient, record.usageCounter, agreement);
const claims = buildUsageClaims(commitment, agreement, claimContext);
if (claims.length !== 1 || claims[0].clause_or_assembly !== clauseKey) {
    throw new Error(`expected one usage claim for ${clauseKey}, got ${JSON.stringify(claims)}`);
}
const accrualBefore = await read(record.usageCounter, USAGE_COUNTER_ABI, 'batchAccrualOf', [clauseKey, currentPeriod]);
await sequencer.submitUsageClaim(claims[0]);
console.log(`submitted usage claim for ${spec.clauseId} (period ${currentPeriod})`);

console.log(`\nwaiting for batch ${settledBase + 2}…`);
await waitForSettled(settledBase + 2);

// ── Final chain facts ───────────────────────────────────────────────────────

const [buyerFinal, sellerFinal, verifierFinal, finalRoot, finalCount, accrualAfter] =
    await Promise.all([
        read(TOKEN, ERC20_ABI, 'balanceOf', [buyerAccount.address]),
        read(TOKEN, ERC20_ABI, 'balanceOf', [sellerAccount.address]),
        read(TOKEN, ERC20_ABI, 'balanceOf', [verifier]),
        read(verifier, BATCH_VERIFIER_ABI, 'stateRoot'),
        read(verifier, BATCH_VERIFIER_ABI, 'batchCount'),
        read(record.usageCounter, USAGE_COUNTER_ABI, 'batchAccrualOf', [clauseKey, currentPeriod]),
    ]);

const checks = [
    [`buyer net −payment: ${buyerFinal - buyerToken}`, buyerFinal - buyerToken === -PAYMENT],
    [`seller net +payment: ${sellerFinal - sellerToken}`, sellerFinal - sellerToken === PAYMENT],
    [`verifier retains nothing: ${verifierFinal - verifierToken}`, verifierFinal === verifierToken],
    [`state root advanced: ${finalRoot}`, finalRoot !== stateRoot],
    [`batch count +2: ${finalCount}`, finalCount === batchCount + 2n],
    [`usage accrued on the counter: c ${accrualAfter[0]}, d ${accrualAfter[1]}, score ${accrualAfter[2]}`,
        accrualAfter[0] === accrualBefore[0] + 1n && accrualAfter[1] >= accrualBefore[1]],
    // The score mirrors UsageCounter._score: floored to 0 until the clause has
    // minSellers distinct (buyer, seller) pairs — accrual below the floor is
    // counted, never scored.
    [`score matches the minSellers floor (d ${accrualAfter[1]} vs floor ${minSellers})`,
        (accrualAfter[1] >= minSellers) === (accrualAfter[2] > 0n)],
];
let failed = 0;
for (const [label, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failed++;
}

const page = await sequencer.batches({ limit: 10 });
const recent = page.batches.filter((b) => b.batch > settledBase);
saveRecord({
    settledBatches: recent.map((b) => ({
        batch: b.batch,
        prevStateRoot: b.prev_state_root,
        newStateRoot: b.new_state_root,
        settlementTx: b.settlement_tx,
    })),
});
console.log(`signed records: ${recordFile}`);
console.log(`\n── Settled batches ──`);
for (const b of recent) {
    console.log(`batch ${b.batch}: ${b.prev_state_root} → ${b.new_state_root}`);
    console.log(`  settlement tx: ${b.settlement_tx ?? '(dry run)'}`);
}

if (failed > 0) {
    console.error(`\n${failed} chain-fact check(s) FAILED`);
    process.exit(1);
}
console.log('\nAll chain facts verified — the batch universe settled live.');
