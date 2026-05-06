#!/usr/bin/env node
/**
 * pin-operator-fixtures.mjs
 *
 * Scaffold IPFS content for the example operators in
 * `lib/shared/runtime-fixtures/local-runtime-identity.json`. Each merchant
 * gets a deterministic SVG logo (accent-coloured square + 2-letter
 * monogram), pinned to the local IPFS HTTP API. The resulting CIDs
 * replace the `ipfs://example/<x>-logo.png` placeholders in the manifest.
 *
 * Run after starting your local IPFS container:
 *
 *     npm run ipfs:scaffold
 *
 * Idempotent: SVG generation is deterministic per merchant (same name +
 * accent → same bytes → same CID). Re-running on a fresh IPFS produces
 * the same CIDs and the same manifest diff.
 *
 * Defaults assume Kubo's stock ports (API 5001, gateway 8080); override
 * with `IPFS_API_URL` and `IPFS_GATEWAY_URL` env vars if your container
 * exposes different ports.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_FRONTEND = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(
    REPO_FRONTEND,
    "lib/shared/runtime-fixtures/local-runtime-identity.json",
);
const IPFS_API_URL = process.env.IPFS_API_URL ?? "http://127.0.0.1:5001";
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL ?? "http://127.0.0.1:8080";

/**
 * Extract a 2-letter uppercase monogram from a merchant name. Splits on
 * whitespace only (NOT apostrophes — splitting on `'` leaves the
 * possessive `s` in "Bob's" as a standalone "word" and produces "BS"
 * instead of "BP"). Takes the first letter of the first two whitespace-
 * separated words. Example: "Bob's Pizza Palace" → "BP";
 * "Acme Components Supply" → "AC"; "Carlo's Espresso Bar" → "CE".
 */
function monogramFor(name) {
    const words = name
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
    const letters = words.slice(0, 2).map((w) => w[0].toUpperCase());
    if (letters.length === 1) {
        // Single-word names: take the first two characters.
        const w = words[0];
        return (w[0] + (w[1] ?? "")).toUpperCase();
    }
    return letters.join("");
}

/**
 * Deterministic SVG bytes for one merchant. No timestamps, no platform-
 * dependent line endings — same input always yields the same bytes
 * (and therefore the same IPFS CID).
 */
function svgFor(name, accent) {
    const monogram = monogramFor(name);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">`,
        `<rect width="96" height="96" rx="8" fill="${accent}"/>`,
        `<text x="48" y="58" font-family="system-ui,-apple-system,sans-serif" font-size="40" font-weight="600" fill="#ffffff" text-anchor="middle">${monogram}</text>`,
        `</svg>`,
        ``,
    ].join("\n");
}

async function pinSvg(slug, svg) {
    const formData = new FormData();
    formData.append(
        "file",
        new Blob([svg], { type: "image/svg+xml" }),
        `${slug}-logo.svg`,
    );
    const url = `${IPFS_API_URL}/api/v0/add?cid-version=1&pin=true`;
    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) {
        throw new Error(
            `IPFS add failed for ${slug}: ${res.status} ${res.statusText}`,
        );
    }
    const text = await res.text();
    // Kubo returns one JSON object per line for multi-file uploads; we
    // sent one file so the response is a single line.
    const firstLine = text.split("\n").find((l) => l.trim().length > 0);
    if (!firstLine) throw new Error(`IPFS add: empty response for ${slug}`);
    const result = JSON.parse(firstLine);
    if (!result.Hash) {
        throw new Error(
            `IPFS add: response missing Hash for ${slug}: ${firstLine}`,
        );
    }
    return result.Hash;
}

async function verifyGateway(cid) {
    const url = `${IPFS_GATEWAY_URL}/ipfs/${cid}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(
            `Gateway fetch failed for ${cid}: ${res.status} ${res.statusText}`,
        );
    }
    const bytes = await res.arrayBuffer();
    return bytes.byteLength;
}

async function main() {
    console.log(`Reading manifest: ${MANIFEST_PATH}`);
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(raw);

    if (!Array.isArray(manifest.sellerCatalogueMetadata)) {
        throw new Error(
            `Manifest missing sellerCatalogueMetadata array: ${MANIFEST_PATH}`,
        );
    }

    console.log(`API: ${IPFS_API_URL}`);
    console.log(`Gateway: ${IPFS_GATEWAY_URL}`);
    console.log(
        `Pinning ${manifest.sellerCatalogueMetadata.length} merchant logos...\n`,
    );

    const cidMap = {};
    for (const cat of manifest.sellerCatalogueMetadata) {
        const slug = cat.slug ?? cat.merchantId;
        const name = cat.name;
        const accent = cat.branding?.accentColor ?? "#6b7280";
        const svg = svgFor(name, accent);
        const monogram = monogramFor(name);

        const cid = await pinSvg(slug, svg);
        const bytes = await verifyGateway(cid);
        const ipfsURI = `ipfs://${cid}`;

        cidMap[slug] = { cid, ipfsURI, monogram, accent, name };
        cat.branding = cat.branding ?? {};
        cat.branding.logoURI = ipfsURI;

        console.log(
            `  ✓ ${slug.padEnd(26)} ${monogram.padEnd(3)} ${accent}  →  ${cid} (${bytes} bytes via gateway)`,
        );
    }

    // Pretty-print with the manifest's existing 4-space indent so the diff
    // stays line-by-line readable.
    const updated = JSON.stringify(manifest, null, 4) + "\n";
    await writeFile(MANIFEST_PATH, updated, "utf8");

    console.log(`\nManifest updated. CID map:`);
    console.log(JSON.stringify(cidMap, null, 2));
    console.log(
        `\nDone. Verify in the browser at /discover and /m/<address>; the InitialsAvatar fallback should stop firing for the seven seeded merchants.`,
    );
}

main().catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    if (err.cause) console.error(`Cause: ${err.cause}`);
    console.error(
        `\nIs your IPFS container running? Default endpoints expected:\n` +
        `  API     ${IPFS_API_URL}/api/v0/...\n` +
        `  Gateway ${IPFS_GATEWAY_URL}/ipfs/<cid>\n` +
        `Override with IPFS_API_URL / IPFS_GATEWAY_URL env vars if needed.`,
    );
    process.exit(1);
});
