/**
 * privateFilings — the private filings of one order, delivered to the
 * counterparty on its request: the third use of the per-order sealed
 * ceremony (`./ceremony`), beside the address detail and the content
 * delivery.
 *
 * A party that attests at a stage whose set of fields is private files only
 * the content reference; its browser keeps the content, blinding value
 * included (`keepPrivateWitnessContent`). Its counterparty receives a copy
 * only by asking:
 *
 *   1. The receiver, either party of the order, offers its temporary public
 *      key, wallet-signed, under `<orderHash>#filings` (`filingsCeremonyId`).
 *      The key lives in that tab's session storage alone.
 *   2. The attester, with that request present, seals every copy it kept
 *      for the order (each entry's order, clause, stage, content reference
 *      and encoded bytes) to the receiver's key and sends it, with its own
 *      key, each message wallet-signed. Nothing is sent without its click.
 *   3. The receiver unseals and checks each entry: it names this order; its
 *      bytes hash to its content reference (`anchorAttestationContent`); and
 *      an `Attestation` by the sender, from either emitter, holds that order,
 *      clause, stage and reference (`privateFilingAnchors`, checked again
 *      until it appears by `useCeremonyChannel`). The channel already
 *      refused any message not signed by the order's other party. An entry
 *      that passes is kept in the store every reader reads, marked received
 *      (`keepReceivedWitnessContent`); one that fails is kept nowhere, and
 *      the others are not affected.
 *
 * The sealed payload is bounded (`PRIVATE_FILINGS_MAX_COUNT` entries,
 * `PRIVATE_FILINGS_MAX_BYTES` of encoded content in all), refused over the
 * bound by the sender before it seals, and by the receiver twice: a sealed
 * message longer than any payload within the bound makes
 * (`PRIVATE_FILINGS_MAX_BLOB_CHARS`) before it is opened, and a payload
 * over the bound after it unseals.
 */
import type { Hex } from "viem";
import { anchorAttestationContent } from "@figaro-protocol/sdk";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { hexEqual, isBytes32Hex } from "@/lib/shared/evm";
import {
    encodedSetPrivacy,
    keepReceivedWitnessContent,
    readHeldWitness,
    readKeptWitnessContent,
    type WitnessHolder,
} from "@/lib/composition/witnessContent";
import type { AnchorExpectation } from "./handoffAnchorState";
import {
    openCeremonyBlob,
    requestCeremonyKey,
    sendCeremonyBlob,
    type SignChannelAuth,
} from "./ceremony";

/** The per-order filings ceremony's correlation id — scoped so it never
 *  collides with the address ceremony's (the bare order hash) or the
 *  content ceremony's (`<orderHash>#content`). */
export function filingsCeremonyId(orderId: string): string {
    return `${orderId}#filings`;
}

/** The most entries one sealed payload carries. */
export const PRIVATE_FILINGS_MAX_COUNT = 64;

/** The most encoded content, in bytes, one sealed payload carries in all:
 *  the content delivery's channel-sized cap. */
export const PRIVATE_FILINGS_MAX_BYTES = 128 * 1024;

/** The most characters of the sealed text one entry spends beside its
 *  content's hex: the keys, the order hash, the clause key, the content
 *  reference and the stage, written as `sendPrivateFilings` writes them
 *  (272 at most), with room to spare. */
const ENTRY_TEXT_BESIDE_CONTENT = 320;

/** The longest sealed blob a payload within the bound makes: the JSON text
 *  (two hex characters per content byte, plus each entry's other fields),
 *  the AES-GCM nonce and tag (28 bytes), in base64url. The receiver refuses
 *  a longer blob before it decrypts or parses anything, so the bound holds
 *  whatever size the transport lets through. */
export const PRIVATE_FILINGS_MAX_BLOB_CHARS = Math.ceil(
    ((2 * PRIVATE_FILINGS_MAX_BYTES + PRIVATE_FILINGS_MAX_COUNT * ENTRY_TEXT_BESIDE_CONTENT + 16 + 28) * 4) / 3,
);

/** One private filing: where it sits on the chain, and its encoded bytes. */
export interface PrivateFiling {
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    contentRef: Hex;
    content: Hex;
}

/** What the receiver unsealed: the entries that passed the checks it can
 *  make alone, how many it dropped, and the refusal of a payload over the
 *  bound (no entry is read then). */
export interface ReceivedPrivateFilings {
    filings: PrivateFiling[];
    dropped: number;
    refusal: string | null;
}

/** An attestation as the order page and the indexer carry it. */
interface FiledAttestation {
    orderHash: string;
    clauseId: string;
    stage: number;
    contentRef: string;
    attester: string;
}

