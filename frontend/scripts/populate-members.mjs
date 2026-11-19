#!/usr/bin/env node
/**
 * Register ONE member profile on MembersRegistry — the members family's seed
 * path (`populate-clauses.mjs`' sibling: parallel registry families, one
 * script each; the shared plumbing — chain resolution, pinning, the Ledger
 * wallet, the vault approve/execute cycle — is imported from there, never
 * re-implemented).
 *
 * The profile document is the MEMBER's own declaration (SDK
 * `MemberProfileMetadata`; only `name` is required). It is authored by clause
 * NAME (`name` or `name@version`); every name is resolved to the key of the
 * spec in `clauses/` it names (`resolveAuthoredClauseKeys`) and the result is
 * validated with the SDK parser before it is pinned, so the pinned profile
 * carries keys. Every member registers from ITS OWN wallet
 * with ITS OWN stake (RELEASE_READINESS Task 13), the wallet the plan in
 * deployments/<chainId>.expected.json names for its file (`registrations.
 * members`; `scripts/seed/seed.sh member <file>` sets the registrar and
 * refuses a signer whose address is not the plan's): the founder direct from
 * the Ledger; the DAO from its operator EOA (`daoOperator`), a plain
 * transaction signed with that EOA's own key (DAO_OPERATOR_KEY) and staked
 * from its balance, never from the vault address (members/README.md); a
 * stranger from theirs. One registrar per invocation:
 *
 *   MEMBER_PROFILE            — path to the profile JSON (required)
 *   NEXT_PUBLIC_MEMBERS_REGISTRY — the MembersRegistry address (required;
 *                               frontend/.env.local unless overridden)
 *   RPC_URL                   — chain RPC (default http://127.0.0.1:8545)
 *   REGISTRAR_PRIVATE_KEY     — EOA registrar (devnet default anvil[0]), OR
 *   REGISTRAR_LEDGER_HD_PATH  — Ledger registrar (signed on the device), OR
 *   REGISTRAR_IMPERSONATE     — fork rehearsal only: an address impersonated
 *                               on an Anvil node (populate-clauses.mjs), OR
 *   REGISTRAR_VAULT + VAULT_OWNER_KEYS [+ VAULT_LEDGER_HD_PATH | VAULT_IMPERSONATE_OWNER]
 *                             — the vault registers ITSELF as the member, staking
 *                               from its own balance; the seeding never runs it
 *                               for a profile in members/ (the treasury wallet
 *                               holds no profile: docs/DAO.md § "Who holds the
 *                               treasury")
 *   IPFS_PIN_SERVICE_JWT / NEXT_PUBLIC_IPFS_API_URL — pinning, as populate-clauses
 *
 * Idempotent: an already-registered wallet is reported and skipped (a profile
 * refresh is `updateProfile`, the member's own runtime act — not seeding).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, encodeFunctionData, http } from 'viem';
import { MEMBERS_REGISTRY_ABI, parseMemberProfileDocument, resolveAuthoredClauseKeys } from '@figaro-protocol/sdk';
import {
    VAULT_ABI, loadAuthoredSpecs, pinJSON, pinService, readEnvLocal, registrarWalletClient, resolveChain, vaultExecute, vaultOwnerClients,
} from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

async function main() {
    const env = readEnvLocal();
    const registry = process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? env.NEXT_PUBLIC_MEMBERS_REGISTRY;
    const ipfsApiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    if (!registry) throw new Error('NEXT_PUBLIC_MEMBERS_REGISTRY missing — deploy the contracts first.');
    const profilePath = process.env.MEMBER_PROFILE;
    if (!profilePath) throw new Error('MEMBER_PROFILE (path to the profile JSON) is required');
    const authored = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf8'));
    // Seed time: the authored clause names become the keys of the loaded specs.
    const raw = resolveAuthoredClauseKeys(authored, loadAuthoredSpecs());
    // Strict SDK parse: a malformed profile fails HERE, not in every reader.
    const profile = parseMemberProfileDocument(raw);

    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    const vault = process.env.REGISTRAR_VAULT;
    if (vault && (process.env.REGISTRAR_LEDGER_HD_PATH || process.env.REGISTRAR_IMPERSONATE)) {
        throw new Error('REGISTRAR_VAULT and REGISTRAR_LEDGER_HD_PATH / REGISTRAR_IMPERSONATE are two registrars — one per invocation');
    }
    let ownerClients;
    if (vault) {
        if (!(process.env.VAULT_OWNER_KEYS ?? '').trim()) throw new Error('REGISTRAR_VAULT is set but VAULT_OWNER_KEYS is missing');
        ownerClients = await vaultOwnerClients({ chain, rpcUrl: RPC_URL });
    }
    // In vault mode the executing owner sends every transaction the run sends.
    const walletClient = vault ? ownerClients[0] : await registrarWalletClient({ chain, rpcUrl: RPC_URL });
    if (vault) {
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
        await publicClient.simulateContract({
            account: walletClient.account.address, address: registry, abi: MEMBERS_REGISTRY_ABI,
            functionName: 'register', args: [metadataURI], value: deposit,
        });
        // Write through the client's own shape (never the simulated request —
        // that carries a JSON-RPC account and needs the node to hold the key).
        const hash = await walletClient.writeContract({
            address: registry, abi: MEMBERS_REGISTRY_ABI,
            functionName: 'register', args: [metadataURI], value: deposit,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }
    console.log(`  ✓ ${profile.name} (${member}) — registered; profile ${metadataURI}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
