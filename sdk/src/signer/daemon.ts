/**
 * @figaro/sdk/signer — the policy signer daemon.
 *
 * A separate PROCESS that holds the key (F1) and exposes signing as an
 * operation over a local UNIX socket. Every request passes the out-of-model
 * policy gate (F2, F3) before anything is signed; every decision is audited.
 * The key exists only in this process — the socket carries signatures out,
 * never key bytes, and `signMessage` (personal_sign) is refused always: it
 * is not a protocol operation and a free-form signature is a blank cheque.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import { createPublicClient, http, type Address, type Hex, type TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { simulateCalls } from "viem/actions";
import {
    evaluateSimulation, evaluateTransaction, evaluateTypedData,
    type GateDecision, type SimulationOutcome, type TypedDataRequest,
} from "./gate.js";
import type { SignerPolicy } from "./policy.js";
import { appendAudit } from "./audit.js";
import { SpendJournal } from "./window.js";
import { parseRequest, wireStringify, type WireResponse } from "./wire.js";

export interface SignerDaemonOptions {
    /** A policy that already passed `validatePolicy`. */
    policy: SignerPolicy;
    /** The decrypted key — never leaves this process. */
    privateKey: Hex;
    socketPath: string;
    auditPath: string;
    journalPath: string;
    /** Injectable simulation (tests); defaults to eth_call + asset trace
     *  against the policy's RPC. */
    simulate?: (tx: { to: Address; data: Hex; value: bigint }) => Promise<SimulationOutcome>;
    /** Injectable clock (tests); defaults to wall time. */
    nowSecs?: () => number;
}

export interface SignerDaemon {
    address: Address;
    listen(): Promise<void>;
    close(): Promise<void>;
}

/** Convert a wire message's string quantities back to bigint per the typed
 *  data's own type table — nested structs included. The wire carries no
 *  BigInt; viem's signTypedData wants real ones. */
export function reviveTypedMessage(
    types: Record<string, { name: string; type: string }[]>,
    typeName: string,
    message: Record<string, unknown>,
): Record<string, unknown> {
    const fields = types[typeName];
    if (!fields) return message;
    const out: Record<string, unknown> = { ...message };
    for (const f of fields) {
        const v = out[f.name];
        if (/^u?int\d*$/.test(f.type) && typeof v === "string") {
            out[f.name] = BigInt(v);
        } else if (types[f.type] && typeof v === "object" && v !== null) {
            out[f.name] = reviveTypedMessage(types, f.type, v as Record<string, unknown>);
        }
    }
    return out;
}

/** Revive a serialized transaction's quantity fields. */
function reviveTx(params: Record<string, unknown>): TransactionSerializable {
    const out: Record<string, unknown> = { ...params };
    for (const k of ["value", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "gasPrice", "nonce", "chainId"]) {
        const v = out[k];
        if (typeof v === "string" && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(v)) {
            out[k] = k === "nonce" || k === "chainId" ? Number(BigInt(v)) : BigInt(v);
        }
    }
    return out as unknown as TransactionSerializable;
}

