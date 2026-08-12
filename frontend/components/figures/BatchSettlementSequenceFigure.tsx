import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type BatchSettlementSequenceFigureProps = BaseFigureProps;

/**
 * The batch path in order of who acts, and where the acceptance gate sits.
 *
 * `SettlementPathsFigure` renders the two settlement universes side by side —
 * what each path's inputs, events, and state ARE, and that they share none of
 * it. This figure renders the batch path's SEQUENCE instead: the order in which
 * the wallets, the sequencer, the off-chain execution, the verifier, and the
 * counter act, which of those steps are off-chain, which single step admits a
 * batch, and what a party does when the sequencer will not serve it.
 *
 * VOCABULARY (load-bearing). The rendered strings name no contract, function,
 * or proving system: no paper in the corpus does, and the host paper's §5.6
 * deliberately keeps the proving system an abstract, un-discharged assumption —
 * naming it would concede in a caption what the prose declines to concede.
 * Source identifiers belong here in the comment, not on the page.
 *
 * STEP SEMANTICS verified against `src/protocol/verifier/FigaroBatchVerifier.sol`:
 *  - Public values are 8 ABI-encoded words (:70-78) — two state roots, chainId,
 *    verifyingContract, and FOUR HASHES (tokenOpsHash, attestationEventsHash,
 *    specBindingsHash, usageAccrualHash). They COMMIT to the positions,
 *    attestations, spec bindings and accrual; the data itself rides as calldata
 *    and is hash-checked against those commitments (:273-284). The proof does
 *    not carry the data.
 *  - Execution order is positions (:291) → attestation re-emission (:298) →
 *    usage accrual (:324-329) → state root (:331), in that order.
 *  - The accrual is wrapped in try/catch: a reward-tier gate refusal is dropped
 *    wholesale and surfaced as `BatchAccrualSkipped`, never unwinding the token
 *    settlement and never blocking it.
 * The "fall back to direct = a NEW process, never a migration" rule is
 * `docs/SCALING_STRATEGY.md`.
 */

interface Step {
    actor: string;
    lines: readonly string[];
    onChain: boolean;
}

const STEPS: readonly Step[] = [
    {
        actor: "Buyer + seller wallets",
        lines: [
            "Both parties sign one typed-data commitment. Its domain names the",
            "batch verifier, so a batch signature is not a kernel signature.",
        ],
        onChain: false,
    },
    {
        actor: "→ Sequencer",
        lines: [
            "Gathers signed commitments and orders them for proving.",
            "Transport, not authority.",
        ],
        onChain: false,
    },
    {
        actor: "→ Off-chain execution",
        lines: [
            "A mirror of the kernel's state machine runs the ordered batch,",
            "validating each clause against its published specification.",
        ],
        onChain: false,
    },
    {
        actor: "→ Validity proof",
        lines: [
            "Its public values commit, by hash, to the token positions, the",
            "attestations, the specification bindings, and the usage accrual.",
        ],
        onChain: false,
    },
    {
        actor: "→ The settlement call",
        lines: [
            "The verifier checks the proof, checks the submitted data against",
            "those commitments, anchors each specification; reverts otherwise.",
        ],
        onChain: true,
    },
    {
        actor: "→ Net positions, then attestations",
        lines: [
            "Each party's net position transfers — parties approve the verifier,",
            "not the kernel — and the attestations are re-emitted.",
        ],
        onChain: true,
    },
    {
        actor: "→ Usage accrual, then the state root",
        lines: [
            "The one quantity crossing between the paths reaches the counter; if",
            "a reward gate refuses it is dropped whole, never unwinding trade.",
        ],
        onChain: true,
    },
];

const ROW_H = 42;
const TOP = 52;
const DOT_X = 26;
const TEXT_X = 42;

