/**
 * lib/mechanisms/offsetAggregators.ts
 *
 * Per-chain registry of carbon-offset retirement aggregators usable by the
 * Path A bridge. Each entry carries the contract address, the ABI fragments
 * the bridge calls, the input token (USDC.e on Polygon), and adapter
 * functions that normalize per-aggregator function signatures into one
 * interface the hook uses.
 *
 * - Polygon mainnet (chainId 137): KlimaRetirementAggregator V2 (the
 *   IKlimaInfinity-typed entrypoint) + Toucan OffsetHelper. Verified
 *   addresses pulled from each provider's docs and verified on Polygonscan;
 *   ABI fragments are the subset the bridge needs (quote + retire +
 *   retirement event).
 *
 * - Devnet / Anvil (chainId 31337): MockOffsetAggregator deployed by
 *   script/Deploy.s.sol, address read from NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR.
 *   Single mock entry exposed as both `klima` and `toucan` providers so
 *   the e2e flow can exercise the picker without standing up two mocks.
 *
 * - Other chains: empty registry → bridge UI surfaces "switch chain" state.
 *
 * All providers are unified behind one TypeScript interface (`AggregatorAdapter`)
 * so the hook's quote / retire / parse-event paths are aggregator-agnostic.
 * Aggregators differ in the value vs the interface — the hook never branches
 * on provider key; it just calls `adapter.quote(...)` and `adapter.retire(...)`.
 */

import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { CONTRACTS } from "@/lib/core/contracts";

// ── Public types ─────────────────────────────────────────────────────────────

export type OffsetProvider = "klima" | "toucan" | "custom";

export interface AggregatorQuote {
    /** Amount of `inputToken` the buyer must approve + spend. */
    amountIn: bigint;
    /** Identifier of the source (e.g. "klima-default-pool", "toucan-bct", "mock"). */
    source: string;
}

export interface AggregatorRetireArgs {
    /** Tonnes to retire, expressed in 1e18 fixed-point (1e18 = 1 tonne). */
    tonsToRetire: bigint;
    /** Beneficiary recorded in the aggregator's retirement event — typically
     *  the buyer wallet. */
    beneficiary: Address;
    /** Slippage guard — buyer accepts up to this much `inputToken` IN. */
    maxAmountIn: bigint;
}

export interface AggregatorAdapter {
    /** The aggregator contract address on this chain. */
    address: Address;
    /** ABI fragments the hook needs to call. */
    abi: readonly unknown[];
    /** ERC-20 the buyer pays in. USDC.e on Polygon, MockToken on devnet. */
    inputToken: Address;
    /** Quote how much `inputToken` is needed to retire `tonsToRetire` tonnes. */
    quote(client: PublicClient, tonsToRetire: bigint): Promise<AggregatorQuote>;
    /**
     * Build the calldata for the retirement transaction.
     * Returns `{ functionName, args }` shaped so wagmi's `useWriteContract`
     * can call `writeContract({ address, abi, functionName, args })`.
     */
    buildRetireCall(args: AggregatorRetireArgs): {
        functionName: string;
        args: readonly unknown[];
    };
}

export interface ChainAggregators {
    /** Available providers on this chain — empty array if no aggregators. */
    providers: readonly OffsetProvider[];
    /** Lookup an adapter by provider key. Returns null if the provider
     *  isn't supported on this chain. */
    get(provider: OffsetProvider): AggregatorAdapter | null;
}

// ── Klima (Polygon, chainId 137) ─────────────────────────────────────────────

const KLIMA_INFINITY_ADDRESS: Address = "0x8cE54d9625371fb2a068986d32C85De8E6e995f8";

const KLIMA_INFINITY_ABI = parseAbi([
    "function getSourceAmountDefaultRetirement(address sourceToken, address carbonToken, uint256 retireAmount) view returns (uint256 amountIn)",
    "function retireExactCarbonDefault(address sourceToken, address poolToken, uint256 maxAmountIn, uint256 retireAmount, string retiringEntityString, address beneficiaryAddress, string beneficiaryString, string retirementMessage, uint8 fromMode) payable returns (uint256 retirementIndex)",
    "event CarbonRetired(uint8 carbonBridge, address indexed retiringAddress, string retiringEntityString, address indexed beneficiaryAddress, string beneficiaryString, string retirementMessage, address indexed carbonPool, address carbonToken, uint256 retiredAmount)",
] as const);

/// Klima's BCT pool — the default carbon token Klima retires against when
/// caller doesn't specify a project. Production bridge can later expose a
/// pool selector (BCT/NCT/MCO2/NBO/UBO); v1 hardcodes BCT.
const POLYGON_BCT_ADDRESS: Address = "0x2F800Db0fdb5223b3C3f354886d907A671414A7F";

/// USDC.e (PoS-bridged USDC) on Polygon. Verify against current Klima
/// liquidity at implementation time — Klima's docs reference this variant.
const POLYGON_USDC_E_ADDRESS: Address = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const klimaPolygonAdapter: AggregatorAdapter = {
    address: KLIMA_INFINITY_ADDRESS,
    abi: KLIMA_INFINITY_ABI,
    inputToken: POLYGON_USDC_E_ADDRESS,
    async quote(client, tonsToRetire) {
        const amountIn = (await client.readContract({
            address: KLIMA_INFINITY_ADDRESS,
            abi: KLIMA_INFINITY_ABI,
            functionName: "getSourceAmountDefaultRetirement",
            args: [POLYGON_USDC_E_ADDRESS, POLYGON_BCT_ADDRESS, tonsToRetire],
        })) as bigint;
        return { amountIn, source: "klima-default-pool-bct" };
    },
    buildRetireCall({ tonsToRetire, beneficiary, maxAmountIn }) {
        return {
            functionName: "retireExactCarbonDefault",
            args: [
                POLYGON_USDC_E_ADDRESS,
                POLYGON_BCT_ADDRESS,
                maxAmountIn,
                tonsToRetire,
                "Figaro Protocol",
                beneficiary,
                "Figaro Protocol — buyer wallet",
                "Retirement against a Figaro process; binding recorded on-chain via ProcessOffsetReceipt.",
                0, // fromMode = EXTERNAL (pull from msg.sender via approve)
            ],
        };
    },
};

