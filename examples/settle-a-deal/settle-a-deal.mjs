#!/usr/bin/env node
/**
 * settle-a-deal.mjs — one complete Figaro trade, narrated.
 *
 * A buyer and a seller who have never met settle a purchase directly: no
 * platform, no processor, no arbitrator, no timeout. This script walks the
 * whole thing against a LOCAL devnet and prints every step, every transaction
 * hash, and every balance change it reads back off the chain.
 *
 *   1. read the deployment record          → contract addresses
 *   2. discover the network                → registered clauses + assemblies
 *   3. adopt an anchored composition       → the template the trade is shaped by
 *   4. fill it, hash it, sign it twice     → the bilateral EIP-712 commitment
 *   5. commit                              → both sides' bonds are locked
 *   6. attest                              → evidence bound to the signed agreement
 *   7. resolve                             → the buyer settles; the bonds come back
 *
 * NOTHING here is hardcoded about WHAT is being traded. The script names no
 * assembly, no slug, no clause id and no seller roster: the composition is
 * chosen from what the AssemblyRegistry actually holds, and every field it
 * fills is routed through the clause specs the ClauseRegistry actually
 * publishes. Anchor a new assembly composing a clause nobody has ever seen and
 * this same script will pick it up and settle it, with no edit.
 *
 * Only published SDK entry points and viem are used — an adopter with a repo
 * checkout and a wallet can run this without reading any other file.
 *
 * Usage:
 *   npm install && node settle-a-deal.mjs
 *
 * Environment (all optional — the defaults are what ./scripts/devup.sh brings up):
 *   DEPLOYMENT_RECORD   path to the deployment record   (../../.deployments/local.json)
 *   FIGARO_RPC_URL      JSON-RPC endpoint               (http://127.0.0.1:8545)
 *   IPFS_API_URL        Kubo HTTP API                   (http://127.0.0.1:5001)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

import {
    createPublicClient,
    createWalletClient,
    defineChain,
    formatUnits,
    http,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

import {
    ERC20_ABI,
    addressesFromDeploymentRecord,
    assertAgreementSignable,
    buildSectionInclusionProof,
    calculateBonds,
    calculateRootApproval,
    calculateSettlement,
    computeAgreementHash,
    computeClauseKey,
    fetchDiscoveryEvents,
    fillCommerceSection,
    fillProvenanceSection,
    mechanicallyFilledFieldNames,
    parseProjectionHints,
    planTemplateOrders,
    readDenominationPin,
    reconstructDiscovery,
    reconstructOrdersFromTemplate,
    sectionDataHash,
    specIsMandatory,
    strippingReviver,
    templateCompositionHash,
    verifyCommitmentSignature,
    writeTopologySection,
} from "@figaro/sdk";
import { parseClauseSpec } from "@figaro/sdk/clauses";
import { attestAsSeller, commit, resolveProcess } from "@figaro/sdk/agent";

// ── Configuration ───────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC_URL = process.env.FIGARO_RPC_URL ?? "http://127.0.0.1:8545";
const IPFS_API_URL = process.env.IPFS_API_URL ?? "http://127.0.0.1:5001";
const DEPLOYMENT_RECORD =
    process.env.DEPLOYMENT_RECORD ?? resolvePath(HERE, "../../.deployments/local.json");

/**
 * The anvil development mnemonic — public, worthless, and identical on every
 * machine. NEVER put a real key in a file like this.
 */
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

/**
 * Wallet indices. 38 and 39 are past every index the repo's own devnet
 * machinery claims (0-37), so this example collides with nothing that runs
 * beside it — see README.md § "The two wallets". Index 0 is the devnet's
 * pre-funded faucet account.
 */
const FAUCET_INDEX = 0;
const BUYER_INDEX = 38;
const SELLER_INDEX = 39;

/**
 * What the BUYER types at checkout, keyed by the FIELD NAME a clause spec
 * declares — never by clause id. Whichever registered clause declares
 * `origin` gets this origin; a composition that declares none ignores it.
 * A required field with no answer here and no spec default stops the run with
 * a message naming the field, rather than inventing a value.
 */
const BUYER_ANSWERS = {
    modality: "pickup",
    origin: "u33dc0",
    destination: "u33dc1",
};

