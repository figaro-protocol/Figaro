/**
 * @figaro/sdk/signer — the out-of-model policy.
 *
 * The policy is CONFIGURATION THE MODEL CANNOT REACH: a JSON file the signer
 * process owns, loaded at start, validated strictly — a malformed policy
 * refuses to start rather than defaulting anything open. Everything the gate
 * decides (docs/AI_AGENT_COORDINATION.md § "The sandboxed signer runtime")
 * derives from this object plus the request; nothing is decided by the model
 * that proposes the signature.
 */

import type { Address, Hex } from "viem";

/** Value ceilings, all amounts as decimal strings in base units.
 *
 *  Token risk (approvals at their amount, bonds at the wallet's side of the
 *  2× math) counts against `perAction`/`perPeriod` in the settlement token's
 *  base units. Native risk (a payable call's `value` — registry stakes)
 *  counts against `perActionNative`/`perPeriodNative` in wei; ABSENT means
 *  ZERO — a transaction carrying ETH is refused unless the policy grants a
 *  native ceiling explicitly. */
export interface SignerCeilings {
    perAction: string;
    perPeriod: string;
    periodSecs: number;
    perActionNative?: string;
    perPeriodNative?: string;
}

/**
 * The signer policy — JSON alongside the deployment record.
 *
 * `verifyingContracts` carries BOTH EIP-712 domains a Figaro wallet signs
 * under: `FigaroCore` (the direct path) and `FigaroBatchVerifier` (the batch
 * universe signs over the VERIFIER's domain — ruled 2026-08-20). A typed-data
 * request binding any other domain is refused outright.
 */
export interface SignerPolicy {
    chainId: number;
    /** EIP-712 verifyingContract allowlist (lowercased at validation). */
    verifyingContracts: Address[];
    /** Transaction targets: address → allowed 4-byte selectors (lowercased). */
    contracts: Record<Address, Hex[]>;
    /** The settlement token whose `approve` amounts are counted as risk. */
    token: Address;
    ceilings: SignerCeilings;
    /** Egress allowlist, consumed by the sandbox wrapper (validated here so
     *  one file carries the whole boundary). */
    egress: string[];
    /** The RPC the simulation veto calls — part of the egress boundary. */
    rpcUrl: string;
}

export type PolicyResult =
    | { ok: true; policy: SignerPolicy }
    | { ok: false; errors: string[] };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const DECIMAL_RE = /^[0-9]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse a non-negative decimal-string amount, or null. */
export function parseAmount(v: unknown): bigint | null {
    if (typeof v !== "string" || !DECIMAL_RE.test(v)) return null;
    return BigInt(v);
}

/**
 * Validate an untrusted policy object into a `SignerPolicy` with every
 * address and selector lowercased (comparisons downstream are exact). Strict:
 * unknown top-level keys are errors — a typo must fail loudly, not silently
 * grant nothing.
 */
export function validatePolicy(raw: unknown): PolicyResult {
    const errors: string[] = [];
    if (!isRecord(raw)) return { ok: false, errors: ["policy must be a JSON object"] };

    const KNOWN = new Set([
        "chainId", "verifyingContracts", "contracts", "token", "ceilings", "egress", "rpcUrl",
    ]);
    for (const key of Object.keys(raw)) {
        if (!KNOWN.has(key)) errors.push(`unknown key: ${key}`);
    }

    const chainId = raw.chainId;
    if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) {
        errors.push("chainId must be a positive integer");
    }

    const vcs: Address[] = [];
    if (!Array.isArray(raw.verifyingContracts) || raw.verifyingContracts.length === 0) {
        errors.push("verifyingContracts must be a non-empty array");
    } else {
        for (const a of raw.verifyingContracts) {
            if (typeof a !== "string" || !ADDRESS_RE.test(a)) {
                errors.push(`verifyingContracts: not an address: ${String(a)}`);
            } else {
                vcs.push(a.toLowerCase() as Address);
            }
        }
    }

    const contracts: Record<Address, Hex[]> = {};
    if (!isRecord(raw.contracts) || Object.keys(raw.contracts).length === 0) {
        errors.push("contracts must be a non-empty object of address → selectors");
    } else {
        for (const [addr, sels] of Object.entries(raw.contracts)) {
            if (!ADDRESS_RE.test(addr)) {
                errors.push(`contracts: not an address: ${addr}`);
                continue;
            }
            if (!Array.isArray(sels) || sels.length === 0) {
                errors.push(`contracts[${addr}]: selectors must be a non-empty array`);
                continue;
            }
            const clean: Hex[] = [];
            for (const s of sels) {
                if (typeof s !== "string" || !SELECTOR_RE.test(s)) {
                    errors.push(`contracts[${addr}]: not a 4-byte selector: ${String(s)}`);
                } else {
                    clean.push(s.toLowerCase() as Hex);
                }
            }
            contracts[addr.toLowerCase() as Address] = clean;
        }
    }

    let token: Address | null = null;
    if (typeof raw.token !== "string" || !ADDRESS_RE.test(raw.token)) {
        errors.push("token must be an address");
    } else {
        token = raw.token.toLowerCase() as Address;
    }

    let ceilings: SignerCeilings | null = null;
    if (!isRecord(raw.ceilings)) {
        errors.push("ceilings must be an object");
    } else {
        const c = raw.ceilings;
        const perAction = parseAmount(c.perAction);
        const perPeriod = parseAmount(c.perPeriod);
        if (perAction === null) errors.push("ceilings.perAction must be a decimal string");
        if (perPeriod === null) errors.push("ceilings.perPeriod must be a decimal string");
        if (perAction !== null && perPeriod !== null && perAction > perPeriod) {
            errors.push("ceilings.perAction must not exceed ceilings.perPeriod");
        }
        if (typeof c.periodSecs !== "number" || !Number.isInteger(c.periodSecs) || c.periodSecs <= 0) {
            errors.push("ceilings.periodSecs must be a positive integer");
        }
        for (const k of ["perActionNative", "perPeriodNative"] as const) {
            if (c[k] !== undefined && parseAmount(c[k]) === null) {
                errors.push(`ceilings.${k} must be a decimal string when present`);
            }
        }
        if (errors.length === 0) {
            ceilings = {
                perAction: c.perAction as string,
                perPeriod: c.perPeriod as string,
                periodSecs: c.periodSecs as number,
                ...(c.perActionNative !== undefined ? { perActionNative: c.perActionNative as string } : {}),
                ...(c.perPeriodNative !== undefined ? { perPeriodNative: c.perPeriodNative as string } : {}),
            };
        }
    }

    const egress: string[] = [];
    if (!Array.isArray(raw.egress)) {
        errors.push("egress must be an array of origins");
    } else {
        for (const e of raw.egress) {
            if (typeof e !== "string" || e.length === 0) errors.push(`egress: not an origin: ${String(e)}`);
            else egress.push(e);
        }
    }

    if (typeof raw.rpcUrl !== "string" || !/^https?:\/\//.test(raw.rpcUrl)) {
        errors.push("rpcUrl must be an http(s) URL");
    }

    if (errors.length > 0 || token === null || ceilings === null) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        policy: {
            chainId: chainId as number,
            verifyingContracts: vcs,
            contracts,
            token,
            ceilings,
            egress,
            rpcUrl: raw.rpcUrl as string,
        },
    };
}
