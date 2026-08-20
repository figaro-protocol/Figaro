/**
 * @figaro/sdk/signer — the socket-backed account.
 *
 * The agent side of the boundary: a viem local account whose signing methods
 * round-trip the UNIX socket. Dropping it into the `WalletClient` the agent
 * layer already takes moves the boundary from "which account object" to
 * "which process" — the agent's code path is unchanged and the key is
 * unreachable (F1).
 */

import * as net from "node:net";
import type { Address, Hex, LocalAccount } from "viem";
import { toAccount } from "viem/accounts";
import { wireStringify } from "./wire.js";
import { strippingReviver } from "../safeJson.js";

export interface SocketSignerConfig {
    socketPath: string;
    /** The operated wallet — the daemon's `health` response states it; pass
     *  it here so account construction needs no round-trip. */
    address: Address;
    timeoutMs?: number;
}

let nextId = 1;

function request(
    config: SocketSignerConfig,
    op: string,
    params: unknown,
): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        const conn = net.connect(config.socketPath);
        const timer = setTimeout(() => {
            conn.destroy();
            reject(new Error(`signer did not answer within ${config.timeoutMs ?? 30_000}ms`));
        }, config.timeoutMs ?? 30_000);
        let buffer = "";
        conn.on("connect", () => {
            conn.write(`${wireStringify({ id, op, params })}\n`);
        });
        conn.on("data", (chunk) => {
            buffer += chunk.toString("utf-8");
            const nl = buffer.indexOf("\n");
            if (nl < 0) return;
            clearTimeout(timer);
            conn.end();
            try {
                const res = JSON.parse(buffer.slice(0, nl), strippingReviver) as {
                    ok: boolean; result?: Record<string, unknown>; error?: string;
                };
                if (res.ok && res.result) resolve(res.result);
                else reject(new Error(res.error ?? "signer refused"));
            } catch (e) {
                reject(e);
            }
        });
        conn.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
        });
    });
}

/**
 * Build the socket-backed account. `signMessage` round-trips too — the
 * daemon refuses it always, and routing the refusal through the socket puts
 * it in the audit log rather than losing it client-side.
 */
export function socketSignerAccount(config: SocketSignerConfig): LocalAccount {
    return toAccount({
        address: config.address,
        async signMessage() {
            await request(config, "signMessage", {});
            throw new Error("unreachable: the signer never grants personal_sign");
        },
        async signTransaction(tx) {
            const result = await request(config, "signTransaction", tx);
            return result.serializedTransaction as Hex;
        },
        async signTypedData(typedData) {
            const result = await request(config, "signTypedData", typedData);
            return result.signature as Hex;
        },
    }) as LocalAccount;
}

/** Ask a running daemon who it operates — the one-round-trip health check. */
export async function signerHealth(
    config: Omit<SocketSignerConfig, "address"> & { address?: Address },
): Promise<{ status: string; address: Address }> {
    const result = await request({ ...config, address: (config.address ?? "0x") as Address }, "health", {});
    return result as unknown as { status: string; address: Address };
}
