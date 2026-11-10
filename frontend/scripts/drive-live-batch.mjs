#!/usr/bin/env node
/**
 * drive-live-batch.mjs — drive one order's full batch lifecycle against a
 * PUBLIC chain's deployed stack, through a running relay, in every batch form
 * the env selects (RELEASE_READINESS § Pre-Mainnet: one real Groth16 batch
 * resolving is the genesis-root + SP1-routing proof).
 *
 * The batch sibling of the direct-path Sepolia smoke: where
 * `sdk/tests/batch-e2e.test.ts` deploys its own mock stack on a devnet anvil,
 * this script deploys no protocol contract — every protocol address comes from
 * the committed deployment record, the denomination is the chain's real one,
 * and the signers are explicitly-passed funded keys. The same invocation runs
 * against a fork of the public chain (layer 2 — the rehearsal) and against the
 * public chain itself (layer 3 — the live resolve).
 *
 * Flow (every Figaro operation is a signed message or wallet-code bytes
 * POSTed to the relay; the transactions this script sends are the token
 * approvals, and, for the wallet-code forms only, the delegation and digest
 * approvals described below):
 *   1. Preflight — chain id vs record, relay mirror vs on-chain state root,
 *      canonical spec bytes vs the ClauseRegistry anchor, the seller's member
 *      stake, balances — name every gap and stop before spending.
 *   2. Approve bonds to FigaroBatchVerifier (buyer 2×payment, seller
 *      2×cumulativeValue).
 *   3. Submit the Commit and each selected attestation form (EIP-712 over the
 *      VERIFIER's domain — the batch universe's domain, never FigaroCore's).
 *   4. Wait until the chain carries the order's OrderCommitted and every
 *      selected attestation's Attestation, in whatever batches the relay put
 *      them, then check the chain facts.
 *   5. (optional, fork only) The refusal check: a wallet-code attestation
 *      whose code says no at settlement is skipped and its batch lands.
 *   6. Submit the resolve (signed, or by wallet code) and the RPGF usage
 *      claim; wait for ProcessResolved, then for the counter's accrual to move
 *      (the relay may carry the claim in a later batch than the resolve).
 *   7. Check payouts, the state root, the batch count against the verifier's
 *      own BatchSettled logs, and the accrual; record the batches read from
 *      the verifier's BatchSettled / BatchOperations logs.
 *
 * The forms, and how each is checked on chain:
 *   - Hash-only attestation (the default form; ATTEST_HASH_ONLY): the seller
 *     signs AttestSeller and the relay receives the clauseDataHash and the
 *     inclusion proof alone. Check: one verifier-emitted Attestation for the
 *     order with the seller as attester and this form's contentRef.
 *   - Plaintext attestation (the attesting party's explicit choice,
 *     `checkContentInProof`; ATTEST_PLAINTEXT): the spec, content and
 *     clauseData go to the relay and are validated inside the proof. Same
 *     check, under its own contentRef.
 *     Each hash-only form fingerprints its own small attested document, so
 *     every form's event is told apart by its contentRef; the plaintext
 *     form's contentRef is the spec-encoded content, which the proof checks.
 *   - Wallet-code attestation (ATTEST_BY_WALLET_CODE = seller | buyer |
 *     both): the party's EOA carries code installed by an EIP-7702
 *     delegation; the code is told to validate exactly the role's attestation
 *     digest with fresh random bytes, and the bytes are submitted with
 *     `submitAttestByWalletCode`. Check: the Attestation is emitted with that
 *     party as attester.
 *   - Wallet-code refusal (WALLET_CODE_REFUSAL_CHECK, fork only): a buyer
 *     wallet-code attestation the code validates at the relay's door and at
 *     batch formation, and refuses in the settlement transaction. The relay
 *     asks the code before it batches (prover/sequencer/src/submitter.rs,
 *     `check_wallet_code`), so a refusal can only reach the chain when the
 *     code changes between that ask and the settlement; on a fork the script
 *     makes it so by holding the block (anvil automine off), waiting for the
 *     relay's settleBatch in the pool, and placing ahead of it, at a higher
 *     tip, the buyer's own call that makes its code answer 0xffffffff
 *     (`setBalanceCeiling(token, 0)`: the answer is no while the account
 *     holds more than 0 of the token). The ceiling is set to the maximum
 *     before the submission, so the code takes the same path (it reads the
 *     token balance) when the relay estimates the settlement's gas as when
 *     it refuses: the relay sends settleBatch with the node's gas estimate
 *     and no headroom, so code that costs more at settlement than at the
 *     estimate runs the transaction out of gas instead of being skipped.
 *     Check: the settlement succeeds, its
 *     BatchOperations carries the entry's bytes, and no Attestation is
 *     emitted for the entry (docs/DESIGN_DECISIONS.md § 21, the skip rule).
 *     A live chain cannot hold a block, so the flag refuses to run there.
 *   - Signed resolve (the default): the buyer signs ResolveProcess.
 *   - Wallet-code resolve (RESOLVE_BY_WALLET_CODE): the buyer's code is told
 *     to validate `hashResolveProcess(processId, cumulativeValue)` with fresh
 *     random bytes, submitted with `submitResolveByWalletCode`. Check: the
 *     process resolves and the payouts are those of the signed form.
 *
 * The wallet code. The wallet-code forms need account code that answers
 * ERC-1271 for the party. This script uses `src/mocks/MockERC1271Wallet.sol`,
 * a TEST target: it validates exactly the (digest, bytes) pairs it was told
 * to, and ANYONE can tell it to — so while an EOA is delegated to it, anyone
 * can authorize that EOA's batch resolves and wallet-code attestations. The
 * choice made here:
 *   - The delegate is WALLET_CODE_DELEGATE when set (a MockERC1271Wallet
 *     already deployed), else the script deploys MockERC1271Wallet from the
 *     Foundry artifact (`forge build` writes it under FOUNDRY_OUT).
 *   - Each party that needs code signs an EIP-7702 authorization to the
 *     delegate with its own key and sends it in a type-4 transaction to
 *     itself; the script then approves on the party's own address the exact
 *     digests the run submits, nothing else.
 *   - The script removes every delegation it installed before it exits (an
 *     authorization to the zero address), on success and on failure.
 *   - On a chain that is not an anvil node, the script refuses to delegate
 *     unless WALLET_CODE_LIVE=1 — the operator's explicit acceptance of the
 *     window above for those test keys.
 * Nothing here is a production surface: the mock is never deployed by any
 * deploy script, and no app path reads it.
 *
 * Env:
 *   RPC_URL               — chain RPC (fork or live) — required
 *   SEQUENCER_URL         — the running relay's HTTP API — required
 *   BATCH_BUYER_KEY       — buyer signer (explicit, funded) — required
 *   BATCH_SELLER_KEY      — seller signer (explicit, funded, a registered
 *                           member so the usage claim credits) — required
 *   DEPLOYMENT_RECORD     — path to the deployment record JSON
 *                           (default ../../deployments/11155111.json)
 *   SETTLEMENT_TOKEN      — ERC-20 the order resolves in (defaults to Circle's
 *                           Sepolia USDC when the record says 11155111)
 *   PAYMENT               — payment in the token's base units (default 1000000)
 *   WITNESS_CLAUSE        — the file in clauses/ the witness attestation's
 *                           spec is read from (default figaro-modalities);
 *                           its key is the hash of its canonical bytes
 *   BATCH_WAIT_TIMEOUT_MS — per-wait timeout (default 7200000 — a local CPU
 *                           Groth16 proof takes minutes to tens of minutes)
 *   RECORDS_DIR           — where the signed records persist (default
 *                           ../batch-records, gitignored). Party custody: the
 *                           relay is a convenience publisher, never the sole
 *                           custodian — the parties keep the struct exactly as
 *                           signed, every signature and authorization, and the
 *                           domain, enough to re-verify or re-publish.
 *  The forms (1 = on):
 *   ATTEST_HASH_ONLY          — seller signed attestation, hash-only (default 1)
 *   ATTEST_PLAINTEXT          — seller signed attestation, plaintext (default 1)
 *   ATTEST_BY_WALLET_CODE     — seller | buyer | both | 1 (= seller); default off
 *   RESOLVE_BY_WALLET_CODE    — resolve by the buyer's wallet code (default 0:
 *                               the buyer's signature)
 *   WALLET_CODE_REFUSAL_CHECK — the refusal check above (default 0; fork only)
 *   BATCH_ALL_FORMS           — 1 turns every form above on (wallet-code
 *                               attestation: both parties)
 *  The wallet code:
 *   WALLET_CODE_DELEGATE  — a deployed MockERC1271Wallet to delegate to;
 *                           unset = deploy one from FOUNDRY_OUT
 *   FOUNDRY_OUT           — Foundry's output dir (default ../../out)
 *   WALLET_CODE_LIVE      — 1 allows delegating on a non-anvil chain
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    createPublicClient, createWalletClient, defineChain, http,
    keccak256, hashTypedData, toHex, stringToHex, parseAbi, encodeFunctionData,
    zeroAddress, maxUint256, parseAbiItem,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    BATCH_VERIFIER_ABI, CLAUSE_REGISTRY_ABI, ERC20_ABI,
    MEMBERS_REGISTRY_ABI, USAGE_COUNTER_ABI,
    buildCommitment, buildDomain, calculateBonds, computeOrderHash,
    computeCheckoutHash, computeClauseKey, canonicalize, hashResolveProcess,
    fetchUsageClaimContext, buildUsageClaims, USAGE_KIND_CLAUSE,
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
const flag = (name, dflt) => (process.env[name] ?? dflt) === '1';

const RPC_URL = requireEnv('RPC_URL');
const SEQUENCER_URL = requireEnv('SEQUENCER_URL');
const BUYER_KEY = requireEnv('BATCH_BUYER_KEY');
const SELLER_KEY = requireEnv('BATCH_SELLER_KEY');
const RECORD_PATH = process.env.DEPLOYMENT_RECORD
    ?? path.resolve(__dirname, '../../deployments/11155111.json');
const PAYMENT = BigInt(process.env.PAYMENT ?? '1000000');
const WITNESS_CLAUSE = process.env.WITNESS_CLAUSE ?? 'figaro-modalities';
const BATCH_WAIT_TIMEOUT_MS = Number(process.env.BATCH_WAIT_TIMEOUT_MS ?? 7_200_000);

const ALL = flag('BATCH_ALL_FORMS', '0');
const FORMS = {
    hashOnly: ALL || flag('ATTEST_HASH_ONLY', '1'),
    plaintext: ALL || flag('ATTEST_PLAINTEXT', '1'),
    walletCodeAttest: (() => {
        const v = ALL ? 'both' : (process.env.ATTEST_BY_WALLET_CODE ?? '');
        if (v === '' || v === '0') return [];
        if (v === '1' || v === 'seller') return ['Seller'];
        if (v === 'buyer') return ['Buyer'];
        if (v === 'both') return ['Seller', 'Buyer'];
        console.error(`ATTEST_BY_WALLET_CODE must be seller, buyer, both, 1 or 0; got ${v}`);
        process.exit(1);
    })(),
    resolveByWalletCode: ALL || flag('RESOLVE_BY_WALLET_CODE', '0'),
    refusalCheck: ALL || flag('WALLET_CODE_REFUSAL_CHECK', '0'),
};
const buyerNeedsCode = FORMS.resolveByWalletCode || FORMS.refusalCheck
    || FORMS.walletCodeAttest.includes('Buyer');
const sellerNeedsCode = FORMS.walletCodeAttest.includes('Seller');
const needsCode = buyerNeedsCode || sellerNeedsCode;

// Circle's canonical Sepolia USDC — the reference-assembly denomination fill.
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const record = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf-8'));
const TOKEN = process.env.SETTLEMENT_TOKEN
    ?? (record.chainId === 11155111 ? SEPOLIA_USDC : null);
if (!TOKEN) {
    console.error('SETTLEMENT_TOKEN is required for a non-Sepolia record.');
    process.exit(1);
}

// The test wallet code's surface (src/mocks/MockERC1271Wallet.sol).
const WALLET_CODE_ABI = parseAbi([
    'function approve(bytes32 digest, bytes signature)',
    'function setBalanceCeiling(address token, uint256 ceiling)',
    'function isValidSignature(bytes32 digest, bytes signature) view returns (bytes4)',
]);
const ERC1271_MAGIC = '0x1626ba7e';
// FigaroBatchVerifier's own event (src/core/verifier/FigaroBatchVerifier.sol);
// the SDK's BATCH_VERIFIER_ABI does not carry it.
const BATCH_ACCRUAL_SKIPPED = parseAbiItem('event BatchAccrualSkipped(uint64 indexed batchId, bytes reason)');

// ── Clients ─────────────────────────────────────────────────────────────────

const probe = createPublicClient({ transport: http(RPC_URL) });
const chainId = await probe.getChainId();
const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { retryCount: 6, retryDelay: 2000 }) });
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);
const buyerWallet = createWalletClient({ account: buyerAccount, chain, transport: http(RPC_URL, { retryCount: 6, retryDelay: 2000 }) });
const sellerWallet = createWalletClient({ account: sellerAccount, chain, transport: http(RPC_URL, { retryCount: 6, retryDelay: 2000 }) });
const sequencer = new SequencerClient({ url: SEQUENCER_URL });

// An anvil node answers its own methods; a public chain's RPC refuses them.
const isAnvil = await publicClient.request({ method: 'anvil_nodeInfo' }).then(() => true, () => false);

const verifier = record.batchVerifier;
const bonds = calculateBonds(PAYMENT, PAYMENT);

// ── The witness clause: canonical bytes, exactly as registered ──────────────
// The clause key IS keccak over the spec's CANONICAL serialization (the bytes
// the seeding pinned), so the witness proof carries that same canonical
// string for the guest's hash to meet the key.

const specObject = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, `../../clauses/${WITNESS_CLAUSE}.json`), 'utf-8'));
const specJson = canonicalize(specObject);
const parseResult = parseClauseSpec(specObject);
if (!parseResult.ok) {
    console.error(`spec parse failed: ${JSON.stringify(parseResult.errors)}`);
    process.exit(1);
}
const spec = parseResult.spec;
// Over the raw document (block included), as the seeding pins it — never the
// parsed spec, which drops the presentation slice.
const clauseKey = computeClauseKey(specObject);

const clauseObject = { modality: 'delivery' };
const clauseData = canonicalize(clauseObject);
const clauseDataHash = keccak256(stringToHex(clauseData));

const agreement = {
    version: 'a1',
    buyer: buyerAccount.address,
    seller: sellerAccount.address,
    clauses: [{ clause: clauseKey, data: clauseObject }],
};
const checkoutHash = computeCheckoutHash(agreement);

// The plaintext form, the attesting party's choice: the content is validated
// inside the proof, and the relay receives it (and the proving network, when
// the relay proves there). Its contentRef is the spec-encoded content, which
// the proof checks.
const witnessContent = {
    spec_json: specJson,
    content_json: clauseData,
    clause_data: clauseData,
    content_kind: 'RuntimeWitness',
};
const plaintextContentRef = keccak256(encodeContentFromSpec(spec, clauseObject, { stage: 0 }));

// A hash-only attestation's contentRef is the fingerprint of the document the
// attester keeps off chain. Each hash-only form here attests its own small
// document, so each form's Attestation is told apart by its contentRef.
const runTag = `0x${randomBytes(8).toString('hex')}`;
function attestedDocument(form) {
    const doc = canonicalize({ form, modality: clauseObject.modality, run: runTag });
    return { doc, contentRef: keccak256(stringToHex(doc)) };
}

// ── Preflight — name every gap, stop before spending ────────────────────────

const read = (address, abi, functionName, args = []) =>
    publicClient.readContract({ address, abi, functionName, args });

// The RPC URL often carries a provider key in its path; print its host alone.
console.log(`\n── Preflight against ${new URL(RPC_URL).host} (chain ${chainId}${isAnvil ? ', anvil' : ''}) ──`);
const gaps = [];

if (chainId !== record.chainId) {
    gaps.push(`chain id mismatch: RPC says ${chainId}, record says ${record.chainId}`);
}
if (needsCode && !isAnvil && process.env.WALLET_CODE_LIVE !== '1') {
    gaps.push('a wallet-code form is selected on a non-anvil chain: the test wallet code lets anyone approve digests for a delegated account; set WALLET_CODE_LIVE=1 to accept that for these test keys');
}
if (FORMS.refusalCheck && !isAnvil) {
    gaps.push('WALLET_CODE_REFUSAL_CHECK needs an anvil fork: it holds a block to place a call ahead of the relay\'s settlement');
}

let status;
try {
    status = await sequencer.status();
} catch (e) {
    console.error(`sequencer unreachable at ${SEQUENCER_URL}: ${e.message ?? e}`);
    process.exit(1);
}

const [stateRoot, batchCount, clauseRegistered, deposit, sellerRegistered,
    currentPeriod, minSellers, tokenDecimals, tokenSymbol] = await Promise.all([
    read(verifier, BATCH_VERIFIER_ABI, 'stateRoot'),
    read(verifier, BATCH_VERIFIER_ABI, 'batchCount'),
    read(record.clauseRegistry, CLAUSE_REGISTRY_ABI, 'registered', [clauseKey]),
    read(record.clauseRegistry, CLAUSE_REGISTRY_ABI, 'depositOf', [clauseKey]),
    read(record.membersRegistry, MEMBERS_REGISTRY_ABI, 'registered', [sellerAccount.address]),
    read(record.usageCounter, USAGE_COUNTER_ABI, 'currentPeriod'),
    read(record.usageCounter, USAGE_COUNTER_ABI, 'minSellers'),
    read(TOKEN, ERC20_ABI, 'decimals'),
    read(TOKEN, ERC20_ABI, 'symbol'),
]);

if (keccak256(toHex(specJson)) !== clauseKey) {
    gaps.push(`witness spec bytes do not hash to the clause key ${clauseKey}`);
}
if (!clauseRegistered) {
    gaps.push(`${WITNESS_CLAUSE} (key ${clauseKey}) is not registered — the local spec differs from every registered one, or it was never seeded`);
}
if (deposit[1] === true || deposit[0] === zeroAddress) {
    gaps.push(`${WITNESS_CLAUSE} has no live registry deposit — the usage pre-filter drops the claim`);
}
if (!sellerRegistered) {
    gaps.push(`seller ${sellerAccount.address} holds no live MembersRegistry stake — the usage claim will not credit`);
}
if (status.state_root !== stateRoot) {
    gaps.push(`sequencer state-root mirror ${status.state_root} != on-chain ${stateRoot} — the relay does not hold the state behind the verifier's root (its STATE_PATH file)`);
}

const [buyerToken, sellerToken, buyerEth, sellerEth,
    buyerAllowance, sellerAllowance] = await Promise.all([
    read(TOKEN, ERC20_ABI, 'balanceOf', [buyerAccount.address]),
    read(TOKEN, ERC20_ABI, 'balanceOf', [sellerAccount.address]),
    publicClient.getBalance({ address: buyerAccount.address }),
    publicClient.getBalance({ address: sellerAccount.address }),
    read(TOKEN, ERC20_ABI, 'allowance', [buyerAccount.address, verifier]),
    read(TOKEN, ERC20_ABI, 'allowance', [sellerAccount.address, verifier]),
]);

if (buyerToken < bonds.buyerBond) {
    gaps.push(`buyer holds ${buyerToken} ${tokenSymbol} base units, bond needs ${bonds.buyerBond}`);
}
// The refusal makes the buyer's code answer no while the buyer holds any of
// the token, so the buyer must still hold some after its bond is pulled.
if (FORMS.refusalCheck && buyerToken <= bonds.buyerBond) {
    gaps.push(`the refusal check needs the buyer to hold more than its bond ${bonds.buyerBond}; it holds ${buyerToken}`);
}
if (sellerToken < bonds.sellerBond) {
    gaps.push(`seller holds ${sellerToken} ${tokenSymbol} base units, bond needs ${bonds.sellerBond}`);
}
// One approval + margin; the wallet-code forms add a delegation, its removal,
// a deployment and a few digest approvals.
const GAS_FLOOR = needsCode ? 6_000_000_000_000_000n : 2_000_000_000_000_000n;
if (buyerEth < GAS_FLOOR) gaps.push(`buyer ETH ${buyerEth} below the ~${Number(GAS_FLOOR) / 1e18} gas floor`);
if (sellerEth < GAS_FLOOR) gaps.push(`seller ETH ${sellerEth} below the ~${Number(GAS_FLOOR) / 1e18} gas floor`);

const fmt = (v) => `${v} (${Number(v) / 10 ** Number(tokenDecimals)} ${tokenSymbol})`;
console.log(`record:            ${RECORD_PATH}`);
console.log(`verifier:          ${verifier}`);
console.log(`state root:        ${stateRoot}  (batchCount ${batchCount})`);
console.log(`sequencer:         ${SEQUENCER_URL}  (mirror ${status.state_root}, resolved ${status.batches_settled}, pending ${status.pending_ops}, pending claims ${status.pending_usage_claims})`);
console.log(`witness clause:    ${spec.clauseId} v${spec.version}  key ${clauseKey}`);
console.log(`buyer:             ${buyerAccount.address}  ${fmt(buyerToken)}`);
console.log(`seller:            ${sellerAccount.address}  ${fmt(sellerToken)}  member=${sellerRegistered}`);
console.log(`payment:           ${fmt(PAYMENT)}  bonds: buyer ${fmt(bonds.buyerBond)}, seller ${fmt(bonds.sellerBond)}`);
console.log(`counter period:    ${currentPeriod}  (minSellers floor ${minSellers})`);
console.log(`forms:             hash-only ${FORMS.hashOnly}, plaintext ${FORMS.plaintext}, wallet-code attestation [${FORMS.walletCodeAttest.join(', ')}], wallet-code resolve ${FORMS.resolveByWalletCode}, refusal check ${FORMS.refusalCheck}`);
if (batchCount === 0n) {
    console.log('NOTE: batchCount is 0 — no batch has ever resolved here; this run is the genesis-root proof.');
}

if (gaps.length > 0) {
    console.error(`\nPreflight found ${gaps.length} gap(s); nothing was spent:`);
    for (const g of gaps) console.error(`  ✗ ${g}`);
    process.exit(1);
}
console.log('preflight:         all checks pass\n');

// ── Helpers ─────────────────────────────────────────────────────────────────

async function mined(hash, what) {
    // A slow public node confirms late; a receipt wait outlasts its lag.
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 600_000 });
    if (receipt.status !== 'success') throw new Error(`${what} reverted: ${hash}`);
    return receipt;
}

async function approveIfNeeded(wallet, who, allowance, bond) {
    if (allowance >= bond) {
        console.log(`${who} allowance ${allowance} already covers the bond — skipping approve`);
        return;
    }
    const hash = await wallet.writeContract({
        address: TOKEN, abi: ERC20_ABI, functionName: 'approve', args: [verifier, bond],
    });
    await mined(hash, `${who} approve`);
    console.log(`${who} approved ${bond} to the verifier (${hash})`);
}

/** EIP-7702: the party signs an authorization to `target` with its own key
 *  and sends it in a type-4 transaction to itself. `target` zero removes the
 *  delegation. */
