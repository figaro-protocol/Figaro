import type { MissingPart } from "@/lib/audit/types";

/**
 * The parts the evidence file does not contain, each with the reason the
 * reader gave: the page's counterpart of the PDF's "What this evidence file does not
 * contain" page. States what is missing and draws no conclusion about why.
 * Renders nothing when no part is missing.
 */
export function MissingParts({ missing }: { missing: readonly MissingPart[] }) {
    if (missing.length === 0) return null;
    return (
        <div className="space-y-2 border border-default rounded-section p-5" data-testid="audit-missing-parts">
            <h3 className="text-sm font-semibold text-ink-heading">What this evidence file does not contain</h3>
            <ul className="space-y-2 text-sm text-ink-body">
                {missing.map((m, i) => (
                    <li key={i}>
                        <p>{m.part}</p>
                        {m.orderHash && <p className="text-xs font-mono text-ink-muted break-all">order {m.orderHash}</p>}
                        <p className="text-xs text-ink-muted">{m.reason}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
