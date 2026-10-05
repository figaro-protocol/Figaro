/**
 * @figaro-protocol/sdk/signer — the policy gate.
 *
 * Pure decision core: policy + request + window state in, decision out. No
 * I/O, no key, no clock reads — the daemon supplies `nowSecs` and the spent
 * window, which is what makes every refusal unit-testable.
 *
 * Risk accounting is deliberately closed-world over how value can LEAVE the
 * wallet: the denomination moves only through allowances (no `transfer`
 * selector is ever allowlisted), so counting every `approve` at its amount
 * bounds all token outflow; native ETH leaves as a payable call's `value`
 * and as the transaction's fee, counted together against the native ceiling
 * (absent = zero = every transaction refused: a fee is ETH). A transaction
 * is read field by field, and one carrying a field the gate does not
 * evaluate is refused. A typed-data signature's risk is the wallet's bonds
 * under the 2× bond math on a Commitment — both when it is buyer and seller;
 * the other protocol structs put nothing new at risk.
 */

import type { Address, Hex } from "viem";
import { calculateBonds } from "../bonds.js";
import { parseAmount, type SignerPolicy } from "./policy.js";

/** What a request would add to the wallet's exposure. */
export interface RiskDelta {
    token: bigint;
    native: bigint;
}

export interface GateDecision {
    allow: boolean;
    risk: RiskDelta;
    reason: string;
}

/** The rolling-window totals already spent (from the signer's journal). */
export interface SpentWindow {
    token: bigint;
    native: bigint;
}

const refuse = (reason: string): GateDecision =>
    ({ allow: false, risk: { token: 0n, native: 0n }, reason });

function toBigInt(v: unknown): bigint | null {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === "string" && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(v)) return BigInt(v);
    return null;
}

function ceilings(policy: SignerPolicy) {
    return {
        perAction: parseAmount(policy.ceilings.perAction) ?? 0n,
        perPeriod: parseAmount(policy.ceilings.perPeriod) ?? 0n,
        perActionNative: parseAmount(policy.ceilings.perActionNative ?? "0") ?? 0n,
        perPeriodNative: parseAmount(policy.ceilings.perPeriodNative ?? "0") ?? 0n,
    };
}

/** Ceiling check shared by both request kinds. */
function checkCeilings(
    policy: SignerPolicy,
    risk: RiskDelta,
    spent: SpentWindow,
): GateDecision | null {
    const c = ceilings(policy);
    if (risk.token > c.perAction) {
        return refuse(`token risk ${risk.token} exceeds perAction ceiling ${c.perAction}`);
    }
    if (spent.token + risk.token > c.perPeriod) {
        return refuse(`token risk ${risk.token} + window ${spent.token} exceeds perPeriod ceiling ${c.perPeriod}`);
    }
    if (risk.native > c.perActionNative) {
        return refuse(`native risk ${risk.native} exceeds perActionNative ceiling ${c.perActionNative}`);
    }
    if (spent.native + risk.native > c.perPeriodNative) {
        return refuse(`native risk ${risk.native} + window ${spent.native} exceeds perPeriodNative ceiling ${c.perPeriodNative}`);
    }
    return null;
}

// ── Typed data ──────────────────────────────────────────────────────────────

export interface TypedDataRequest {
    domain: { chainId?: unknown; verifyingContract?: unknown };
    primaryType: string;
    message: Record<string, unknown>;
}

/** Protocol structs whose signature moves no value by itself. */
const ZERO_RISK_PRIMARY_TYPES = new Set([
    "AttestSeller",
    "AttestBuyer",
    "ResolveProcess",
]);

/**
 * Decide a `signTypedData` request. Domain binding first (chainId + a
 * verifyingContract on the policy's allowlist — FigaroCore or the batch
 * verifier), then risk: a Commitment binds the wallet's own bond side; an
 * unknown primaryType is refused, never signed blind.
 */
