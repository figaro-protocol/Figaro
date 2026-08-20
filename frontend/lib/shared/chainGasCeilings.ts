/**
 * chainGasCeilings.ts — re-export of the SDK's chain gas ceilings.
 *
 * The canonical implementation (empirical constants + pure math + client
 * wrappers) lives in `@figaro-protocol/sdk` (`sdk/src/gasCeilings.ts`) so agents
 * and the frontend share ONE ceiling. `scripts/lint-chain-gas.sh` locks
 * the SDK constants to `test/kernel/GasCeilingTest.t.sol`. This module exists
 * only to keep the frontend's stable `@/lib/shared/chainGasCeilings`
 * import path.
 */

export {
    maxOrdersResolvablePerProcess,
    maxCommitsLandableInOneBlock,
} from "@figaro-protocol/sdk";
