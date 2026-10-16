#!/usr/bin/env node
/**
 * populate-test-data.mjs — the ONE pre-population path FOR TESTING. Populates the
 * registries the e2e suite consumes from: clauses (ClauseRegistry + IPFS, reusing
 * populate-clauses), the seed assemblies (AssemblyRegistry + IPFS — the blank
 * mandatory-only composition sellers bind, plus the multi-order delivery chain
 * the multi-order e2e runs), AND members (MembersRegistry + IPFS).
 * Run after deploy, before the test suite. The runtime specs then discover everything from chain → IPFS.
 *
 * This is the single source of the test SELLERS — it replaces `seller-roster.ts`
 * (which was wrongly imported by runtime specs as a parallel path). The seller
 * DATA here (names, specialties, catalogs) is legitimate setup input;
 * every ADDRESS is derived from the standard anvil mnemonic — nothing hardcoded.
 *
 * Production members onboard themselves through the wizard; this script exists for
 * TESTING ONLY. For production clause population use populate-clauses.mjs.
 *
 * Env (frontend/.env.local): NEXT_PUBLIC_CLAUSE_REGISTRY, NEXT_PUBLIC_MEMBERS_REGISTRY,
 *   NEXT_PUBLIC_ASSEMBLY_REGISTRY, NEXT_PUBLIC_AGREEMENT_REGISTRY,
 *   NEXT_PUBLIC_TOKEN_ADDRESS, NEXT_PUBLIC_IPFS_API_URL, RPC_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
// Protocol canonicals come from the SDK (@figaro-protocol/sdk, file:../sdk): the
// registry + ERC-20 ABIs, the canonical-JSON convention, and the assembly
// identity (compositionHash + slug). Nothing is re-implemented here.
import { MEMBERS_REGISTRY_ABI, ERC20_ABI } from '@figaro-protocol/sdk';
import {
    ASSEMBLIES_DIR, LOCAL_ANVIL, anchorBuiltAssembly, fillDeployTimeCurrency, loadAuthoredSpecs, pinFile, pinJSON,
    loadAuthoredAgreements, readBuiltAssembly,
    populateClauses, populateReferenceAssemblies, readEnvLocal, registrarAccount,
} from './populate-clauses.mjs';
import { assemblyCompositionHash, deriveAssemblySlug, resolveAuthoredClauseKeys, composeAuthoredAgreement, assembleAuthored } from '@figaro-protocol/sdk';

// The specs in clauses/, each with its key — the set every authored clause
// NAME below resolves against at seed time (`resolveAuthoredClauseKeys`);
// everything pinned carries keys.
const AUTHORED = loadAuthoredSpecs();
const AUTHORED_AGREEMENTS = loadAuthoredAgreements(AUTHORED);

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRATION_DEPOSIT = 1_000_000_000_000_000n; // 0.001 ETH

// The test members, each with something to sell. addressIndex ∈ [5,19]; the buyers, anvil[0..4], are not registered.
// Addresses derive from the anvil mnemonic below — nothing hardcoded.
//
// Each seller BINDS the reference assembly its specialty names (`binds` is the
// file in assemblies/), so the world a visitor meets on /discover keeps the
// promise the directory makes: a member surfaces only with an anchored
// binding, and the deploy anchors the references first. DEVNET ONLY — on a
// public chain a seller binds through the real flow. A courier designation
// (`courierIndex`) names anvil[8] as the delivery counterparty on the
// local-commerce composition; undesignated sellers leave the courier to the
// buyer's checkout choice or dispatch race.
const COURIER_CLAUSE = 'figaro-courier-process';
const SELLERS = [
    { addressIndex: 5, name: 'Northside Stationers', specialty: 'stationery', geohash: '9q8yyk8yu', binds: 'pos.json', products: [{ name: 'Notebook', price: '1' }] },
    { addressIndex: 6, name: 'Ridgeway Hardware', specialty: 'hardware counter', geohash: '9q8yyk8yt', binds: 'pos.json', products: [{ name: 'Box of screws', price: '1' }] },
    { addressIndex: 7, name: 'Meridian Books', specialty: 'books, own delivery', geohash: '9q8yyk8yv', binds: 'local-commerce.json', courierIndex: 8, products: [{ name: 'Paperback', price: '1' }] },
    { addressIndex: 8, name: 'Cardinal Couriers', specialty: 'last-mile delivery', geohash: '9q8yyk8yw', binds: 'local-commerce.json', products: [{ name: 'Standard delivery', price: '1', category: 'delivery' }] },
    { addressIndex: 9, name: 'Linden Florist', specialty: 'flowers, buyer-arranged delivery', geohash: '9q8yyk8yx', binds: 'local-commerce.json', products: [{ name: 'Bouquet', price: '1' }] },
    { addressIndex: 10, name: 'Copperline Parts', specialty: 'spare parts, auction-arranged delivery', geohash: '9q8yyk8yy', binds: 'local-commerce.json', products: [{ name: 'Spare part', price: '1' }] },
    { addressIndex: 11, name: 'Fernhill Nursery', specialty: 'plants, emissions-disclosed delivery', geohash: '9q8yyk8yz', binds: 'local-commerce.json', courierIndex: 8, products: [{ name: 'Potted plant', price: '1' }] },
    { addressIndex: 12, name: 'Sterling Goods', specialty: 'general goods, delivery with named recourse', geohash: '9q8yyk8z0', binds: 'pos.json', products: [{ name: 'Hardware kit', price: '1' }] },
];

/** The slug a reference assembly is anchored under: the composition hash of the
 *  assembly AFTER the deploy-time currency fill — the same hash
 *  populateReferenceAssemblies anchored, never the raw file's. */
