import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type RegistryLifecycleFigureProps = BaseFigureProps;

/**
 * What a withdrawal leaves behind, by registry family — two small state
 * machines side by side, because the difference between them is the whole
 * answer.
 *
 * EVERY STATE AND EDGE verified against the contracts, not against prose:
 *
 * `src/protocol/registries/MembersRegistry.sol`
 *  - `register(metadataURI) payable` requires `msg.value == registrationDeposit`
 *    EXACTLY (`InsufficientDeposit`), sets the dedup guard, emits
 *    `MemberRegistered`. A second call reverts `AlreadyRegistered`.
 *  - `updateProfile(metadataURI)` is a self-loop on the live state, callable
 *    only while registered, and changes no deposit.
 *  - `requestWithdrawal()` DELETES the dedup guard immediately — `registered()`
 *    reads false from that block, which is the de-surfacing signal readers
 *    fold — while `pendingDeposit` accrues and `releaseAt = block.timestamp +
 *    withdrawalCooldown`.
 *  - `withdraw()` reverts `CooldownActive(releaseAt)` before that timestamp and
 *    otherwise returns the ETH. `withdrawable(member)` is a VIEW, so the chain
 *    answers "may I claim yet", never a client clock.
 *  - Re-registration is available from the moment of the request (the guard is
 *    already cleared) and costs a SECOND deposit; the first stays locked for
 *    its cooldown. That is the anti-rage-quit property the contract's own
 *    comment names — without it, one deposit is recyclable across identities.
 *
 * `src/protocol/registries/ClauseRegistry.sol` + `AssemblyRegistry.sol`
 *  - `registerClause(...)` / `registerAssembly(...)` take the exact deposit
 *    (`WrongDeposit`), record `registeredBy`, and are first-write-wins:
 *    `AlreadyRegistered(clauseId)` / `CompositionAlreadyRegistered(hash)`.
 *    First-write-wins is anti-DISPLACEMENT, NOT anti-squatting: a clause key is
 *    `keccak256(abi.encode(clauseId, version))` over a CALLER-CHOSEN name, so a
 *    name can be taken first by someone else. What the registry guarantees is
 *    that a binding, once made, cannot be rebound. (An assembly key is the
 *    composition hash, which is why /assemblies can say nothing is squattable
 *    THERE — no caller-chosen name exists. The two must not be conflated, and
 *    that is why this panel's subheading takes two lines.)
 *  - The withdraw gate lives at the PROTOCOL SURFACE, not in the contract:
 *    "SDK/frontend refuse while commits > resolves", because the usage count is
 *    the indexer's and "the kernel is frozen and carries no composition
 *    provenance, so there is no on-chain hardening of this gate."
 *  - `withdrawDeposit(key)` is callable ONLY by the recorded `registeredBy`
 *    (`NotRegisteredBy`), exactly once (`AlreadyWithdrawn`), with no cooldown
 *    of any kind — one call, no waiting.
 *  - The binding is NOT cleared by that call: `registered[idHash]` and
 *    `contentHashOf[idHash]` are never cleared ("the binding is permanent even
 *    after the deposit is withdrawn"), so committed agreements keep resolving
 *    while readers de-surface the entry for NEW compositions.
 *
 * Prose counterpart: /faq § "Can someone hijack your registration or clause?"
 * — this figure is drawn beside it and states the same thing as a shape.
 */

interface State {
    label: string;
    note: string;
    /** The state a reader surfaces. */
    live?: boolean;
}

interface Machine {
    heading: string;
    /** One entry per rendered line — the two ID-keyed registries key by
     *  different things, and collapsing that into one line loses the
     *  distinction the panel is about. */
    subheading: readonly string[];
    states: readonly State[];
    /** Edge labels, one fewer than the states. */
    edges: readonly { call: string; note: string }[];
    /** An edge that does NOT exist, drawn under the last state. */
    nonTransition?: readonly string[];
    /** The closing fact, one entry per rendered line. */
    closing: readonly string[];
}

