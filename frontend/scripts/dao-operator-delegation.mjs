/**
 * dao-operator-delegation.mjs — stand up the DAO's operator EOA on the
 * MetaMask Delegation Framework (RULED 2026-08-19; RELEASE_READINESS Task 13
 * carries the addresses; FLORIN_TOKEN.md § DAO custody the design).
 *
 * The operator EOA is the DAO's ONE account in the ecosystem. Two acts, each
 * a subcommand:
 *
 *   node scripts/dao-operator-delegation.mjs install
 *     Signs the operator's EIP-7702 authorization designating the canonical
 *     `EIP7702StatelessDeleGator` implementation and lands it in a type-4
 *     transaction sent by a relayer key (the operator needs no gas). The
 *     operator's address then carries the delegated code; its own key keeps
 *     signing EIP-712 commitments as before.
 *
 *   node scripts/dao-operator-delegation.mjs grant
 *     Signs an ERC-7710 delegation from the operator to the VAULT (the
 *     multisig), bounded by an AllowedTargetsEnforcer caveat, and writes the
 *     signed delegation JSON for the vault to redeem when governance needs
 *     to act from the operator's address (`DelegationManager.
 *     redeemDelegations` — the manager checks msg.sender IS the delegate,
 *     so only the vault can use it). The delegation is data, not a
 *     transaction: nothing is broadcast; the file is the artifact.
 *
 * Canonical addresses (v1.3.0, CREATE2 — the SAME on Sepolia and mainnet, so
 * the testnet install rehearses mainnet literally), overridable by env:
 *   DELEGATOR_IMPL     0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B
 *   DELEGATION_MANAGER 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
 *   ALLOWED_TARGETS_ENFORCER 0x7F20f61b1f09b08D970938F6fa563634d65c4EeB
 *
 * Env:
 *   RPC_URL             — required
 *   DAO_OPERATOR_KEY    — the operator's private key (required)
 *   RELAYER_KEY         — install only: pays the type-4 tx's gas
 *   DELEGATE            — grant only: the vault address (the delegation's delegate)
 *   ALLOWED_TARGETS     — grant only: csv of addresses the vault may call from
 *                         the operator's address (the caveat's terms). Empty =
 *                         UNBOUNDED (refused unless ALLOW_UNBOUNDED=1).
 *   DELEGATION_OUT      — grant only: output path (default
 *                         ../deployments/dao-operator-delegation.<chainId>.json)
 *   SALT                — grant only: uint256 salt (default 0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { concat, createPublicClient, createWalletClient, http, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { resolveChain } from './populate-clauses.mjs';

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) throw new Error('RPC_URL is required');

const DELEGATOR_IMPL = process.env.DELEGATOR_IMPL ?? '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B';
const DELEGATION_MANAGER = process.env.DELEGATION_MANAGER ?? '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3';
const ALLOWED_TARGETS_ENFORCER = process.env.ALLOWED_TARGETS_ENFORCER ?? '0x7F20f61b1f09b08D970938F6fa563634d65c4EeB';
/** DelegationManager.ROOT_AUTHORITY — the delegation is granted by the root
 *  authority (the operator itself), not re-delegated. */
const ROOT_AUTHORITY = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

async function main() {
    const cmd = process.argv[2];
    if (!['install', 'grant'].includes(cmd)) throw new Error('usage: dao-operator-delegation.mjs <install|grant>');
    if (!process.env.DAO_OPERATOR_KEY) throw new Error('DAO_OPERATOR_KEY is required');
    const operator = privateKeyToAccount(process.env.DAO_OPERATOR_KEY);
    const chain = await resolveChain();
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    if (cmd === 'install') {
        // The framework's canonical contracts must exist on this chain — the
        // authorization is meaningless pointed at empty code.
        for (const [label, addr] of [['DeleGator impl', DELEGATOR_IMPL], ['DelegationManager', DELEGATION_MANAGER]]) {
            const code = await publicClient.getCode({ address: addr });
            if (!code || code === '0x') throw new Error(`${label} has no code at ${addr} on this chain`);
        }
        if (!process.env.RELAYER_KEY) throw new Error('RELAYER_KEY is required for install (pays the type-4 tx)');
        const relayer = privateKeyToAccount(process.env.RELAYER_KEY);
        const relayerClient = createWalletClient({ account: relayer, chain, transport: http(RPC_URL) });
        const authorization = await relayerClient.signAuthorization({
            account: operator, contractAddress: DELEGATOR_IMPL,
        });
        const hash = await relayerClient.sendTransaction({
            to: operator.address, value: 0n, authorizationList: [authorization],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        const code = await publicClient.getCode({ address: operator.address });
        const expected = concat(['0xef0100', DELEGATOR_IMPL.toLowerCase()]);
        if ((code ?? '').toLowerCase() !== expected.toLowerCase()) {
            throw new Error(`authorization landed but code readback mismatches: ${code}`);
        }
        console.log(`✓ operator ${operator.address} now designates ${DELEGATOR_IMPL} (tx ${hash})`);
        return;
    }

    // grant — sign the delegation to the vault, bounded by allowed targets.
    const delegate = process.env.DELEGATE;
    if (!delegate) throw new Error('DELEGATE (the vault address) is required for grant');
    const targets = (process.env.ALLOWED_TARGETS ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    if (!targets.length && !process.env.ALLOW_UNBOUNDED) {
        throw new Error('ALLOWED_TARGETS is empty — an unbounded delegation lets the delegate make ANY call from the operator; set ALLOW_UNBOUNDED=1 only if that is really intended');
    }
    const caveats = targets.length
        ? [{ enforcer: ALLOWED_TARGETS_ENFORCER, terms: concat(targets) }]
        : [];
    const delegation = {
        delegate, delegator: operator.address, authority: ROOT_AUTHORITY,
        caveats, salt: BigInt(process.env.SALT ?? 0),
    };
    const signature = await operator.signTypedData({
        domain: { name: 'DelegationManager', version: '1', chainId: chain.id, verifyingContract: DELEGATION_MANAGER },
        types: {
            Delegation: [
                { name: 'delegate', type: 'address' }, { name: 'delegator', type: 'address' },
                { name: 'authority', type: 'bytes32' }, { name: 'caveats', type: 'Caveat[]' },
                { name: 'salt', type: 'uint256' },
            ],
            Caveat: [{ name: 'enforcer', type: 'address' }, { name: 'terms', type: 'bytes' }],
        },
        primaryType: 'Delegation',
        message: delegation,
    });
    const out = process.env.DELEGATION_OUT
        ?? path.resolve(import.meta.dirname, `../../deployments/dao-operator-delegation.${chain.id}.json`);
    // `args` ride each caveat at REDEMPTION time (excluded from the signed
    // hash); the stored shape carries them empty so the redeem tooling can
    // pass the struct through verbatim.
    const stored = {
        ...delegation,
        salt: delegation.salt.toString(),
        caveats: caveats.map((c) => ({ ...c, args: '0x' })),
        signature,
        delegationManager: DELEGATION_MANAGER,
        chainId: chain.id,
        note: 'ERC-7710 delegation: the vault (delegate) may act from the operator (delegator) via DelegationManager.redeemDelegations, bounded by the caveats. Redemption is the vault\'s multisig act.',
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(stored, null, 2)}\n`);
    console.log(`✓ delegation ${operator.address} → ${delegate} signed (${targets.length ? `targets: ${targets.join(', ')}` : 'UNBOUNDED'}); written to ${out}`);
}

main();
