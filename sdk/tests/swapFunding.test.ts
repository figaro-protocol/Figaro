/**
 * Swap-funded bond legs — the off-chain half of the Permit2 witness
 * convention. The digest test reconstructs Permit2's on-chain hashing
 * INDEPENDENTLY (typehash-stub concatenation, TokenPermissions sub-hash,
 * spender/nonce/deadline/witness struct hash, name-only domain) — the same
 * math `MockWitnessPermit2` runs in Solidity — and requires
 * `hashTypedData(buildSwapWitnessTypedData(...))` to equal it. The on-chain
 * side of the convention is proven against the canonical Permit2 deployment
 * by the Foundry mainnet-fork suite; this test pins the TS builder to the
 * same convention. The envelope test covers the funding leg's wire format.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    encodeAbiParameters,
    encodePacked,
    hashTypedData,
    keccak256,
    parseAbiParameters,
    toHex,
} from "viem";
import {
    DISABLED_SWAP_FUNDING_LEG,
    SWAP_WITNESS_PERMIT_TYPES,
    buildSwapWitnessTypedData,
    type SwapFundingLeg,
} from "../src/swapFunding.js";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "../src/agent/coordination.js";
import type { Commitment } from "../src/types.js";

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** A string constant of a Solidity source, read from the file itself: the
 *  first string literal after `<name> =`, so every type string below is the
 *  contract's, never a copy typed into this test. */
function solidityString(relative: string, name: string): string {
    const source = readFileSync(path.resolve(__dirname, "../..", relative), "utf8");
    const match = new RegExp(`\\b${name}\\s*=\\s*(?:keccak256\\(\\s*)?"([^"]*)"`).exec(source);
    if (!match) throw new Error(`${relative}: no string constant ${name}`);
    return match[1]!;
}
const COORDINATOR_SOL = "src/composability/WitnessSwapAndCommitCoordinator.sol";
/** The coordinator's `SwapWitness` type, as it hashes it. */
const SWAP_WITNESS_TYPE = solidityString(COORDINATOR_SOL, "SWAP_WITNESS_TYPEHASH");
/** The witness type string the coordinator hands Permit2. */
const WITNESS_TYPE_STRING = solidityString(COORDINATOR_SOL, "WITNESS_TYPE_STRING");
/** Permit2's own stub and TokenPermissions type, as the repository's Permit2 stand-in hashes them. */
const PERMIT_WITNESS_STUB = solidityString("src/mocks/MockWitnessPermit2.sol", "PERMIT_WITNESS_STUB");
const TOKEN_PERMISSIONS_TYPE = solidityString("src/mocks/MockWitnessPermit2.sol", "TOKEN_PERMISSIONS_TYPEHASH");
/** FigaroCore's commitment type. */
const COMMITMENT_TYPE = solidityString("src/core/kernel/CommitmentTypes.sol", "COMMITMENT_TYPEHASH");

/** The EIP-712 `encodeType` of `primary` under `types`: the primary type,
 *  then each type it references, sorted by name (EIP-712 § "Definition of
 *  encodeType"). */
function encodeType(types: Record<string, readonly { name: string; type: string }[]>, primary: string): string {
    const deps = new Set<string>();
    const walk = (t: string) => {
        for (const f of types[t] ?? []) {
            const base = f.type.replace(/\[\d*\]$/, "");
            if (types[base] && base !== primary && !deps.has(base)) { deps.add(base); walk(base); }
        }
    };
    walk(primary);
    const one = (t: string) => `${t}(${types[t]!.map((f) => `${f.type} ${f.name}`).join(",")})`;
    return [primary, ...[...deps].sort()].map(one).join("");
}
const COORDINATOR = "0x1111111111111111111111111111111111111111" as const;
const ROUTER = "0x2222222222222222222222222222222222222222" as const;
const INPUT_TOKEN = "0x3333333333333333333333333333333333333333" as const;
const CHAIN_ID = 31337;

const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: "0x9F8A75F6dd73353e1E10E1D517dAD1b9bc3ff353",
    seller: "0xA7CD1b7B8C1EC831d40bC6310CBCb95803028D2F",
    token: "0x4444444444444444444444444444444444444444",
    payment: 1000n,
    runningTotal: 1000n,
    checkoutHash: keccak256(toHex("agreement")),
    salt: 7n,
    commitDeadline: 1_900_000_000n,
};

const ARGS = {
    chainId: CHAIN_ID,
    permit2: PERMIT2,
    coordinator: COORDINATOR,
    router: ROUTER,
    inputToken: INPUT_TOKEN,
    maxInput: 2_000_000_000_000_000_000_000n,
    nonce: 42n,
    deadline: 1_900_000_000n,
    swapData: "0xdeadbeef" as const,
    commitment: COMMITMENT,
    role: "buyer" as const,
};

/** Permit2's witness digest, reconstructed exactly as the contracts build it —
 *  no viem typed-data machinery, so a builder bug cannot cancel out. */
