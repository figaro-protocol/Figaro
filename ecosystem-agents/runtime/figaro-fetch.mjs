#!/usr/bin/env node
/**
 * figaro-fetch — the runtime's ONE door for network content.
 *
 * Every read an agent performs lands on stdout as a framed, provenance-
 * tagged data block (dataChannel.mjs) — never as bare text a model could
 * mistake for instructions. Errors are terse and never echo fetched bytes.
 *
 *   figaro-fetch clause <clauseId> [version]     spec via ClauseRegistry → IPFS
 *   figaro-fetch assembly <compositionHash>      template via AssemblyRegistry → IPFS
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
    fetchDiscoveryEvents, reconstructDiscovery, computeClauseKey,
} from "@figaro-protocol/sdk";
import { frame } from "./dataChannel.mjs";
import { cidOf, fetchIpfsText } from "./ipfsRead.mjs";
import { fetchWitnessContent } from "./witnessContent.mjs";

function fail(message) {
    console.error(`figaro-fetch: ${message}`);
    process.exit(1);
}

function requireEnv(name) {
    const v = process.env[name];
    if (!v) fail(`missing env ${name}`);
    return v;
}

const [, , mode, ...args] = process.argv;
if (!mode) fail("usage: figaro-fetch <clause|assembly|profile|ipfs|witness> <ref>");

async function fetchIpfs(cid) {
    let text;
    try {
        text = await fetchIpfsText(cid);
    } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
    }
    if (text === null) fail(`content ${cid} is not published — absence, not an error`);
    return text;
}

async function discovery() {
    const record = JSON.parse(fs.readFileSync(requireEnv("DEPLOYMENT_RECORD"), "utf-8"));
    const client = createPublicClient({ transport: http(requireEnv("RPC_URL")) });
    const fromBlock = BigInt(process.env.DEPLOYMENT_BLOCK ?? record.deploymentBlock ?? 0);
    const events = await fetchDiscoveryEvents(client, {
        clauseRegistry: record.clauseRegistry,
        membersRegistry: record.membersRegistry,
        assemblyRegistry: record.assemblyRegistry,
    }, fromBlock);
    return reconstructDiscovery(events);
}

async function main() {
    if (mode === "ipfs") {
        const cid = args[0] ?? fail("usage: figaro-fetch ipfs <cid>");
        const content = await fetchIpfs(cidOf(cid));
        console.log(frame({ source: "ipfs", refKind: "cid", ref: cidOf(cid), content }));
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
        const clauseId = args[0] ?? fail("usage: figaro-fetch clause <clauseId> [version]");
        const version = BigInt(args[1] ?? "1");
        const graph = await discovery();
        const clause = graph.getClause(computeClauseKey(clauseId, version));
        if (!clause) fail(`clause ${clauseId} v${version} is not live on the registry`);
        const content = await fetchIpfs(cidOf(clause.contentURI));
        console.log(frame({
            source: "clause-registry", refKind: "cid", ref: cidOf(clause.contentURI), content,
        }));
        return;
    }

    if (mode === "assembly") {
        const compositionHash = args[0] ?? fail("usage: figaro-fetch assembly <compositionHash>");
        const graph = await discovery();
        const assembly = graph.getAssembly(compositionHash);
        if (!assembly) fail(`assembly ${compositionHash} is not live on the registry`);
        const content = await fetchIpfs(cidOf(assembly.contentURI));
        console.log(frame({
            source: "assembly-registry", refKind: "cid", ref: cidOf(assembly.contentURI), content,
        }));
        return;
    }

    if (mode === "profile") {
        const address = args[0] ?? fail("usage: figaro-fetch profile <address>");
        const graph = await discovery();
        const member = graph.getMember(address);
        if (!member) fail(`member ${address} is not live on the registry`);
        const content = await fetchIpfs(cidOf(member.metadataURI));
        console.log(frame({
            source: "members-registry", refKind: "cid", ref: cidOf(member.metadataURI), content,
        }));
        return;
    }

    fail(`unknown mode ${mode}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
