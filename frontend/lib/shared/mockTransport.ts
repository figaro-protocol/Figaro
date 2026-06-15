import {
    BaseError,
    ExecutionRevertedError,
    HttpRequestError,
    RpcRequestError,
    http,
    type HttpTransportConfig,
    type Transport,
} from "viem";
import { ZERO_ADDRESS, ZERO_BYTES32 } from "./evm";
import { DEVNET_CHAIN_ID } from "./chains";
import { isE2EMockSession } from "./e2e";

class MockRpcBlockedError extends Error {
    constructor(method: string) {
        super(
            `Mock RPC blocked: method "${method}" is not stubbed. ` +
            `Mock mode (?e2e=mock) must not reach Anvil — add a stub in mockTransport.ts ` +
            `or gate the caller on e2e mode.`,
        );
        this.name = "MockRpcBlockedError";
    }
}

function toHexQuantity(value: number | bigint): `0x${string}` {
    return `0x${value.toString(16)}`;
}

function mockResponse(
    method: string,
    _params: unknown,
    chainId: number,
): unknown {
    switch (method) {
        case "eth_chainId":
            return toHexQuantity(chainId);
        case "net_version":
            return String(chainId);
        case "web3_clientVersion":
            return "figaro-mock/0.0.0";
        case "eth_blockNumber":
        case "eth_gasPrice":
        case "eth_maxPriorityFeePerGas":
        case "eth_estimateGas":
        case "eth_getBalance":
        case "eth_getTransactionCount":
            return "0x0";
        case "eth_getCode":
        case "eth_call":
            return "0x";
        case "eth_getLogs":
        case "eth_accounts":
        case "eth_requestAccounts":
            return [];
        case "eth_getBlockByNumber":
        case "eth_getBlockByHash":
            return {
                number: "0x0",
                hash: ZERO_BYTES32,
                parentHash: ZERO_BYTES32,
                timestamp: "0x0",
                gasLimit: "0x0",
                gasUsed: "0x0",
                miner: ZERO_ADDRESS,
                baseFeePerGas: "0x0",
                transactions: [],
                logsBloom: `0x${"0".repeat(512)}`,
            };
        case "eth_getTransactionByHash":
        case "eth_getTransactionReceipt":
        case "eth_getBlockTransactionCountByNumber":
            return null;
        case "eth_feeHistory":
            return {
                oldestBlock: "0x0",
                baseFeePerGas: ["0x0"],
                gasUsedRatio: [0],
                reward: [["0x0"]],
            };
        case "eth_sendTransaction":
        case "eth_sendRawTransaction":
        case "eth_signTransaction":
        case "personal_sign":
        case "eth_sign":
        case "eth_signTypedData_v4":
            throw new MockRpcBlockedError(method);
        default:
            throw new MockRpcBlockedError(method);
    }
}

// Read-only JSON-RPC methods that can be safely mocked with empty/zero
// defaults when the live RPC endpoint is unreachable. Returning a safe default
// (instead of throwing) prevents uncaught promise rejections from wagmi's
// internal block-number watcher and similar polling callers when the node is
// down. The RpcBanner informs the user; the transport handles the plumbing.
const READ_ONLY_METHODS = new Set([
    "eth_chainId",
    "net_version",
    "web3_clientVersion",
    "eth_blockNumber",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_estimateGas",
    "eth_getBalance",
    "eth_getTransactionCount",
    "eth_getCode",
    "eth_call",
    "eth_getLogs",
    "eth_accounts",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_getBlockTransactionCountByNumber",
    "eth_feeHistory",
]);

/** Classify an error thrown by viem's HTTP transport. We only want to fall
 *  back to the mock response when the RPC endpoint is genuinely unreachable
 *  — fetch failure, non-2xx HTTP, timeout. RPC-level errors (the node
 *  responded, but the response contained `error` — e.g. a contract revert
 *  on `eth_call`) must propagate, because callers like `simulateContract`
 *  use them to detect pre-wallet failure modes (slug collision, wrong
 *  deposit, etc.). Confusing the two silently broke publish validation. */
function isTransportUnreachable(err: unknown): boolean {
    if (!(err instanceof BaseError)) return false;
    // A revert ANYWHERE in the cause chain means the chain ran the call and
    // rejected it. That's not "RPC down" — it's the answer we want.
    if (
        err.walk(
            (e) =>
                e instanceof ExecutionRevertedError || e instanceof RpcRequestError,
        )
    ) {
        return false;
    }
    return err.walk((e) => e instanceof HttpRequestError) !== null;
}

/**
 * HTTP transport that short-circuits to mock responses when `?e2e=mock` is
 * present on the current page, and falls back to the same safe defaults for
 * read-only methods when the live RPC is unreachable. RPC-level errors
 * (contract reverts, invalid params, etc.) are NOT swallowed — they
 * propagate so callers can react to them. Write / signing methods still
 * throw in the live-but-unreachable case so callers detect the failure
 * instead of silently proceeding.
 *
 * Why: `?e2e=mock` is a per-navigation URL flag, not a build-time signal, so
 * the mock-vs-live decision must be made at request time — this is the one
 * chokepoint that can enforce "mock tests never reach Anvil" regardless of
 * whether individual hooks remember to gate themselves. The same chokepoint
 * is the right place to absorb transport-level unreachability so the user
 * sees one banner, not a cascade of console errors.
 */
export function mockAwareHttp(
    url: string,
    config?: HttpTransportConfig,
): Transport {
    const live = http(url, config);
    return (opts) => {
        const liveInstance = live(opts);
        const chainId = opts.chain?.id ?? DEVNET_CHAIN_ID;
        return {
            ...liveInstance,
            request: async (args) => {
                if (isE2EMockSession()) {
                    return mockResponse(args.method, args.params, chainId) as never;
                }
                try {
                    return await liveInstance.request(args);
                } catch (err) {
                    // Only fall back to mock when the failure is a
                    // transport-level unreachability (HTTP error / network).
                    // RPC-level errors (chain reverts, invalid params, etc.)
                    // MUST propagate — callers like `simulateContract` rely
                    // on the revert payload to detect things like slug
                    // collisions and wrong deposit values. Swallowing those
                    // returns a fake-success `"0x"` and silently breaks the
                    // pre-wallet validation in publish flows.
                    if (READ_ONLY_METHODS.has(args.method) && isTransportUnreachable(err)) {
                        return mockResponse(args.method, args.params, chainId) as never;
                    }
                    throw err;
                }
            },
        };
    };
}