export function evaluateTypedData(
    policy: SignerPolicy,
    wallet: Address,
    req: TypedDataRequest,
    spent: SpentWindow,
): GateDecision {
    const chainId = toBigInt(req.domain.chainId);
    if (chainId === null || chainId !== BigInt(policy.chainId)) {
        return refuse(`domain chainId ${String(req.domain.chainId)} is not the policy chain ${policy.chainId}`);
    }
    const vc = typeof req.domain.verifyingContract === "string"
        ? req.domain.verifyingContract.toLowerCase()
        : "";
    if (!policy.verifyingContracts.includes(vc as Address)) {
        return refuse(`verifyingContract ${vc || "(missing)"} is not on the domain allowlist`);
    }

    let risk: RiskDelta = { token: 0n, native: 0n };
    if (req.primaryType === "Commitment") {
        const buyer = typeof req.message.buyer === "string" ? req.message.buyer.toLowerCase() : "";
        const seller = typeof req.message.seller === "string" ? req.message.seller.toLowerCase() : "";
        const payment = toBigInt(req.message.payment);
        const cumulative = toBigInt(req.message.expectedCumulativeValue);
        const currency = typeof req.message.currency === "string" ? req.message.currency.toLowerCase() : "";
        if (payment === null || cumulative === null) {
            return refuse("Commitment payment/expectedCumulativeValue are not quantities");
        }
        if (currency !== policy.token) {
            return refuse(`Commitment currency ${currency || "(missing)"} is not the policy token`);
        }
        const me = wallet.toLowerCase();
        const bonds = calculateBonds(cumulative, payment);
        // The Core admits buyer == seller and pulls both bonds from the one
        // wallet.
        const mine = (buyer === me ? bonds.buyerBond : 0n) + (seller === me ? bonds.sellerBond : 0n);
        if (buyer !== me && seller !== me) {
            return refuse("wallet is neither buyer nor seller of the Commitment");
        }
        risk = { token: mine, native: 0n };
    } else if (!ZERO_RISK_PRIMARY_TYPES.has(req.primaryType)) {
        return refuse(`unknown primaryType ${req.primaryType} — never signed blind`);
    }

    return checkCeilings(policy, risk, spent)
        ?? { allow: true, risk, reason: `ok: ${req.primaryType} under ${vc}` };
}

// ── Transactions ────────────────────────────────────────────────────────────

/** A transaction as the wallet client hands it to the signer. Every field
 *  present is read: the ones below are evaluated, and any other refuses the
 *  request. */
export interface TransactionRequest {
    to?: unknown;
    data?: unknown;
    value?: unknown;
    gas?: unknown;
    maxFeePerGas?: unknown;
    maxPriorityFeePerGas?: unknown;
    gasPrice?: unknown;
    chainId?: unknown;
    [field: string]: unknown;
}

/** The fields `evaluateTransaction` accounts for. `maxPriorityFeePerGas` is
 *  bounded by `maxFeePerGas`; an access list spends gas inside `gas`; `nonce`
 *  and `from` move no value. Blob fees and authorization lists are outside
 *  this set, and so refused. */
const EVALUATED_TX_FIELDS = new Set([
    "to", "data", "value", "gas", "maxFeePerGas", "maxPriorityFeePerGas",
    "gasPrice", "chainId", "nonce", "type", "accessList", "from",
]);
const EVALUATED_TX_TYPES = new Set(["legacy", "eip2930", "eip1559"]);
const QUANTITY_TX_FIELDS = [
    "value", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasPrice", "nonce", "chainId",
] as const;

/** `approve(address,uint256)` — the one selector whose calldata is risk. */
export const APPROVE_SELECTOR: Hex = "0x095ea7b3";

/**
 * Decide a `signTransaction` request: target + selector must be allowlisted;
 * an `approve` on the denomination counts its amount (and its spender
 * must itself be an allowlisted contract); the payable `value` and the
 * worst-case fee (`gas` × the fee cap) count together against the native
 * ceiling. The transaction must name the policy's chain. Contract creation
 * (`to` absent), a fee that cannot be bounded, and a field the gate does not
 * evaluate are refused.
 */