const MEMBER: Machine = {
    heading: "A participant",
    subheading: ["MembersRegistry — keyed to a wallet"],
    states: [
        { label: "unregistered", note: "invisible to discovery" },
        { label: "live", note: "registered(wallet) == true", live: true },
        { label: "withdrawal requested", note: "de-surfaced; deposit still locked" },
        { label: "withdrawn", note: "ETH back in the wallet" },
    ],
    edges: [
        { call: "register()", note: "msg.value == registrationDeposit" },
        { call: "requestWithdrawal()", note: "de-surfaces in the same block" },
        { call: "withdraw()", note: "after withdrawalCooldown, not before" },
    ],
    closing: [
        "Re-registering is open from the moment of the",
        "request — and costs a SECOND deposit while the",
        "first stays locked. One deposit never walks",
        "two identities.",
        "",
        "While live, updateProfile() rewrites the",
        "profile URI and moves no deposit.",
    ],
};

const CLAUSE: Machine = {
    heading: "A clause or an assembly",
    subheading: [
        "ClauseRegistry — keyed by (chosen id, version)",
        "AssemblyRegistry — by composition hash",
    ],
    states: [
        { label: "unregistered", note: "nothing anchored under the key" },
        { label: "live", note: "surfaced for new compositions", live: true },
        { label: "deposit withdrawn", note: "de-surfaced for NEW compositions" },
    ],
    edges: [
        { call: "registerClause / registerAssembly", note: "first-write-wins, exact deposit" },
        { call: "withdrawDeposit(key)", note: "registeredBy only, once, no cooldown" },
    ],
    nonTransition: [
        "no way back, and none needed: the key",
        "reverts AlreadyRegistered forever, so a",
        "registered binding cannot be displaced.",
    ],
    closing: [
        "The binding is never cleared: the key stays",
        "registered and its content hash stays anchored,",
        "so agreements already committed against it keep",
        "resolving.",
        "",
        "One call — but the protocol surface refuses",
        "while commits outnumber resolves. That count",
        "lives in the indexer; the frozen kernel carries",
        "no composition provenance to harden the gate.",
    ],
};

const MACHINES: readonly Machine[] = [MEMBER, CLAUSE];

const COL_X = [12, 206];
const COL_W = 182;
const STATE_H = 30;
const EDGE_H = 28;
const SUB_LEADING = 9;
const SUB_TOP = 32;
/** The header rule clears the taller of the two subheadings, and the first
 *  state box clears the rule — so a family needing two lines to say what it
 *  keys by gets them without overlapping anything. */
const SUB_LINES = Math.max(...MACHINES.map((m) => m.subheading.length));
const HEADER_RULE_Y = SUB_TOP + (SUB_LINES - 1) * SUB_LEADING + 10;
const STATES_TOP = HEADER_RULE_Y + 16;

