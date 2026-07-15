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
    buildSwapWitnessTypedData,
    type SwapFundingLeg,
} from "../src/swapFunding.js";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "../src/agent/coordination.js";

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const COORDINATOR = "0x1111111111111111111111111111111111111111" as const;
const ROUTER = "0x2222222222222222222222222222222222222222" as const;
const INPUT_TOKEN = "0x3333333333333333333333333333333333333333" as const;
const CHAIN_ID = 31337;

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
} as const;

/** Permit2's witness digest, reconstructed exactly as the contracts build it —
 *  no viem typed-data machinery, so a builder bug cannot cancel out. */
function permit2WitnessDigest(): `0x${string}` {
    // The coordinator's SwapWitness struct hash.
    const swapWitnessTypehash = keccak256(
        toHex("SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)"),
    );
    const witness = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, address, address, uint256, bytes32"), [
            swapWitnessTypehash,
            ROUTER,
            INPUT_TOKEN,
            ARGS.maxInput,
            keccak256(ARGS.swapData),
        ]),
    );

    // Permit2's PermitWitnessTransferFrom typehash: stub + caller type string.
    const typeHash = keccak256(
        toHex(
            "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline," +
            "SwapWitness witness)SwapWitness(address router,address inputToken,uint256 maxInput,bytes32 swapDataHash)TokenPermissions(address token,uint256 amount)",
        ),
    );
    const tokenPermissionsHash = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
            keccak256(toHex("TokenPermissions(address token,uint256 amount)")),
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
        commitment: {
            processId: `0x${"00".repeat(32)}`,
            buyer: "0x9F8A75F6dd73353e1E10E1D517dAD1b9bc3ff353",
            seller: "0xA7CD1b7B8C1EC831d40bC6310CBCb95803028D2F",
            currency: "0x4444444444444444444444444444444444444444",
            payment: 1000n,
            expectedCumulativeValue: 1000n,
            agreementHash: keccak256(toHex("agreement")),
            salt: 7n,
            deadline: ARGS.deadline,
        },
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
