// Imports no wallet code: the standalone public client (`publicClient.ts`)
// reads through `mockAwareHttp` on pages that load no wallet. The wallet-first
// transport wagmi's config uses is `connectorFirstTransport` in `connectors.ts`.
import { http, type HttpTransportConfig, type Transport } from "viem";
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

/**
 * HTTP transport that short-circuits to mock responses when `?e2e=mock` is
 * present on the current page, and is the live transport otherwise. Every
 * live error propagates — an unreachable node as much as a revert: empty
 * logs, a zero balance or a zero gas limit are answers a chain gives, and
 * standing them in for a node that gave none would turn a failed read into
 * a fabricated one. The reader sees the error, and its read is `absent`
 * (`lib/shared/networkRead.ts`).
 *
 * Why here: `?e2e=mock` is a per-navigation URL flag, not a build-time
 * signal, so the mock-vs-live decision must be made at request time — this is
 * the one chokepoint that can enforce "mock tests never reach Anvil"
 * regardless of whether individual hooks remember to gate themselves.
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
                return liveInstance.request(args);
            },
        };
    };
}