export function RegistryLifecycleFigure({
    idPrefix = "registry-lifecycle",
    className,
    svgProps,
}: RegistryLifecycleFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;
    const arrowId = `${idPrefix}-arrow`;

    const rowY = (i: number) => STATES_TOP + i * (STATE_H + EDGE_H);
    const tallest = Math.max(...MACHINES.map((m) => m.states.length));
    const machineBottom = rowY(tallest - 1) + STATE_H;
    const closingTop = machineBottom + 24;
    const closingLines = Math.max(...MACHINES.map((m) => m.closing.length));
    const viewHeight = closingTop + closingLines * 10 + 10;

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
                <title id={titleId}>What a withdrawal leaves behind, by registry family</title>
                <desc id={descId}>
                    Two state machines. A participant registration moves from
                    unregistered to live on an exact deposit, updates its own
                    profile while live, de-surfaces the instant a withdrawal is
                    requested, and releases the deposit only after a cooldown
                    fixed at deployment; re-registering is open immediately and
                    costs a second deposit while the first stays locked. A
                    clause, keyed by the hash of its chosen id and version, or an
                    assembly, keyed by its composition hash, moves from
                    unregistered to live on the same kind of deposit, and its
                    author can withdraw that deposit in a single call with no
                    cooldown — though the protocol surface refuses while commits
                    outnumber resolves. That withdrawal de-surfaces the entry for
                    new compositions but never clears the binding, so agreements
                    already committed against it keep resolving.
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

                {MACHINES.map((machine, m) => {
                    const x = COL_X[m];
                    const lastStateBottom = rowY(machine.states.length - 1) + STATE_H;
                    return (
                        <g key={machine.heading}>
                            <text x={x} y="20" fontSize="10.5" fontWeight="600" className="fill-ink-heading">
                                {machine.heading}
                            </text>
                            {machine.subheading.map((line, i) => (
                                <text key={line} x={x} y={SUB_TOP + i * SUB_LEADING} fontSize="7.5" className="fill-ink-muted">
                                    {line}
                                </text>
                            ))}
                            <line
                                x1={x}
                                y1={HEADER_RULE_Y}
                                x2={x + COL_W}
                                y2={HEADER_RULE_Y}
                                className="stroke-default"
                                strokeWidth="1"
                            />

                            {machine.states.map((state, i) => {
                                const y = rowY(i);
                                return (
                                    <g key={state.label}>
                                        <rect
                                            x={x}
                                            y={y}
                                            width={COL_W}
                                            height={STATE_H}
                                            rx="7"
                                            className={state.live ? "fill-subtle stroke-default-strong" : "fill-paper stroke-default"}
                                            strokeWidth={state.live ? "2" : "1"}
                                        />
                                        <text x={x + 10} y={y + 13} fontSize="8.5" fontWeight="600" className="fill-ink-heading">
                                            {state.label}
                                        </text>
                                        <text x={x + 10} y={y + 24} fontSize="7" className="fill-ink-muted">
                                            {state.note}
                                        </text>
                                    </g>
                                );
                            })}

                            {machine.edges.map((edge, i) => {
                                const from = rowY(i) + STATE_H;
                                const to = rowY(i + 1);
                                return (
                                    <g key={edge.call}>
                                        <line
                                            x1={x + 16}
                                            y1={from + 2}
                                            x2={x + 16}
                                            y2={to - 3}
                                            className="stroke-ink-muted"
                                            strokeWidth="1.25"
                                            markerEnd={`url(#${arrowId})`}
                                        />
                                        <text x={x + 23} y={from + 12} fontSize="7.5" className="fill-ink-primary font-mono">
                                            {edge.call}
                                        </text>
                                        <text x={x + 23} y={from + 22} fontSize="7" className="fill-ink-muted">
                                            {edge.note}
                                        </text>
                                    </g>
                                );
                            })}

                            {machine.nonTransition && (
                                <g>
                                    <g transform={`translate(${x + 16}, ${lastStateBottom + 12})`}>
                                        <circle r="6" className="fill-paper stroke-ink-faint" strokeWidth="1.25" />
                                        <line x1="-4" y1="4" x2="4" y2="-4" className="stroke-ink-faint" strokeWidth="1.25" />
                                    </g>
                                    {machine.nonTransition.map((line, i) => (
                                        <text
                                            key={line}
                                            x={x + 27}
                                            y={lastStateBottom + 9 + i * 9}
                                            fontSize="7"
                                            className="fill-ink-muted"
                                        >
                                            {line}
                                        </text>
                                    ))}
                                </g>
                            )}

                            <line
                                x1={x}
                                y1={closingTop - 12}
                                x2={x + COL_W}
                                y2={closingTop - 12}
                                className="stroke-default"
                                strokeWidth="1"
                            />
                            {machine.closing.map((line, i) => (
                                <text key={line} x={x} y={closingTop + i * 10} fontSize="7.5" className="fill-ink-body">
                                    {line}
                                </text>
                            ))}
                        </g>
                    );
                })}
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Both families price entry the same way &mdash; a reclaimable
                deposit, set per deployment. What differs is what leaving clears:
                a participant is a live identity, a clause or an assembly is a
                permanent published record.
            </figcaption>
        </figure>
    );
}
