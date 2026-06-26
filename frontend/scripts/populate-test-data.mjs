#!/usr/bin/env node
/**
 * populate-test-data.mjs — the ONE pre-population path FOR TESTING. Populates the
 * registries the e2e suite consumes from: clauses (ClauseRegistry + IPFS, reusing
 * populate-clauses) AND sellers (SellerRegistry + IPFS). Run after deploy, before
 * the test suite. The runtime specs then discover everything from chain → IPFS.
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
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    LOCAL_ANVIL, pinJSON, populateClauses, readEnvLocal, registrarAccount,
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

async function main() {
    const env = readEnvLocal();
    const clauseRegistry = env.NEXT_PUBLIC_CLAUSE_REGISTRY;
    const sellerRegistry = env.NEXT_PUBLIC_SELLER_REGISTRY;
    const mockErc20 = env.NEXT_PUBLIC_TOKEN_ADDRESS;
    const ipfsApiUrl = env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!clauseRegistry || !sellerRegistry || !mockErc20) {
        throw new Error('NEXT_PUBLIC_CLAUSE_REGISTRY / NEXT_PUBLIC_SELLER_REGISTRY / NEXT_PUBLIC_TOKEN_ADDRESS missing — deploy first.');
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    await publicClient.getBlockNumber().catch(() => { throw new Error(`Cannot reach the chain at ${RPC_URL}`); });

    // ── 1. Clauses (reuse the production path) ──────────────────────────────
    const registrar = registrarAccount();
    const registrarClient = createWalletClient({ account: registrar, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    console.log('Clauses:');
    await populateClauses({ publicClient, walletClient: registrarClient, account: registrar, registry: clauseRegistry, ipfsApiUrl });

    // ── 2. Sellers (catalogue → profile → register, all pinned + anchored) ──
    const [tokenSymbol, tokenName] = await Promise.all([
        publicClient.readContract({ address: mockErc20, abi: ERC20_VIEW_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: mockErc20, abi: ERC20_VIEW_ABI, functionName: 'name' }),
    ]);

    console.log('\nSellers:');
    for (const s of SELLERS) {
        const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.addressIndex });
        const sellerClient = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const catalogue = {
            subjectAddress: account.address,
            version: '0.1.0',
            unitSystem: 'metric',
            menu: s.products.map((p) => ({
                id: slugifyId(p.name),
                name: p.name,
                description: p.name,
                price: p.price,
                pricingPolicy: 'fixed',
                category: p.category ?? 'General',
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
    console.log('\nDone — test clauses + sellers pre-populated.');
}

main().catch((err) => { console.error(err); process.exit(1); });