/** The buyer's cart. `quantity × unitPrice` is the payment the order commits. */
const CART = [
    { itemId: "example-item", name: "One worked example", quantity: 2n, unitPrice: 750_000_000_000_000_000n },
];

/** MockERC20's open `mint` — the devnet token faucet. Not part of ERC-20. */
const DEVNET_FAUCET_ABI = [
    {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
    },
];

// ── Narration ───────────────────────────────────────────────────────────────

let stepNumber = 0;
const failures = [];

function step(title) {
    stepNumber += 1;
    console.log(`\n${"─".repeat(74)}\n${stepNumber}. ${title}\n${"─".repeat(74)}`);
}

function say(line = "") {
    console.log(`   ${line}`);
}

function check(label, actual, expected, format) {
    const ok = actual === expected;
    const show = format ?? ((v) => String(v));
    say(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) {
        say(`      expected ${show(expected)}`);
        say(`      actual   ${show(actual)}`);
        failures.push(label);
    }
}

// ── IPFS (Kubo HTTP API) ────────────────────────────────────────────────────

/** Read a pinned document. `uri` is an `ipfs://…` locator or a bare CID. */
async function ipfsRead(uri) {
    const cid = uri.replace(/^ipfs:\/\//, "");
    const res = await fetch(`${IPFS_API_URL}/api/v0/cat?arg=${encodeURIComponent(cid)}`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(`IPFS read failed for ${cid}: ${res.status} ${res.statusText}`);
    // Registry documents are untrusted input: parse through the SDK's
    // prototype-stripping reviver.
    return JSON.parse(await res.text(), strippingReviver);
}

/** Pin a document and return its `ipfs://…` locator. */
async function ipfsPin(document) {
    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(document)], { type: "application/json" }));
    const res = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`IPFS pin failed: ${res.status} ${res.statusText}`);
    const { Hash } = await res.json();
    if (!Hash) throw new Error("IPFS pin returned no CID");
    return { cid: Hash, uri: `ipfs://${Hash}` };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\nFIGARO — SETTLE A DEAL");
    console.log("A complete trade between two strangers, against a local devnet.\n");

    // 1 ─────────────────────────────────────────────────────────────────────
    step("Read the deployment record");

    const record = JSON.parse(readFileSync(DEPLOYMENT_RECORD, "utf8"), strippingReviver);
    // A published deployment record uses its own key names (`figaroCore`,
    // `tokenAddress`, …). One SDK call maps it to the shape every other SDK
    // function takes — never spread the record verbatim.
    const addresses = addressesFromDeploymentRecord(record);
    const chain = defineChain({
        id: record.chainId,
        name: `figaro-devnet-${record.chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
    });
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    say(`record        ${DEPLOYMENT_RECORD}`);
    say(`rpc           ${RPC_URL}  (chain ${record.chainId})`);
    say(`kernel        ${addresses.core}`);
    say(`clauses       ${addresses.clauseRegistry}`);
    say(`assemblies    ${addresses.assemblyRegistry}`);
    say(`attestations  ${addresses.attestationCoordinator}`);

    const liveChainId = await publicClient.getChainId();
    if (liveChainId !== record.chainId) {
        throw new Error(
            `the node at ${RPC_URL} reports chain ${liveChainId}, but the deployment record is for ${record.chainId}`,
        );
    }
    say(`the node agrees it is chain ${liveChainId}`);

    // 2 ─────────────────────────────────────────────────────────────────────
    step("Set up the two wallets");

    const faucet = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: FAUCET_INDEX });
    const buyer = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: BUYER_INDEX });
    const seller = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: SELLER_INDEX });

    const faucetWallet = createWalletClient({ account: faucet, chain, transport: http(RPC_URL) });
    const buyerWallet = createWalletClient({ account: buyer, chain, transport: http(RPC_URL) });
    const sellerWallet = createWalletClient({ account: seller, chain, transport: http(RPC_URL) });

    say(`buyer   anvil[${BUYER_INDEX}]  ${buyer.address}`);
    say(`seller  anvil[${SELLER_INDEX}]  ${seller.address}`);
    say("");
    say("Neither wallet is registered anywhere. The kernel verifies two signatures");
    say("and nothing else — publishing a profile is how a wallet is FOUND, never how");
    say("it QUALIFIES. Any wallet can hold either role.");

    // 3 ─────────────────────────────────────────────────────────────────────
    step("Discover the network — what clauses and compositions exist right now");

    const discovery = reconstructDiscovery(await fetchDiscoveryEvents(publicClient, addresses, 0n));
    const registeredClauses = discovery.getClauses();
    const registeredAssemblies = discovery.getAssemblies();

    say(`${registeredClauses.length} clauses and ${registeredAssemblies.length} assemblies are live-staked on this network.`);
    say("Both lists came from registry EVENTS. Nothing is bundled with this script.");

    // Every clause's spec is fetched from where the registry points. The SDK
    // holds no spec cache: `SpecSource` is this script's window onto what it
    // loaded, and every projection call below reads through it.
    const views = new Map();
    for (const clause of registeredClauses) {
        const raw = await ipfsRead(clause.contentURI);
        const parsed = parseClauseSpec(raw);
        if (!parsed.ok) {
            say(`skipping ${clause.clauseId}@${clause.version}: ${parsed.errors[0].message}`);
            continue;
        }
        views.set(`${clause.clauseId}@${clause.version}`, {
            ...parsed.spec,
            hints: parseProjectionHints(raw),
        });
    }
    const specs = {
        get(clauseId, version) {
            if (version != null) return views.get(`${clauseId}@${version}`);
            let best;
            let bestVersion = -1;
            for (const [key, view] of views) {
                if (!key.startsWith(`${clauseId}@`)) continue;
                const candidate = Number(key.slice(clauseId.length + 1));
                if (candidate > bestVersion) {
                    bestVersion = candidate;
                    best = view;
                }
            }
            return best;
        },
        list: () => [...views.values()],
    };
    say(`${views.size} clause specs fetched from IPFS and parsed.`);

    // Which clauses are MANDATORY is the specs' own statement, read at the
    // edge — not a list this script carries.
    const mandatory = specs.list().filter(specIsMandatory).map((s) => s.clauseId);
    say(`the specs declare ${mandatory.length} mandatory clauses: ${mandatory.join(", ")}`);

    // 4 ─────────────────────────────────────────────────────────────────────
    step("Adopt an anchored composition");

    say("Rule, stated up front so the choice is reproducible: among the anchored");
    say("compositions, take the SINGLE-ORDER ones that carry every mandatory clause,");
    say("then the one composing the FEWEST clauses (ties broken by composition hash).");
    say("");

    const candidates = [];
    for (const assembly of registeredAssemblies) {
        let template;
        try {
            template = await ipfsRead(assembly.contentURI);
        } catch (error) {
            say(`  unreadable  ${assembly.compositionHash.slice(0, 12)}…  ${error.message}`);
            continue;
        }
        const orders = Array.isArray(template.agreements) ? template.agreements.length : 0;
        const composed = new Set([
            ...Object.keys(template.assemblyClauses ?? {}),
            ...(template.agreements ?? []).flatMap((a) => Object.keys(a.clauses ?? {})),
        ]);
        const missing = mandatory.filter((id) => !composed.has(id));
        const eligible = orders === 1 && missing.length === 0;
        candidates.push({ assembly, template, orders, size: composed.size, missing, eligible });
    }

    for (const c of candidates.sort((a, b) => (a.template.name ?? "").localeCompare(b.template.name ?? ""))) {
        const why = c.orders !== 1
            ? `${c.orders} orders`
            : c.missing.length
                ? `missing ${c.missing.join(", ")}`
                : "eligible";
        say(`  ${c.eligible ? "*" : " "} ${String(c.size).padStart(2)} clauses  ${(c.template.name ?? "(unnamed)").padEnd(36)} ${why}`);
    }

    const chosen = candidates
        .filter((c) => c.eligible)
        .sort((a, b) => a.size - b.size || a.assembly.compositionHash.localeCompare(b.assembly.compositionHash))[0];
    if (!chosen) throw new Error("no anchored single-order composition carries every mandatory clause");

    const template = chosen.template;
    const compositionHash = templateCompositionHash(template);
    say("");
    say(`adopted        ${template.name}`);
    say(`               "${template.summary}"`);
    say(`author         ${chosen.assembly.author}`);
    say(`compositionHash ${compositionHash}`);
    check(
        "the composition hash recomputes from the pinned template",
        compositionHash.toLowerCase(),
        chosen.assembly.compositionHash.toLowerCase(),
    );

    const planned = planTemplateOrders(template);
    const root = planned[0];
    say(`the template plans ${planned.length} order; it composes: ${Object.keys(root.clauses).join(", ")}`);

    // 5 ─────────────────────────────────────────────────────────────────────
    step("Pick the settlement token and price the cart");

    // The designer may PIN a denomination inside the composition. If they did,
    // that pin denominates; otherwise the deployment's settlement token does.
    const pinned = readDenominationPin(root.clauses, specs);
    const currency = pinned ?? addresses.token;
    say(pinned
        ? `the composition PINS its settlement token: ${currency}`
        : `the composition pins no token; using the deployment's settlement token ${currency}`);

    const [symbol, decimals] = await Promise.all([
        publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: "symbol" }),
        publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    const amount = (value) => `${formatUnits(value, decimals)} ${symbol}`;

    const lineItems = CART.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: item.unitPrice.toString(),
    }));
    const payment = CART.reduce((total, item) => total + item.quantity * item.unitPrice, 0n);
    for (const item of CART) {
        say(`cart  ${item.quantity} × ${item.name} at ${amount(item.unitPrice)}`);
    }
    say(`payment  ${amount(payment)}`);

    // Bond math comes from the kernel's own invariants, never from arithmetic
    // written here.
    const bonds = calculateBonds(payment, payment); // one order ⇒ cumulative value == payment
    say("");
    say("The bonds are DETERRENTS, not fees and not capital at work — they are");
    say("returned in full when the deal is honored, and they exist so that honoring");
    say("it is the profitable move for both sides:");
    say(`  buyer locks   ${amount(bonds.buyerBond)}   (2 × payment)`);
    say(`  seller locks  ${amount(bonds.sellerBond)}   (2 × cumulative value)`);

    // 6 ─────────────────────────────────────────────────────────────────────
    step("Fund the two wallets from the devnet faucet");

    const approvals = calculateRootApproval(payment);
    await ensureGas(publicClient, faucetWallet, [buyer.address, seller.address], say);
    await ensureTokens(publicClient, buyerWallet, currency, buyer.address, approvals.buyerApproval, amount, say);
    await ensureTokens(publicClient, sellerWallet, currency, seller.address, approvals.sellerApproval, amount, say);
    say("");
    say("Both funding paths are devnet-only and permissionless: the faucet account is");
    say("anvil's own pre-funded index 0, and the mock settlement token's `mint` is open");
    say("to anyone. On a real network a wallet arrives already holding what it bonds.");

    // 7 ─────────────────────────────────────────────────────────────────────
    step("Fill the composition — who fills what");

    say("The designer composed the clauses and authored the tailoring. The buyer fills");
    say("the rest at checkout. Everything below is routed by the FIELD NAMES the");
    say("specs declare; this script names no clause.");
    say("");

    // The walk fills some fields mechanically (the cart, the parent-order
    // hashes, the composition identity). Ask the SDK which those are, so the
    // buyer is never asked for a value the protocol derives.
    const mechanical = mechanicallyFilledFieldNames(root.clauses, specs);
    say(`derived mechanically:  ${[...mechanical].sort().join(", ")}`);

    const answered = [];
    const unanswered = [];

    /** Complete one node's clause bag: mechanical fills, then the buyer's answers. */
    function fillNode(node) {
        // Start from the node's own bag — `planTemplateOrders` has already
        // folded the assembly-scope clauses into it.
        let clauses = fillCommerceSection(node.clauses, payment, specs, lineItems);
        clauses = fillProvenanceSection(clauses, compositionHash, specs);
        clauses = writeTopologySection(clauses, [], specs); // a root order has no parents

        const filled = {};
        for (const [clauseId, values] of Object.entries(clauses)) {
            const spec = specs.get(clauseId, node.clauseVersions[clauseId]);
            if (!spec) {
                filled[clauseId] = values;
                continue;
            }
            const next = { ...values };
            for (const field of spec.fields ?? []) {
                if (next[field.name] !== undefined) continue; // designer or seller already filled it
                if (mechanical.has(field.name)) continue; // the walk fills it
                if (field.default !== undefined) continue; // the SPEC speaks; the projection injects it
                if (!field.required) continue;

                const answer = BUYER_ANSWERS[field.name]
                    // A never-seen enum still resolves: take the spec's own first value.
                    ?? (field.type === "enum" ? field.values?.[0] : undefined);
                if (answer === undefined) {
                    unanswered.push(`${field.name} (${field.type}, required by ${clauseId})`);
                    continue;
                }
                next[field.name] = answer;
                answered.push({ field: field.name, clause: clauseId, value: answer });
            }
            filled[clauseId] = next;
        }
        return filled;
    }

    // 8 ─────────────────────────────────────────────────────────────────────
    step("Build the agreement, hash it, and sign it — twice");

    let order;
    let buyerSig;
    let sellerSig;
    let agreementURI;

    await reconstructOrdersFromTemplate(template, {
        buyer: buyer.address,
        currency,
        chainId: record.chainId,
        core: addresses.core,
        specs, // spec-default projection — checkout semantics
        nodes: (node) => ({ seller: seller.address, payment, overrides: fillNode(node) }),
        onOrder: async (realized) => {
            order = realized;

            for (const { field, clause, value } of answered) {
                say(`buyer answers  ${field} = ${JSON.stringify(value)}   (declared by ${clause})`);
            }
            if (unanswered.length) {
                throw new Error(
                    `this composition asks for values this example has no answer for:\n    ` +
                    `${unanswered.join("\n    ")}\n  Add them to BUYER_ANSWERS, keyed by field name.`,
                );
            }
            say("");
            say("Sections in the signed agreement (each one a merkle leaf):");
            for (const section of realized.agreement.sections) {
                const keys = Object.keys(section.data ?? {});
                say(`  ${section.clause}@${section.version}${keys.length ? `  {${keys.join(", ")}}` : "  {}"}`);
            }

            // The single Layer-A gate every signature routes through: no path
            // signs an agreement whose sections violate their specs, or whose
            // hash is not the merkle root of what it contains.
            assertAgreementSignable(realized.agreement, realized.agreementHash, specs, "settle-a-deal");
            check(
                "agreementHash is the merkle root of the sections",
                computeAgreementHash(realized.agreement).toLowerCase(),
                realized.agreementHash.toLowerCase(),
            );
            say("");
            say(`agreementHash  ${realized.agreementHash}`);
            say(`orderHash      ${realized.orderHash}`);
            say(`processId      ${realized.processId}`);
            say(`the root signs processId 0x00…00 — the kernel derives the real id`);

            const pinned = await ipfsPin(realized.agreement);
            agreementURI = pinned.uri;
            say(`agreement pinned at  ${agreementURI}`);
            say("The chain will hold only the fingerprint. The document stays with the");
            say("two parties, retrievable by hash — nobody has to be trusted to keep it.");

            // Two signatures over the SAME struct. The SDK never fabricates one.
            buyerSig = await buyerWallet.signTypedData({ account: buyer, ...realized.typedData });
            sellerSig = await sellerWallet.signTypedData({ account: seller, ...realized.typedData });
            say("");
            say(`buyer  signature  ${buyerSig.slice(0, 22)}…`);
            say(`seller signature  ${sellerSig.slice(0, 22)}…`);
        },
    });

    check(
        "the buyer's signature recovers to the buyer",
        await verifyCommitmentSignature(order.commitment, buyerSig, buyer.address, {
            chainId: record.chainId,
            core: addresses.core,
        }),
        true,
    );
    check(
        "the seller's signature recovers to the seller",
        await verifyCommitmentSignature(order.commitment, sellerSig, seller.address, {
            chainId: record.chainId,
            core: addresses.core,
        }),
        true,
    );

    // 9 ─────────────────────────────────────────────────────────────────────
    step("Approve the exact bonds");

    say("The kernel pulls the FULL bond on every commit, and nets nothing.");
    say(`buyer approves   ${amount(approvals.buyerApproval)}`);
    say(`seller approves  ${amount(approvals.sellerApproval)}`);

    await send(publicClient, buyerWallet, {
        address: currency, abi: ERC20_ABI, functionName: "approve",
        args: [addresses.core, approvals.buyerApproval],
    }, "buyer approve", say);
    await send(publicClient, sellerWallet, {
        address: currency, abi: ERC20_ABI, functionName: "approve",
        args: [addresses.core, approvals.sellerApproval],
    }, "seller approve", say);

    const opening = await balances(publicClient, currency, [buyer.address, seller.address]);
    say("");
    say(`buyer  holds  ${amount(opening[0])}`);
    say(`seller holds  ${amount(opening[1])}`);

    // 10 ────────────────────────────────────────────────────────────────────
    step("Commit — both bonds lock in one transaction");

    const committed = await commit(
        buyerWallet, publicClient, addresses.core, order.commitment, buyerSig, sellerSig,
    );
    await publicClient.waitForTransactionReceipt({ hash: committed.hash });
    say(`tx  ${committed.hash}`);
    say("Either party — or any relayer holding the two signatures — may broadcast this.");
    say("The kernel checks the signatures, never the sender.");

    const afterCommit = await balances(publicClient, currency, [buyer.address, seller.address]);
    say("");
    say("Balances read FRESH from the chain (never from this script's bookkeeping):");
    say(`buyer   ${amount(afterCommit[0])}   delta ${amount(afterCommit[0] - opening[0])}`);
    say(`seller  ${amount(afterCommit[1])}   delta ${amount(afterCommit[1] - opening[1])}`);
    check("commit pulled the buyer's 2× payment bond", afterCommit[0] - opening[0], -bonds.buyerBond, amount);
    check("commit pulled the seller's 2× cumulative-value bond", afterCommit[1] - opening[1], -bonds.sellerBond, amount);

    const escrowed = await balances(publicClient, currency, [addresses.core]);
    check("the kernel holds exactly both bonds", escrowed[0], bonds.totalLocked, amount);

    // 11 ────────────────────────────────────────────────────────────────────
    step("Attest — the seller binds evidence to the signed agreement");

    // WHICH section is attested is read off the agreement itself. The first
    // section carrying committed content is attested; no clause is named here.
    const target = order.agreement.sections.find((s) => Object.keys(s.data ?? {}).length > 0)
        ?? order.agreement.sections[0];
    const { proof } = buildSectionInclusionProof(order.agreement, target.clause);
    const sectionHash = sectionDataHash(target);
    const clauseKey = computeClauseKey(target.clause, target.version);

    say(`attesting  ${target.clause}@${target.version}`);
    say(`clause key    ${clauseKey}`);
    say(`section hash  ${sectionHash}`);
    say(`merkle proof  ${proof.length} sibling${proof.length === 1 ? "" : "s"} — opens against the agreementHash the kernel already holds`);

    const attested = await attestAsSeller(
        sellerWallet,
        addresses.attestationCoordinator,
        order.commitment, // role: this order's seller
        order.commitment, // target: the same order (same-order attestation)
        clauseKey,
        0, // stage 0 = the clause's COMMITTED content
        sectionHash,
        proof,
        sectionHash, // contentRef == sectionHash: re-asserting what was committed
    );
    await publicClient.waitForTransactionReceipt({ hash: attested.hash });
    say(`tx  ${attested.hash}`);
    say("Only the FINGERPRINT went on chain. The section's plaintext never touched");
    say("public calldata — and the timestamped record now outlives the deal, usable");
    say("as evidence in any forum the parties later reach for.");

    // 12 ────────────────────────────────────────────────────────────────────
    step("Resolve — the buyer settles, atomically");

    say("Only the buyer can do this, and there is no timeout, no admin key and no");
    say("recovery path. That is what makes the seller's bond a real deterrent — and");
    say("the buyer's own bond is what makes withholding cost the buyer too.");

    const resolved = await resolveProcess(
        buyerWallet, addresses.core, order.processId, [order.commitment],
    );
    await publicClient.waitForTransactionReceipt({ hash: resolved.hash });
    say(`tx  ${resolved.hash}`);

    const afterResolve = await balances(publicClient, currency, [buyer.address, seller.address]);
    const settlement = calculateSettlement(payment, bonds.sellerBond, bonds.buyerBond);
    say("");
    say("Balances read FRESH from the chain:");
    say(`buyer   ${amount(afterResolve[0])}   delta ${amount(afterResolve[0] - afterCommit[0])}`);
    say(`seller  ${amount(afterResolve[1])}   delta ${amount(afterResolve[1] - afterCommit[1])}`);

    // 13 ────────────────────────────────────────────────────────────────────
    step("Assert the exact payouts");

    check("seller received bond + payment", afterResolve[1] - afterCommit[1], settlement.sellerPayout, amount);
    check("buyer received bond − payment", afterResolve[0] - afterCommit[0], settlement.buyerPayout, amount);
    check("net: the buyer is out exactly the payment", opening[0] - afterResolve[0], settlement.netTransfer, amount);
    check("net: the seller is up exactly the payment", afterResolve[1] - opening[1], settlement.netTransfer, amount);
    const emptied = await balances(publicClient, currency, [addresses.core]);
    check("the kernel holds nothing from this process", emptied[0], 0n, amount);

    say("");
    say(`Everything above was read back out of band: the balances come from the token`);
    say(`contract, not from anything this script believed it had done.`);

    // ────────────────────────────────────────────────────────────────────────
    console.log(`\n${"═".repeat(74)}`);
    if (failures.length) {
        console.log(`FAILED — ${failures.length} assertion(s) did not hold:`);
        for (const f of failures) console.log(`  · ${f}`);
        console.log("═".repeat(74));
        process.exitCode = 1;
        return;
    }
    console.log("SETTLED. Every assertion held.");
    console.log("═".repeat(74));
    console.log(`
  buyer          ${buyer.address}
  seller         ${seller.address}
  composition    ${template.name}  (${compositionHash.slice(0, 18)}…)
  processId      ${order.processId}
  agreement      ${agreementURI}
  net transfer   ${amount(settlement.netTransfer)}  buyer → seller

  No platform sat in the middle. No arbitrator was consulted. Neither party had
  to trust the other — cooperating was simply worth more to both of them than
  anything else on the board.
`);
}

