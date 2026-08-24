import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type OriginationSequenceFigureProps = BaseFigureProps;

/**
 * The origination handshake in order of who acts, across four columns — and
 * the two points at which it REFUSES.
 *
 * `MarketFormationSwimlaneFigure` renders how a buyer FINDS a counterparty
 * (the dispatch race / RFQ legs, in the paper register). This figure renders
 * what happens once one is chosen: the draft → validate → counter-sign →
 * approvals → commit → attest → resolve sequence, with the chain column
 * showing which of those steps is a transaction at all.
 *
 * VOCABULARY. /spec names contracts and SDK symbols throughout (it is the
 * integration reference), so the rendered strings do too — the opposite of the
 * paper-corpus figures. Do not embed this on a paper page without prop-izing
 * the strings first.
 *
 * STEP SEMANTICS verified against `sdk/README.md` § "Your first commit" step 4
 * (the runnable form is `sdk/scripts/verify-origination.devnet.mjs`) and the
 * shipped signatures in `sdk/dist/agent/originate.d.ts`:
 *  - Discovery: `ctx.sync()` folds the registry event streams; the template is
 *    HYDRATED from its `contentURI`, and the commerce clause is located by the
 *    field it declares — no hardcoded clause id.
 *  - Buyer gate: `assertAgreementSignable(agreement, expectedHash, specs,
 *    struct)` — every section conforms to its clause spec AND the currency /
 *    payment TERMS equal the commitment struct's mirrors.
 *  - Deadline: `computeDeadline(await readChainTimestamp(client))` — chain
 *    time, never the machine clock.
 *  - Seller gate: `validateOffer` — buyer signature present, named seller is
 *    me, the agreement re-hashes to the committed `agreementHash`, parties
 *    match; with `specs`, the same merkle-leaf seam runs on the seller's side.
 *    A tampered/forged offer THROWS; the two opt-in floors (`accept` business
 *    rule, `policy` economic bound) DECLINE with `null` instead, and a decline
 *    does not approve the bond.
 *  - Approval order: the seller approves its 2× bond BEFORE returning the
 *    counter-signed offer (`approveBond`, default true); the buyer approves its
 *    own 2× payment bond before submitting `commit`.
 *  - Attestation: `AttestationCoordinator` binds each attestation to the signed
 *    `agreementHash` by merkle inclusion proof (`docs/CONTRACTS.md`).
 *  - Close: `resolveProcess` is buyer-only and atomic, and the usage record
 *    belongs in the same breath (`sdk/README.md` step 5).
 */

type Column = "buyer" | "channel" | "seller" | "chain";

interface Row {
    /** Rendered step ordinal. */
    n: number;
    /** An arrow between two columns, or an action on one column's own lifeline. */
    from: Column;
    to?: Column;
    /** Drawn as a dot where the arrow crosses the channel column. */
    viaChannel?: boolean;
    /** A chain READ rather than a write — drawn dashed. */
    read?: boolean;
    label: string;
    /** SVG does not wrap text — the break points are authored here. */
    detail: readonly string[];
    /** A refusal that ends the handshake at this step, one entry per line. */
    exit?: readonly string[];
}

