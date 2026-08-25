interface ContractEntryProps {
    /** Anchor id for deep-linking (e.g. `#FigaroCore`). */
    id?: string;
    /** Contract or interface name — rendered in `<code>`. */
    title: string;
    /** Full description. The first sentence is always visible as the one-line
     *  purpose; the remainder sits behind a native disclosure. */
    desc: string;
    /** Optional source link (typically GitHub source). */
    href?: string;
    /** Optional right-aligned meta pill (e.g. "permissionless · event-only"). */
    meta?: string;
}

/**
 * Splits `desc` into its first sentence (the always-visible one-line purpose)
 * and everything after it (the collapsed remainder). Pure — exported for unit
 * testing.
 *
 * Splits on the first ". " (period + space), not on any bare period, so a
 * dotted code identifier or reference (e.g. `FigaroCore.orderStatus`, which
 * has no space after the dot) never triggers a false split. When no such
 * boundary exists — a single-sentence `desc`, or one with only trailing
 * punctuation — the whole string is the lead and there is nothing to
 * collapse.
 */
export function splitFirstSentence(desc: string): { lead: string; rest: string } {
    const boundary = desc.indexOf(". ");
    if (boundary === -1) return { lead: desc, rest: "" };
    return {
        lead: desc.slice(0, boundary + 1),
        rest: desc.slice(boundary + 2).trim(),
    };
}

/**
 * Catalogue row for a contract or interface. Used inside `<ul>` lists on
 * `/spec` and any other page that needs to enumerate the on-chain surface.
 * Stable shape: title (mono) → optional meta-pill → one-line purpose → the
 * rest of the description behind a native `<details>` disclosure (renders in
 * the static HTML, so it stays crawlable without JS).
 */
export function ContractEntry({ id, title, desc, href, meta }: ContractEntryProps) {
    const { lead, rest } = splitFirstSentence(desc);
    return (
        <li id={id} className="border-b border-default pb-4 scroll-mt-24">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="text-ink-primary font-medium">
                    {href ? (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                        >
                            <code>{title}</code>
                        </a>
                    ) : (
                        <code>{title}</code>
                    )}
                </div>
                {meta && <div className="text-xs text-ink-body">{meta}</div>}
            </div>
            <p className="text-sm text-ink-body mt-1">{lead}</p>
            {rest && (
                <details className="mt-1">
                    <summary className="text-xs text-ink-muted hover:text-ink-heading cursor-pointer select-none">
                        Full description
                    </summary>
                    <p className="text-sm text-ink-body mt-2">{rest}</p>
                </details>
            )}
        </li>
    );
}
