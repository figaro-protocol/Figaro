import { cn } from "@/lib/shared/utils";
import { MerkleTreeFigure } from "@/components/figures/MerkleTreeFigure";

export interface MerkleForestFigureProps {
    /** Merged onto the outer <figure>. */
    className?: string;
}

// Modeling constraints the drawing must keep: one root per agreement; each
// tree its own kernel, never one kernel for the whole forest; token balances
// are LINEAR (asymmetric bonding up the chain of hands) while the forest is
// NON-LINEAR (arranged by the deal's topology); the roots and the staked
// tokens sit in the blockchain's blocks.
const CONSUMERS = [
    "You — the data's owner",
    "The other hands in the deal",
    "Markets",
    "Regulators, tax authorities, courts",
] as const;

const MAIN_LEAVES = ["price", "delivery", "consent", "recourse"] as const;

function TierLabel({ children }: { children: string }) {
    return (
        <div aria-hidden="true" className="text-center text-xs text-ink-muted my-2">
            {children} ↓
        </div>
    );
}

export function MerkleForestFigure({ className }: MerkleForestFigureProps) {
    return (
        <figure className={cn("w-full max-w-2xl mx-auto", className)}>
            <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Who reads the data">
                {CONSUMERS.map((consumer) => (
                    <li key={consumer} className="rounded border border-default px-3 py-1.5 text-xs text-ink-heading">
                        {consumer}
                    </li>
                ))}
            </ul>
            <TierLabel>each reads only what it is entitled to see</TierLabel>
            <div className="rounded border border-default px-4 py-2 flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold text-ink-heading whitespace-nowrap">The record the deal emits</span>
                <span className="text-xs text-ink-muted text-right">public in aggregate, private in detail</span>
            </div>
            <TierLabel>each agreement, a tree — its clauses the leaves</TierLabel>
            <div className="flex items-end justify-center gap-6">
                <MerkleTreeFigure
                    leaves={MAIN_LEAVES}
                    idPrefix="home-merkle-main"
                    accessibleTitle="One agreement as a merkle tree"
                    accessibleDesc="Four clause leaves — price, delivery, consent, recourse — hashed pair by pair down to one root: the agreement's fingerprint."
                    className="max-w-xs"
                />
                <MerkleTreeFigure
                    leaves={["", "", ""]}
                    rootLabel="root"
                    idPrefix="home-merkle-sibling-a"
                    accessibleTitle="A second agreement's tree, compact"
                    accessibleDesc="A neighbouring agreement in the same deal, its own leaves hashed to its own root."
                    className="hidden sm:block w-32"
                />
                <MerkleTreeFigure
                    leaves={["", ""]}
                    rootLabel="root"
                    idPrefix="home-merkle-sibling-b"
                    accessibleTitle="A third agreement's tree, compact"
                    accessibleDesc="Another agreement in the same deal, its own leaves hashed to its own root."
                    className="hidden sm:block w-24"
                />
            </div>
            <TierLabel>every root anchored in a block, beside the staked tokens</TierLabel>
            <div
                className="flex gap-1"
                role="img"
                aria-label="The blockchain: a row of blocks; three hold a root and its staked tokens, the stakes climbing linearly along the chain of hands"
            >
                {([false, true, true, true, false] as const).map((holdsRoot, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded border-[1.5px] border-ink-heading bg-subtle-hover px-2 py-1.5 text-center"
                    >
                        <div className="text-xs font-semibold text-ink-heading">block</div>
                        <div className="text-[10px] text-ink-muted whitespace-nowrap">{holdsRoot ? "root · stakes" : " "}</div>
                    </div>
                ))}
            </div>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                The stakes are linear &mdash; each seller&apos;s bond covers all the value added before it.
                The forest is not &mdash; a deal&apos;s trees arrange in whatever shape its topology draws, each tree its own kernel.
            </figcaption>
        </figure>
    );
}
