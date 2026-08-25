import Link from "next/link";

/**
 * CtaLink — the marketing call-to-action, in one place.
 *
 * The shape is DESIGN_TOKENS.md §1's hover form (a): a CTA inverts its FILL
 * STATE within one hue — outline-sumi (`bg-paper text-ink-primary
 * border-ink-primary`) flipping to filled-sumi on hover — rather than crossing
 * hue families, which reads as a register break instead of activation. Sumi
 * rather than `bg-accent` because accent is capped at one surface per page and
 * these CTAs appear beside a marketing header that already spends it.
 *
 * It was hand-spelled at four call sites (`/members` ×2, `/assemblies`,
 * `/clauses`) with the same ~250 characters of class list. This is that string,
 * once. Anything a caller needs to vary — the outer margin, mainly — comes
 * through `className`; the idiom itself is not a prop.
 *
 * The trailing arrow is part of the idiom, not the caller's copy: it is
 * `aria-hidden` decoration on every one of these, so folding it in keeps the
 * label the only thing a caller writes.
 *
 * `(marketing)` only — no wagmi, no client hooks; this renders in the static
 * marketing tree.
 */

const CTA_CLASSES =
    "inline-flex min-w-[200px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
    "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus";

export interface CtaLinkProps {
    /** Destination. Internal routes only — these are in-site calls to action. */
    href: string;
    /** The label. The trailing arrow is supplied by the component. */
    children: React.ReactNode;
    /** Layout-only additions (margins). Not a hook for restyling the idiom. */
    className?: string;
    "data-testid"?: string;
}

export function CtaLink({ href, children, className, "data-testid": testId }: CtaLinkProps) {
    return (
        <Link
            href={href}
            className={className ? `${CTA_CLASSES} ${className}` : CTA_CLASSES}
            data-testid={testId}
        >
            {children} <span aria-hidden="true">&rarr;</span>
        </Link>
    );
}