async function setDelegation(wallet, account, target) {
    const authorization = await wallet.signAuthorization({
        account, contractAddress: target, executor: 'self',
    });
    const hash = await wallet.sendTransaction({
        authorizationList: [authorization],
        to: account.address,
        // A call the delegate answers (a no-op ceiling reset); empty when
        // removing, since the account then has no code.
        data: target === zeroAddress ? '0x' : encodeFunctionData({
            abi: WALLET_CODE_ABI, functionName: 'setBalanceCeiling', args: [zeroAddress, 0n],
        }),
    });
    await mined(hash, `delegation of ${account.address} to ${target}`);
    const code = (await publicClient.getCode({ address: account.address })) ?? '0x';
    const expected = target === zeroAddress ? '0x' : `0xef0100${target.slice(2).toLowerCase()}`;
    if (code.toLowerCase() !== expected) {
        throw new Error(`delegation of ${account.address} reads ${code}, expected ${expected}`);
    }
    return hash;
}

/** Tell the party's code to validate exactly `authorization` for `digest`,
 *  and check that it now answers the ERC-1271 magic value. */
async function approveDigest(wallet, account, digest, authorization) {
    const hash = await wallet.writeContract({
        address: account.address, abi: WALLET_CODE_ABI, functionName: 'approve', args: [digest, authorization],
    });
    await mined(hash, `digest approval on ${account.address}`);
    const answer = await read(account.address, WALLET_CODE_ABI, 'isValidSignature', [digest, authorization]);
    if (answer !== ERC1271_MAGIC) throw new Error(`${account.address}'s code answers ${answer} for ${digest} after approval`);
}

