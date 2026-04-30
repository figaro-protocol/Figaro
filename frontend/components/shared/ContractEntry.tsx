interface ContractEntryProps {
    /** Anchor id for deep-linking (e.g. `#FigaroCore`). */
    id?: string;
    /** Contract or interface name — rendered in `<code>`. */
    title: string;
    /** One-line description rendered as the body text. */
    desc: string;
    /** Optional source link (typically GitHub source). */
    href?: string;
    /** Optional right-aligned meta pill (e.g. "permissionless · event-only"). */
    meta?: string;
}

/**
 * Catalogue row for a contract or interface. Used inside `<ul>` lists on
 * `/spec` and any other page that needs to enumerate the on-chain surface.
 * Stable shape: title (mono) → optional meta-pill → description.
 */
export function ContractEntry({ id, title, desc, href, meta }: ContractEntryProps) {
    return (
        <li id={id} className="border-b border-gray-100 pb-4 scroll-mt-24">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="text-black font-medium">
                    {href ? (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black rounded"
                        >
                            <code>{title}</code>
                        </a>
                    ) : (
                        <code>{title}</code>
                    )}
                </div>
                {meta && <div className="text-xs text-gray-600">{meta}</div>}
            </div>
            <p className="text-sm text-gray-700 mt-1">{desc}</p>
        </li>
    );
}
