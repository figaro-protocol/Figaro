// Who registered each reference member profile the expectations file names —
// the part of scripts/check-deployment.mjs that reads MembersRegistry, as
// check-deployment-registrars.mjs reads the agreement and process registries.
// Its own module so scripts/test-check-deployment-members.mjs can run it
// against a stand-in chain read.
//
// The expectations file names them under "registrations":
//   "members": { "<file in members/, no .json>": "<wallet>" }
// A member registers from its own wallet (MembersRegistry.register binds
// msg.sender), so "registered by" is "the wallet is the member": the wallet
// must hold a live stake, and the profile it registered must be the file's.
// The DAO's profile is registered under its operator EOA, never the vault
// (docs/RELEASE_READINESS.md Task 13, members/README.md): the vault holding a
// member stake is a failure whenever the file names a vault (`wallets.daoVault`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MEMBERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../members");

/** The profiles the plan names: `{ members: [{ name, wallet, profile }], errors: [...] }`. */
export function plannedMembers(plan, membersDir = MEMBERS_DIR) {
    const errors = [];
    const members = [];
    for (const [name, wallet] of Object.entries(plan?.members ?? {})) {
        const file = path.join(membersDir, `${name}.json`);
        if (!fs.existsSync(file)) { errors.push(`members/${name}.json does not exist`); continue; }
        members.push({ name, wallet, profile: JSON.parse(fs.readFileSync(file, "utf8")) });
    }
    return { members, errors };
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Check each planned member against the chain.
 * `readRegistered(address)` returns MembersRegistry.registered(address) (a live stake).
 * `readProfileURI(address)` returns the metadata URI of the wallet's latest
 *   MemberRegistered or MemberProfileUpdated event, or null.
 * `readProfile(uri)` returns the pinned profile document, or null when it is not read
 *   (no gateway given); a null skips the content comparison and says so.
 * `walletAddress(name)` returns `{ address }`, `{ undecided }` or `{ error }`.
 * `vaultAddress` is the DAO vault's address, or undefined when the file names none.
 */
export async function checkMembers({ planned, readRegistered, readProfileURI, readProfile, walletAddress, vaultAddress, ok, bad, note = () => {} }) {
    for (const why of planned.errors) bad("members", why);
    for (const { name, wallet, profile } of planned.members) {
        const label = `member ${name} registered by ${wallet}`;
        const want = walletAddress(wallet);
        if (want.undecided) { bad(label, `not decided — wallet "${wallet}" has no address`); continue; }
        if (want.error) { bad(label, want.error); continue; }
        const address = want.address;
        if (vaultAddress && same(address, vaultAddress)) {
            bad(label, `the plan names the vault ${address}; a member profile registers from its own wallet, the DAO's from its operator EOA`);
            continue;
        }
        if (profile.subjectAddress && !same(profile.subjectAddress, address)) {
            bad(label, `members/${name}.json names subject ${profile.subjectAddress}, not ${address}`);
            continue;
        }
        if (!(await readRegistered(address))) { bad(label, `${address} holds no live member stake (never registered, or its withdrawal is requested)`); continue; }
        const uri = await readProfileURI(address);
        if (!uri) { bad(label, `${address} is registered but no MemberRegistered event names it since the deployment block`); continue; }
        const pinned = await readProfile(uri);
        if (pinned === null) {
            note(`${label}: the pinned profile ${uri} was not read (no gateway given) — its content is not compared`);
            ok(label);
            continue;
        }
        if (pinned.name !== profile.name) { bad(label, `the pinned profile ${uri} is "${pinned.name}", not members/${name}.json's "${profile.name}"`); continue; }
        ok(`${label} (${uri})`);
    }
    if (vaultAddress) {
        if (await readRegistered(vaultAddress)) bad("the DAO vault is no member", `${vaultAddress} holds a member stake; the DAO's profile registers from its operator EOA`);
        else ok("the DAO vault is no member");
    }
}
