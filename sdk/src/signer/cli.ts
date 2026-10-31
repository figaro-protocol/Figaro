#!/usr/bin/env node
/**
 * @figaro-protocol/sdk/signer — the daemon entrypoint.
 *
 *   figaro-signer --policy <policy.json> \
 *     (--keystore <keystore.json> | --ledger [--hd-path <path>]) \
 *     [--dir <dir>] [--socket <path>]
 *
 * The socket, the audit log and the spend journal sit in one directory of
 * the signer's own — `~/.figaro-signer` unless named — never in a temp
 * directory: a sandboxed agent may write there.
 *
 * Keystore custody: the passphrase arrives via FIGARO_SIGNER_PASSPHRASE or a
 * hidden prompt — never an argument (arguments are visible to every process
 * lister). Ledger custody: the key stays on the device, reached over USB HID
 * through `@ledgerhq/hw-transport-node-hid`, which the owner installs beside
 * the SDK; the Ethereum app must be open, and the device asks for each
 * signature. A malformed policy, a failed keystore decrypt, or a device that
 * cannot be opened refuses to start.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as readline from "node:readline";
import { Writable } from "node:stream";
import { validatePolicy } from "./policy.js";
import { decryptKeystore, type KeystoreV3 } from "./keystore.js";
import { keyCustody, type SignerCustody } from "./custody.js";
import { DEFAULT_LEDGER_PATH, ledgerCustody, type LedgerTransport } from "./ledger.js";
import { createSignerDaemon } from "./daemon.js";
import { resolveSignerPaths } from "./paths.js";

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
    console.error(`figaro-signer: ${message}`);
    process.exit(1);
}

async function promptPassphrase(): Promise<string> {
    // Muted output: the prompt renders, the typed characters do not.
    let muted = false;
    const mutable = new Writable({
        write(chunk, _enc, cb) {
            if (!muted) process.stdout.write(chunk);
            cb();
        },
    });
    const rl = readline.createInterface({ input: process.stdin, output: mutable, terminal: true });
    return new Promise((resolve) => {
        rl.question("keystore passphrase: ", (answer) => {
            muted = false;
            process.stdout.write("\n");
            rl.close();
            resolve(answer);
        });
        muted = true;
    });
}

/** The USB HID transport, from the package the owner installs beside the
 *  SDK; absent, the signer refuses to start and names it. */
async function openLedgerTransport(): Promise<LedgerTransport> {
    const name = "@ledgerhq/hw-transport-node-hid";
    let mod: { default?: { create(): Promise<LedgerTransport> } };
    try {
        mod = await import(name) as typeof mod;
    } catch {
        fail(`--ledger needs ${name} installed beside @figaro-protocol/sdk (npm install ${name})`);
    }
    if (!mod.default?.create) fail(`${name} has no default transport to open`);
    return mod.default.create();
}

async function main() {
    const policyPath = arg("policy") ?? fail("--policy <file> is required");
    const keystorePath = arg("keystore");
    const useLedger = process.argv.includes("--ledger");
    if (Boolean(keystorePath) === useLedger) fail("name one custody: --keystore <file> or --ledger");
    const { socketPath, auditPath, journalPath } = resolveSignerPaths(
        { dir: arg("dir"), socket: arg("socket") },
        os.homedir(),
    );

    const policyResult = validatePolicy(JSON.parse(fs.readFileSync(policyPath, "utf-8")));
    if (!policyResult.ok) {
        fail(`policy refused:\n  ${policyResult.errors.join("\n  ")}`);
    }
    const policy = policyResult.policy;

    let custody: SignerCustody;
    if (keystorePath) {
        const keystore = JSON.parse(fs.readFileSync(keystorePath, "utf-8")) as KeystoreV3;
        const passphrase = process.env.FIGARO_SIGNER_PASSPHRASE ?? await promptPassphrase();
        custody = keyCustody(decryptKeystore(keystore, passphrase));
    } else {
        custody = await ledgerCustody({ transport: await openLedgerTransport(), path: arg("hd-path") ?? DEFAULT_LEDGER_PATH });
    }

    const daemon = createSignerDaemon({
        policy, custody, socketPath, auditPath, journalPath,
    });
    await daemon.listen();
    console.log(`figaro-signer: operating ${daemon.address}`);
    console.log(`  chain ${policy.chainId} · domains ${policy.verifyingContracts.join(", ")}`);
    console.log(`  socket ${socketPath} · audit ${auditPath} · journal ${journalPath}`);

    const shutdown = async () => {
        await daemon.close();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
