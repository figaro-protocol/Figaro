// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

/**
 * @title PolygonOffsetForkTest
 * @notice Polygon-fork audit of the Klima + Toucan adapter declarations in
 *         `frontend/lib/mechanisms/offsetAggregators.ts`. The adapters have
 *         only been exercised against `MockOffsetAggregator` on Anvil; this
 *         test verifies the live mainnet contracts answer to the function
 *         signatures, parameter shapes, and event signatures declared in TS.
 *
 *         Specifically catches:
 *           1. Klima `fromMode = 0` semantics — adapter asserts EXTERNAL
 *              (pull from msg.sender via approve). Verified by checking that
 *              the USDC.e balance drops on `buyer` after the retire call.
 *           2. Toucan `Redeemed` event ABI — adapter declares
 *              `(address indexed sender, address indexed poolToken, ...)`
 *              while Toucan docs show no `indexed` annotation. Test asserts
 *              the actual on-chain log topic count and topic0 hash.
 *           3. USDC.e / BCT pool liquidity — the quote functions return
 *              non-zero amounts (flagged at `offsetAggregators.ts:96`).
 *           4. Function-selector resolution — quote + retire on both
 *              aggregators execute without selector-mismatch reverts.
 *
 *         Opt-in via env var:
 *           POLYGON_RPC_URL=https://polygon-rpc.com \
 *             forge test --match-contract PolygonOffsetForkTest -vv
 *
 *         Without `POLYGON_RPC_URL` set, every test in this contract
 *         self-skips (no network access required for the default test run).
 */

// ── Minimal interfaces (mirror the parseAbi declarations in TS) ──────────────

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IKlimaInfinity {
    function getSourceAmountDefaultRetirement(address sourceToken, address carbonToken, uint256 retireAmount)
        external
        view
        returns (uint256 amountIn);

    function retireExactCarbonDefault(
        address sourceToken,
        address poolToken,
        uint256 maxAmountIn,
        uint256 retireAmount,
        string calldata retiringEntityString,
        address beneficiaryAddress,
        string calldata beneficiaryString,
        string calldata retirementMessage,
        uint8 fromMode
    ) external payable returns (uint256 retirementIndex);
}

interface IToucanOffsetHelper {
    function calculateNeededTokenAmount(address _fromToken, address _poolToken, uint256 _toAmount)
        external
        view
        returns (uint256 amountIn);

    function autoOffsetExactOutToken(address _fromToken, address _poolToken, uint256 _amountToOffset)
        external
        returns (address[] memory tco2s, uint256[] memory amounts);
}

