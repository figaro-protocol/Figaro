#!/usr/bin/env node
/**
 * populate-test-data.mjs — the ONE pre-population path FOR TESTING. Populates the
 * registries the e2e suite consumes from: clauses (ClauseRegistry + IPFS, reusing
 * populate-clauses), the seed assemblies (AssemblyRegistry + IPFS — the blank
 * mandatory-only composition sellers bind, plus the multi-order delivery chain
 * the multi-order e2e runs), AND sellers (MembersRegistry + IPFS).
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
 * Env (frontend/.env.local): NEXT_PUBLIC_CLAUSE_REGISTRY, NEXT_PUBLIC_MEMBERS_REGISTRY,
 *   NEXT_PUBLIC_TOKEN_ADDRESS, NEXT_PUBLIC_IPFS_API_URL, RPC_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
// Protocol canonicals come from the SDK (@figaro/sdk, file:../sdk): the
// registry + ERC-20 ABIs, the canonical-JSON convention, and the assembly
// identity (compositionHash + slug). Nothing is re-implemented here.
import {
    MEMBERS_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, ERC20_ABI,
    canonicalize, templateCompositionHash, deriveAssemblySlug,
} from '@figaro/sdk';
import {
    ASSEMBLIES_DIR, CLAUSES_DIR, LOCAL_ANVIL, pinFile, pinJSON, populateClauses, readEnvLocal, registrarAccount,
} from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRATION_DEPOSIT = 1_000_000_000_000_000n; // 0.001 ETH

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
// (maintainer ruling 2026-07-02; the scenario-era build-order coupling is the
// cautionary tale). The template reproduces the designer's emission byte for
// byte: identity (compositionHash + slug) and canonical JSON come from the
// SDK; the mandatory fold mirrors `lib/designer/buildAssemblyTemplate.ts`
// (composeStructuralClauses) — so the anchored document is indistinguishable
// from a designer-published one.

/** Fold the MANDATORY clauses (block.design.article === "mandatory",
 *  read from the canonical Layer-A specs — derived, never named) onto an
 *  order: each takes the subset of the design-time bag it declares. Parents
 *  are LOCAL template ids — mirrors the designer's composeStructuralClauses. */