function referenceSlug(file, tokenAddress) {
    const { assembly } = readBuiltAssembly(path.join(ASSEMBLIES_DIR, file), AUTHORED, AUTHORED_AGREEMENTS);
    return deriveAssemblySlug(assemblyCompositionHash(fillDeployTimeCurrency(assembly, tokenAddress)));
}

const slugifyId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const isAlreadyRegistered = (err) => /AlreadyRegistered/i.test(err instanceof Error ? err.message : String(err));


// ── Seed assembly (AssemblyRegistry) ─────────────────────────────────────────
// The suite's runtime specs need >=1 anchored assembly BEFORE any test runs
// (the even-surfacing rule: a member surfaces only with an anchored binding,
// so an empty AssemblyRegistry means zero surfaced members). Seeding is
// PRE-POPULATION, exactly like clauses and sellers above — never a test
// (the scenario-era build-order coupling is the cautionary tale). Each seed is
// authored like a reference: its agreements composed by clause name
// (`composeAuthoredAgreement` — the mandatory clauses fold in, so a seed
// writes only what it selects), then the assembly built over them by name
// (`assembleAuthored`): its agreements register on AgreementRegistry, then
// its assembly anchors — identity (agreement keys, compositionHash + slug)
// and canonical JSON come from the SDK.

/** The seeds' authored agreements, composed once, by name. Design time is
 *  STRUCTURAL: a clause is SELECTED; its values are the buyer's at checkout. */
const SEED_AGREEMENTS = Object.fromEntries(Object.entries({
    // The blank agreement: the mandatory clauses alone.
    blank: { clauses: {} },
    // A root merchant agreement: the merchant process and the modality the
    // buyer picks at checkout.
    merchant: { clauses: { 'figaro-merchant-process': {}, 'figaro-modalities': {} } },
    // A courier sub-agreement.
    courier: { clauses: { 'figaro-courier-process': {} } },
    // A supplier sub-agreement: the merchant process alone.
    supplier: { clauses: { 'figaro-merchant-process': {} } },
}).map(([name, authored]) => [name, composeAuthoredAgreement(authored, AUTHORED).document]));

