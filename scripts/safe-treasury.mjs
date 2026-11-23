#!/usr/bin/env node
// safe-treasury.mjs — the treasury's Safe, created by CREATE2 from what the
// expectations file states.
//
//   node scripts/safe-treasury.mjs address <expected.json> --rpc-url <rpc>
//   node scripts/safe-treasury.mjs ensure  <expected.json> --rpc-url <rpc>   (signs with PRIVATE_KEY)
//   node scripts/safe-treasury.mjs check   <expected.json> --rpc-url <rpc>
//
// The treasury is a Safe, on every public chain. Its address is not a value
// someone hands the deploy: Safe's own factory creates a Safe by CREATE2, so
// the address follows from the factory, the Safe's code, its owners, its
// threshold and a salt. The expectations file states the last three under
// `treasurySafe`:
//
//   "treasurySafe": { "owners": ["founder", "supporters", "deployer"],
//                     "threshold": 2, "saltNonce": "<decimal>" }
//
// where an owner is a wallet the file's `wallets` block names by a literal
// address, or a literal address itself.
//
//   address  derives the Safe's address and prints it; sends nothing.
//   ensure   derives it, creates the Safe when no code stands there, checks
//            it, and prints the address. Anyone may send the creation; the
//            owners sign nothing. A Safe already standing there is accepted
//            when it passes the check, and refused when it does not.
//   check    derives it and checks the Safe that stands there.
//
// The check: the factory, the Safe's code and the fallback handler on the
// chain are the ones Safe published (by code hash); the factory's creation
// code is the published one; the proxy at the derived address points at that
// Safe's code; its owners are the stated set and its threshold the stated
// number; it has no module, no guard, and the published fallback handler.
// Stdout carries the address alone; every other line goes to stderr.
//
// The file states the Safe as it is created, and the check is of a deploy. A
// Safe changes its own owners and threshold, and may enable a module, by a
// transaction its present owners sign, at the same address; after such a
// change the check differs from the file by design, and is no rule on the DAO.
//
// The contracts are Safe's v1.4.1, at the addresses and code hashes of its
// own registry (github.com/safe-global/safe-deployments, src/assets/v1.4.1),
// the same on Ethereum mainnet and on Sepolia. The salt is the factory's:
// keccak256(keccak256(initializer) ++ saltNonce), and the init code its
// creation code followed by the Safe's code address as one word
// (SafeProxyFactory.createProxyWithNonce and deployProxy, v1.4.1).

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
    concatHex, createPublicClient, createWalletClient, encodeFunctionData, getAddress, getContractAddress,
    http, isAddress, keccak256, pad, parseAbi, toHex, zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Safe v1.4.1 as its registry publishes it for chains 1 and 11155111. */
export const SAFE_1_4_1 = {
    proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    singleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
    fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
    codeHash: {
        proxyFactory: "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317",
        singleton: "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4",
        fallbackHandler: "0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9",
    },
    /** keccak256 of what `proxyCreationCode()` returns on the published factory. */
    proxyCreationCodeHash: "0x1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f",
};

const SAFE_ABI = parseAbi([
    "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
    "function getOwners() view returns (address[])",
    "function getThreshold() view returns (uint256)",
    "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
]);
/** Where a Safe keeps its guard and its fallback handler: keccak256 of
 *  "guard_manager.guard.address" and of "fallback_manager.handler.address". */
const GUARD_POSITION = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const FALLBACK_HANDLER_POSITION = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
/** The head of a Safe's module list, which `getModulesPaginated` starts from. */
const SENTINEL = "0x0000000000000000000000000000000000000001";
const FACTORY_ABI = parseAbi([
    "function proxyCreationCode() pure returns (bytes)",
    "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
]);

