/**
 * @figaro-protocol/sdk/signer — the policy gate.
 *
 * Pure decision core: policy + request + window state in, decision out. No
 * I/O, no key, no clock reads — the daemon supplies `nowSecs` and the spent
 * window, which is what makes every refusal unit-testable.
 *
 * Risk accounting is deliberately closed-world over how value can LEAVE the
 * wallet: the settlement token moves only through allowances (no `transfer`
 * selector is ever allowlisted), so counting every `approve` at its amount
 * bounds all token outflow; native ETH moves only as a payable call's
 * `value`, counted against its own ceiling (absent = zero = refused). A
 * typed-data signature's risk is the wallet's own side of the 2× bond math
 * on a Commitment; the other protocol structs put nothing new at risk.
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
        if (buyer === me) risk = { token: bonds.buyerBond, native: 0n };
        else if (seller === me) risk = { token: bonds.sellerBond, native: 0n };
        else return refuse("wallet is neither buyer nor seller of the Commitment");
    } else if (!ZERO_RISK_PRIMARY_TYPES.has(req.primaryType)) {
        return refuse(`unknown primaryType ${req.primaryType} — never signed blind`);
    }

    return checkCeilings(policy, risk, spent)
        ?? { allow: true, risk, reason: `ok: ${req.primaryType} under ${vc}` };
}

// ── Transactions ────────────────────────────────────────────────────────────

export interface TransactionRequest {
    to?: unknown;
    data?: unknown;
    value?: unknown;
}

/** `approve(address,uint256)` — the one selector whose calldata is risk. */
export const APPROVE_SELECTOR: Hex = "0x095ea7b3";

/**
 * Decide a `signTransaction` request: target + selector must be allowlisted;
 * an `approve` on the settlement token counts its amount (and its spender
 * must itself be an allowlisted contract); a payable `value` counts against
 * the native ceiling. Contract creation (`to` absent) is refused.
 */
export function evaluateTransaction(
    policy: SignerPolicy,
    req: TransactionRequest,
    spent: SpentWindow,
): GateDecision {
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

    const risk: RiskDelta = { token: tokenRisk, native: value };
    return checkCeilings(policy, risk, spent)
        ?? { allow: true, risk, reason: `ok: ${selector} on ${to}` };
}

// ── Simulation veto ─────────────────────────────────────────────────────────

export interface SimulationOutcome {
    /** The `eth_call` outcome — a revert refuses the signature. */
    reverted: boolean;
    revertReason?: string;
    /** Signed settlement-token delta for the wallet when the RPC could trace
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
