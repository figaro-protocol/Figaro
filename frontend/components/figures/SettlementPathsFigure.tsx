import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { ArrowMarker } from "@/components/figures/ArrowMarker";
import { FigureFrame } from "@/components/figures/FigureFrame";

interface SettlementPathPanel {
    heading: string;
    subheading: string;
    inputs: readonly string[];
    events: readonly string[];
    state: readonly string[];
    /** Italic line closing the panel's state section. Optional. */
    stateNote?: string;
}

export interface SettlementPathsFigureProps extends BaseFigureProps {
    directPath?: SettlementPathPanel;
    batchPath?: SettlementPathPanel;
    /** Section labels inside both panels. */
    sectionLabels?: { inputs: string; events: string; state: string };
    /** Label beside the no-entry glyph — the kernel field the batch path never writes. */
    neverWrittenNote?: string;
    /** The bridge box: the one surface both paths touch. */
    bridgeLabel?: string;
    bridgeSublabel?: string;
    /** Printed ON the crossing arrow — the one quantity that crosses. */
    crossingLabel?: string;
    crossingSublabel?: string;
    /** Panel body lines are monospaced by default (they are literal identifiers
     *  on /spec). A surface passing prose rather than identifiers passes "sans". */
    lineFont?: "mono" | "sans";
    figureTitle?: string;
    figureDesc?: string;
    caption?: ReactNode;
}

/**
 * The two disjoint settlement universes, side by side, with the single surface
 * that bridges them.
 *
 * The default prop set is /spec's, verbatim — /spec § "The two paths share no state"
 * (the canonical #settlement-paths anchor) renders it with no props at all, and
 * its strings are identifiers on purpose: that surface names contracts. Names
 * verified against `docs/CONTRACTS.md` and `src/kernel/FigaroCore.sol` /
 * `src/protocol/verifier/FigaroBatchVerifier.sol`.
 *
 * Every rendered string is a prop because the paper corpus names no contract,
 * function, or proving system, so a paper embedding this figure must supply its
 * own register. Layout is COMPUTED from the content, not hardcoded: a caller
 * passing a different number of lines gets a taller panel rather than an
 * overlap.
 *
 * The structural facts the figure asserts are the same under any register: the
 * two paths share no settlement state, the batch path never writes the kernel's
 * per-order status, and the usage accrual is the one quantity that crosses.
 */

const SPEC_DIRECT: SettlementPathPanel = {
    heading: "Direct path",
    subheading: "FigaroCore — kernel (frozen)",
    inputs: ["commit(commitment, buyerSig, sellerSig)", "resolveProcess(processId, commitments[])"],
    events: ["OrderCommitted", "OrderResolved", "ProcessResolved"],
    state: ["orderStatus[orderHash]: 0 → 1 → 2"],
    stateNote: "has no notion of a batch",
};

const SPEC_BATCH: SettlementPathPanel = {
    heading: "Batch path",
    subheading: "FigaroBatchVerifier — proof-based (SP1)",
    inputs: [
        "signed Commitment structs",
        "→ sequencer → SP1 validity proof",
        "→ settleBatch(proof, publicValues,",
        "   positions, events, usage)",
    ],
    events: ["BatchSettled"],
    state: ["stateRoot (verifier-local only)"],
};

const SPEC_SECTION_LABELS = { inputs: "Inputs", events: "Events", state: "State" };
const SPEC_NEVER_WRITTEN = "FigaroCore.orderStatus — never written";
const SPEC_BRIDGE_LABEL = "UsageCounter";
const SPEC_BRIDGE_SUBLABEL = "usage-accrual ledger";
const SPEC_CROSSING_LABEL = "usage accrual";
const SPEC_CROSSING_SUBLABEL = "(same settleBatch tx)";
const SPEC_TITLE = "Two disjoint settlement paths";
const SPEC_DESC =
    "FigaroCore's direct path (commit, resolveProcess) and FigaroBatchVerifier's " +
    "proof-based batch path (signed commitments through a sequencer and an SP1 " +
    "proof to settleBatch) settle independently. The batch path never writes " +
    "FigaroCore's orderStatus. The one connection between the two paths is usage " +
    "accrual, carried from settleBatch into UsageCounter in the same transaction.";
const SPEC_CAPTION = (
    <>
        Batch-settled orders never acquire kernel status &mdash; FigaroBatchVerifier
        never writes FigaroCore.orderStatus. UsageCounter is the only bridge
        between the two settlement universes.
    </>
);

// Vertical rhythm, all measured from a panel's own top edge.
const HEAD_DY = 28;
const SUB_DY = 44;
const RULE_DY = 54;
const SECTION_LABEL_DY = 18;
const LINE_DY = 15;
const SECTION_GAP = 8;
const PANEL_PAD = 16;

/** Lay a panel out from its content; returns the y of every line it draws. */
function layoutPanel(panel: SettlementPathPanel, top: number, withGlyphRow: boolean) {
    let cursor = top + RULE_DY;
    const section = (lines: readonly string[]) => {
        const labelY = cursor + SECTION_LABEL_DY;
        const lineYs = lines.map((_, i) => labelY + (i + 1) * LINE_DY);
        cursor = lineYs.length > 0 ? lineYs[lineYs.length - 1] : labelY;
        return { labelY, lineYs };
    };

    const inputs = section(panel.inputs);
    cursor += SECTION_GAP;
    const events = section(panel.events);
    cursor += SECTION_GAP;
    const state = section(panel.state);

    let stateNoteY: number | undefined;
    if (panel.stateNote) {
        stateNoteY = cursor + LINE_DY;
        cursor = stateNoteY;
    }
    let glyphY: number | undefined;
    if (withGlyphRow) {
        glyphY = cursor + SECTION_LABEL_DY;
        cursor = glyphY;
    }

    return {
        top,
        headY: top + HEAD_DY,
        subY: top + SUB_DY,
        ruleY: top + RULE_DY,
        inputs,
        events,
        state,
        stateNoteY,
        glyphY,
        height: cursor - top + PANEL_PAD,
    };
}