/** One attestation's place on its order, as one comparable string. */
function placeKey(att: { clauseId: string; stage: number; contentRef: string }): string {
    return `${att.clauseId}:${att.stage}:${att.contentRef}`.toLowerCase();
}

/** The refusal of a list over the bound, in the words both sides show;
 *  null within it. */
function boundRefusal(filings: readonly { content: string }[]): string | null {
    const bytes = filings.reduce((sum, f) => sum + Math.max(0, f.content.length - 2) / 2, 0);
    if (filings.length > PRIVATE_FILINGS_MAX_COUNT || bytes > PRIVATE_FILINGS_MAX_BYTES) {
        return `A delivery of private filings carries at most ${PRIVATE_FILINGS_MAX_COUNT} filings and ${Math.round(PRIVATE_FILINGS_MAX_BYTES / 1024)} KiB of content; this one holds ${filings.length} filings and ${Math.ceil(bytes / 1024)} KiB.`;
    }
    return null;
}

/** The copies the holder kept when it filed: each private filing on
 *  `orderHash` attested by the holder's wallet, whose kept bytes check
 *  against the reference and which it did not receive from anyone. One per
 *  place; none where no wallet is connected. */
export function heldOwnPrivateFilings(orderHash: string, attestations: readonly FiledAttestation[], holder: WitnessHolder | null | undefined): PrivateFiling[] {
    const out: PrivateFiling[] = [];
    if (!holder) return out;
    const seen = new Set<string>();
    for (const att of attestations) {
        if (!hexEqual(att.orderHash, orderHash) || !hexEqual(att.attester, holder.address)) continue;
        const place = placeKey(att);
        if (seen.has(place)) continue;
        const held = readHeldWitness(holder, att);
        if (!held || held.received) continue;
        seen.add(place);
        out.push({ orderHash: orderHash as Hex, clauseId: att.clauseId as Hex, stage: att.stage, contentRef: att.contentRef as Hex, content: held.content });
    }
    return out;
}

/** How many private filings `attester` made on `orderHash` whose content
 *  the holder does not keep: what the receiver may ask for. A filing
 *  counts once its clause's spec is read and declares the set private. */
export function privateFilingsNotHeld(orderHash: string, attestations: readonly FiledAttestation[], attester: string, holder: WitnessHolder | null | undefined): number {
    const places = new Set<string>();
    for (const att of attestations) {
        if (!hexEqual(att.orderHash, orderHash) || !hexEqual(att.attester, attester)) continue;
        // A filing whose clause's spec is unread is not counted: its set
        // may be public.
        if (encodedSetPrivacy(att.clauseId, att.stage) !== true || readKeptWitnessContent(holder, att)) continue;
        places.add(placeKey(att));
    }
    return places.size;
}

/** Whether the private filings of `orderHash` concern the holder's wallet:
 *  the counterparty made a filing on it whose set its clause's spec, once
 *  read, declares private, or the holder kept one it made. The order page
 *  mounts the panel only then, and reads again as specs load. */
export function privateFilingsInPlay(orderHash: string, attestations: readonly FiledAttestation[], holder: WitnessHolder, counterparty: string): boolean {
    return attestations.some((att) => hexEqual(att.orderHash, orderHash)
        && hexEqual(att.attester, counterparty)
        && encodedSetPrivacy(att.clauseId, att.stage) === true)
        || heldOwnPrivateFilings(orderHash, attestations, holder).length > 0;
}

/** Step 1 — the receiver asks for the private filings of the order: its
 *  temporary key, created in this tab, is sent wallet-signed. Returns the
 *  public key sent. */
export async function requestPrivateFilings(
    channel: HandoffChannel,
    params: { myAddress: string; recipientAddress: string; orderId: string; signAuth: SignChannelAuth },
): Promise<string> {
    return requestCeremonyKey(channel, {
        myAddress: params.myAddress,
        recipientAddress: params.recipientAddress,
        ceremonyId: filingsCeremonyId(params.orderId),
        signAuth: params.signAuth,
    });
}

/** Step 2 — the attester seals its kept filings of the order to the
 *  receiver's key and sends them. An entry kept for another order is never
 *  sent. Throws over the bound, before anything is sealed. Returns the blob
 *  and how many entries it carries. */