contract PolygonOffsetForkTest is Test {
    // Addresses mirror frontend/lib/mechanisms/offsetAggregators.ts exactly.
    // Verified against Polygonscan + provider docs at adapter authoring time;
    // this test is the live re-check.
    address internal constant KLIMA_INFINITY = 0x8cE54d9625371fb2a068986d32C85De8E6e995f8;
    address internal constant TOUCAN_OFFSET_HELPER = 0x7cB7C0484d4F2324F51d81E2368823c20AEf8072;
    address internal constant POLYGON_BCT = 0x2F800Db0fdb5223b3C3f354886d907A671414A7F;
    address internal constant POLYGON_USDC_E = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    // Expected event topic0 — keccak256 of the canonical signature. The
    // canonical signature ignores `indexed`, so this only verifies the
    // event NAME + TYPES, not how arguments are indexed. Topic count is
    // asserted separately to catch indexed-vs-non-indexed drift.
    bytes32 internal constant KLIMA_CARBON_RETIRED_TOPIC0 =
        keccak256("CarbonRetired(uint8,address,string,address,string,string,address,address,uint256)");
    bytes32 internal constant TOUCAN_REDEEMED_TOPIC0 = keccak256("Redeemed(address,address,address[],uint256[])");

    // Adapter's declared indexed-arg count for each event. If the live
    // contract emits a different count, that's an ABI drift bug — surfaced
    // by these constants vs the actual log.topics.length.
    uint256 internal constant KLIMA_CARBON_RETIRED_INDEXED_COUNT = 3; // retiringAddress, beneficiaryAddress, carbonPool
    // Toucan's `Redeemed` carries no indexed arguments — all four fields
    // live in event data. Verified against live emission on Polygon mainnet.
    // The adapter ABI in offsetAggregators.ts was wrong about this until
    // this test caught the divergence; if a future change re-introduces
    // `indexed` on either field, this assertion fails and the adapter must
    // be updated in lockstep.
    uint256 internal constant TOUCAN_REDEEMED_INDEXED_COUNT = 0;

    address internal buyer = makeAddr("polygon-offset-buyer");

    function setUp() public {
        string memory rpc = vm.envOr("POLYGON_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true, "POLYGON_RPC_URL not set - fork test opt-in only");
            return;
        }
        vm.createSelectFork(rpc);
    }

    // ── Klima: quote + retire ────────────────────────────────────────

    function test_klima_quote_returnsNonZeroAmountForOneTonne() public view {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IKlimaInfinity(KLIMA_INFINITY).getSourceAmountDefaultRetirement(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        assertGt(amountIn, 0, "Klima quote returned zero - USDC.e/BCT pool liquidity gone?");
        // USDC.e has 6 decimals; carbon credits land in the single-digit-USD
        // to single-digit-dollars-per-tonne range in normal Klima conditions.
        // A multi-million-USDC quote indicates the source-token mapping is
        // wrong (e.g. accidentally passing a non-USDC.e address).
        assertLt(amountIn, 1_000_000 * 1e6, "Klima quote absurdly high - likely wrong source token");
    }

    function test_klima_retireFromModeExternal_pullsFromMsgSender() public {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IKlimaInfinity(KLIMA_INFINITY).getSourceAmountDefaultRetirement(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        uint256 maxAmountIn = amountIn * 2;

        deal(POLYGON_USDC_E, buyer, maxAmountIn);

        vm.startPrank(buyer);
        IERC20Like(POLYGON_USDC_E).approve(KLIMA_INFINITY, maxAmountIn);

        uint256 balanceBefore = IERC20Like(POLYGON_USDC_E).balanceOf(buyer);

        // fromMode = 0 — the adapter asserts this is EXTERNAL (pull from
        // msg.sender via approve). Any other semantics would either revert
        // (no other source approved) or pull from the wrong account.
        IKlimaInfinity(KLIMA_INFINITY).retireExactCarbonDefault(
            POLYGON_USDC_E,
            POLYGON_BCT,
            maxAmountIn,
            oneTonne,
            "Figaro Protocol",
            buyer,
            "Figaro Protocol - buyer wallet",
            "Retirement against a Figaro process; fork-test fixture.",
            0
        );
        vm.stopPrank();

        uint256 balanceAfter = IERC20Like(POLYGON_USDC_E).balanceOf(buyer);
        assertLt(balanceAfter, balanceBefore, "fromMode=0 should pull USDC.e from buyer (EXTERNAL semantics)");
    }

    function test_klima_carbonRetired_eventTopic0Matches() public {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IKlimaInfinity(KLIMA_INFINITY).getSourceAmountDefaultRetirement(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        uint256 maxAmountIn = amountIn * 2;

        deal(POLYGON_USDC_E, buyer, maxAmountIn);
        vm.startPrank(buyer);
        IERC20Like(POLYGON_USDC_E).approve(KLIMA_INFINITY, maxAmountIn);

        vm.recordLogs();
        IKlimaInfinity(KLIMA_INFINITY).retireExactCarbonDefault(
            POLYGON_USDC_E,
            POLYGON_BCT,
            maxAmountIn,
            oneTonne,
            "Figaro Protocol",
            buyer,
            "Figaro Protocol - buyer wallet",
            "Retirement against a Figaro process; fork-test fixture.",
            0
        );
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == KLIMA_INFINITY && logs[i].topics.length > 0
                && logs[i].topics[0] == KLIMA_CARBON_RETIRED_TOPIC0) {
                found = true;
                assertEq(
                    logs[i].topics.length,
                    1 + KLIMA_CARBON_RETIRED_INDEXED_COUNT,
                    "CarbonRetired indexed-arg count diverges from adapter ABI"
                );
                break;
            }
        }
        assertTrue(found, "CarbonRetired event not emitted from Klima - adapter signature stale");
    }

    // ── Toucan: quote + retire ───────────────────────────────────────

    function test_toucan_quote_returnsNonZeroAmountForOneTonne() public view {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IToucanOffsetHelper(TOUCAN_OFFSET_HELPER).calculateNeededTokenAmount(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        assertGt(amountIn, 0, "Toucan quote returned zero - USDC.e/BCT pool liquidity gone?");
        assertLt(amountIn, 1_000_000 * 1e6, "Toucan quote absurdly high - likely wrong source token");
    }

    function test_toucan_autoOffsetExactOut_executesAndReturnsTco2s() public {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IToucanOffsetHelper(TOUCAN_OFFSET_HELPER).calculateNeededTokenAmount(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        uint256 maxAmountIn = amountIn * 2;

        deal(POLYGON_USDC_E, buyer, maxAmountIn);
        vm.startPrank(buyer);
        IERC20Like(POLYGON_USDC_E).approve(TOUCAN_OFFSET_HELPER, maxAmountIn);

        uint256 balanceBefore = IERC20Like(POLYGON_USDC_E).balanceOf(buyer);

        (address[] memory tco2s, uint256[] memory amounts) =
            IToucanOffsetHelper(TOUCAN_OFFSET_HELPER).autoOffsetExactOutToken(POLYGON_USDC_E, POLYGON_BCT, oneTonne);

        vm.stopPrank();

        assertGt(tco2s.length, 0, "Toucan retire returned no TCO2 projects");
        assertEq(tco2s.length, amounts.length, "tco2s / amounts arrays must align");

        uint256 balanceAfter = IERC20Like(POLYGON_USDC_E).balanceOf(buyer);
        assertLt(balanceAfter, balanceBefore, "Toucan auto-offset should pull USDC.e from msg.sender");
    }

    function test_toucan_redeemed_eventTopic0AndIndexedCountMatchAbi() public {
        uint256 oneTonne = 1e18;
        uint256 amountIn = IToucanOffsetHelper(TOUCAN_OFFSET_HELPER).calculateNeededTokenAmount(
            POLYGON_USDC_E, POLYGON_BCT, oneTonne
        );
        uint256 maxAmountIn = amountIn * 2;

        deal(POLYGON_USDC_E, buyer, maxAmountIn);
        vm.startPrank(buyer);
        IERC20Like(POLYGON_USDC_E).approve(TOUCAN_OFFSET_HELPER, maxAmountIn);

        vm.recordLogs();
        IToucanOffsetHelper(TOUCAN_OFFSET_HELPER).autoOffsetExactOutToken(POLYGON_USDC_E, POLYGON_BCT, oneTonne);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // The Toucan OffsetHelper composes into the BaseCarbonTonne pool
        // contract — Redeemed is emitted by the pool, not by the helper.
        // We accept the event from any emitter on the same fork.
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == TOUCAN_REDEEMED_TOPIC0) {
                found = true;
                assertEq(
                    logs[i].topics.length,
                    1 + TOUCAN_REDEEMED_INDEXED_COUNT,
                    "Redeemed indexed-arg count diverges from adapter ABI"
                );
                break;
            }
        }
        assertTrue(found, "Redeemed event not seen - adapter signature stale or event renamed");
    }
}
