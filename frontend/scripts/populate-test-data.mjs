#!/usr/bin/env node
/**
 * populate-test-data.mjs — the ONE pre-population path FOR TESTING. Populates the
 * registries the e2e suite consumes from: clauses (ClauseRegistry + IPFS, reusing
 * populate-clauses), the seed assemblies (AssemblyRegistry + IPFS — the blank
 * structural composition sellers bind, plus the multi-order delivery chain
 * the multi-order e2e runs), AND sellers (SellerRegistry + IPFS).
 * Run after deploy, before the test suite. The runtime specs then discover everything from chain → IPFS.
 *
 * This is the single source of the test SELLERS — it replaces `seller-roster.ts`
 * (which was wrongly imported by runtime specs as a parallel path). The seller
 * DATA here (names, specialties, catalogues) is legitimate setup input;
 * every ADDRESS is derived from the standard anvil mnemonic — nothing hardcoded.
 *
 * Production sellers onboard themselves through the wizard; this script exists for
 * TESTING ONLY. For production clause population use populate-clauses.mjs.
 *
 * Env (frontend/.env.local): NEXT_PUBLIC_CLAUSE_REGISTRY, NEXT_PUBLIC_SELLER_REGISTRY,
 *   NEXT_PUBLIC_TOKEN_ADDRESS, NEXT_PUBLIC_IPFS_API_URL, RPC_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, toHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    CLAUSES_DIR, LOCAL_ANVIL, pinJSON, populateClauses, readEnvLocal, registrarAccount,
} from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRATION_DEPOSIT = 1_000_000_000_000_000n; // 0.001 ETH

const SELLER_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function updateProfile(string metadataURI) external',
    'error AlreadyRegistered()',
]);
const ERC20_VIEW_ABI = parseAbi([
    'function symbol() view returns (string)',
    'function name() view returns (string)',
]);
const ASSEMBLY_REGISTRY_ABI = parseAbi([
    'function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable',
    'function registrationDeposit() view returns (uint256)',
    'event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)',
]);

// The test sellers. addressIndex ∈ [5,19] (disjoint from buyers anvil[0..4]).
// Addresses derive from the anvil mnemonic below — nothing hardcoded.
const SELLERS = [
    { addressIndex: 5, name: 'Kiosk Corner', specialty: 'kiosk', geohash: '9q8yyk8yu', products: [{ name: 'Newspaper', price: '1' }] },
    { addressIndex: 6, name: 'Aurora Café', specialty: 'café', geohash: '9q8yyk8yt', products: [{ name: 'Espresso', price: '1' }] },
    { addressIndex: 7, name: "Rosa's Kitchen", specialty: 'prepared food, own delivery', geohash: '9q8yyk8yv', products: [{ name: 'Margherita pizza', price: '1' }] },
    { addressIndex: 8, name: 'Cardinal Couriers', specialty: 'last-mile delivery', geohash: '9q8yyk8yw', products: [{ name: 'Standard delivery', price: '1', category: 'delivery' }] },
    { addressIndex: 9, name: 'Saffron Table', specialty: 'prepared food, buyer-arranged delivery', geohash: '9q8yyk8yx', products: [{ name: 'Margherita pizza', price: '1' }] },
    { addressIndex: 10, name: 'Pomodoro Kitchen', specialty: 'prepared food, auction-arranged delivery', geohash: '9q8yyk8yy', products: [{ name: 'Margherita pizza', price: '1' }] },
    { addressIndex: 11, name: 'Harbor Provisions', specialty: 'grocery, emissions-disclosed delivery', geohash: '9q8yyk8yz', products: [{ name: 'Grocery box', price: '1' }] },
    { addressIndex: 12, name: 'Sterling Goods', specialty: 'general goods, delivery with named recourse', geohash: '9q8yyk8z0', products: [{ name: 'Hardware kit', price: '1' }] },
];

const slugifyId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const isAlreadyRegistered = (err) => /AlreadyRegistered/i.test(err instanceof Error ? err.message : String(err));


// ── Seed assembly (AssemblyRegistry) ─────────────────────────────────────────
// The suite's runtime specs need >=1 anchored assembly BEFORE any test runs
// (the even-surfacing rule: a seller surfaces only with an anchored binding,
// so an empty AssemblyRegistry means zero surfaced sellers). Seeding is
// PRE-POPULATION, exactly like clauses and sellers above — never a test
// (operator ruling 2026-07-02; the scenario-era build-order coupling is the
// cautionary tale). The template reproduces the designer's emission byte for
// byte — sources of truth: `lib/designer/buildAssemblyTemplate.ts` (structural
// fold), `lib/shared/assemblyTemplate.ts` (slug derivation) — so the anchored
// document is indistinguishable from a designer-published one.

/** Sorted-keys JSON at every depth — mirrors buildAssemblyTemplate.ts. */
function canonicalize(value) {
    return JSON.stringify(value, (_key, raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const sorted = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = raw[k];
        return sorted;
    });
}

