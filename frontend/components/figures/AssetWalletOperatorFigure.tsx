import { cn } from "@/lib/shared/utils";

export interface AssetWalletOperatorFigureProps {
    /** Merged onto the outer <figure>. */
    className?: string;
}

// The asset/wallet/operator triad, drawn once for /agents — the page's own
// three-layer prose as a figure. Same rule as SystemLayersFigure (ruled
// 2026-08-06): plain HTML, not SVG — the triad must read as TEXT to every
// reader (curl, agents, screen readers), not only as shape. The kernel's
// resolution boundary sits ON the wallet row: everything the chain ever sees.
const TRIAD = [
    {
        name: "Operator",
        gloss: "controls the signing key under the owner's policy — a person, a script, an LLM",
        edge: "signs for",
        kernelSees: false,
    },
    {
        name: "Wallet",
        gloss: "the asset's on-chain life — address, credentials, receipts, stakes, signatures",
        edge: "represents",
        kernelSees: true,
    },
    {
        name: "Asset",
        gloss: "off-chain, on its owner's books, never tokenized — a kitchen, a van, labour, a service",
        edge: null,
        kernelSees: false,
    },
] as const;

export function AssetWalletOperatorFigure({ className }: AssetWalletOperatorFigureProps) {
    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <ol className="space-y-0" aria-label="The triad: an operator signs for a wallet; the wallet represents an asset">
                {TRIAD.map((row) => (
                    <li key={row.name}>
                        <div
                            className={cn(
                                "flex items-baseline justify-between gap-4 rounded px-4 py-2",
                                row.kernelSees
                                    ? "border-[1.5px] border-ink-heading bg-subtle-hover"
                                    : "border border-default",
                            )}
                        >
                            <span className={cn(
                                "text-sm whitespace-nowrap text-ink-heading",
                                row.kernelSees ? "font-bold" : "font-semibold",
                            )}>
                                {row.name}
                            </span>
                            <span className={cn("text-xs text-right", row.kernelSees ? "text-ink-body" : "text-ink-muted")}>
                                {row.gloss}
                                {row.kernelSees && (
                                    <span className="block font-semibold text-ink-heading">
                                        — all the kernel ever sees
                                    </span>
                                )}
                            </span>
                        </div>
                        {row.edge && (
                            <div className="py-0.5 pl-6 text-xs text-ink-muted" aria-hidden="true">
                                ↓ {row.edge}
                            </div>
                        )}
                    </li>
                ))}
            </ol>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                The kernel&apos;s resolution ends at the wallet: whether the operator is a person
                or software is invisible to settlement, and the asset never leaves its
                owner&apos;s books.
            </figcaption>
        </figure>
    );
}
