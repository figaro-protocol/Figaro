// Who registered each reference agreement and assembly the expectations file
// names — the part of scripts/check-deployment.mjs that reads
// AgreementRegistry.bindings(key) and ProcessRegistry.bindings(key), as the
// clause part reads ClauseRegistry.depositOf(key). Its own module so
// scripts/test-check-deployment-registrars.mjs can run it against a stand-in
// chain read; check-deployment.mjs is a command and cannot be imported.
//
// The expectations file names them under "registrations":
//   "agreements":    { "<file in agreements/, no .json>": "<wallet>" }
//   "assemblies":    { "<file in assemblies/, no .json>": "<wallet>" }
//   "assemblyToken": the token the seeding filled into the assemblies'
//                    denomination pin (ASSEMBLY_TOKEN_ADDRESS); the
//                    assembly's key depends on it. A written assembly that
//                    names an address of the deployment for its pin (`deployTimeCurrency`,
//                    the florin-gated twins' `florinToken`) takes that
//                    entry's address from the deployment record instead.
// The key is derived the way the seeding derives it (populate-clauses.mjs:
// the agreement's merkle root over its composed clauses, the assembly's hash
// over its composition), never read from a name.

import fs from "node:fs";
import path from "node:path";
import { agreementHashOf, processDesignHashOf } from "../sdk/dist/index.js";
import {
    ASSEMBLIES_DIR, loadAuthoredAgreements, loadAuthoredSpecs, readDeployedAssembly,
} from "../frontend/scripts/populate-clauses.mjs";

/** The keys the plan names: `{ agreements: [{ name, key, wallet }], assemblies: [{ name, key, wallet, token }], errors: [...] }`.
 *  `record` is the deployment record, read for a pin a written assembly names in it. */
export function plannedRegistrations(plan, record = {}) {
    const errors = [];
    const authored = loadAuthoredSpecs();
    const agreementsByName = loadAuthoredAgreements(authored);
    const agreements = [];
    for (const [name, wallet] of Object.entries(plan.agreements ?? {})) {
        const doc = agreementsByName[name];
        if (!doc) { errors.push(`agreements/${name}.json does not exist`); continue; }
        agreements.push({ name, key: agreementHashOf(doc), wallet });
    }
    const assemblies = [];
    for (const [name, wallet] of Object.entries(plan.assemblies ?? {})) {
        const file = path.join(ASSEMBLIES_DIR, `${name}.json`);
        if (!fs.existsSync(file)) { errors.push(`assemblies/${name}.json does not exist`); continue; }
        let deployed;
        try {
            deployed = readDeployedAssembly(file, { record, deploymentToken: plan.assemblyToken ?? undefined }, authored, agreementsByName);
        } catch (e) {
            errors.push(`assemblies/${name}: not decided — ${/^not decided/.test(e.message) ? "registrations.assemblyToken is not named, and the key depends on it" : e.message}`);
            continue;
        }
        assemblies.push({ name, key: processDesignHashOf(deployed.assembly), wallet, token: deployed.token });
    }
    return { agreements, assemblies, errors };
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Check each planned registration against the chain.
 * `readBinding(family, key)` returns `[registeredBy, registeredAt, withdrawn, contentURI]`.
 * `walletAddress(name)` returns the wallet's address, or `{ undecided }` / `{ error }`.
 * `ok(label)` and `bad(label, why)` record a result.
 */
export async function checkRegistrars({ planned, readBinding, walletAddress, ok, bad }) {
    for (const why of planned.errors) bad("registrations", why);
    for (const [family, rows] of [["agreement", planned.agreements], ["assembly", planned.assemblies]]) {
        for (const { name, key, wallet } of rows) {
            const label = `${family} ${name} registered by ${wallet}`;
            const [registeredBy, , withdrawn] = await readBinding(family, key);
            if (registeredBy === ZERO) { bad(label, `not registered (key ${key})`); continue; }
            if (withdrawn) { bad(label, "its deposit is withdrawn"); continue; }
            const want = walletAddress(wallet);
            if (want.undecided) { bad(label, `not decided — wallet "${wallet}" has no address`); continue; }
            if (want.error) { bad(label, want.error); continue; }
            if (String(registeredBy).toLowerCase() === String(want.address).toLowerCase()) ok(label);
            else bad(label, `registered by ${registeredBy}, expected ${want.address}`);
        }
    }
}