/** The Safe's owners, threshold and salt as the expectations file states them, owners as addresses. */
export function resolveSafeSpec(expected) {
    const spec = expected?.treasurySafe;
    if (!spec) return { error: 'the expectations file states no "treasurySafe"' };
    const { owners, threshold, saltNonce } = spec;
    if (!Array.isArray(owners) || owners.length === 0) return { error: "treasurySafe.owners is not a list of owners" };
    const resolved = [];
    for (const owner of owners) {
        const value = isAddress(owner) ? owner : expected.wallets?.[owner];
        if (typeof value !== "string" || !isAddress(value)) {
            return { error: `treasurySafe owner "${owner}" is neither an address nor a wallet the file names by an address` };
        }
        resolved.push(getAddress(value));
    }
    if (new Set(resolved.map((a) => a.toLowerCase())).size !== resolved.length) {
        return { error: "treasurySafe.owners names one address twice" };
    }
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > resolved.length) {
        return { error: `treasurySafe.threshold ${threshold} is not between 1 and the ${resolved.length} owner(s)` };
    }
    if (typeof saltNonce !== "string" || !/^\d+$/.test(saltNonce)) {
        return { error: "treasurySafe.saltNonce is not a decimal string" };
    }
    return { owners: resolved, threshold, saltNonce: BigInt(saltNonce) };
}

/** The `setup` call a new Safe is created with: its owners and threshold, the published fallback handler, no module, no payment. */
export function setupInitializer({ owners, threshold }) {
    return encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "setup",
        args: [owners, BigInt(threshold), zeroAddress, "0x", SAFE_1_4_1.fallbackHandler, zeroAddress, 0n, zeroAddress],
    });
}

/** The address `createProxyWithNonce` gives, derived as the factory derives it. */
export function predictSafeAddress({ proxyCreationCode, initializer, saltNonce }) {
    const salt = keccak256(concatHex([keccak256(initializer), toHex(saltNonce, { size: 32 })]));
    return getContractAddress({
        opcode: "CREATE2",
        from: SAFE_1_4_1.proxyFactory,
        salt,
        bytecode: concatHex([proxyCreationCode, pad(SAFE_1_4_1.singleton, { size: 32 })]),
    });
}

/** What stands on the chain for Safe's own contracts, against what Safe published. */
async function checkPublished(client) {
    const errors = [];
    for (const name of ["proxyFactory", "singleton", "fallbackHandler"]) {
        const code = await client.getCode({ address: SAFE_1_4_1[name] });
        if (!code || code === "0x") errors.push(`Safe's ${name} ${SAFE_1_4_1[name]} has no code on this chain`);
        else if (keccak256(code) !== SAFE_1_4_1.codeHash[name]) errors.push(`the code at Safe's ${name} ${SAFE_1_4_1[name]} is not the published one`);
    }
    if (errors.length) return { errors };
    const proxyCreationCode = await client.readContract({ address: SAFE_1_4_1.proxyFactory, abi: FACTORY_ABI, functionName: "proxyCreationCode" });
    if (keccak256(proxyCreationCode) !== SAFE_1_4_1.proxyCreationCodeHash) {
        return { errors: ["the factory's proxy creation code is not the published one"] };
    }
    return { errors, proxyCreationCode };
}

/** The word a contract keeps at a storage position, read from the chain's latest block. */
const storageAt = async (client, address, position) =>
    (await client.request({ method: "eth_getStorageAt", params: [address, position, "latest"] })) ?? "0x0";

/** The Safe at `address` against the stated owners and threshold: `{ exists, errors }`. */
export async function checkSafe(client, address, spec) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") return { exists: false, errors: [`no Safe stands at ${address}`] };
    const errors = [];
    const codeAddress = await storageAt(client, address, "0x0");
    if (BigInt(codeAddress) !== BigInt(SAFE_1_4_1.singleton)) errors.push(`the proxy at ${address} does not point at the published Safe code`);
    const owners = await client.readContract({ address, abi: SAFE_ABI, functionName: "getOwners" });
    const threshold = await client.readContract({ address, abi: SAFE_ABI, functionName: "getThreshold" });
    const want = spec.owners.map((a) => a.toLowerCase()).sort();
    const have = owners.map((a) => a.toLowerCase()).sort();
    if (want.length !== have.length || want.some((a, i) => a !== have[i])) {
        errors.push(`the Safe's owners are ${owners.join(", ")}, not ${spec.owners.join(", ")}`);
    }
    if (threshold !== BigInt(spec.threshold)) errors.push(`the Safe's threshold is ${threshold}, not ${spec.threshold}`);
    // What its owners can add after its creation and a look at the owners
    // does not show: a module, which moves the Safe's tokens with no owner's
    // signature; a guard; another fallback handler.
    const [modules] = await client.readContract({ address, abi: SAFE_ABI, functionName: "getModulesPaginated", args: [SENTINEL, 1n] });
    if (modules.length) errors.push(`the Safe has a module enabled, ${modules[0]}`);
    const guard = await storageAt(client, address, GUARD_POSITION);
    if (BigInt(guard) !== 0n) errors.push(`the Safe has a guard set, ${guard}`);
    const handler = await storageAt(client, address, FALLBACK_HANDLER_POSITION);
    if (BigInt(handler) !== BigInt(SAFE_1_4_1.fallbackHandler)) errors.push(`the Safe's fallback handler is ${handler}, not the published one`);
    return { exists: true, errors };
}