function attestTypedData(role, { orderHash, processId, contentRef }) {
    if (role === 'Seller') {
        return {
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
        };
    }
    return {
        domain,
        types: {
            AttestBuyer: [
                { name: 'processId', type: 'bytes32' },
                { name: 'orderHash', type: 'bytes32' },
                { name: 'clauseId', type: 'bytes32' },
                { name: 'stage', type: 'uint8' },
                { name: 'contentRef', type: 'bytes32' },
            ],
        },
        primaryType: 'AttestBuyer',
        message: { processId, orderHash, clauseId: clauseKey, stage: 0, contentRef },
    };
}

const freshBytes = () => `0x${randomBytes(48).toString('hex')}`;

/** Poll `check` until it returns a value, failing early when the relay
 *  dead-letters operations or drops usage claims during the wait. */
async function waitUntil(label, check, { watchClaims = false } = {}) {
    const deadline = Date.now() + BATCH_WAIT_TIMEOUT_MS;
    const base = await sequencer.status();
    const baseDead = base.dead_lettered_ops ?? 0;
    const baseDropped = base.dropped_usage_claims ?? 0;
    let last = '';
    console.log(`\nwaiting for ${label}…`);
    while (Date.now() < deadline) {
        const found = await check();
        if (found) return found;
        try {
            const s = await sequencer.status();
            const line = `resolved ${s.batches_settled}, pending ${s.pending_ops}, claims ${s.pending_usage_claims}, dead ${s.dead_lettered_ops ?? 0}, dropped claims ${s.dropped_usage_claims ?? 0}`;
            if (line !== last) { console.log(`  [${new Date().toISOString()}] ${line}`); last = line; }
            // A death is final — the relay dead-letters only failures it
            // classified as deterministic.
            if ((s.dead_lettered_ops ?? 0) > baseDead) {
                throw new Error(`the relay dead-lettered operations while waiting for ${label}: ${s.last_settle_error ?? '(no reason surfaced)'}`);
            }
            if (watchClaims && (s.dropped_usage_claims ?? 0) > baseDropped) {
                throw new Error(`the relay dropped usage claims while waiting for ${label}: ${s.last_dropped_claim_error ?? '(no reason surfaced)'}`);
            }
        } catch (e) {
            if (/while waiting for/.test(String(e?.message))) throw e;
            console.log(`  [wait] ${e.message ?? e}`);
        }
        await new Promise((r) => setTimeout(r, 4000));
    }
    throw new Error(`${label} did not happen within ${BATCH_WAIT_TIMEOUT_MS}ms`);
}

