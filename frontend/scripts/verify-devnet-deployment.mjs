#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');
const rpcUrl = process.env.FIGARO_DEVNET_RPC_URL || 'http://127.0.0.1:8545';
const expectedChainId = '0x7a69';
// keccak256("currentPeriod()")[0..4] — UsageCounter's view of the period open for accrual.
const CURRENT_PERIOD_SELECTOR = '0x06040618';

const requiredContracts = [
    { key: 'NEXT_PUBLIC_FIGARO_CORE', label: 'FigaroCore' },
    { key: 'NEXT_PUBLIC_TOKEN_ADDRESS', label: 'MockERC20' },
    { key: 'NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS', label: 'MockPermitToken' },
    { key: 'NEXT_PUBLIC_ATTESTATION_COORDINATOR', label: 'AttestationCoordinator' },
];

const optionalContracts = [
    { key: 'NEXT_PUBLIC_CLAUSE_REGISTRY', label: 'ClauseRegistry' },
    { key: 'NEXT_PUBLIC_MEMBERS_REGISTRY', label: 'MembersRegistry' },
    { key: 'NEXT_PUBLIC_ASSEMBLY_REGISTRY', label: 'AssemblyRegistry' },
    { key: 'NEXT_PUBLIC_AGREEMENT_REGISTRY', label: 'AgreementRegistry' },
    { key: 'NEXT_PUBLIC_DAO_TREASURY', label: 'MockTreasuryMultisig' },
];

function fail(message) {
    console.error(`\n[devnet-preflight] ${message}`);
    console.error('[devnet-preflight] Expected local setup:');
    console.error('[devnet-preflight]   1. Start Anvil: anvil --port 8545');
    console.error('[devnet-preflight]   2. Redeploy from repo root: ./deploy-local.sh');
    console.error('[devnet-preflight]   3. Restart the frontend if .env.local changed');
    process.exit(1);
}

function parseEnvFile(filePath) {
    const values = {};

    if (!fs.existsSync(filePath)) {
        fail(`Missing ${path.relative(path.resolve(__dirname, '..'), filePath)}.`);
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    for (const line of contents.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        values[key] = value;
    }

    return values;
}

function isAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function rpc(method, params = []) {
    let response;
    try {
        response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method,
                params,
            }),
        });
    } catch (error) {
        fail(`Could not reach RPC at ${rpcUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
        fail(`RPC at ${rpcUrl} returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (payload.error) {
        fail(`RPC ${method} failed: ${payload.error.message || JSON.stringify(payload.error)}`);
    }

    return payload.result;
}

async function main() {
    const env = parseEnvFile(envPath);

    for (const contract of requiredContracts) {
        const value = env[contract.key];
        if (!value) {
            fail(`Missing required ${contract.key} in .env.local.`);
        }
        if (!isAddress(value)) {
            fail(`${contract.key} is not a valid Ethereum address: ${value}`);
        }
    }

    for (const contract of optionalContracts) {
        const value = env[contract.key];
        if (value && !isAddress(value)) {
            fail(`${contract.key} is not a valid Ethereum address: ${value}`);
        }
    }

    const chainId = await rpc('eth_chainId');
    if (chainId !== expectedChainId) {
        fail(`RPC ${rpcUrl} is on chain ${chainId}, expected ${expectedChainId} (31337).`);
    }

    const configuredContracts = [...requiredContracts, ...optionalContracts]
        .map((contract) => ({ ...contract, address: env[contract.key] }))
        .filter((contract) => Boolean(contract.address));

    const missingCode = [];
    for (const contract of configuredContracts) {
        const code = await rpc('eth_getCode', [contract.address, 'latest']);
        if (!code || code === '0x') {
            missingCode.push(`${contract.label} (${contract.key}=${contract.address})`);
        }
    }

    if (missingCode.length > 0) {
        fail(`Configured contracts have no bytecode on ${rpcUrl}:\n[devnet-preflight]   ${missingCode.join('\n[devnet-preflight]   ')}`);
    }

    // The devnet runs the nine annual accrual periods of every public network
    // (script/Deploy.s.sol), and the rewards spec closes one per run by advancing
    // the chain's clock past it; after nine such runs every period has ended:
    // UsageCounter.currentPeriod() reverts AccrualClosed, every usage recording
    // reverts with it, and the specs that hold usage to the counter fail on a
    // devnet that is otherwise whole. A closed accrual is a devnet to redeploy —
    // devup redeploys when this preflight fails.
    const usageCounter = env.NEXT_PUBLIC_USAGE_COUNTER;
    if (usageCounter && isAddress(usageCounter)) {
        const call = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'eth_call',
                params: [{ to: usageCounter, data: CURRENT_PERIOD_SELECTOR }, 'latest'],
            }),
        });
        // eslint-disable-next-line no-restricted-syntax -- the local anvil node's answer, read for its error field alone
        const payload = await call.json();
        if (payload.error) {
            fail(`UsageCounter.currentPeriod() reverts on ${rpcUrl}: every accrual period of this devnet has ended (each run of the rewards spec advances the chain past one of its nine annual periods), so every usage recording reverts AccrualClosed. Redeploy: FORCE_REDEPLOY=1 ./scripts/devup.sh`);
        }
    }

    console.log(`[devnet-preflight] Verified ${configuredContracts.length} contract addresses against ${rpcUrl}; the accrual is open.`);
}

await main();