export function SettlementPathsFigure({
    idPrefix = "settlement-paths",
    className,
    svgProps,
    directPath = SPEC_DIRECT,
    batchPath = SPEC_BATCH,
    sectionLabels = SPEC_SECTION_LABELS,
    neverWrittenNote = SPEC_NEVER_WRITTEN,
    bridgeLabel = SPEC_BRIDGE_LABEL,
    bridgeSublabel = SPEC_BRIDGE_SUBLABEL,
    crossingLabel = SPEC_CROSSING_LABEL,
    crossingSublabel = SPEC_CROSSING_SUBLABEL,
    lineFont = "mono",
    figureTitle = SPEC_TITLE,
    figureDesc = SPEC_DESC,
    caption = SPEC_CAPTION,
}: SettlementPathsFigureProps) {
    const lineClass = lineFont === "mono" ? "fill-ink-primary font-mono" : "fill-ink-primary";

    const direct = layoutPanel(directPath, 16, false);
    const batch = layoutPanel(batchPath, direct.top + direct.height + 24, true);

    const arrowTop = batch.top + batch.height;
    const bridgeTop = arrowTop + 26;
    const viewHeight = bridgeTop + 60;

    const panels = [
        { layout: direct, panel: directPath, key: "direct" },
        { layout: batch, panel: batchPath, key: "batch" },
    ];

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox={`0 0 400 ${viewHeight}`}
            title={figureTitle}
            desc={figureDesc}
            caption={caption}
        >
                <defs>
                    <ArrowMarker id={`${idPrefix}-arrow`} />
                </defs>

                {panels.map(({ layout, panel, key }) => (
                    <g key={key}>
                        <rect
                            x="16"
                            y={layout.top}
                            width="368"
                            height={layout.height}
                            rx="10"
                            className="fill-paper stroke-default"
                            strokeWidth="1"
                        />
                        <text x="32" y={layout.headY} fontSize="14" fontWeight="600" className="fill-ink-heading">
                            {panel.heading}
                        </text>
                        <text x="32" y={layout.subY} fontSize="10" className="fill-ink-muted">
                            {panel.subheading}
                        </text>
                        <line x1="32" y1={layout.ruleY} x2="368" y2={layout.ruleY} className="stroke-default" strokeWidth="1" />

                        {([
                            [sectionLabels.inputs, panel.inputs, layout.inputs],
                            [sectionLabels.events, panel.events, layout.events],
                            [sectionLabels.state, panel.state, layout.state],
                        ] as const).map(([label, lines, geometry]) => (
                            <g key={label}>
                                <text x="32" y={geometry.labelY} fontSize="11" fontWeight="600" className="fill-ink-body">
                                    {label}
                                </text>
                                {lines.map((line, i) => (
                                    // xmlSpace preserves a caller's leading indent —
                                    // /spec's default wraps one call across two lines.
                                    <text
                                        key={line}
                                        x="40"
                                        y={geometry.lineYs[i]}
                                        fontSize="10"
                                        xmlSpace="preserve"
                                        className={lineClass}
                                    >
                                        {line}
                                    </text>
                                ))}
                            </g>
                        ))}

                        {panel.stateNote && layout.stateNoteY !== undefined && (
                            <text x="40" y={layout.stateNoteY} fontSize="10" fontStyle="italic" className="fill-ink-muted">
                                {panel.stateNote}
                            </text>
                        )}

                        {/* Visually explicit disjointness: a no-entry glyph beside the
                            one kernel field the batch path never touches. */}
                        {layout.glyphY !== undefined && (
                            <>
                                <g transform={`translate(46, ${layout.glyphY - 5})`}>
                                    <circle r="7" className="fill-none stroke-ink-muted" strokeWidth="1.25" />
                                    <line x1="-5" y1="5" x2="5" y2="-5" className="stroke-ink-muted" strokeWidth="1.25" />
                                </g>
                                <text x="60" y={layout.glyphY} fontSize="10" fontStyle="italic" className="fill-ink-muted">
                                    {neverWrittenNote}
                                </text>
                            </>
                        )}
                    </g>
                ))}

                {/* The bridge — the one surface both paths touch. */}
                <rect x="110" y={bridgeTop} width="180" height="46" rx="8" className="fill-subtle stroke-default-strong" strokeWidth="1" />
                <text x="200" y={bridgeTop + 20} fontSize="12" fontWeight="600" textAnchor="middle" className="fill-ink-heading">
                    {bridgeLabel}
                </text>
                <text x="200" y={bridgeTop + 35} fontSize="9" textAnchor="middle" className="fill-ink-muted">
                    {bridgeSublabel}
                </text>

                {/* The one crossing arrow. */}
                <line
                    x1="200"
                    y1={arrowTop}
                    x2="200"
                    y2={bridgeTop - 2}
                    className="stroke-ink-muted"
                    strokeWidth="1.5"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />
                <text x="208" y={arrowTop + 10} fontSize="9" className={lineFont === "mono" ? "fill-ink-body font-mono" : "fill-ink-body"}>
                    {crossingLabel}
                </text>
                <text x="208" y={arrowTop + 21} fontSize="8" fontStyle="italic" className="fill-ink-muted">
                    {crossingSublabel}
                </text>
        </FigureFrame>
    );
}