const ROWS: readonly Row[] = [
    {
        n: 1,
        from: "buyer",
        to: "chain",
        read: true,
        label: "discover — ctx.sync()",
        detail: [
            "The registry event streams fold into a live catalogue, and the chosen",
            "template hydrates from its contentURI. The commerce clause is located",
            "by the field it DECLARES, never by clause name.",
        ],
    },
    {
        n: 2,
        from: "buyer",
        label: "instantiate the root agreement",
        detail: [
            "originateProcess() applies the buyer's overrides to the discovered",
            "template. Terms, not yet a signature.",
        ],
    },
    {
        n: 3,
        from: "buyer",
        label: "validate — assertAgreementSignable()",
        detail: [
            "Every section conforms to its clause spec, and the currency and payment",
            "TERMS equal the commitment struct's mirrors.",
        ],
        exit: [
            "refuses to sign: a missing required term, or a leaf that",
            "contradicts the struct it rides with. Nothing is signed.",
        ],
    },
    {
        n: 4,
        from: "buyer",
        label: "sign — EIP-712, chain-time deadline",
        detail: [
            "computeDeadline(await readChainTimestamp(client)): the deadline comes",
            "from the chain's clock, never the machine's. One signature so far.",
        ],
    },
    {
        n: 5,
        from: "buyer",
        to: "seller",
        viaChannel: true,
        label: "offer — singly signed",
        detail: [
            "The transport is a CoordinationChannel: HttpChannel or A2aChannel across",
            "the wire, InProcessChannel in tests. Transport, not authority — nothing",
            "here is on chain, and no channel can alter what was signed.",
        ],
    },
    {
        n: 6,
        from: "seller",
        label: "validate — validateOffer()",
        detail: [
            "The agreement must re-hash to the committed agreementHash, the named",
            "seller must be me, and the buyer signature must recover to the named",
            "buyer. With specs, the same merkle-leaf seam runs on this side too.",
        ],
        exit: [
            "a hash or signature mismatch THROWS; the two opt-in",
            "floors decline with null instead. Nothing is on chain.",
        ],
    },
    {
        n: 7,
        from: "seller",
        to: "chain",
        label: "approve 2 × expectedCumulativeValue",
        detail: [
            "The seller's bond allowance lands before the buyer commits",
            "(approveBond, default true). A declined offer never reaches this step.",
        ],
    },
    {
        n: 8,
        from: "seller",
        to: "buyer",
        viaChannel: true,
        label: "counter-signature — now dual-signed",
        detail: [
            "counterSignOffer() returns the struct unchanged but for the second",
            "signature. No counter-signature, no commit: neither is fabricated.",
        ],
    },
    {
        n: 9,
        from: "buyer",
        to: "chain",
        label: "approve 2 × payment, then commit(c, buyerSig, sellerSig)",
        detail: [
            "Two transactions — signing is not committing. The kernel verifies both",
            "signatures against one digest, pulls both bonds inside commit, and",
            "emits OrderCommitted.",
        ],
    },
    {
        n: 10,
        from: "seller",
        to: "chain",
        label: "attest — AttestationCoordinator",
        detail: [
            "A merkle inclusion proof binds each attestation to the signed",
            "agreementHash; the evidence is content-hashed, and the chain",
            "validates no content shape.",
        ],
    },
    {
        n: 11,
        from: "buyer",
        to: "chain",
        label: "resolveProcess(processId, commitments)",
        detail: [
            "Buyer-only, and atomic across every active order in the process. Call",
            "recordProcessUsage in the same breath: a record counts in whatever period",
            "is open when you call — or in none at all, once accrual has closed.",
        ],
    },
];

const COLUMN_X: Record<Column, number> = { buyer: 58, channel: 152, seller: 246, chain: 348 };
const COLUMN_LABEL: Record<Column, string> = {
    buyer: "Buyer",
    channel: "Channel",
    seller: "Seller",
    chain: "Chain",
};
const COLUMN_SUB: Record<Column, string> = {
    buyer: "any wallet",
    channel: "transport",
    seller: "any wallet",
    // Not "FigaroCore": of the five interactions reaching this column, only the
    // commit and the resolve are the kernel — the read is the registries, the
    // approvals are the settlement token, the attestation is the coordinator.
    chain: "on chain",
};
const COLUMNS: readonly Column[] = ["buyer", "channel", "seller", "chain"];

const HEAD_BOTTOM = 58;
const FIRST_ROW_Y = 82;
const DETAIL_DY = 12;
const DETAIL_LEADING = 10;
const EXIT_DY = 13;
const ROW_GAP = 16;
const EXIT_X = 30;