function permit2WitnessDigest(): `0x${string}` {
    // The coordinator's SwapWitness struct hash.
    const swapWitnessTypehash = keccak256(
        toHex(SWAP_WITNESS_TYPE),
    );
    // The commitment's EIP-712 struct hash, built by hand from the Solidity
    // type string, and the buyer's role (0).
    const commitmentHash = keccak256(
        encodeAbiParameters(
            parseAbiParameters("bytes32, bytes32, address, address, address, uint256, uint256, bytes32, uint256, uint256"),
            [
                keccak256(toHex(COMMITMENT_TYPE)),
                COMMITMENT.processId, COMMITMENT.buyer, COMMITMENT.seller, COMMITMENT.token,
                COMMITMENT.payment, COMMITMENT.runningTotal, COMMITMENT.checkoutHash,
                COMMITMENT.salt, COMMITMENT.commitDeadline,
            ],
        ),
    );
    const witness = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, address, address, uint256, bytes32, bytes32, uint8"), [
            swapWitnessTypehash,
            ROUTER,
            INPUT_TOKEN,
            ARGS.maxInput,
            keccak256(ARGS.swapData),
            commitmentHash,
            0,
        ]),
    );

    // Permit2's PermitWitnessTransferFrom typehash: stub + caller type string.
    const typeHash = keccak256(
        toHex(PERMIT_WITNESS_STUB + WITNESS_TYPE_STRING),
    );
    const tokenPermissionsHash = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
            keccak256(toHex(TOKEN_PERMISSIONS_TYPE)),
            INPUT_TOKEN,
            ARGS.maxInput,
        ]),
    );
    const structHash = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, bytes32, address, uint256, uint256, bytes32"), [
            typeHash,
            tokenPermissionsHash,
            COORDINATOR,
            ARGS.nonce,
            ARGS.deadline,
            witness,
        ]),
    );

    // Permit2's domain has NO version field.
    const domainSeparator = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, bytes32, uint256, address"), [
            keccak256(toHex("EIP712Domain(string name,uint256 chainId,address verifyingContract)")),
            keccak256(toHex("Permit2")),
            BigInt(CHAIN_ID),
            PERMIT2,
        ]),
    );
    return keccak256(encodePacked(["string", "bytes32", "bytes32"], ["\x19\x01", domainSeparator, structHash]));
}

describe("SWAP_WITNESS_PERMIT_TYPES — the contracts' type strings", () => {
    it("encodes to Permit2's stub followed by the coordinator's witness type string, and to the coordinator's SwapWitness", () => {
        expect(encodeType(SWAP_WITNESS_PERMIT_TYPES, "PermitWitnessTransferFrom")).toBe(PERMIT_WITNESS_STUB + WITNESS_TYPE_STRING);
        expect(encodeType(SWAP_WITNESS_PERMIT_TYPES, "SwapWitness")).toBe(SWAP_WITNESS_TYPE);
        expect(encodeType(SWAP_WITNESS_PERMIT_TYPES, "TokenPermissions")).toBe(TOKEN_PERMISSIONS_TYPE);
    });
});

describe("buildSwapWitnessTypedData — digest parity with Permit2's on-chain hashing", () => {
    it("hashTypedData equals the independently reconstructed Permit2 witness digest", () => {
        expect(hashTypedData(buildSwapWitnessTypedData(ARGS))).toBe(permit2WitnessDigest());
    });

    it("the witness binds the route: different swapData → different digest", () => {
        const substituted = hashTypedData(
            buildSwapWitnessTypedData({ ...ARGS, swapData: "0xdeadbeee" }),
        );
        expect(substituted).not.toBe(hashTypedData(buildSwapWitnessTypedData(ARGS)));
    });

    it("the witness binds the commitment: another commitment naming the same party → different digest", () => {
        const other = hashTypedData(
            buildSwapWitnessTypedData({ ...ARGS, commitment: { ...COMMITMENT, salt: 8n } }),
        );
        expect(other).not.toBe(hashTypedData(buildSwapWitnessTypedData(ARGS)));
    });

    it("the witness binds the role: the same leg as the seller's → different digest", () => {
        const asSeller = hashTypedData(buildSwapWitnessTypedData({ ...ARGS, role: "seller" }));
        expect(asSeller).not.toBe(hashTypedData(buildSwapWitnessTypedData(ARGS)));
    });
});

describe("CommitmentPayload — buyerFunding wire format", () => {
    const leg: SwapFundingLeg = {
        enabled: true,
        inputToken: INPUT_TOKEN,
        maxInput: ARGS.maxInput,
        permitNonce: ARGS.nonce,
        permitDeadline: ARGS.deadline,
        permitSignature: "0xabcd",
        swapData: ARGS.swapData,
    };
    const payload: CommitmentPayload = {
        commitment: COMMITMENT,
        agreement: { orders: [] } as unknown as CommitmentPayload["agreement"],
        buyerFunding: leg,
    };

    it("round-trips the funding leg with bigints revived", () => {
        const revived = deserializeCommitmentPayload(serializeCommitmentPayload(payload));
        expect(revived.buyerFunding).toBeDefined();
        expect(revived.buyerFunding!.enabled).toBe(true);
        expect(revived.buyerFunding!.maxInput).toBe(leg.maxInput);
        expect(revived.buyerFunding!.permitNonce).toBe(leg.permitNonce);
        expect(revived.buyerFunding!.permitDeadline).toBe(leg.permitDeadline);
        expect(revived.buyerFunding!.swapData).toBe(leg.swapData);
        expect(typeof revived.buyerFunding!.maxInput).toBe("bigint");
    });

    it("a payload without a funding leg round-trips unchanged (no phantom field)", () => {
        const { buyerFunding: _omit, ...bare } = payload;
        const revived = deserializeCommitmentPayload(serializeCommitmentPayload(bare));
        expect(revived.buyerFunding).toBeUndefined();
    });

    it("the disabled leg constant is inert and serializable", () => {
        const revived = deserializeCommitmentPayload(
            serializeCommitmentPayload({ ...payload, buyerFunding: DISABLED_SWAP_FUNDING_LEG }),
        );
        expect(revived.buyerFunding!.enabled).toBe(false);
    });
});