export async function sendPrivateFilings(
    channel: HandoffChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        orderId: string;
        recipientPubKeyHex: string;
        filings: readonly PrivateFiling[];
        signAuth: SignChannelAuth;
    },
): Promise<{ blobB64: string; count: number }> {
    const filings = params.filings
        .filter((f) => hexEqual(f.orderHash, params.orderId))
        .map(({ orderHash, clauseId, stage, contentRef, content }) => ({ orderHash, clauseId, stage, contentRef, content }));
    if (filings.length === 0) throw new Error("No private filing of this order is kept in this browser.");
    const refusal = boundRefusal(filings);
    if (refusal) throw new Error(refusal);
    const { blobB64 } = await sendCeremonyBlob(channel, {
        myAddress: params.myAddress,
        recipientAddress: params.recipientAddress,
        ceremonyId: filingsCeremonyId(params.orderId),
        recipientPubKeyHex: params.recipientPubKeyHex,
        plain: JSON.stringify({ filings }),
        signAuth: params.signAuth,
    });
    return { blobB64, count: filings.length };
}

/** One entry of the unsealed payload, read as a filing of `orderId`; null
 *  where it is malformed, names another order, or its bytes do not hash to
 *  its reference. */
function readEntry(raw: unknown, orderId: string): PrivateFiling | null {
    if (!raw || typeof raw !== "object") return null;
    const e = raw as Record<string, unknown>;
    if (!isBytes32Hex(e.orderHash) || !isBytes32Hex(e.clauseId) || !isBytes32Hex(e.contentRef)) return null;
    if (typeof e.stage !== "number" || !Number.isInteger(e.stage) || e.stage < 0 || e.stage > 255) return null;
    if (typeof e.content !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(e.content)) return null;
    if (!hexEqual(e.orderHash as string, orderId)) return null;
    const content = anchorAttestationContent(e.content as Hex, e.contentRef as Hex);
    if (!content) return null;
    return { orderHash: e.orderHash as Hex, clauseId: e.clauseId as Hex, stage: e.stage, contentRef: e.contentRef as Hex, content };
}

/** The unsealed text's list of entries; null where it does not parse. */
function readFilingsList(plain: string): unknown[] | null {
    try {
        const parsed = JSON.parse(plain) as { filings?: unknown };
        return Array.isArray(parsed.filings) ? parsed.filings : null;
    } catch {
        return null;
    }
}

/** Step 3 — the receiver unseals with the sender's public key and checks
 *  each entry alone: the order it names, and its bytes against its
 *  reference. Null where the blob does not unseal or the payload does not
 *  parse — absence, not an exception. The chain check is
 *  `privateFilingAnchors`. */
export async function decryptPrivateFilings(params: {
    myAddress: string;
    orderId: string;
    senderPubKeyHex: string;
    blobB64: string;
}): Promise<ReceivedPrivateFilings | null> {
    // A blob longer than any payload within the bound can make is refused
    // unread: nothing is decrypted or parsed.
    if (params.blobB64.length > PRIVATE_FILINGS_MAX_BLOB_CHARS) {
        return {
            filings: [], dropped: 0,
            refusal: `A delivery of private filings carries at most ${PRIVATE_FILINGS_MAX_COUNT} filings and ${Math.round(PRIVATE_FILINGS_MAX_BYTES / 1024)} KiB of content; this sealed message is larger than any such delivery, so it was not opened.`,
        };
    }
    const entries = await openCeremonyBlob(params, filingsCeremonyId(params.orderId), readFilingsList);
    if (entries === null) return null;
    const refusal = boundRefusal(entries.map((e) => ({
        content: e && typeof e === "object" && typeof (e as { content?: unknown }).content === "string" ? (e as { content: string }).content : "",
    })));
    if (refusal) return { filings: [], dropped: entries.length, refusal };
    const filings: PrivateFiling[] = [];
    const seen = new Set<string>();
    for (const raw of entries) {
        const filing = readEntry(raw, params.orderId);
        // A second entry at one place is dropped: each place is kept once.
        if (!filing || seen.has(placeKey(filing))) continue;
        seen.add(placeKey(filing));
        filings.push(filing);
    }
    return { filings, dropped: entries.length - filings.length, refusal: null };
}

/** What the chain must hold for each received entry, in order: an
 *  Attestation by the sender at that order, clause, stage and reference. */
export function privateFilingAnchors(received: ReceivedPrivateFilings, sender: string): AnchorExpectation[] {
    return received.filings.map((f) => ({ contentRef: f.contentRef, clauseId: f.clauseId, stage: f.stage, attester: sender }));
}

/** Keep each received entry whose attestation the chain holds
 *  (`anchoredEach`, one verdict per entry in order), marked received.
 *  Returns how many entries the holder keeps a copy of. */
export function keepConfirmedPrivateFilings(holder: WitnessHolder | null | undefined, received: ReceivedPrivateFilings, anchoredEach: readonly boolean[]): number {
    let kept = 0;
    received.filings.forEach((f, i) => {
        if (anchoredEach[i] === true && keepReceivedWitnessContent(holder, f) === "kept") kept += 1;
    });
    return kept;
}