/** Fold the MANDATORY structural clauses (block.article === "structural",
 *  read from the canonical Layer-A specs — derived, never named) onto an
 *  order: each takes the subset of the design-time bag it declares. Parents
 *  are LOCAL template ids — mirrors the designer's composeStructuralClauses. */
function structuralClauseFold(parents = []) {
    const bag = { parentOrderHashes: parents };
    const out = {};
    for (const file of fs.readdirSync(CLAUSES_DIR).filter((f) => f.endsWith('.json')).sort()) {
        const spec = JSON.parse(fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8'));
        if (spec.block?.article !== 'structural') continue;
        const data = {};
        for (const field of spec.fields ?? []) {
            if (field.name in bag) data[field.name] = bag[field.name];
        }
        out[spec.clauseId] = data;
    }
    if (Object.keys(out).length === 0) throw new Error('no structural clauses found in clauses/*.json');
    return out;
}

async function anchorAssembly({ publicClient, walletClient, account, registry, ipfsApiUrl, template }) {
    // Content hash over the COMPOSITION ONLY (editorial excluded) — mirrors
    // serializeAssemblyTemplate.ts; slug mirrors deriveAssemblySlug.
    const contentHash = keccak256(toHex(canonicalize({ orders: template.orders })));
    const slug = `asm-${contentHash.slice(2, 18)}`;

    const anchored = await publicClient.getContractEvents({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered',
        args: { slugHash: keccak256(toHex(slug)) }, fromBlock: 0n,
    });
    if (anchored.length > 0) {
        console.log(`  · ${slug} — already anchored, skipped`);
        return slug;
    }

    const metadataURI = await pinJSON(ipfsApiUrl, canonicalize(template));
    const deposit = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const { request } = await publicClient.simulateContract({
        account: account.address, address: registry, abi: ASSEMBLY_REGISTRY_ABI,
        functionName: 'registerAssembly', args: [slug, contentHash, metadataURI], value: deposit,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ✓ ${slug} — anchored; template ${metadataURI}`);
    return slug;
}

/** The blank single-order composition: structural clauses only — the minimal
 *  bindable assembly the single-order specs run against. */
function seedTemplateBlank() {
    return {
        name: 'Devnet seed',
        summary: 'Pre-populated bindable assembly for the e2e suite.',
        description: 'A blank single-order composition (structural clauses only), anchored by populate-test-data so sellers can bind before any spec runs.',
        orders: [{ id: 'order-0', clauses: structuralClauseFold() }],
    };
}

/** The multi-order value-added CHAIN — the externalized P&L the multi-order
 *  e2e runs end-to-end: a root meal order (merchant process, delivery
 *  modality) plus courier and supplier sub-orders. Which clauses compose
 *  which order is scenario DATA (a designed artifact this seed reproduces
 *  byte-for-byte), exactly like the seller roster above. Counterparties are
 *  NOT seeded — the lead binds + designates them through the real UI flow. */
function seedTemplateChain() {
    return {
        name: 'Devnet delivery chain',
        summary: 'Three-order value-added chain: meal, courier, supplier.',
        description: 'A delivery chain for the multi-order e2e: the buyer sees the full decomposition at checkout, each contributor is bond-secured, and the single resolve pays every party.',
        orders: [
            {
                id: 'order-0',
                clauses: {
                    'figaro-merchant-process': {},
                    'figaro-modalities': { modality: 'delivery' },
                    ...structuralClauseFold([]),
                },
            },
            {
                id: 'order-1',
                clauses: {
                    'figaro-courier-process': {},
                    ...structuralClauseFold(['order-0']),
                },
            },
            {
                id: 'order-2',
                clauses: {
                    'figaro-merchant-process': {},
                    ...structuralClauseFold(['order-0']),
                },
            },
        ],
    };
}

async function main() {
    const env = readEnvLocal();
    const clauseRegistry = env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const sellerRegistry = env.NEXT_PUBLIC_SELLER_REGISTRY;
    const assemblyRegistry = env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    const mockErc20 = env.NEXT_PUBLIC_TOKEN_ADDRESS;
    const ipfsApiUrl = env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!clauseRegistry || !sellerRegistry || !assemblyRegistry || !mockErc20) {
        throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY / NEXT_PUBLIC_SELLER_REGISTRY / NEXT_PUBLIC_ASSEMBLY_REGISTRY / NEXT_PUBLIC_TOKEN_ADDRESS missing — deploy first.');
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    await publicClient.getBlockNumber().catch(() => { throw new Error(`Cannot reach the chain at ${RPC_URL}`); });

    // ── 1. Clauses (reuse the production path) ──────────────────────────────
    const registrar = registrarAccount();
    const registrarClient = createWalletClient({ account: registrar, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    console.log('Clauses:');
    await populateClauses({ publicClient, walletClient: registrarClient, account: registrar, registry: clauseRegistry, ipfsApiUrl });

    // ── 1b. Seed assemblies (blank + multi-order chain, idempotent) ─────────
    console.log('\nAssemblies:');
    const anchorArgs = { publicClient, walletClient: registrarClient, account: registrar, registry: assemblyRegistry, ipfsApiUrl };
    await anchorAssembly({ ...anchorArgs, template: seedTemplateBlank() });
    await anchorAssembly({ ...anchorArgs, template: seedTemplateChain() });

    // ── 2. Sellers (catalogue → profile → register, all pinned + anchored) ──
    const [tokenSymbol, tokenName] = await Promise.all([
        publicClient.readContract({ address: mockErc20, abi: ERC20_VIEW_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: mockErc20, abi: ERC20_VIEW_ABI, functionName: 'name' }),
    ]);

    console.log('\nSellers:');
    for (const s of SELLERS) {
        const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.addressIndex });
        const sellerClient = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // The canonical catalogue-document shape (`SellerCatalogueMetadata`):
        // the items key is `items` (a `menu` key parses to an EMPTY catalogue —
        // the item list every read projects from, incl. sub-order pricing);
        // `category` only when authored (never a coined default).
        const catalogue = {
            subjectAddress: account.address,
            version: '0.1.0',
            unitSystem: 'metric',
            items: s.products.map((p) => ({
                id: slugifyId(p.name),
                name: p.name,
                description: p.name,
                price: p.price,
                ...(p.category ? { category: p.category } : {}),
                available: true,
            })),
        };
        const catalogueURI = await pinJSON(ipfsApiUrl, JSON.stringify(catalogue));

        const profile = {
            subjectAddress: account.address,
            name: s.name,
            specialty: s.specialty,
            catalogueURI,
            location: { geohash: s.geohash },
            acceptedTokens: [{ address: mockErc20, symbol: tokenSymbol, name: tokenName }],
            defaultTokenAddress: mockErc20,
            // No bindings seeded: a seller binds a PUBLISHED assembly (asm-<hash>)
            // through the real flow — author + publish in the designer, then bind.
            assemblyBindings: [],
        };
        const metadataURI = await pinJSON(ipfsApiUrl, JSON.stringify(profile));

        try {
            const { request } = await publicClient.simulateContract({
                account: account.address, address: sellerRegistry, abi: SELLER_REGISTRY_ABI,
                functionName: 'register', args: [metadataURI], value: REGISTRATION_DEPOSIT,
            });
            const hash = await sellerClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ✓ ${s.name} (anvil[${s.addressIndex}]) — registered; profile ${metadataURI}`);
        } catch (err) {
            if (!isAlreadyRegistered(err)) throw err;
            // Already registered — refresh the pinned profile so a re-run repairs it.
            const { request } = await publicClient.simulateContract({
                account: account.address, address: sellerRegistry, abi: SELLER_REGISTRY_ABI,
                functionName: 'updateProfile', args: [metadataURI],
            });
            const hash = await sellerClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ↻ ${s.name} — already registered; profile updated ${metadataURI}`);
        }
    }
    console.log('\nDone — test clauses + seed assembly + sellers pre-populated.');
}

main().catch((err) => { console.error(err); process.exit(1); });
