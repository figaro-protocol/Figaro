#!/usr/bin/env node
/**
 * figaro-fetch — the runtime's ONE door for network content.
 *
 * Every read an agent performs lands on stdout as a framed, provenance-
 * tagged data block (dataChannel.mjs) — never as bare text a model could
 * mistake for instructions. Errors are terse and never echo fetched bytes.
 *
 *   figaro-fetch clause <clauseKey>              spec via ClauseRegistry → IPFS
 *   figaro-fetch agreement <agreementHash>        registered agreement via AgreementRegistry → IPFS
 *   figaro-fetch assembly <processDesignHash>      assembly via ProcessRegistry → IPFS
 *   figaro-fetch profile <address>               profile via MembersRegistry → IPFS
 *   figaro-fetch ipfs <cid>                      raw content by CID
 *   figaro-fetch witness <contentRef>            an attestation's substance —
 *                                                the fingerprint IS the address
 *
 * Env: RPC_URL, DEPLOYMENT_RECORD (path to deployments/<chainId>.json),
 * IPFS_GATEWAY_URL (+ optional IPFS_FALLBACK_GATEWAY_URL),
 * DEPLOYMENT_BLOCK (scan start; defaults to the record's).
 */

import * as fs from "node:fs";
import { createPublicClient, http } from "viem";
import {
    addressesFromDeploymentRecord, fetchDiscoveryEvents, isBytes32Hex, reconstructDiscovery,
} from "@figaro-protocol/sdk";
import { frame } from "./dataChannel.mjs";
import { requireEnv } from "./env.mjs";
import { cidOf, fetchUriText } from "./ipfsRead.mjs";
import { fetchWitnessContent } from "./witnessContent.mjs";
import { fetchAnchoredClauseSpec, fetchAnchoredRegisteredAgreement, fetchAnchoredAssembly } from "./anchoredContent.mjs";

function fail(message) {
    console.error(`figaro-fetch: ${message}`);
    process.exit(1);
}


const [, , mode, ...args] = process.argv;
if (!mode) fail("usage: figaro-fetch <clause|agreement|assembly|profile|ipfs|witness> <ref>");

/** A content URI's provenance handle: its CID when it names one, else the URI. */
function provenanceRef(uri) {
    const cid = cidOf(uri);
    return cid === null ? { refKind: "uri", ref: uri } : { refKind: "cid", ref: cid };
}

async function fetchContent(uri) {
    let text;
    try {
        text = await fetchUriText(uri);
    } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
    }
    if (text === null) fail(`content ${uri} is not published — absence, not an error`);
    return text;
}

async function discovery() {
    const record = JSON.parse(fs.readFileSync(requireEnv("DEPLOYMENT_RECORD", "figaro-fetch"), "utf-8"));
    const client = createPublicClient({ transport: http(requireEnv("RPC_URL", "figaro-fetch")) });
    const fromBlock = BigInt(process.env.DEPLOYMENT_BLOCK ?? record.deploymentBlock ?? 0);
    const events = await fetchDiscoveryEvents(client, addressesFromDeploymentRecord(record), fromBlock);
    return reconstructDiscovery(events);
}

async function main() {
    if (mode === "ipfs") {
        const cid = args[0] ?? fail("usage: figaro-fetch ipfs <cid>");
        const content = await fetchContent(cid);
        console.log(frame({ source: "ipfs", ...provenanceRef(cid), content }));
        return;
    }

    if (mode === "witness") {
        // The substance behind an Attestation event's fingerprint. No registry
        // read: `contentRef` IS the content address, and the bytes are verified
        // to hash back to it before anything is printed.
        const contentRef = args[0] ?? fail("usage: figaro-fetch witness <contentRef>");
        let hit;
        try {
            hit = await fetchWitnessContent(contentRef);
        } catch (e) {
            return fail(e instanceof Error ? e.message : String(e));
        }
        if (!hit) fail(`no published content for ${contentRef} — private, erased, or never published (absence, not an error)`);
        console.log(frame({
            source: "attestation-content", refKind: "cid", ref: hit.cid, content: hit.content,
        }));
        return;
    }

    if (mode === "clause") {
        const clauseKey = args[0] ?? fail("usage: figaro-fetch clause <clauseKey>");
        if (!isBytes32Hex(clauseKey)) fail(`a clause is read by its 32-byte key, not by name: ${clauseKey}`);
        const graph = await discovery();
        const clause = graph.getClause(clauseKey);
        if (!clause) fail(`clause ${clauseKey} is not live on the registry`);
        // Verified against the clause key (the hash of the spec without `block`)
        // before it is printed: a gateway can serve any bytes.
        const hit = await fetchAnchoredClauseSpec(clause);
        if (hit.absent) fail(`clause ${clauseKey}: no anchored spec at ${clause.contentURI} — ${hit.absent} (absence, not the registry's content)`);
        console.log(frame({
            source: "clause-registry", ...provenanceRef(clause.contentURI), content: hit.text,
        }));
        return;
    }

    if (mode === "agreement") {
        const agreementHash = args[0] ?? fail("usage: figaro-fetch agreement <agreementHash>");
        if (!isBytes32Hex(agreementHash)) fail(`a registered agreement is read by its 32-byte key: ${agreementHash}`);
        const graph = await discovery();
        // The binding whatever its stake: a binding is never cleared, so an
        // assembly composed from a withdrawn agreement still reads it.
        const agreement = graph.getAgreementBinding(agreementHash);
        if (!agreement) fail(`agreement ${agreementHash} is not registered`);
        // Verified against its key before it is printed.
        const hit = await fetchAnchoredRegisteredAgreement(agreement);
        if (hit.absent) fail(`agreement ${agreementHash}: no anchored document at ${agreement.contentURI} — ${hit.absent} (absence, not the registry's content)`);
        console.log(frame({
            source: "agreement-registry", ...provenanceRef(agreement.contentURI), content: hit.text,
        }));
        return;
    }

    if (mode === "assembly") {
        const processDesignHash = args[0] ?? fail("usage: figaro-fetch assembly <processDesignHash>");
        const graph = await discovery();
        const assembly = graph.getAssembly(processDesignHash);
        if (!assembly) fail(`assembly ${processDesignHash} is not live on the registry`);
        // Verified against its assembly hash before it is printed.
        const hit = await fetchAnchoredAssembly(assembly);
        if (hit.absent) fail(`assembly ${processDesignHash}: no anchored assembly at ${assembly.contentURI} — ${hit.absent} (absence, not the registry's content)`);
        console.log(frame({
            source: "assembly-registry", ...provenanceRef(assembly.contentURI), content: hit.text,
        }));
        return;
    }

    if (mode === "profile") {
        const address = args[0] ?? fail("usage: figaro-fetch profile <address>");
        const graph = await discovery();
        const member = graph.getMember(address);
        if (!member) fail(`member ${address} is not live on the registry`);
        const content = await fetchContent(member.metadataURI);
        console.log(frame({
            source: "members-registry", refKind: "uri", ref: member.metadataURI, content,
        }));
        return;
    }

    fail(`unknown mode ${mode}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
