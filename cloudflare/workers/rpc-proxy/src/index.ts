/**
 * Figaro beta RPC proxy Worker.
 *
 * Three checks before any request reaches the backing Anvil container:
 *
 *   1. Session: the request must carry a valid `figaro-session` cookie
 *      whose value resolves in the shared SESSIONS KV namespace.
 *   2. Method: the JSON-RPC method must be in the allowlist below.
 *      `eth_getCode`, `debug_*`, `anvil_*`, `eth_getStorageAt` are
 *      not in the allowlist — these are how a participant would
 *      extract bytecode or internal state.
 *   3. Address (eth_call / eth_estimateGas only): the `to` address
 *      in the call params must be in the CONTRACT_ALLOWLIST KV
 *      namespace. Calls to arbitrary addresses are rejected.
 *
 * Approved requests are forwarded to the Anvil container; the
 * response is returned verbatim. Rejected requests return a JSON-RPC
 * error response with code -32601 (method not allowed) or -32602
 * (target not allowed).
 */

interface Env {
    SESSIONS: KVNamespace;
    CONTRACT_ALLOWLIST: KVNamespace;
    ANVIL: DurableObjectNamespace;
}

interface JsonRpcRequest {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: unknown;
}

const SESSION_COOKIE = "figaro-session";

/**
 * JSON-RPC methods participants are allowed to call.
 *
 * Whitelist by design — easier to reason about than a denylist.
 * Adding a method here is the operator's explicit choice. Removing
 * one is one line plus a deploy.
 */
const ALLOWED_METHODS = new Set<string>([
    // Read state.
    "eth_call",
    "eth_estimateGas",
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getTransactionReceipt",
    "eth_getTransactionByHash",
    "eth_getLogs",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
    "eth_getBalance",
    "eth_getTransactionCount",

    // Subscribe (websocket — used by viem for event watching).
    "eth_subscribe",
    "eth_unsubscribe",

    // Write state.
    "eth_sendRawTransaction",

    // Net.
    "net_version",
    "web3_clientVersion",
]);

/**
 * Methods explicitly blocked even if added to ALLOWED_METHODS by
 * mistake. Defense in depth — these are the methods that leak the
 * kernel.
 */
const HARD_BLOCKED_METHODS = new Set<string>([
    "eth_getCode",
    "eth_getStorageAt",
    "debug_traceTransaction",
    "debug_traceCall",
    "debug_traceBlockByNumber",
    "debug_traceBlockByHash",
]);

const ANVIL_PREFIX = "anvil_"; // anvil_setStorageAt, anvil_impersonateAccount, etc.
const PERSONAL_PREFIX = "personal_"; // personal_unlockAccount, personal_sign — should not reach Anvil from a participant

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        // ── Session check ──────────────────────────────────────────────
        const sessionId = readSessionCookie(request);
        if (!sessionId) return rpcError(-32000, "no session", null);
        const session = await env.SESSIONS.get(sessionId, "json");
        if (!session) return rpcError(-32000, "session expired or invalid", null);

        // ── Parse the JSON-RPC body ────────────────────────────────────
        if (request.method !== "POST") {
            return rpcError(-32600, "RPC requires POST", null);
        }
        let body: JsonRpcRequest | JsonRpcRequest[];
        try {
            body = await request.json();
        } catch {
            return rpcError(-32700, "parse error", null);
        }

        // Batch and single both supported.
        const isBatch = Array.isArray(body);
        const calls = isBatch ? body : [body];

        // Validate every call before forwarding any.
        for (const call of calls) {
            const validation = validateCall(call, env);
            // Lazy validation for KV-backed contract allowlist — surface
            // rejections sequentially.
            const result = await validation;
            if (result) return result;
        }

        // All calls passed validation — forward as-is to Anvil.
        return forwardToAnvil(request, env);
    },
};

async function validateCall(call: JsonRpcRequest, env: Env): Promise<Response | null> {
    const method = call.method;
    if (!method || typeof method !== "string") {
        return rpcError(-32600, "method missing", call.id ?? null);
    }
    if (HARD_BLOCKED_METHODS.has(method)) {
        return rpcError(-32601, `method ${method} blocked`, call.id ?? null);
    }
    if (method.startsWith(ANVIL_PREFIX) || method.startsWith(PERSONAL_PREFIX)) {
        return rpcError(-32601, `method namespace ${method} blocked`, call.id ?? null);
    }
    if (!ALLOWED_METHODS.has(method)) {
        return rpcError(-32601, `method ${method} not allowed`, call.id ?? null);
    }

    // Address allowlist for eth_call / eth_estimateGas.
    if (method === "eth_call" || method === "eth_estimateGas") {
        const params = call.params;
        const target = extractCallTarget(params);
        if (!target) {
            return rpcError(-32602, "missing call target address", call.id ?? null);
        }
        const allowed = await env.CONTRACT_ALLOWLIST.get(target.toLowerCase());
        if (!allowed) {
            return rpcError(
                -32602,
                `call target ${target} not in allowlist`,
                call.id ?? null,
            );
        }
    }

    return null;
}

/**
 * Extract the `to` address from eth_call / eth_estimateGas params.
 * Standard JSON-RPC: params[0] is a CallObject with a `.to` field.
 */
function extractCallTarget(params: unknown): string | null {
    if (!Array.isArray(params) || params.length === 0) return null;
    const callObject = params[0];
    if (typeof callObject !== "object" || callObject === null) return null;
    const to = (callObject as { to?: unknown }).to;
    if (typeof to !== "string") return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return null;
    return to;
}

function forwardToAnvil(request: Request, env: Env): Promise<Response> {
    // The Container binding exposes a fetch(...) method. We forward the
    // entire request — body, headers, method.
    const id = env.ANVIL.idFromName("anvil-singleton");
    const stub = env.ANVIL.get(id);
    return stub.fetch(request);
}

function readSessionCookie(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
        const [name, value] = part.trim().split("=");
        if (name === SESSION_COOKIE && value) return value;
    }
    return null;
}

function rpcError(code: number, message: string, id: number | string | null): Response {
    return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
        {
            status: 200, // JSON-RPC errors carry HTTP 200 with an error envelope.
            headers: { "content-type": "application/json" },
        },
    );
}

/**
 * Durable Object class wrapping the Anvil container.
 *
 * The Container is a Cloudflare-managed Docker runtime. Wrangler.toml
 * declares the image; the Worker accesses it via this Durable Object
 * binding. The DO ID is fixed ("anvil-singleton") so all RPC calls
 * route to the same container instance, which holds shared chain state.
 */
export class AnvilContainer {
    constructor(private state: DurableObjectState, private env: Env) {}

    async fetch(request: Request): Promise<Response> {
        // Forward to the container's HTTP port. The container is set
        // up to listen on port 8545 (Anvil default).
        // The exact mechanism is wrangler-specific — see the
        // Cloudflare Containers docs. This is a placeholder that
        // documents intent.
        const url = new URL(request.url);
        url.host = "localhost:8545";
        url.protocol = "http:";
        return fetch(url.toString(), request);
    }
}