const events = (eventName, args, fromBlock) => publicClient.getContractEvents({
    address: verifier, abi: BATCH_VERIFIER_ABI, eventName, args, fromBlock,
});

let failed = 0;
function check(label, ok) {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failed++;
}

// ── Approvals (only where the standing allowance falls short) ───────────────

await approveIfNeeded(buyerWallet, 'buyer', buyerAllowance, bonds.buyerBond);
await approveIfNeeded(sellerWallet, 'seller', sellerAllowance, bonds.sellerBond);

// ── The order ───────────────────────────────────────────────────────────────
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
    checkoutHash,
    salt,
    deadline: chainNow + 7200n,
}, domain);

const buyerSig = await buyerWallet.signTypedData(typedData);
const sellerSig = await sellerWallet.signTypedData(typedData);
const processId = hashTypedData(typedData); // root order: processId = the signed digest
const orderHash = computeOrderHash(commitment, chainId, verifier);
const startBlock = await publicClient.getBlockNumber();

// Party custody — persisted BEFORE anything reaches the relay, updated as
// each signature or authorization is produced. Batch-path signatures are over
// the VERIFIER's domain; the record carries it so a reader verifies against
// the right one.
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
    attestations: [],
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

// Every delegation installed is removed before exit, whatever happens.
const delegated = [];
let automineHeld = false;
try {
    // ── The wallet code (only when a wallet-code form is selected) ───────────
    if (needsCode) {
        let delegate = process.env.WALLET_CODE_DELEGATE;
        if (!delegate) {
            const artifactPath = path.resolve(
                process.env.FOUNDRY_OUT ?? path.resolve(__dirname, '../../out'),
                'MockERC1271Wallet.sol/MockERC1271Wallet.json',
            );
            if (!fs.existsSync(artifactPath)) {
                throw new Error(`no WALLET_CODE_DELEGATE and no artifact at ${artifactPath} — run forge build`);
            }
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
            const hash = await buyerWallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object });
            delegate = (await mined(hash, 'MockERC1271Wallet deployment')).contractAddress;
            console.log(`deployed the test wallet code MockERC1271Wallet at ${delegate}`);
        }
        saveRecord({ walletCodeDelegate: delegate });
        for (const [needed, wallet, account, who] of [
            [buyerNeedsCode, buyerWallet, buyerAccount, 'buyer'],
            [sellerNeedsCode, sellerWallet, sellerAccount, 'seller'],
        ]) {
            if (!needed) continue;
            delegated.push([wallet, account, who]);
            const hash = await setDelegation(wallet, account, delegate);
            console.log(`${who} ${account.address} delegated to ${delegate} (EIP-7702, ${hash})`);
        }
    }

    // ── Commit + the attestation forms ──────────────────────────────────────

    const commitResult = await sequencer.submitCommit(commitment, buyerSig, sellerSig);
    console.log(`\nsubmitted Commit (op ${commitResult.id})  order ${orderHash}  process ${processId}`);

    // Each expected Attestation: who attests, under which contentRef.
    const expected = [];

    if (FORMS.hashOnly) {
        const { doc, contentRef } = attestedDocument('hash-only');
        const sig = await sellerWallet.signTypedData(attestTypedData('Seller', { orderHash, processId, contentRef }));
        signedRecord.attestations.push({ form: 'hash-only', role: 'Seller', clauseId: clauseKey, stage: 0, contentRef, document: doc, clauseData, sellerSig: sig });
        saveRecord({});
        const r = await sequencer.submitAttestAsSeller({
            target: commitment, clauseId: clauseKey, stage: 0, contentRef,
            sellerSig: sig, clauseDataHash, inclusionProof: [],
        });
        console.log(`submitted AttestAsSeller, hash-only (op ${r.id})  contentRef ${contentRef}`);
        expected.push({ label: 'hash-only seller attestation', attester: sellerAccount.address, contentRef });
    }

    if (FORMS.plaintext) {
        const contentRef = plaintextContentRef;
        const sig = await sellerWallet.signTypedData(attestTypedData('Seller', { orderHash, processId, contentRef }));
        signedRecord.attestations.push({ form: 'plaintext', role: 'Seller', clauseId: clauseKey, stage: 0, contentRef, clauseData, sellerSig: sig });
        saveRecord({});
        const r = await sequencer.submitAttestAsSeller({
            target: commitment, clauseId: clauseKey, stage: 0, contentRef,
            sellerSig: sig, clauseDataHash, inclusionProof: [],
            checkContentInProof: witnessContent,
        });
        console.log(`submitted AttestAsSeller, plaintext (op ${r.id})  contentRef ${contentRef}`);
        expected.push({ label: 'plaintext seller attestation', attester: sellerAccount.address, contentRef });
    }

    for (const role of FORMS.walletCodeAttest) {
        const [wallet, account] = role === 'Seller' ? [sellerWallet, sellerAccount] : [buyerWallet, buyerAccount];
        const { doc, contentRef } = attestedDocument(`wallet-code-${role.toLowerCase()}`);
        const digest = hashTypedData(attestTypedData(role, { orderHash, processId, contentRef }));
        const authorization = freshBytes();
        await approveDigest(wallet, account, digest, authorization);
        signedRecord.attestations.push({ form: 'wallet-code', role, clauseId: clauseKey, stage: 0, contentRef, document: doc, clauseData, digest, authorization });
        saveRecord({});
        const r = await sequencer.submitAttestByWalletCode({
            role, target: commitment, clauseId: clauseKey, stage: 0, contentRef,
            authorization, clauseDataHash, inclusionProof: [],
        });
        console.log(`submitted AttestByWalletCode, ${role.toLowerCase()} (op ${r.id})  contentRef ${contentRef}`);
        expected.push({ label: `wallet-code ${role.toLowerCase()} attestation`, attester: account.address, contentRef });
    }

    // The relay may put the commit and each attestation in different batches:
    // wait on the chain facts themselves, never on a batch count.
    const attestationsOf = () => events('Attestation', { orderHash }, startBlock);
    const sameAddr = (a, b) => a.toLowerCase() === b.toLowerCase();
    await waitUntil('the order commit and every attestation on chain (a real Groth16 proof takes minutes)', async () => {
        const [committed, atts] = await Promise.all([events('OrderCommitted', { orderHash }, startBlock), attestationsOf()]);
        if (committed.length === 0) return null;
        const all = expected.every((e) => atts.some((l) => sameAddr(l.args.attester, e.attester) && l.args.contentRef === e.contentRef));
        return all ? true : null;
    });

    // ── Chain facts after the commit ────────────────────────────────────────

    const [buyerAfterCommit, sellerAfterCommit] = await Promise.all([
        read(TOKEN, ERC20_ABI, 'balanceOf', [buyerAccount.address]),
        read(TOKEN, ERC20_ABI, 'balanceOf', [sellerAccount.address]),
    ]);
    check(`buyer bond pulled: ${fmt(buyerToken - buyerAfterCommit)}`, buyerToken - buyerAfterCommit === bonds.buyerBond);
    check(`seller bond pulled: ${fmt(sellerToken - sellerAfterCommit)}`, sellerToken - sellerAfterCommit === bonds.sellerBond);
    const atts = await attestationsOf();
    for (const e of expected) {
        const ours = atts.filter((l) => sameAddr(l.args.attester, e.attester) && l.args.contentRef === e.contentRef);
        check(`${e.label}: ${ours.length} Attestation re-emitted (attester ${e.attester}, clause ${ours[0]?.args.clauseId === clauseKey ? 'matches' : 'MISMATCH'}, process ${ours[0]?.args.processId === processId ? 'matches' : 'MISMATCH'}, block ${ours[0]?.blockNumber})`,
            ours.length === 1 && ours[0].args.clauseId === clauseKey && ours[0].args.processId === processId && ours[0].args.stage === 0);
    }

    // ── The refusal check (fork only) ───────────────────────────────────────

    if (FORMS.refusalCheck) {
        const { doc, contentRef } = attestedDocument('wallet-code-refused');
        const digest = hashTypedData(attestTypedData('Buyer', { orderHash, processId, contentRef }));
        const authorization = freshBytes();
        await approveDigest(buyerWallet, buyerAccount, digest, authorization);
        // Yes while the buyer holds at most the maximum: the code reads the
        // balance now, as it will when it refuses.
        await mined(await buyerWallet.writeContract({
            address: buyerAccount.address, abi: WALLET_CODE_ABI, functionName: 'setBalanceCeiling', args: [TOKEN, maxUint256],
        }), 'ceiling at the maximum');
        signedRecord.attestations.push({ form: 'wallet-code-refused', role: 'Buyer', clauseId: clauseKey, stage: 0, contentRef, document: doc, clauseData, digest, authorization });
        saveRecord({});

        // Hold the block, so the relay's settlement waits in the pool.
        await publicClient.request({ method: 'evm_setAutomine', params: [false] });
        automineHeld = true;
        const r = await sequencer.submitAttestByWalletCode({
            role: 'Buyer', target: commitment, clauseId: clauseKey, stage: 0, contentRef,
            authorization, clauseDataHash, inclusionProof: [],
        });
        console.log(`\nsubmitted AttestByWalletCode, buyer, to be refused at settlement (op ${r.id})  contentRef ${contentRef}`);

        const settleTx = await waitUntil('the relay\'s settleBatch in the held pool', async () => {
            const pool = await publicClient.request({ method: 'txpool_content', params: [] });
            for (const byNonce of Object.values(pool.pending ?? {})) {
                for (const tx of Object.values(byNonce)) {
                    if (tx.to && sameAddr(tx.to, verifier)) return tx;
                }
            }
            return null;
        });
        // Ahead of it, at a higher tip: the buyer's code now answers no.
        const tip = BigInt(settleTx.maxPriorityFeePerGas ?? settleTx.gasPrice);
        const cap = BigInt(settleTx.maxFeePerGas ?? settleTx.gasPrice);
        const refuseHash = await buyerWallet.sendTransaction({
            to: buyerAccount.address,
            data: encodeFunctionData({ abi: WALLET_CODE_ABI, functionName: 'setBalanceCeiling', args: [TOKEN, 0n] }),
            maxPriorityFeePerGas: tip * 2n + 1_000_000_000n,
            maxFeePerGas: cap * 2n + 2_000_000_000n,
            gas: 100_000n,
        });
        await publicClient.request({ method: 'evm_mine', params: [] });
        await publicClient.request({ method: 'evm_setAutomine', params: [true] });
        automineHeld = false;

        const [refuseReceipt, settleReceipt] = await Promise.all([
            publicClient.waitForTransactionReceipt({ hash: refuseHash }),
            publicClient.waitForTransactionReceipt({ hash: settleTx.hash }),
        ]);
        const refusedAnswer = await read(buyerAccount.address, WALLET_CODE_ABI, 'isValidSignature', [digest, authorization]);
        check(`refusal placed ahead of the settlement (block ${refuseReceipt.blockNumber}, index ${refuseReceipt.transactionIndex} < ${settleReceipt.transactionIndex}); the code now answers ${refusedAnswer}`,
            refuseReceipt.status === 'success' && refuseReceipt.blockNumber === settleReceipt.blockNumber
            && refuseReceipt.transactionIndex < settleReceipt.transactionIndex && refusedAnswer !== ERC1271_MAGIC);
        const inTx = (logs) => logs.filter((l) => l.transactionHash === settleTx.hash);
        const [settledLogs, opsLogs, attLogs] = await Promise.all([
            events('BatchSettled', undefined, settleReceipt.blockNumber).then(inTx),
            events('BatchOperations', undefined, settleReceipt.blockNumber).then(inTx),
            attestationsOf().then(inTx),
        ]);
        check(`the batch carrying the refused entry landed (status ${settleReceipt.status}, batch ${settledLogs[0]?.args.batchId})`,
            settleReceipt.status === 'success' && settledLogs.length === 1);
        check('its BatchOperations stream carries the refused entry\'s bytes',
            opsLogs.length === 1 && opsLogs[0].args.operations.toLowerCase().includes(authorization.slice(2).toLowerCase()));
        check('no Attestation was emitted for the refused entry',
            settleReceipt.status === 'success' && !attLogs.some((l) => l.args.contentRef === contentRef) && !(await attestationsOf()).some((l) => l.args.contentRef === contentRef));
        // The buyer's code answers yes again for every digest it approved.
        await mined(await buyerWallet.writeContract({
            address: buyerAccount.address, abi: WALLET_CODE_ABI, functionName: 'setBalanceCeiling', args: [zeroAddress, 0n],
        }), 'ceiling reset');
    }

    // ── Resolve + RPGF usage claim ──────────────────────────────────────────

    // The process holds the one order: its cumulative value is that order's
    // expected cumulative value, and the buyer authorizes it.
    const cumulativeValue = commitment.expectedCumulativeValue;
    if (FORMS.resolveByWalletCode) {
        const digest = hashResolveProcess(processId, cumulativeValue, { chainId, core: verifier });
        const authorization = freshBytes();
        await approveDigest(buyerWallet, buyerAccount, digest, authorization);
        saveRecord({ resolution: { form: 'wallet-code', processId, cumulativeValue: cumulativeValue.toString(), digest, authorization } });
        const r = await sequencer.submitResolveByWalletCode(processId, cumulativeValue, [commitment], authorization);
        console.log(`\nsubmitted ResolveByWalletCode (op ${r.id})`);
    } else {
        const buyerResolveSig = await buyerWallet.signTypedData({
            domain,
            types: {
                ResolveProcess: [
                    { name: 'processId', type: 'bytes32' },
                    { name: 'cumulativeValue', type: 'uint256' },
                ],
            },
            primaryType: 'ResolveProcess',
            message: { processId, cumulativeValue },
        });
        saveRecord({ resolution: { form: 'signed', processId, cumulativeValue: cumulativeValue.toString(), buyerSig: buyerResolveSig } });
        const r = await sequencer.submitResolve(processId, cumulativeValue, [commitment], buyerResolveSig);
        console.log(`\nsubmitted Resolve (op ${r.id})`);
    }

    const claimContext = await fetchUsageClaimContext(publicClient, record.usageCounter, agreement);
    const claims = buildUsageClaims(commitment, agreement, claimContext);
    if (claims.length !== 1 || claims[0].clause_or_assembly !== clauseKey) {
        throw new Error(`expected one usage claim for ${clauseKey}, got ${JSON.stringify(claims)}`);
    }
    const accrualKey = [USAGE_KIND_CLAUSE, clauseKey, currentPeriod];
    const accrualBefore = await read(record.usageCounter, USAGE_COUNTER_ABI, 'accrualOf', accrualKey);
    const claimBlock = await publicClient.getBlockNumber();
    await sequencer.submitUsageClaim(claims[0]);
    console.log(`submitted usage claim for ${spec.clauseId} (period ${currentPeriod})`);

    const resolved = await waitUntil('the process to resolve on chain', async () => {
        const logs = await events('ProcessResolved', { processId }, startBlock);
        return logs[0] ?? null;
    });

    // The relay may carry the claim in the resolve's batch or a later one:
    // wait for the counter itself to move. A batch whose accrual the counter
    // refused names it in BatchAccrualSkipped; that is a failure, not a wait.
    const accrualAfter = await waitUntil('the usage accrual on the counter', async () => {
        const skipped = await publicClient.getLogs({ address: verifier, event: BATCH_ACCRUAL_SKIPPED, fromBlock: claimBlock });
        if (skipped.length > 0) {
            throw new Error(`the counter skipped a batch's accrual since the claim (batch ${skipped[0].args.batchId}, reason ${skipped[0].args.reason}) — while waiting for the usage accrual`);
        }
        const a = await read(record.usageCounter, USAGE_COUNTER_ABI, 'accrualOf', accrualKey);
        return a[0] > accrualBefore[0] ? a : null;
    }, { watchClaims: true });

    // ── Final chain facts ───────────────────────────────────────────────────

    const [buyerFinal, sellerFinal, finalRoot, finalCount, orderResolved, settled, ops] =
        await Promise.all([
            read(TOKEN, ERC20_ABI, 'balanceOf', [buyerAccount.address]),
            read(TOKEN, ERC20_ABI, 'balanceOf', [sellerAccount.address]),
            read(verifier, BATCH_VERIFIER_ABI, 'stateRoot'),
            read(verifier, BATCH_VERIFIER_ABI, 'batchCount'),
            events('OrderResolved', { orderHash }, startBlock),
            events('BatchSettled', undefined, startBlock),
            events('BatchOperations', undefined, startBlock),
        ]);

    check(`process resolved by ${FORMS.resolveByWalletCode ? 'the buyer\'s wallet code' : 'the buyer\'s signature'} (ProcessResolved buyer ${resolved.args.buyer}, orders ${resolved.args.orderCount})`,
        sameAddr(resolved.args.buyer, buyerAccount.address) && resolved.args.orderCount === 1n);
    check(`OrderResolved payouts: seller ${orderResolved[0]?.args.sellerPayout}, buyer ${orderResolved[0]?.args.buyerPayout}`,
        orderResolved.length === 1
        && orderResolved[0].args.sellerPayout === bonds.sellerBond + PAYMENT
        && orderResolved[0].args.buyerPayout === bonds.buyerBond - PAYMENT);
    check(`buyer net −payment: ${buyerFinal - buyerToken}`, buyerFinal - buyerToken === -PAYMENT);
    check(`seller net +payment: ${sellerFinal - sellerToken}`, sellerFinal - sellerToken === PAYMENT);
    check(`state root advanced: ${finalRoot}`, finalRoot !== stateRoot);
    // Other parties' batches may land meanwhile: the count must grow by
    // exactly the BatchSettled logs the verifier emitted since the start.
    check(`batch count ${batchCount} → ${finalCount}, matching the ${settled.length} BatchSettled log(s) since block ${startBlock}`,
        finalCount - batchCount === BigInt(settled.length));
    check(`usage accrued on the counter: c ${accrualBefore[0]} → ${accrualAfter[0]}, d ${accrualAfter[1]}, score ${accrualAfter[2]}`,
        accrualAfter[0] === accrualBefore[0] + 1n && accrualAfter[1] >= accrualBefore[1]);
    // The score mirrors UsageCounter._score: floored to 0 until the clause has
    // minSellers distinct (buyer, seller) pairs — accrual below the floor is
    // counted, never scored.
    check(`score matches the minSellers floor (d ${accrualAfter[1]} vs floor ${minSellers})`,
        (accrualAfter[1] >= minSellers) === (accrualAfter[2] > 0n));

    // ── The batches, from the verifier's own logs ──────────────────────────
    // BatchSettled names each batch and its roots; BatchOperations, in the
    // same transaction, carries its operation stream. A batch is ours when it
    // emitted one of this order's events or its stream carries the order (its
    // commitment's salt, which is random per run) — a refused entry emits none.
    const ourTxs = new Set([
        ...(await events('OrderCommitted', { orderHash }, startBlock)),
        ...(await attestationsOf()),
        ...orderResolved,
    ].map((l) => l.transactionHash));
    const saltWord = salt.toString(16).padStart(64, '0');
    const batches = settled.map((s) => {
        const stream = ops.find((o) => o.transactionHash === s.transactionHash);
        return {
            batch: Number(s.args.batchId),
            prevStateRoot: s.args.prevStateRoot,
            newStateRoot: s.args.newStateRoot,
            resolutionTx: s.transactionHash,
            block: Number(s.blockNumber),
            operationsBytes: stream ? (stream.args.operations.length - 2) / 2 : null,
            carriesThisOrder: ourTxs.has(s.transactionHash)
                || (stream?.args.operations.toLowerCase().includes(saltWord) ?? false),
        };
    });
    saveRecord({ settledBatches: batches });
    console.log(`signed records: ${recordFile}`);
    console.log(`\n── Resolved batches since block ${startBlock} ──`);
    for (const b of batches) {
        console.log(`batch ${b.batch}${b.carriesThisOrder ? ' (this order)' : ''}: ${b.prevStateRoot} → ${b.newStateRoot}`);
        console.log(`  resolve tx: ${b.resolutionTx}  stream ${b.operationsBytes} bytes`);
    }
} finally {
    if (automineHeld) {
        await publicClient.request({ method: 'evm_setAutomine', params: [true] }).catch(() => {});
    }
    for (const [wallet, account, who] of delegated) {
        try {
            const hash = await setDelegation(wallet, account, zeroAddress);
            console.log(`${who} ${account.address} delegation removed (${hash})`);
        } catch (e) {
            failed++;
            console.error(`✗ could not remove the ${who}'s delegation: ${e.message ?? e} — remove it by hand (an EIP-7702 authorization to the zero address)`);
        }
    }
}

if (failed > 0) {
    console.error(`\n${failed} chain-fact check(s) FAILED`);
    process.exit(1);
}
console.log('\nAll chain facts verified — the batch universe resolved in every selected form.');