// ── Toucan (Polygon, chainId 137) ────────────────────────────────────────────

const TOUCAN_OFFSET_HELPER_ADDRESS: Address = "0x7cB7C0484d4F2324F51d81E2368823c20AEf8072";

const TOUCAN_OFFSET_HELPER_ABI = parseAbi([
    "function calculateNeededTokenAmount(address _fromToken, address _poolToken, uint256 _toAmount) view returns (uint256 amountIn)",
    "function autoOffsetExactOutToken(address _fromToken, address _poolToken, uint256 _amountToOffset) returns (address[] tco2s, uint256[] amounts)",
    "event Redeemed(address indexed sender, address indexed poolToken, address[] tco2s, uint256[] amounts)",
] as const);

const toucanPolygonAdapter: AggregatorAdapter = {
    address: TOUCAN_OFFSET_HELPER_ADDRESS,
    abi: TOUCAN_OFFSET_HELPER_ABI,
    inputToken: POLYGON_USDC_E_ADDRESS,
    async quote(client, tonsToRetire) {
        const amountIn = (await client.readContract({
            address: TOUCAN_OFFSET_HELPER_ADDRESS,
            abi: TOUCAN_OFFSET_HELPER_ABI,
            functionName: "calculateNeededTokenAmount",
            args: [POLYGON_USDC_E_ADDRESS, POLYGON_BCT_ADDRESS, tonsToRetire],
        })) as bigint;
        return { amountIn, source: "toucan-bct" };
    },
    buildRetireCall({ tonsToRetire }) {
        // Toucan's autoOffsetExactOutToken doesn't take a beneficiary or
        // maxAmountIn parameter — slippage protection happens via the
        // approval cap (the contract can't pull more than approved). The
        // hook enforces maxAmountIn at the approval step.
        return {
            functionName: "autoOffsetExactOutToken",
            args: [POLYGON_USDC_E_ADDRESS, POLYGON_BCT_ADDRESS, tonsToRetire],
        };
    },
};

// ── Mock (devnet, chainId 31337) ─────────────────────────────────────────────

const MOCK_OFFSET_AGGREGATOR_ABI = parseAbi([
    "function quote(uint256 tonsToRetire) view returns (uint256 amountIn)",
    "function retire(uint256 tonsToRetire, address beneficiary, uint256 maxAmountIn) returns (bytes32 retirementId)",
    "event Retired(bytes32 indexed retirementId, address indexed retiringAddress, address indexed beneficiary, uint256 tonsRetired, address inputToken, uint256 inputAmount)",
] as const);

function buildMockAdapter(): AggregatorAdapter | null {
    const aggregator = CONTRACTS.mockOffsetAggregator;
    const inputToken = CONTRACTS.mockToken;
    if (!aggregator || aggregator.length !== 42 || !inputToken || inputToken.length !== 42) {
        return null;
    }
    return {
        address: aggregator,
        abi: MOCK_OFFSET_AGGREGATOR_ABI,
        inputToken,
        async quote(client, tonsToRetire) {
            const amountIn = (await client.readContract({
                address: aggregator,
                abi: MOCK_OFFSET_AGGREGATOR_ABI,
                functionName: "quote",
                args: [tonsToRetire],
            })) as bigint;
            return { amountIn, source: "mock" };
        },
        buildRetireCall({ tonsToRetire, beneficiary, maxAmountIn }) {
            return {
                functionName: "retire",
                args: [tonsToRetire, beneficiary, maxAmountIn],
            };
        },
    };
}

// ── Empty / wrong-chain registry ─────────────────────────────────────────────

const EMPTY_AGGREGATORS: ChainAggregators = {
    providers: [],
    get: () => null,
};

// ── Public lookup ────────────────────────────────────────────────────────────

/**
 * Lookup the aggregator registry for a given chain. Returns an empty
 * registry for any chain without offset support — the hook uses this to
 * surface the "switch chain" state.
 */
export function getOffsetAggregators(chainId: number | undefined): ChainAggregators {
    if (chainId === undefined) return EMPTY_AGGREGATORS;
    if (chainId === 137) {
        return {
            providers: ["klima", "toucan"] as const,
            get: (provider) => {
                if (provider === "klima") return klimaPolygonAdapter;
                if (provider === "toucan") return toucanPolygonAdapter;
                return null;
            },
        };
    }
    if (chainId === 31337) {
        const mock = buildMockAdapter();
        if (!mock) return EMPTY_AGGREGATORS;
        // Devnet: expose the single mock under both klima and toucan keys
        // so the picker can be exercised without two separate mocks.
        return {
            providers: ["klima", "toucan"] as const,
            get: (provider) => {
                if (provider === "klima" || provider === "toucan") return mock;
                return null;
            },
        };
    }
    return EMPTY_AGGREGATORS;
}

/** Aggregator content fields the hook builds for the
 *  ProcessOffsetReceipt.record(...) call after retirement succeeds. */
export interface RetirementReceiptContent {
    processId: Hex;
    retirementTxHash: Hex;
    aggregator: Address;
    tonsRetired: bigint;
    inputToken: Address;
    inputAmount: bigint;
}