/** Lay the ladder out from its content: each row is as tall as its own text. */
function layoutRows(rows: readonly Row[]) {
    let cursor = FIRST_ROW_Y;
    const laid = rows.map((row) => {
        const arrowY = cursor;
        const detailY = arrowY + DETAIL_DY;
        const lastDetailY = detailY + (row.detail.length - 1) * DETAIL_LEADING;
        const exitY = row.exit ? lastDetailY + EXIT_DY : undefined;
        const exitBottom = exitY !== undefined && row.exit ? exitY + (row.exit.length - 1) * 9.5 : undefined;
        cursor = (exitBottom ?? lastDetailY) + ROW_GAP;
        return { row, arrowY, detailY, exitY };
    });
    return { laid, bottom: cursor };
}

export function OriginationSequenceFigure({
    idPrefix = "origination-sequence",
    className,
    svgProps,
}: OriginationSequenceFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;
    const arrowId = `${idPrefix}-arrow`;

    const { laid, bottom } = layoutRows(ROWS);
    const lifelineBottom = bottom - ROW_GAP + 8;
    const viewHeight = lifelineBottom + 46;

    return (
        <figure className={cn("w-full max-w-2xl mx-auto", className)}>
            <svg
                viewBox={`0 0 400 ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>The origination handshake, step by step</title>
                <desc id={descId}>
                    A sequence across four columns — buyer, channel, seller, and
                    the chain. The buyer discovers the network, instantiates the
                    root agreement from a template, validates it against every
                    clause spec, and signs an EIP-712 commitment over a
                    chain-time deadline. The offer crosses a coordination
                    channel to the seller, who re-hashes the agreement against
                    the committed agreement hash, checks the buyer signature and
                    its own floors, approves its bond of twice the cumulative
                    value, and counter-signs. The buyer approves twice the
                    payment and submits the commit, which pulls both bonds. The
                    seller attests during execution, and the buyer alone
                    resolves the process and records the usage. Two refusals end
                    the handshake before anything is committed: the buyer&apos;s
                    own gate refuses to sign a non-conforming agreement, and the
                    seller throws on an agreement-hash or signature mismatch.
                </desc>

                <defs>
                    <marker
                        id={arrowId}
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

                {/* ── Column headers, and the lifelines beneath them ──── */}
                {COLUMNS.map((col) => (
                    <g key={col}>
                        <rect
                            x={COLUMN_X[col] - 42}
                            y="12"
                            width="84"
                            height="28"
                            rx="6"
                            className={col === "chain" ? "fill-ink-heading" : "fill-subtle stroke-default"}
                            strokeWidth={col === "chain" ? undefined : "1"}
                        />
                        <text
                            x={COLUMN_X[col]}
                            y="26"
                            fontSize="9.5"
                            fontWeight="600"
                            textAnchor="middle"
                            className={col === "chain" ? "fill-paper" : "fill-ink-heading"}
                        >
                            {COLUMN_LABEL[col]}
                        </text>
                        <text
                            x={COLUMN_X[col]}
                            y="36"
                            fontSize="7"
                            textAnchor="middle"
                            className={col === "chain" ? "fill-paper" : "fill-ink-muted"}
                        >
                            {COLUMN_SUB[col]}
                        </text>
                        {/* Drawn before the step text, so the text reads over them. */}
                        <line
                            x1={COLUMN_X[col]}
                            y1={HEAD_BOTTOM}
                            x2={COLUMN_X[col]}
                            y2={lifelineBottom}
                            className={col === "chain" ? "stroke-default-strong" : "stroke-default"}
                            strokeWidth="1"
                            strokeDasharray="3 4"
                        />
                    </g>
                ))}

                {/* ── Steps ───────────────────────────────────────────── */}
                {laid.map(({ row, arrowY, detailY, exitY }) => {
                    const fromX = COLUMN_X[row.from];
                    const toX = row.to ? COLUMN_X[row.to] : undefined;
                    const forward = toX !== undefined && toX > fromX;
                    // A self-action label runs outward from its own lifeline —
                    // rightward from the left half, leftward from the right half,
                    // so it never runs off the plate.
                    const selfLeft = fromX < 200;
                    const labelX = toX === undefined ? (selfLeft ? fromX + 14 : fromX - 14) : (fromX + toX) / 2;
                    const labelAnchor = toX === undefined ? (selfLeft ? "start" : "end") : "middle";

                    return (
                        <g key={row.n}>
                            <text x="12" y={arrowY + 3} fontSize="8" fontWeight="600" className="fill-ink-heading">
                                {row.n}
                            </text>

                            {toX === undefined ? (
                                <rect
                                    x={fromX - 6}
                                    y={arrowY - 6}
                                    width="12"
                                    height="12"
                                    rx="3"
                                    className="fill-paper stroke-default-strong"
                                    strokeWidth="1.25"
                                />
                            ) : (
                                <>
                                    <line
                                        x1={forward ? fromX + 4 : fromX - 4}
                                        y1={arrowY}
                                        x2={forward ? toX - 4 : toX + 4}
                                        y2={arrowY}
                                        className="stroke-ink-muted"
                                        strokeWidth="1.25"
                                        strokeDasharray={row.read ? "4 3" : undefined}
                                        markerEnd={`url(#${arrowId})`}
                                    />
                                    {row.viaChannel && (
                                        <circle cx={COLUMN_X.channel} cy={arrowY} r="2.5" className="fill-ink-muted" />
                                    )}
                                </>
                            )}

                            <text
                                x={labelX}
                                y={arrowY - 6}
                                fontSize="7.5"
                                fontWeight="600"
                                textAnchor={labelAnchor}
                                className="fill-ink-heading font-mono"
                            >
                                {row.label}
                            </text>

                            {row.detail.map((line, i) => (
                                <text
                                    key={line}
                                    x="24"
                                    y={detailY + i * DETAIL_LEADING}
                                    fontSize="7.5"
                                    className="fill-ink-body"
                                >
                                    {line}
                                </text>
                            ))}

                            {row.exit !== undefined && exitY !== undefined && (
                                <>
                                    <line
                                        x1={fromX}
                                        y1={arrowY + 8}
                                        x2={EXIT_X + 8}
                                        y2={exitY - 5}
                                        className="stroke-ink-faint"
                                        strokeWidth="1"
                                        strokeDasharray="3 3"
                                    />
                                    <g transform={`translate(${EXIT_X}, ${exitY - 3})`}>
                                        <circle r="5" className="fill-paper stroke-ink-faint" strokeWidth="1.25" />
                                        <line x1="-3.2" y1="3.2" x2="3.2" y2="-3.2" className="stroke-ink-faint" strokeWidth="1.25" />
                                    </g>
                                    {row.exit.map((line, i) => (
                                        <text
                                            key={line}
                                            x={EXIT_X + 10}
                                            y={exitY + i * 9.5}
                                            fontSize="7.5"
                                            fontStyle="italic"
                                            className="fill-ink-muted"
                                        >
                                            {line}
                                        </text>
                                    ))}
                                </>
                            )}
                        </g>
                    );
                })}

                <line
                    x1="12"
                    y1={lifelineBottom + 14}
                    x2="388"
                    y2={lifelineBottom + 14}
                    className="stroke-default"
                    strokeWidth="1"
                />
                <text x="12" y={lifelineBottom + 28} fontSize="7.5" className="fill-ink-body">
                    The chain is written at steps 7, 9, 10 and 11 only. Step 1 is a read (dashed);
                </text>
                <text x="12" y={lifelineBottom + 38} fontSize="7.5" className="fill-ink-body">
                    steps 2&ndash;6 and 8 never touch the chain at all.
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Signing and committing are two steps, and the handshake refuses
                twice before either: once when the buyer&apos;s own gate finds an
                agreement that does not conform to its specs, and once when the
                seller&apos;s re-hash of that agreement fails to reproduce the
                committed <code>agreementHash</code>.
            </figcaption>
        </figure>
    );
}
