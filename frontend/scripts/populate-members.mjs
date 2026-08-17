#!/usr/bin/env node
/**
 * Register ONE member profile on MembersRegistry — the members family's seed
 * path (`populate-clauses.mjs`' sibling: parallel registry families, one
 * script each; the shared plumbing — chain resolution, pinning, the Ledger
 * wallet, the vault approve/execute cycle — is imported from there, never
 * re-implemented).
 *
 * The profile document is the MEMBER's own declaration (SDK
 * `MemberProfileMetadata`; only `name` is required) and is validated with the
 * SDK parser before it is pinned. Every member registers from ITS OWN wallet
 * with ITS OWN stake (RELEASE_READINESS Task 13): the founder direct from the
 * Ledger, the DAO through its vault from the vault's balance, a stranger from
 * theirs. One registrar per invocation:
 *
 *   MEMBER_PROFILE            — path to the profile JSON (required)
 *   NEXT_PUBLIC_MEMBERS_REGISTRY — the MembersRegistry address (required;
 *                               frontend/.env.local unless overridden)
 *   RPC_URL                   — chain RPC (default http://127.0.0.1:8545)
 *   REGISTRAR_PRIVATE_KEY     — EOA registrar (devnet default anvil[0]), OR
 *   REGISTRAR_LEDGER_HD_PATH  — Ledger registrar (signed on the device), OR
 *   REGISTRAR_VAULT + VAULT_OWNER_KEYS [+ VAULT_LEDGER_HD_PATH]
 *                             — the vault registers, staking from its own balance
 *   IPFS_PIN_SERVICE_JWT / NEXT_PUBLIC_IPFS_API_URL — pinning, as populate-clauses
 *
 * Idempotent: an already-registered wallet is reported and skipped (a profile
 * refresh is `updateProfile`, the member's own runtime act — not seeding).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MEMBERS_REGISTRY_ABI, parseMemberProfileDocument } from '@figaro/sdk';
import {
    VAULT_ABI, ledgerWalletClient, pinJSON, pinService, readEnvLocal, registrarAccount, resolveChain, vaultExecute,
} from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

async function main() {
    const env = readEnvLocal();
    const registry = process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? env.NEXT_PUBLIC_MEMBERS_REGISTRY;
    const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!registry) throw new Error('NEXT_PUBLIC_MEMBERS_REGISTRY missing — deploy the contracts first.');
    const profilePath = process.env.MEMBER_PROFILE;
    if (!profilePath) throw new Error('MEMBER_PROFILE (path to the profile JSON) is required');
    const raw = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf8'));
    // Strict SDK parse: a malformed profile fails HERE, not in every reader.
    const profile = parseMemberProfileDocument(raw);

    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    const vault = process.env.REGISTRAR_VAULT;
    if (vault && process.env.REGISTRAR_LEDGER_HD_PATH) {
        throw new Error('REGISTRAR_VAULT and REGISTRAR_LEDGER_HD_PATH are two registrars — one per invocation');
    }
    const walletClient = process.env.REGISTRAR_LEDGER_HD_PATH
        ? ledgerWalletClient({ hdPath: process.env.REGISTRAR_LEDGER_HD_PATH, rpcUrl: RPC_URL })
        : createWalletClient({ account: registrarAccount(), chain, transport: http(RPC_URL) });
    let ownerClients;
    if (vault) {
        const keys = (process.env.VAULT_OWNER_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (keys.length === 0) throw new Error('REGISTRAR_VAULT is set but VAULT_OWNER_KEYS is missing');
        ownerClients = keys.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http(RPC_URL) }));
        if (process.env.VAULT_LEDGER_HD_PATH) {
            ownerClients.push(ledgerWalletClient({ hdPath: process.env.VAULT_LEDGER_HD_PATH, rpcUrl: RPC_URL }));
        }
        for (const c of ownerClients) {
            const ok = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: 'isOwner', args: [c.account.address] });
            if (!ok) throw new Error(`${c.account.address} is not an owner of vault ${vault}`);
        }
    }
    const member = vault ?? walletClient.account.address;
    // The profile speaks for the wallet that registers it — refuse a document
    // that names another wallet as its subject.
    if (profile.subjectAddress && profile.subjectAddress.toLowerCase() !== member.toLowerCase()) {
        throw new Error(`profile.subjectAddress ${profile.subjectAddress} is not the registering wallet ${member}`);
    }

    console.log(`Registering member → MembersRegistry ${registry} (chain ${chain.id})`);
    console.log(`  member    ${member}${vault ? ' (vault)' : ''}`);
    console.log(`  IPFS      ${pinService() ? `pin service (${pinService().api})` : ipfsApiUrl}`);

    if (await publicClient.readContract({ address: registry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [member] })) {
        console.log(`  · ${member} — already registered, skipped`);
        return;
    }
    const deposit = await publicClient.readContract({ address: registry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit' });
    const balance = await publicClient.getBalance({ address: member });
    if (balance < deposit) throw new Error(`${member} holds ${balance} wei but the registration deposit is ${deposit} wei — fund it first`);
    const metadataURI = await pinJSON(ipfsApiUrl, JSON.stringify(profile));

    if (vault) {
        // Nonce = the member address itself: unique per member, deterministic across re-runs.
        await vaultExecute({
            publicClient, vault, ownerClients, to: registry, value: deposit,
            data: encodeFunctionData({ abi: MEMBERS_REGISTRY_ABI, functionName: 'register', args: [metadataURI] }),
            nonce: BigInt(member),
        });
    } else {
        const { request } = await publicClient.simulateContract({
            account: walletClient.account.address, address: registry, abi: MEMBERS_REGISTRY_ABI,
            functionName: 'register', args: [metadataURI], value: deposit,
        });
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
    }
    console.log(`  ✓ ${profile.name} (${member}) — registered; profile ${metadataURI}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
