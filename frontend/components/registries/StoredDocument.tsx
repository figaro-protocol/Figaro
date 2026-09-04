"use client";

/**
 * The pinned document, as stored — the disclosure under a clause or assembly
 * row on `/registries`.
 *
 * The explorer describes a registration in the spec's own words. A reader who
 * has to reason about what a clause BINDS needs the document those words came
 * from, byte for byte, plus the digest the chain anchors and a way to see the
 * two agree. That is what this shows, and nothing more: the bytes the gateway
 * served, rendered as preformatted TEXT (content is data — it is never parsed
 * into markup and never rendered as HTML), the anchored hash beside them, and
 * the recomputation stated as a verdict.
 *
 * The read is the one the site already does everywhere else: the registration
 * event's own `contentURI`, resolved through `lib/shared/ipfsService` (the
 * user's own gateway when they configured one) and size-capped, so a
 * permissionlessly-registered pointer at a huge pin aborts mid-stream instead
 * of hanging the page. The arithmetic is `storedDocument` in the registries
 * read model — pure, and unit-tested there.
 *
 * The fetch fires only when the panel is OPENED: 100+ registered rows must not
 * each open a gateway round-trip on page load.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { DEFAULT_IPFS_SERVICE, fetchCappedContent } from "@/lib/shared/ipfsService";
import {
    STORED_DOCUMENT_NOTE,
    storedDocument,
    type StoredDocumentAnchor,
    type StoredDocument as StoredDocumentVerdict,
} from "@/lib/registries/explorer";

interface StoredDocumentProps {
    /** Stable id for the disclosure panel — the row's own key. */
    id: string;
    /** The registration event's IPFS locator. */
    contentURI: string;
    /** The digest the chain anchors for this row. */
    anchoredHash: string;
    /** Which digest that is, and therefore what it covers. */
    anchor: StoredDocumentAnchor;
}

type ReadState =
    | { state: "idle" }
    | { state: "reading" }
    | { state: "unreachable"; detail: string }
    | { state: "read"; text: string; verdict: StoredDocumentVerdict };

export function StoredDocument({ id, contentURI, anchoredHash, anchor }: StoredDocumentProps) {
    const [expanded, setExpanded] = useState(false);
    const [read, setRead] = useState<ReadState>({ state: "idle" });
    // The effect must not depend on `read`: depending on it re-ran the effect
    // the moment "reading" was set, and that re-run's cleanup cancelled the
    // fetch it had just started — the panel then read "Reading…" forever.
    const readRef = useRef(read);
    readRef.current = read;

    useEffect(() => {
        if (!expanded || readRef.current.state === "read") return;
        let cancelled = false;
        setRead({ state: "reading" });
        (async () => {
            const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(contentURI);
            if (!url) {
                if (!cancelled) setRead({ state: "unreachable", detail: `no gateway resolves ${contentURI}` });
                return;
            }
            try {
                const response = await fetchCappedContent(url);
                if (cancelled) return;
                if (!response.ok) {
                    setRead({ state: "unreachable", detail: `${response.status} ${response.statusText}` });
                    return;
                }
                const text = await response.text();
                if (cancelled) return;
                setRead({ state: "read", text, verdict: storedDocument(text, anchoredHash, anchor) });
            } catch (err) {
                if (!cancelled) setRead({ state: "unreachable", detail: err instanceof Error ? err.message : String(err) });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [expanded, contentURI, anchoredHash, anchor]);

    const onToggle = useCallback(() => setExpanded((v) => !v), []);

    return (
        <div className="mt-2">
            <Disclosure
                id={`stored-${id}`}
                triggerTestId={`stored-toggle-${id}`}
                panelTestId={`stored-panel-${id}`}
                expanded={expanded}
                onToggle={onToggle}
                triggerClassName="pl-0 pr-2 text-xs text-ink-muted hover:text-ink-heading"
                label={<span className="underline">The document, as stored</span>}
                panelClassName="mt-2 space-y-2"
            >
                <p className="text-xs text-ink-muted break-all">
                    <span className="text-ink-body">Pinned at</span>{" "}
                    <code className="font-mono">{contentURI}</code>
                </p>

                {read.state === "reading" ? (
                    <p className="text-xs text-ink-muted" data-testid={`stored-reading-${id}`}>
                        Reading the pinned document&hellip;
                    </p>
                ) : null}

                {read.state === "unreachable" ? (
                    <p className="text-xs text-ink-muted" data-testid={`stored-unreachable-${id}`}>
                        No gateway served this document on this read ({read.detail}). That is the
                        absence of a copy here, never evidence that the registration is wrong &mdash;
                        the anchor below is on chain either way.
                    </p>
                ) : null}

                {read.state === "read" ? (
                    <>
                        <pre
                            className="max-h-96 overflow-auto rounded border border-default bg-subtle p-3 text-xs font-mono text-ink-body whitespace-pre-wrap break-words"
                            data-testid={`stored-json-${id}`}
                        >
                            {read.text}
                        </pre>
                        <p className="text-xs text-ink-muted break-all">
                            <span className="text-ink-body">Anchored on chain</span>{" "}
                            <code className="font-mono" data-testid={`stored-hash-${id}`}>
                                {read.verdict.anchored}
                            </code>
                        </p>
                        <p className="text-xs text-ink-muted break-all" data-testid={`stored-verdict-${id}`}>
                            {read.verdict.matches ? (
                                <>
                                    Recomputed from these bytes:{" "}
                                    <code className="font-mono">{read.verdict.recomputed}</code> &mdash; it
                                    reproduces the anchor. This document is the one the chain names.
                                </>
                            ) : read.verdict.recomputed === null ? (
                                <>
                                    These bytes do not parse as the document this anchor is computed
                                    over, so nothing was recomputed. The served copy does not answer
                                    for the registration.
                                </>
                            ) : (
                                <>
                                    Recomputed from these bytes:{" "}
                                    <code className="font-mono">{read.verdict.recomputed}</code> &mdash; it
                                    does NOT reproduce the anchor. The served copy is not the document
                                    the chain names; read it as evidence of a drifted pin, not as terms.
                                </>
                            )}
                        </p>
                        <p className="text-xs text-ink-muted">{STORED_DOCUMENT_NOTE[read.verdict.anchor]}</p>
                    </>
                ) : null}
            </Disclosure>
        </div>
    );
}