// The zero-address sentinel, the currency fill, and the anchoring itself all
// live in populate-clauses.mjs now — the ONE reference-assembly population
// path, shared by devnet (EOA + mock token, here) and testnet/mainnet
// (treasury + ruled token). This file keeps only the devnet TEST SCAFFOLDING.

/** The blank single-agreement composition: mandatory clauses only — the
 *  minimal bindable assembly the single-order specs run against. */
function seedBlank() {
    return assembleAuthored({
        name: 'Devnet seed',
        summary: 'Pre-populated bindable assembly for the e2e suite.',
        description: 'A blank single-agreement composition (mandatory clauses only), anchored by populate-test-data so sellers can bind before any spec runs.',
        agreements: [{ id: 'order-0', agreement: 'blank' }],
    }, SEED_AGREEMENTS, AUTHORED);
}

/** The multi-order value-added CHAIN — the externalized P&L the multi-order
 *  e2e runs end-to-end: a root merchant agreement (merchant process, delivery
 *  modality) plus courier and supplier sub-agreements. Which agreements
 *  compose which agreement is scenario DATA (a designed assembly this seed
 *  reproduces byte-for-byte), exactly like the member roster above.
 *  Counterparties are NOT seeded — the lead binds + designates them through
 *  the real UI flow. */
function seedChain() {
    return assembleAuthored({
        name: 'Devnet delivery chain',
        summary: 'Three-order value-added chain: merchant, courier, supplier.',
        description: 'A delivery chain for the multi-order e2e: the buyer sees the full decomposition at checkout, each contributor is bond-secured, and the single resolve pays every party.',
        agreements: [
            { id: 'order-0', agreement: 'merchant' },
            { id: 'order-1', agreement: 'courier', parentOrderHashes: ['order-0'] },
            { id: 'order-2', agreement: 'supplier', parentOrderHashes: ['order-0'] },
        ],
    }, SEED_AGREEMENTS, AUTHORED);
}