export function BatchSettlementSequenceFigure({
    idPrefix = "batch-settlement-sequence",
    className,
    svgProps,
}: BatchSettlementSequenceFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    const firstOnChain = STEPS.findIndex((s) => s.onChain);
    // A gap opens before the first on-chain step so the acceptance-gate rule and
    // the band heading have clear air above the step-5 row.
    const GAP = 24;
    const rowY = (i: number) => TOP + i * ROW_H + (i >= firstOnChain ? GAP : 0);
    const bandY = rowY(firstOnChain) - 20;
    const bandH = (STEPS.length - firstOnChain) * ROW_H + 12;
    const seqBottom = bandY + bandH;
    const fallbackY = seqBottom + 22;
    const viewHeight = fallbackY + 90;

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox={`0 0 400 ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>The batch settlement path, step by step</title>
                <desc id={descId}>
                    Seven steps in order. Off chain: both parties sign one typed-data
                    commitment whose domain names the batch verifier rather than the
                    kernel; a sequencer gathers and orders signed commitments, as transport
                    rather than as authority; a mirror of the kernel&apos;s state machine
                    runs the ordered batch off chain, validating each clause against its
                    published specification supplied as witness input; the resulting
                    validity proof does not carry that data but commits to it by hash — its
                    public values hold hash commitments to the token positions, the
                    attestations, the specification bindings, and the usage accrual. On
                    chain, in one transaction: the verifier checks the proof, checks the
                    submitted data against those hash commitments, and anchors every
                    witness specification to its registration, reverting otherwise; then
                    each party&apos;s net position transfers, against approvals the parties
                    gave the verifier rather than the kernel, and the attestations are
                    re-emitted; then the usage accrual reaches the counter, and if a
                    reward-tier gate refuses it the accrual is dropped whole rather than
                    unwinding or blocking the settlement already executed; the state root
                    advances last. The verifier is the sole acceptance gate — sequencer and
                    prover can each produce a candidate batch and neither can admit one. If
                    the sequencer stalls or censors, the parties sign again for the
                    kernel&apos;s own domain and settle directly; that is a new process, not
                    a migration of a batched one.
                </desc>

                <defs>
                    <marker
                        id={`${idPrefix}-arrow`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
                    </marker>
                </defs>

                <text x="20" y="22" fontSize="12" fontWeight="600" className="fill-ink-heading">
                    Batch path — who acts, in what order
                </text>
                <text x="20" y="36" fontSize="9" className="fill-ink-muted">
                    Steps 1&ndash;4 are off chain. Steps 5&ndash;7 are one transaction.
                </text>

                {/* On-chain band */}
                <rect
                    x="14"
                    y={bandY}
                    width="372"
                    height={bandH}
                    rx="8"
                    className="fill-subtle stroke-default"
                    strokeWidth="0.75"
                />
                <text x="380" y={bandY + 12} fontSize="8" textAnchor="end" className="fill-ink-muted">
                    on chain — one transaction
                </text>

                {/* Spine */}
                <line
                    x1={DOT_X}
                    y1={TOP - 6}
                    x2={DOT_X}
                    y2={rowY(STEPS.length - 1) + 4}
                    className="stroke-default-strong"
                    strokeWidth="1"
                />

                {STEPS.map((step, i) => {
                    const y = rowY(i);
                    return (
                        <g key={step.actor}>
                            <circle cx={DOT_X} cy={y} r="7" className="fill-ink-heading" />
                            <text
                                x={DOT_X}
                                y={y + 3}
                                fontSize="8"
                                fontWeight="700"
                                textAnchor="middle"
                                className="fill-paper"
                            >
                                {i + 1}
                            </text>
                            <text x={TEXT_X} y={y + 2} fontSize="10" fontWeight="600" className="fill-ink-heading">
                                {step.actor}
                            </text>
                            {step.lines.map((line, j) => (
                                <text
                                    key={line}
                                    x={TEXT_X}
                                    y={y + 14 + j * 11}
                                    fontSize="8.5"
                                    className="fill-ink-body"
                                >
                                    {line}
                                </text>
                            ))}
                        </g>
                    );
                })}

                {/* The acceptance gate — the one step that admits a batch. */}
                <line
                    x1="14"
                    y1={bandY}
                    x2="386"
                    y2={bandY}
                    className="stroke-ink-primary"
                    strokeWidth="1.75"
                />
                <text x="20" y={bandY - 5} fontSize="8.5" fontWeight="600" className="fill-ink-primary">
                    acceptance gate — nothing above this line admits a batch
                </text>

                {/* Direct-path fallback */}
                <rect
                    x="14"
                    y={fallbackY}
                    width="372"
                    height="76"
                    rx="8"
                    strokeDasharray="4 3"
                    className="fill-paper stroke-default-strong"
                    strokeWidth="1"
                />
                <line
                    x1={DOT_X}
                    y1={seqBottom}
                    x2={DOT_X}
                    y2={fallbackY - 2}
                    strokeDasharray="3 3"
                    className="stroke-ink-muted"
                    strokeWidth="1"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />
                <text x="26" y={fallbackY + 18} fontSize="10" fontWeight="600" className="fill-ink-heading">
                    If the sequencer stalls or censors: the direct path
                </text>
                <text x="26" y={fallbackY + 33} fontSize="8.5" className="fill-ink-body">
                    The parties sign again for the kernel&rsquo;s own domain and settle
                </text>
                <text x="26" y={fallbackY + 44} fontSize="8.5" className="fill-ink-body">
                    directly. Batch settlement is itself permissionless, so anyone
                </text>
                <text x="26" y={fallbackY + 55} fontSize="8.5" className="fill-ink-body">
                    may prove and submit what a stalled sequencer will not.
                </text>
                <text x="26" y={fallbackY + 68} fontSize="8" fontStyle="italic" className="fill-ink-muted">
                    A new process on the kernel &mdash; never a migration of a batched one.
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Sequencer and prover each produce a candidate batch; neither admits one.
                The verifier is the sole acceptance gate, which is why a sequencer failure
                is a liveness problem and not a safety one.
            </figcaption>
        </figure>
    );
}
