#!/usr/bin/env node
/**
 * @figaro-protocol/sdk/signer — the daemon entrypoint.
 *
 *   figaro-signer --policy <policy.json> --keystore <keystore.json> \
 *     --socket <path> [--audit <file>] [--journal <file>]
 *
 * The passphrase arrives via FIGARO_SIGNER_PASSPHRASE or a hidden prompt —
 * never an argument (arguments are visible to every process lister). A
 * malformed policy or a failed keystore decrypt refuses to start.
 */

import * as fs from "node:fs";
import * as readline from "node:readline";
import { Writable } from "node:stream";
import { validatePolicy } from "./policy.js";
import { decryptKeystore, type KeystoreV3 } from "./keystore.js";
import { createSignerDaemon } from "./daemon.js";

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

async function main() {
    const policyPath = arg("policy") ?? fail("--policy <file> is required");
    const keystorePath = arg("keystore") ?? fail("--keystore <file> is required");
    const socketPath = arg("socket") ?? fail("--socket <path> is required");
    const auditPath = arg("audit") ?? `${socketPath}.audit.jsonl`;
    const journalPath = arg("journal") ?? `${socketPath}.window.jsonl`;

    const policyResult = validatePolicy(JSON.parse(fs.readFileSync(policyPath, "utf-8")));
    if (!policyResult.ok) {
        fail(`policy refused:\n  ${policyResult.errors.join("\n  ")}`);
    }
    const policy = policyResult.policy;

    const keystore = JSON.parse(fs.readFileSync(keystorePath, "utf-8")) as KeystoreV3;
    const passphrase = process.env.FIGARO_SIGNER_PASSPHRASE ?? await promptPassphrase();
    const privateKey = decryptKeystore(keystore, passphrase);

    const daemon = createSignerDaemon({
        policy, privateKey, socketPath, auditPath, journalPath,
    });
    await daemon.listen();
    console.log(`figaro-signer: operating ${daemon.address}`);
    console.log(`  chain ${policy.chainId} · domains ${policy.verifyingContracts.join(", ")}`);
    console.log(`  socket ${socketPath} · audit ${auditPath}`);

    const shutdown = async () => {
        await daemon.close();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