function mandatoryClauseFold(parents = []) {
    const bag = { parentOrderHashes: parents };
    const out = {};
    for (const file of fs.readdirSync(CLAUSES_DIR).filter((f) => f.endsWith('.json')).sort()) {
        const spec = JSON.parse(fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8'));
        if (spec.block?.design?.article !== 'mandatory') continue;
        // Mandatory folds at the level its scope names (ruled 2026-07-28):
        // assembly-scoped mandatory (assembly-provenance) is a template-level
        // fold, not a per-agreement one.
        if (spec.block?.design?.scope === 'assembly') continue;
        const data = {};
        for (const field of spec.fields ?? []) {
            if (field.name in bag) data[field.name] = bag[field.name];
        }
        out[spec.clauseId] = data;
    }
    if (Object.keys(out).length === 0) throw new Error('no mandatory clauses found in clauses/*.json');
    return out;
}

// The zero address — the codebase's standing sentinel for an unset
// address-hex value (mirrors `ZERO_ADDRESS` in frontend/lib/shared/evm.ts and
// the SDK's own address-hex schema default). A reference assembly cannot ship
// a REAL token address: `assemblies/*.json` is checked in once and reused by
// every fresh devnet deploy, but the deployed MockERC20's address is new
// every time. A reference that composes figaro-utility-token (an
// ASSEMBLY-SCOPED designer fill — ruled 2026-07-28 — that is part of the
// composition's identity) ships the sentinel in place of the pin; this SEED
// PATH is the one place that knows the live deployment's token address, so it
// substitutes it in HERE, before pinning — the anchored template (and its
// compositionHash) carries the real pin, never the sentinel.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Fill the deploy-time currency pin: any assembly-scoped figaro-utility-token
 *  composed with the ZERO_ADDRESS sentinel gets the live token address
 *  substituted before anchoring. Templates that don't compose the clause, or
 *  that already pin a real address, pass through unchanged. */
function fillDeployTimeCurrency(template, tokenAddress) {
    const pin = template.assemblyClauses?.['figaro-utility-token'];
    if (!pin || pin.currency !== ZERO_ADDRESS) return template;
    return {
        ...template,
        assemblyClauses: {
            ...template.assemblyClauses,
            'figaro-utility-token': { ...pin, currency: tokenAddress },
        },
    };
}

async function anchorAssembly({ publicClient, walletClient, account, registry, ipfsApiUrl, template }) {
    // Composition hash over the COMPOSITION ONLY (editorial excluded); the slug
    // is presentation, derived off-chain. Both from the SDK single home — the
    // registry keys bindings by compositionHash.
    const compositionHash = templateCompositionHash(template);
    const slug = deriveAssemblySlug(compositionHash);

    const anchored = await publicClient.getContractEvents({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered',
        args: { compositionHash }, fromBlock: 0n,
    });
    if (anchored.length > 0) {
        console.log(`  · ${slug} — already anchored, skipped`);
        return slug;
    }

    const contentURI = await pinJSON(ipfsApiUrl, canonicalize(template));
    const deposit = await publicClient.readContract({
        address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
    });
    const { request } = await publicClient.simulateContract({
        account: account.address, address: registry, abi: ASSEMBLY_REGISTRY_ABI,
        functionName: 'registerAssembly', args: [compositionHash, contentURI], value: deposit,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ✓ ${slug} — anchored; template ${contentURI}`);
    return slug;
}

/** The blank single-agreement composition: mandatory clauses only — the
 *  minimal bindable assembly the single-order specs run against. */
function seedTemplateBlank() {
    return {
        name: 'Devnet seed',
        summary: 'Pre-populated bindable assembly for the e2e suite.',
        description: 'A blank single-agreement composition (mandatory clauses only), anchored by populate-test-data so sellers can bind before any spec runs.',
        // Provenance is MANDATORY AT ASSEMBLY SCOPE (ruled 2026-07-28): the
        // assembly-scope fold carries it into every agreement, checkout fills
        // the template's own compositionHash mechanically, and the designer
        // credit can land. A seed without it denies every run that binds it
        // the RPGF assembly leg — which is how the first-commit walkthrough
        // resolved with assemblyRecorded:false for weeks.
        assemblyClauses: { 'figaro-assembly-provenance': {} },
        agreements: [{ id: 'order-0', clauses: mandatoryClauseFold() }],
    };
}

/** The multi-order value-added CHAIN — the externalized P&L the multi-order
 *  e2e runs end-to-end: a root meal agreement (merchant process, delivery
 *  modality) plus courier and supplier sub-agreements. Which clauses compose
 *  which agreement is scenario DATA (a designed assembly this seed reproduces
 *  byte-for-byte), exactly like the seller roster above. Counterparties are
 *  NOT seeded — the lead binds + designates them through the real UI flow. */
function seedTemplateChain() {
    return {
        name: 'Devnet delivery chain',
        summary: 'Three-order value-added chain: meal, courier, supplier.',
        description: 'A delivery chain for the multi-order e2e: the buyer sees the full decomposition at checkout, each contributor is bond-secured, and the single resolve pays every party.',
        // The provenance declaration lives at ASSEMBLY SCOPE (ruled
        // 2026-07-28) — the fold carries it into EVERY agreement, checkout
        // fills the template's own compositionHash mechanically (the hash
        // cannot appear inside the composition it hashes), and the buyer's
        // record of it at resolve is the RPGF designer-credit event.
        assemblyClauses: { 'figaro-assembly-provenance': {} },
        agreements: [
            {
                id: 'order-0',
                clauses: {
                    'figaro-merchant-process': {},
                    // Design time is STRUCTURAL (ruled 2026-07-14): the clause
                    // is SELECTED; the modality is the buyer's checkout pick.
                    'figaro-modalities': {},
                    ...mandatoryClauseFold([]),
                },
            },
            {
                id: 'order-1',
                clauses: {
                    'figaro-courier-process': {},
                    ...mandatoryClauseFold(['order-0']),
                },
            },
            {
                id: 'order-2',
                clauses: {
                    'figaro-merchant-process': {},
                    ...mandatoryClauseFold(['order-0']),
                },
            },
        ],
    };
}

async function main() {
    const env = readEnvLocal();
    const clauseRegistry = env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const membersRegistry = env.NEXT_PUBLIC_MEMBERS_REGISTRY;
    const assemblyRegistry = env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    const mockErc20 = env.NEXT_PUBLIC_TOKEN_ADDRESS;
    const ipfsApiUrl = env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!clauseRegistry || !membersRegistry || !assemblyRegistry || !mockErc20) {
        throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY / NEXT_PUBLIC_MEMBERS_REGISTRY / NEXT_PUBLIC_ASSEMBLY_REGISTRY / NEXT_PUBLIC_TOKEN_ADDRESS missing — deploy first.');
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
    //  set, the sibling of `clauses/`) anchor first: each is a canonical
    //  AssemblyTemplate whose compositionHash is content-derived, so
    //  re-anchoring is a no-op and an e2e that authors the same composition
    //  collapses onto the same on-chain binding. Their affixed documents
    //  (`assemblies/documents/*`) pin beforehand so every in-template
    //  ipfs:// reference resolves. The two inline templates below are
    //  devnet TEST SCAFFOLDING, not references.
    console.log('\nAssemblies:');
    const anchorArgs = { publicClient, walletClient: registrarClient, account: registrar, registry: assemblyRegistry, ipfsApiUrl };
    const documentsDir = path.join(ASSEMBLIES_DIR, 'documents');
    if (fs.existsSync(documentsDir)) {
        for (const file of fs.readdirSync(documentsDir).sort()) {
            const cid = await pinFile(ipfsApiUrl, path.join(documentsDir, file));
            console.log(`  · document ${file} — pinned ipfs://${cid}`);
        }
    }
    // The inline TEST-SCAFFOLDING seeds anchor FIRST so the blank stays the
    // EARLIEST anchored single-order assembly — specs that discover "the
    // single-order seed" by `agreements.length === 1` (sellers-onboarding,
    // sign-countersign, checkout-assembly-choice, …) must resolve the blank,
    // not a single-order REFERENCE (pos/freelancer). The references anchor
    // after and are discovered by their OWN specific shapes, so order doesn't
    // affect them. (Regression fixed 2026-07-23: refs-first shadowed the blank.)
    await anchorAssembly({ ...anchorArgs, template: seedTemplateBlank() });
    await anchorAssembly({ ...anchorArgs, template: seedTemplateChain() });
    for (const file of fs.readdirSync(ASSEMBLIES_DIR).filter((f) => f.endsWith('.json')).sort()) {
        const raw = JSON.parse(fs.readFileSync(path.join(ASSEMBLIES_DIR, file), 'utf8'));
        const template = fillDeployTimeCurrency(raw, mockErc20);
        await anchorAssembly({ ...anchorArgs, template });
    }

    // ── 2. Sellers (catalogue → profile → register, all pinned + anchored) ──
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

        // The canonical catalogue-document shape (`MemberCatalogueMetadata`):
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
            acceptedTokens: [{ address: mockErc20, symbol: tokenSymbol, name: tokenName }, ...permitTokenEntry],
            defaultTokenAddress: mockErc20,
            // No bindings seeded: a seller binds a PUBLISHED assembly (asm-<hash>)
            // through the real flow — author + publish in the designer, then bind.
            assemblyBindings: [],
        };
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
