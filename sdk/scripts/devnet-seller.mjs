/**
 * devnet-seller.mjs — what the origination proofs' seller agents read and do
 * as sellers, shared by the four `verify-origination*.devnet.mjs` scripts.
 *
 * A seller accepts an order only under an assembly its own member profile
 * binds, and its gate reads both the profile and the design the order names at
 * acceptance time. This module supplies the two readers a seller handler takes
 * (`readProfile`, `readDesign`) over a live `FigaroContext`, and the seller's
 * own act of binding an assembly: pin a profile that binds it and point
 * `MembersRegistry` at it (register, or update a profile already registered).
 */
import { MEMBERS_REGISTRY_ABI, tryParseMemberProfileDocument } from "@figaro-protocol/sdk";

/** The seller's OWN profile, read at acceptance time: MembersRegistry's
 *  latest metadataURI for the member (folded from the registry's events by a
 *  fresh sync) → the pinned document → the SDK's parse. Null when the member
 *  has no live profile or any read fails. */
export function memberProfileReader(ctx, readDocument) {
    return async (member) => {
        await ctx.sync();
        const entry = ctx.getMembers().find((m) => m.member.toLowerCase() === member.toLowerCase());
        if (!entry?.metadataURI) return null;
        return tryParseMemberProfileDocument(await readDocument(entry.metadataURI));
    };
}

/** The design an order's provenance leaf names, read at acceptance time: the
 *  assembly registered under its composition hash, hydrated and verified by
 *  `hydrate` (the assembly against its hash, each registered agreement
 *  against its key). Null when it is not registered or does not verify. */
export function designReader(ctx, hydrate) {
    return async (provenance) => {
        await ctx.sync();
        const registered = ctx.getAssemblies()
            .find((a) => a.compositionHash.toLowerCase() === provenance.compositionHash.toLowerCase());
        return registered ? hydrate(registered) : null;
    };
}

async function pinJson(ipfsApiUrl, doc) {
    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(doc)], { type: "application/json" }), "profile.json");
    const res = await fetch(`${ipfsApiUrl}/api/v0/add?pin=true`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`IPFS pin failed: ${res.status} ${await res.text()}`);
    const { Hash } = await res.json();
    return `ipfs://${Hash}`;
}

/**
 * The seller binds `compositionHash` in its own member profile — skipped when
 * its profile already binds it. The profile it already has is kept and the
 * binding added; a wallet with none publishes a profile that names it and
 * binds the assembly. Returns once `MembersRegistry` points at the new pin.
 */
export async function bindAssemblyAsSeller({ pub, wallet, membersRegistry, compositionHash, ipfsApiUrl, readProfile, name }) {
    const seller = wallet.account.address;
    const current = await readProfile(seller);
    if ((current?.assemblyBindings ?? []).some((b) => b.compositionHash.toLowerCase() === compositionHash.toLowerCase())) return false;
    const profile = {
        ...(current ?? { name }),
        subjectAddress: seller,
        assemblyBindings: [
            ...(current?.assemblyBindings ?? []),
            { bindingId: `binding:${seller.toLowerCase()}:${compositionHash}`, subjectAddress: seller, compositionHash },
        ],
    };
    const metadataURI = await pinJson(ipfsApiUrl, profile);
    const registered = await pub.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: "registered", args: [seller] });
    const { request } = registered
        ? await pub.simulateContract({ account: wallet.account, address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: "updateProfile", args: [metadataURI] })
        : await pub.simulateContract({
            account: wallet.account, address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: "register", args: [metadataURI],
            value: await pub.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: "registrationDeposit" }),
        });
    const hash = await wallet.writeContract({ ...request, chain: wallet.chain ?? null });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`binding the assembly reverted for ${seller}`);
    return true;
}