export function createSignerDaemon(opts: SignerDaemonOptions): SignerDaemon {
    const { policy, socketPath, auditPath, journalPath } = opts;
    const account = privateKeyToAccount(opts.privateKey);
    const journal = new SpendJournal(journalPath, policy.ceilings.periodSecs);
    const nowSecs = opts.nowSecs ?? (() => Math.floor(Date.now() / 1000));

    const publicClient = createPublicClient({ transport: http(policy.rpcUrl) });
    const simulate = opts.simulate ?? (async (tx): Promise<SimulationOutcome> => {
        try {
            await publicClient.call({ account: account.address, to: tx.to, data: tx.data, value: tx.value });
        } catch (e) {
            return { reverted: true, revertReason: e instanceof Error ? e.message.split("\n")[0] : String(e) };
        }
        // Asset tracing is best-effort: eth_simulateV1 where the RPC serves
        // it; the calldata accounting above is the always-on bound.
        try {
            const sim = await simulateCalls(publicClient, {
                account: account.address,
                calls: [{ to: tx.to, data: tx.data, value: tx.value }],
                traceAssetChanges: true,
            });
            const change = sim.assetChanges?.find(
                (c) => c.token.address.toLowerCase() === policy.token,
            );
            return { reverted: false, tokenDelta: change ? change.value.diff : undefined };
        } catch {
            return { reverted: false };
        }
    });

    const audit = (op: string, d: GateDecision, subject: string) => appendAudit(auditPath, {
        ts: new Date().toISOString(),
        op,
        allow: d.allow,
        reason: d.reason,
        subject,
        riskToken: d.risk.token.toString(),
        riskNative: d.risk.native.toString(),
    });

    async function handle(req: NonNullable<ReturnType<typeof parseRequest>>): Promise<WireResponse> {
        if (req.op === "health") {
            return { id: req.id, ok: true, result: { status: "ok", address: account.address } };
        }
        if (req.op === "signMessage") {
            const d: GateDecision = {
                allow: false, risk: { token: 0n, native: 0n },
                reason: "personal_sign is not a protocol operation — refused always",
            };
            audit(req.op, d, "signMessage");
            return { id: req.id, ok: false, error: d.reason };
        }
        const params = req.params ?? {};

        if (req.op === "signTypedData") {
            const typed = params as unknown as {
                domain: Record<string, unknown>;
                types: Record<string, { name: string; type: string }[]>;
                primaryType: string;
                message: Record<string, unknown>;
            };
            if (!typed.domain || !typed.types || typeof typed.primaryType !== "string" || !typed.message) {
                return { id: req.id, ok: false, error: "malformed signTypedData params" };
            }
            const decision = evaluateTypedData(
                policy, account.address,
                typed as unknown as TypedDataRequest,
                journal.spent(nowSecs()),
            );
            audit(req.op, decision, typed.primaryType);
            if (!decision.allow) return { id: req.id, ok: false, error: decision.reason };

            const signature = await account.signTypedData({
                domain: typed.domain,
                types: typed.types,
                primaryType: typed.primaryType,
                message: reviveTypedMessage(typed.types, typed.primaryType, typed.message),
            } as Parameters<typeof account.signTypedData>[0]);
            journal.record(nowSecs(), decision.risk.token, decision.risk.native);
            return { id: req.id, ok: true, result: { signature } };
        }

        // signTransaction
        const tx = reviveTx(params);
        const decision = evaluateTransaction(policy, {
            to: (tx as { to?: string }).to,
            data: (tx as { data?: string }).data,
            value: (tx as { value?: bigint }).value ?? 0n,
        }, journal.spent(nowSecs()));
        const subject = `${String((tx as { to?: string }).to)}:${String((tx as { data?: string }).data ?? "0x").slice(0, 10)}`;
        if (!decision.allow) {
            audit(req.op, decision, subject);
            return { id: req.id, ok: false, error: decision.reason };
        }
        const sim = await simulate({
            to: (tx as { to?: Address }).to as Address,
            data: ((tx as { data?: Hex }).data ?? "0x") as Hex,
            value: (tx as { value?: bigint }).value ?? 0n,
        });
        const veto = evaluateSimulation(policy, sim);
        const finalDecision = veto.allow ? decision : veto;
        audit(req.op, finalDecision, subject);
        if (!finalDecision.allow) return { id: req.id, ok: false, error: finalDecision.reason };

        const serializedTransaction = await account.signTransaction(tx);
        journal.record(nowSecs(), decision.risk.token, decision.risk.native);
        return { id: req.id, ok: true, result: { serializedTransaction } };
    }

    let server: net.Server | null = null;

    return {
        address: account.address,
        listen(): Promise<void> {
            return new Promise((resolve, reject) => {
                if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
                server = net.createServer((conn) => {
                    let buffer = "";
                    conn.on("data", (chunk) => {
                        buffer += chunk.toString("utf-8");
                        let nl: number;
                        while ((nl = buffer.indexOf("\n")) >= 0) {
                            const line = buffer.slice(0, nl);
                            buffer = buffer.slice(nl + 1);
                            const req = parseRequest(line);
                            if (!req) {
                                conn.write(`${wireStringify({ id: -1, ok: false, error: "malformed request" })}\n`);
                                continue;
                            }
                            handle(req)
                                .then((res) => conn.write(`${wireStringify(res)}\n`))
                                .catch((e) => conn.write(`${wireStringify({
                                    id: req.id, ok: false,
                                    error: e instanceof Error ? e.message : String(e),
                                })}\n`));
                        }
                    });
                });
                server.on("error", reject);
                server.listen(socketPath, () => {
                    // Owner-only: the socket is the signing capability.
                    fs.chmodSync(socketPath, 0o600);
                    resolve();
                });
            });
        },
        close(): Promise<void> {
            return new Promise((resolve) => {
                if (!server) return resolve();
                server.close(() => {
                    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
                    resolve();
                });
            });
        },
    };
}