// ── Small chain helpers ─────────────────────────────────────────────────────

async function balances(publicClient, token, holders) {
    return Promise.all(
        holders.map((address) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
        ),
    );
}

async function send(publicClient, wallet, call, label, log) {
    const { request } = await publicClient.simulateContract({ account: wallet.account, ...call });
    const hash = await wallet.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    log(`${label}  ${hash}`);
    return hash;
}

const GAS_FLOOR = 10n ** 17n; // 0.1 ETH
const GAS_TOPUP = 10n ** 18n; // 1 ETH

async function ensureGas(publicClient, faucetWallet, targets, log) {
    for (const address of targets) {
        const held = await publicClient.getBalance({ address });
        if (held >= GAS_FLOOR) {
            log(`${address} already holds ${formatUnits(held, 18)} ETH for gas`);
            continue;
        }
        const hash = await faucetWallet.sendTransaction({ to: address, value: GAS_TOPUP });
        await publicClient.waitForTransactionReceipt({ hash });
        log(`${address} funded with ${formatUnits(GAS_TOPUP, 18)} ETH for gas  ${hash}`);
    }
}

async function ensureTokens(publicClient, wallet, token, address, need, amount, log) {
    const [held] = await balances(publicClient, token, [address]);
    if (held >= need) {
        log(`${address} already holds ${amount(held)} — enough to bond ${amount(need)}`);
        return;
    }
    const short = need - held;
    await send(publicClient, wallet, {
        address: token, abi: DEVNET_FAUCET_ABI, functionName: "mint", args: [address, short],
    }, `${address} minted ${amount(short)} from the devnet faucet`, log);
}

main().catch((error) => {
    console.error(`\n${"═".repeat(74)}`);
    console.error(`FAILED — ${error.message}`);
    if (error.cause?.message) console.error(`  cause: ${error.cause.message}`);
    console.error("═".repeat(74));
    process.exitCode = 1;
});