export function evaluateTransaction(
    policy: SignerPolicy,
    req: TransactionRequest,
    spent: SpentWindow,
): GateDecision {
    // Absent is `undefined` only: the serializer reads a `null` field as
    // present (a `null` authorization list makes an EIP-7702 transaction).
    for (const [field, v] of Object.entries(req)) {
        if (v === undefined) continue;
        if (!EVALUATED_TX_FIELDS.has(field)) {
            return refuse(`transaction field ${field} is not one the gate evaluates — never signed blind`);
        }
    }
    if (req.type !== undefined && (typeof req.type !== "string" || !EVALUATED_TX_TYPES.has(req.type))) {
        return refuse(`transaction type ${String(req.type)} is not one the gate evaluates — never signed blind`);
    }
    // Every quantity present is one the gate can read. The serializer reads
    // more spellings than `toBigInt` does (" 1e15", "0X…", ["…"], true): a
    // quantity the gate cannot read is one it would not count, so it refuses.
    for (const field of QUANTITY_TX_FIELDS) {
        if (req[field] !== undefined && toBigInt(req[field]) === null) {
            return refuse(`transaction ${field} is not a quantity`);
        }
    }
    const chainId = toBigInt(req.chainId);
    if (chainId === null || chainId !== BigInt(policy.chainId)) {
        return refuse(`transaction chainId ${String(req.chainId ?? "(missing)")} is not the policy chain ${policy.chainId}`);
    }

    const to = typeof req.to === "string" ? req.to.toLowerCase() : "";
    if (!to) return refuse("transaction has no target — contract creation is refused");
    const selectors = policy.contracts[to as Address];
    if (!selectors) return refuse(`target ${to} is not an allowlisted contract`);

    const data = typeof req.data === "string" ? req.data.toLowerCase() : "0x";
    if (data.length < 10) return refuse("calldata carries no selector");
    const selector = data.slice(0, 10) as Hex;
    if (!selectors.includes(selector)) {
        return refuse(`selector ${selector} is not allowlisted on ${to}`);
    }

    const value = toBigInt(req.value ?? 0n);
    if (value === null) return refuse("transaction value is not a quantity");

    // The fee is ETH leaving the wallet, to whoever builds the block. The
    // most it can be is the gas limit at the fee cap.
    const gas = toBigInt(req.gas);
    const caps = [toBigInt(req.maxFeePerGas), toBigInt(req.gasPrice)].filter((c): c is bigint => c !== null);
    if (gas === null || caps.length === 0) {
        return refuse("transaction carries no gas limit or no fee cap — its fee cannot be bounded");
    }
    const fee = gas * caps.reduce((a, b) => (a > b ? a : b));

    let tokenRisk = 0n;
    if (to === policy.token && selector === APPROVE_SELECTOR) {
        if (data.length < 10 + 128) return refuse("approve calldata is truncated");
        const spender = (`0x${data.slice(10 + 24, 10 + 64)}`) as Address;
        const amount = BigInt(`0x${data.slice(10 + 64, 10 + 128)}`);
        if (!policy.contracts[spender]) {
            return refuse(`approve spender ${spender} is not an allowlisted contract`);
        }
        tokenRisk = amount;
    }

    const risk: RiskDelta = { token: tokenRisk, native: value + fee };
    return checkCeilings(policy, risk, spent)
        ?? { allow: true, risk, reason: `ok: ${selector} on ${to}` };
}

// ── Simulation veto ─────────────────────────────────────────────────────────

export interface SimulationOutcome {
    /** The `eth_call` outcome — a revert refuses the signature. */
    reverted: boolean;
    revertReason?: string;
    /** Signed denomination delta for the wallet when the RPC could trace
     *  it (negative = outflow); undefined when tracing is unsupported. */
    tokenDelta?: bigint;
}

/**
 * The simulation veto: the gate disposes AFTER the chain has spoken. A
 * revert refuses outright; a traced outflow beyond the per-action ceiling
 * refuses even when the calldata accounting passed (defense in depth — the
 * ceiling holds whichever side sees the larger number).
 */
export function evaluateSimulation(
    policy: SignerPolicy,
    sim: SimulationOutcome,
): GateDecision {
    if (sim.reverted) {
        return refuse(`simulation reverted${sim.revertReason ? `: ${sim.revertReason}` : ""}`);
    }
    if (sim.tokenDelta !== undefined && sim.tokenDelta < 0n) {
        const outflow = -sim.tokenDelta;
        const perAction = parseAmount(policy.ceilings.perAction) ?? 0n;
        if (outflow > perAction) {
            return refuse(`simulated token outflow ${outflow} exceeds perAction ceiling ${perAction}`);
        }
    }
    return { allow: true, risk: { token: 0n, native: 0n }, reason: "simulation clean" };
}