async function main() {
    const env = readEnvLocal();
    const clauseRegistry = env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const membersRegistry = env.NEXT_PUBLIC_MEMBERS_REGISTRY;
    const assemblyRegistry = env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    const agreementRegistry = env.NEXT_PUBLIC_AGREEMENT_REGISTRY;
    const mockErc20 = env.NEXT_PUBLIC_TOKEN_ADDRESS;
    const ipfsApiUrl = env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!clauseRegistry || !membersRegistry || !assemblyRegistry || !agreementRegistry || !mockErc20) {
        throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY / NEXT_PUBLIC_MEMBERS_REGISTRY / NEXT_PUBLIC_ASSEMBLY_REGISTRY / NEXT_PUBLIC_AGREEMENT_REGISTRY / NEXT_PUBLIC_TOKEN_ADDRESS missing — deploy first.');
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    await publicClient.getBlockNumber().catch(() => { throw new Error(`Cannot reach the chain at ${RPC_URL}`); });

    // ── 1. Clauses (reuse the production path) ──────────────────────────────
    const registrar = registrarAccount();
    const registrarClient = createWalletClient({ account: registrar, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    console.log('Clauses:');
    await populateClauses({ publicClient, walletClient: registrarClient, account: registrar, registry: clauseRegistry, ipfsApiUrl });

    // ── 1b. Seed assemblies (idempotent) ────────────────────────────────────
    //  The REFERENCE assemblies (`assemblies/*.json` — the user-onboarding
    //  set, the sibling of `clauses/`) are the deploy's genesis
    //  (`scripts/deploy-local.sh` registers them through populate-clauses,
    //  with this same token), so the call below finds each one's agreements
    //  and assembly already bound and skips them: compositionHash and every
    //  agreement key are content-derived, the registries' `bindings` read is
    //  the already-registered test, and first write wins whoever the
    //  registrar. It still anchors them on a registry that lacks them. Their
    //  affixed documents (`assemblies/documents/*`) pin beforehand so every
    //  in-assembly ipfs:// reference resolves. The two inline assemblies are
    //  devnet TEST SCAFFOLDING, not references; specs recognize them by shape
    //  (`discoverSeedAssemblies` in tests/e2e/devnet-helpers.ts), never by
    //  registration order — the references are anchored before them.
    console.log('\nAssemblies:');
    const anchorArgs = { publicClient, walletClient: registrarClient, account: registrar, registry: assemblyRegistry, agreementRegistry, ipfsApiUrl };
    const documentsDir = path.join(ASSEMBLIES_DIR, 'documents');
    if (fs.existsSync(documentsDir)) {
        for (const file of fs.readdirSync(documentsDir).sort()) {
            const cid = await pinFile(ipfsApiUrl, path.join(documentsDir, file));
            console.log(`  · document ${file} — pinned ipfs://${cid}`);
        }
    }
    await anchorBuiltAssembly({ ...anchorArgs, built: seedBlank() });
    await anchorBuiltAssembly({ ...anchorArgs, built: seedChain() });
    await populateReferenceAssemblies({ ...anchorArgs, tokenAddress: mockErc20 });

    // ── 2. Members (catalog → profile → register, all pinned + anchored) ──
    const [tokenSymbol, tokenName] = await Promise.all([
        publicClient.readContract({ address: mockErc20, abi: ERC20_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: mockErc20, abi: ERC20_ABI, functionName: 'name' }),
    ]);
    // The second devnet token: sellers accept it alongside the default, so the
    // buyer may fund a bond from it via the swap-and-commit path (acceptedTokens
    // IS the swap-into set; the process stays denominated in the default).
    const permitErc20 = env.NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS;
    const permitTokenEntry = permitErc20
        ? [{
            address: permitErc20,
            symbol: await publicClient.readContract({ address: permitErc20, abi: ERC20_ABI, functionName: 'symbol' }),
            name: await publicClient.readContract({ address: permitErc20, abi: ERC20_ABI, functionName: 'name' }),
        }]
        : [];

    console.log('\nSellers:');
    for (const s of SELLERS) {
        const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.addressIndex });
        const sellerClient = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // The canonical catalog-document shape (`MemberCatalogMetadata`):
        // the items key is `items` (a `menu` key parses to an EMPTY catalog —
        // the item list every read projects from, incl. sub-order pricing);
        // `category` only when authored (never a coined default).
        const catalog = {
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
        const catalogURI = await pinJSON(ipfsApiUrl, JSON.stringify(catalog));

        // Authored with the courier clause's NAME; resolved to its key here.
        const profile = resolveAuthoredClauseKeys({
            subjectAddress: account.address,
            name: s.name,
            specialty: s.specialty,
            catalogURI,
            location: { geohash: s.geohash },
            acceptedTokens: [{ address: mockErc20, symbol: tokenSymbol, name: tokenName }, ...permitTokenEntry],
            defaultTokenAddress: mockErc20,
            assemblyBindings: [{
                bindingId: `seed-${s.addressIndex}`,
                subjectAddress: account.address,
                assemblySlug: referenceSlug(s.binds, mockErc20),
                counterpartyBindings: s.courierIndex == null
                    ? []
                    : [{ clauseId: COURIER_CLAUSE, addresses: [mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.courierIndex }).address] }],
            }],
        }, AUTHORED);
        const metadataURI = await pinJSON(ipfsApiUrl, JSON.stringify(profile));

        try {
            const { request } = await publicClient.simulateContract({
                account: account.address, address: membersRegistry, abi: MEMBERS_REGISTRY_ABI,
                functionName: 'register', args: [metadataURI], value: REGISTRATION_DEPOSIT,
            });
            const hash = await sellerClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`  ✓ ${s.name} (anvil[${s.addressIndex}]) — registered; profile ${metadataURI}`);
        } catch (err) {
            if (!isAlreadyRegistered(err)) throw err;
            // Already registered — refresh the pinned profile so a re-run repairs it.
            const { request } = await publicClient.simulateContract({
                account: account.address, address: membersRegistry, abi: MEMBERS_REGISTRY_ABI,
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