/** Derive, and for `ensure` create, the treasury's Safe: `{ address, created, errors }`. */
export async function treasurySafe({ command, expected, client, wallet, log = () => {} }) {
    const spec = resolveSafeSpec(expected);
    if (spec.error) return { errors: [spec.error] };
    const published = await checkPublished(client);
    if (published.errors.length) return { errors: published.errors };
    const initializer = setupInitializer(spec);
    const address = predictSafeAddress({ proxyCreationCode: published.proxyCreationCode, initializer, saltNonce: spec.saltNonce });
    log(`the treasury's Safe: ${spec.threshold} of ${spec.owners.length} (${spec.owners.join(", ")}), salt ${spec.saltNonce} → ${address}`);
    if (command === "address") return { address, created: false, errors: [] };

    let state = await checkSafe(client, address, spec);
    let created = false;
    if (!state.exists && command === "ensure") {
        if (!wallet) return { address, errors: ["creating the Safe needs a signer: set PRIVATE_KEY"] };
        log(`no code at ${address}: creating the Safe through ${SAFE_1_4_1.proxyFactory}`);
        // Anyone may create this Safe, so a creation that fails here may have
        // lost to another's: what stands at the address afterwards decides.
        let failure;
        try {
            const hash = await wallet.writeContract({
                address: SAFE_1_4_1.proxyFactory,
                abi: FACTORY_ABI,
                functionName: "createProxyWithNonce",
                args: [SAFE_1_4_1.singleton, initializer, spec.saltNonce],
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            if (receipt.status === "success") created = true;
            else failure = `the creation ${hash} reverted`;
        } catch (error) {
            failure = `the creation was not sent or failed: ${error.shortMessage ?? error.message}`;
        }
        state = await checkSafe(client, address, spec);
        if (!state.exists) return { address, errors: [failure ?? state.errors[0]] };
    }
    return { address, created, errors: state.errors };
}

async function main() {
    const [command, expectedPath, ...rest] = process.argv.slice(2);
    const rpcUrl = rest[rest.indexOf("--rpc-url") + 1];
    if (!["address", "ensure", "check"].includes(command) || !expectedPath || !rest.includes("--rpc-url") || !rpcUrl) {
        console.error("usage: safe-treasury.mjs <address|ensure|check> <expected.json> --rpc-url <rpc>");
        process.exit(2);
    }
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    const client = createPublicClient({ transport: http(rpcUrl) });
    const chainId = await client.getChainId();
    if (expected.chainId !== chainId) {
        console.error(`❌ the RPC is chain ${chainId}, the expectations file chain ${expected.chainId}`);
        process.exit(1);
    }
    let wallet;
    if (command === "ensure" && process.env.PRIVATE_KEY) {
        const account = privateKeyToAccount(process.env.PRIVATE_KEY);
        wallet = createWalletClient({ account, chain: { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } }, transport: http(rpcUrl) });
    }
    const result = await treasurySafe({ command, expected, client, wallet, log: (line) => console.error(`   ${line}`) });
    if (result.errors.length) {
        for (const error of result.errors) console.error(`❌ ${error}`);
        process.exit(1);
    }
    if (result.created) console.error(`   created; it holds the stated owners and threshold`);
    console.log(result.address);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`❌ ${error.shortMessage ?? error.message}`);
        process.exit(1);
    });
}
