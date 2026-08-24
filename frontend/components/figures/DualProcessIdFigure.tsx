import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

/** No SVG here — see the note on the component. */
export type DualProcessIdFigureProps = Omit<BaseFigureProps, "svgProps">;

/**
 * The two process ids that share one name, as a call-site contrast.
 *
 * THE ONE FIGURE IN `components/figures/` THAT IS NOT AN SVG, deliberately:
 * its content is code, and code in an SVG cannot be selected, copied, or
 * reflowed, and renders at whatever size the viewBox scale lands on. The
 * accessible contract is the same as every sibling — a `<figure>` bound to a
 * title and a long description by id, plus a `<figcaption>` — and the palette
 * is tokens only.
 *
 * The trap is invisible in prose because both ids are `bytes32` and both are
 * called `processId`: the ARGUMENT is the kernel's DERIVED id, while every
 * struct inside `commitments` must carry the id the parties SIGNED — and a
 * root order signed zero.
 *
 * IDENTIFIERS verified against the shipped SDK surface
 * (`sdk/dist/commitments.d.ts`) and the kernel:
 *  - `orderToCommitment(order: Order): Commitment` — pure and event-derived;
 *    its own doc comment says a ROOT order's `processId` here is the DERIVED
 *    id, not the zero the party signed.
 *  - `restoreSignedProcessId(c: Commitment, chainId: number, coreAddress:
 *    Address): Commitment` — if treating the commitment as a root reproduces
 *    its own processId it WAS a root, and comes back with `processId = 0`; a
 *    genuine sub-order is returned unchanged.
 *  - `computeCommitmentProcessId(c, chainId, coreAddress): Hex` — the derived
 *    id: a root order's is its full EIP-712 digest, a sub-order keeps the
 *    process it targets.
 *  - The kernel recomputes `keccak256(abi.encodePacked(processId,
 *    c.hashStruct()))` and reverts `OrderNotCommitted(orderHash)` when the
 *    result is not an active order (`src/kernel/FigaroCore.sol`,
 *    `resolveProcess`). Both ids feed that hash, which is why swapping one
 *    silently misses.
 *  - `executeAction` applies the restore to every element; the lower-level
 *    `resolveProcess` wrapper does not (`sdk/README.md` § "Your first commit").
 */

interface Panel {
    kicker: string;
    heading: string;
    /** Code lines. A struck line is the move that silently misses. */
    code: readonly { text: string; struck?: boolean }[];
    outcome: string;
    fails: boolean;
}

const PANELS: readonly Panel[] = [
    {
        kicker: "the natural move",
        heading: "Feed back what the event carried",
        code: [
            { text: "const commitments = orders.map(" },
            { text: "  orderToCommitment", struck: true },
            { text: ");" },
            { text: "" },
            { text: "resolveProcess(wallet, core," },
            { text: "  derivedId, commitments);" },
        ],
        outcome:
            "The root struct now carries the DERIVED id — that is what OrderCommitted emits, and what event reconstruction hands you. The kernel recomputes keccak256(processId ‖ hashStruct(c)), matches no committed order, and reverts OrderNotCommitted.",
        fails: true,
    },
    {
        kicker: "the bridge",
        heading: "Restore the id the parties signed",
        code: [
            { text: "const commitments = orders.map(" },
            { text: "  (o) => restoreSignedProcessId(" },
            { text: "    orderToCommitment(o)," },
            { text: "    chainId, core));" },
            { text: "" },
            { text: "// executeAction does this for you;" },
            { text: "// the low-level wrapper does not." },
        ],
        outcome:
            "A root order comes back with processId = 0 — the value it was signed with — and a genuine sub-order is returned untouched. The kernel's recomputed order hash matches, and the process resolves.",
        fails: false,
    },
];

export function DualProcessIdFigure({ idPrefix = "dual-process-id", className }: DualProcessIdFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    return (
        <figure className={cn("w-full max-w-2xl mx-auto", className)} aria-labelledby={`${titleId} ${descId}`}>
            <p id={titleId} className="sr-only">
                The two process ids that share one name
            </p>
            <p id={descId} className="sr-only">
                Two call sites side by side. On the left, the natural move:
                rebuilding the commitment structs straight from the events, so a
                root order&apos;s struct carries the derived process id the event
                emitted. The kernel recomputes the order hash from both the
                argument and the struct, finds no match, and reverts with
                OrderNotCommitted. On the right, the bridge: passing each rebuilt
                commitment through restoreSignedProcessId, which returns a root
                order with its process id set back to zero — the value the
                parties actually signed — and leaves a genuine sub-order
                untouched. The argument to resolveProcess stays the derived id in
                both cases; only what the structs carry differs.
            </p>

            <div className="rounded-invariant border border-default bg-paper p-lg">
                <p className="text-xs font-semibold text-ink-heading mb-2">Two ids, one name, one signature</p>
                <pre className="font-mono text-xs text-ink-primary overflow-x-auto whitespace-pre">
                    <code>resolveProcess(bytes32 processId, Commitment[] commitments)</code>
                </pre>
                <p className="text-xs text-ink-muted mt-2">
                    The <strong className="font-medium text-ink-body">argument</strong> is the kernel&apos;s{" "}
                    <em>derived</em> id. Every struct <strong className="font-medium text-ink-body">inside</strong>{" "}
                    <code>commitments</code> must be the one the parties <em>signed</em> &mdash; and a root order
                    signed <code>processId = 0</code>.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 mt-5">
                    {PANELS.map((panel) => (
                        <div
                            key={panel.heading}
                            className={cn(
                                "rounded-tile border p-md",
                                panel.fails ? "border-default bg-canvas" : "border-default-strong bg-subtle",
                            )}
                        >
                            <p className="text-xs text-ink-muted">{panel.kicker}</p>
                            <p className="text-sm font-semibold text-ink-heading mt-0.5 mb-2 flex items-start gap-1.5">
                                {panel.fails && (
                                    <span aria-hidden="true" className="text-ink-muted shrink-0">
                                        &times;
                                    </span>
                                )}
                                <span>{panel.heading}</span>
                            </p>
                            <pre className="font-mono text-xs leading-5 text-ink-primary overflow-x-auto whitespace-pre">
                                <code>
                                    {panel.code.map((line, i) => (
                                        <span key={`${line.text}-${i}`} className="block">
                                            {line.struck ? <s className="text-ink-muted">{line.text}</s> : line.text || " "}
                                        </span>
                                    ))}
                                </code>
                            </pre>
                            <p className={cn("text-xs leading-relaxed mt-3", panel.fails ? "text-ink-muted" : "text-ink-body")}>
                                {panel.outcome}
                            </p>
                        </div>
                    ))}
                </div>

                <p className="text-xs text-ink-body leading-relaxed mt-4 pt-4 border-t border-default">
                    <code>computeCommitmentProcessId(c, chainId, core)</code> derives the{" "}
                    <strong className="font-medium text-ink-body">argument</strong>: a root order&apos;s id is its own
                    EIP-712 digest, a sub-order keeps the process it targets. That id belongs in the argument, and
                    nowhere else.
                </p>
            </div>

            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                The kernel hashes <code>processId</code> together with the struct,
                so both are inputs to one hash. For a <strong className="font-medium">root</strong>{" "}
                order the two differ by design &mdash; the struct carries zero
                where the argument carries the derived id &mdash; so putting the
                same value in both is what misses. A sub-order already carries
                the id it targets, and needs nothing done to it.
            </figcaption>
        </figure>
    );
}
