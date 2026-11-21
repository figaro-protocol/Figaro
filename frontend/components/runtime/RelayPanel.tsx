"use client";

/**
 * RelayPanel — the batch path's relay, wherever a page needs one (checkout,
 * `/sign`, `/orders/view`): the relay the acts go to, a choice among several
 * that pass, the relays that failed and why, the wallet's own relay setting,
 * and what the last act sent to a relay answered.
 *
 * Every relay shown was found by the wallet's setting or a party's profile
 * (`useCheckedRelay`); none is bundled. The check compares what the relay
 * reports with the chain; it proves nothing the relay does. A relay that
 * fails is never offered: its reason is stated as a fact. A relay's answer
 * is an operation id, never a landing: the order's readers show the act once
 * its batch lands.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CheckedRelays } from "@/lib/registries/useCheckedRelay";
import type { RelayReceipt } from "@/lib/core/useRelayActions";
import type { NetworkRead } from "@/lib/shared/networkRead";

/** What the check compared, said once wherever a relay is named. */
const COMPARED =
    "Its reported chain id, verifier address and program key equal the connected chain's id, this deployment's FigaroBatchVerifier and the key that verifier returns from programVKey(), and its operator lets this page submit from a browser.";

/** The line a party reads when no relay that passes the check is known. */
const NO_RELAY_LINE =
    "No relay whose report matches this deployment's batch verifier is known, so this page sends nothing on the batch path. Name a relay below, or ask a party to list one in its profile.";

/** What a party reads once a relay took its act. Each sentence is what the
 *  code holds: the relay answered with an id; the chain holds nothing yet. */
export function relayReceiptLine(receipt: RelayReceipt): string {
    const held = `The relay ${receipt.relayUrl} answered this ${receipt.act} with operation ${receipt.operationId}. It is not on the chain yet; this page shows it once a batch carries it.`;
    if (receipt.act === "commit" && receipt.commitDeadline !== undefined) {
        const deadline = new Date(Number(receipt.commitDeadline) * 1000).toISOString();
        return `${held} A batch can carry it until the order's commit deadline, ${deadline}; after that the order cannot be committed, and no bond moves.`;
    }
    return `${held} If the relay does not land it, nothing changes on the chain: sign the act again here and send it through another relay.`;
}

export function RelayPanel({ read, setting, onSetting, onChoose, receipt, testIdPrefix = "order" }: {
    read: NetworkRead<CheckedRelays>;
    setting: string | null;
    onSetting: (url: string) => boolean;
    onChoose: (url: string) => void;
    receipt?: RelayReceipt | null;
    /** `order`, `checkout` or `sign`: the page the panel stands on. */
    testIdPrefix?: string;
}) {
    const [draft, setDraft] = useState(setting ?? "");
    const [refused, setRefused] = useState(false);
    const settingForm = (
        <form
            className="flex gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                setRefused(!onSetting(draft));
            }}
        >
            <Input
                aria-label="Your relay URL"
                placeholder="Your relay URL"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                data-testid={`${testIdPrefix}-relay-setting-input`}
            />
            <Button type="submit" variant="outline" data-testid={`${testIdPrefix}-relay-setting-save`}>Check and keep</Button>
        </form>
    );
    // A failed read leaves the place empty; a read in flight is a loading state.
    if (read.status === "absent") return null;
    if (read.status === "pending") {
        return <p className="text-sm text-ink-muted" data-testid={`${testIdPrefix}-relay-checking`}>Checking the relays…</p>;
    }
    const { relay, passing, checks } = read.value;
    const failed = checks.filter((c) => c.verdict === "fails");
    return (
        <section className="space-y-2 text-sm text-ink-body" data-testid={`${testIdPrefix}-relay-panel`}>
            {relay && (
                <p data-testid={`${testIdPrefix}-relay-in-use`}>
                    Acts on the batch path are signed for the batch verifier and sent to the relay{" "}
                    <code className="font-mono text-xs">{relay.url}</code>. {COMPARED}
                </p>
            )}
            {!relay && passing.length > 1 && (
                <div className="space-y-1" data-testid={`${testIdPrefix}-relay-choice`}>
                    <p>Several relays match this deployment&apos;s batch verifier. Choose the one your acts go to.</p>
                    {passing.map((r) => (
                        <Button key={r.url} type="button" variant="outline" size="sm" onClick={() => onChoose(r.url)} data-testid={`${testIdPrefix}-relay-choose`}>
                            {r.url}
                        </Button>
                    ))}
                </div>
            )}
            {!relay && passing.length === 0 && (
                <p data-testid={`${testIdPrefix}-relay-none`}>{NO_RELAY_LINE}</p>
            )}
            {failed.length > 0 && (
                <ul className="space-y-1 text-xs text-ink-muted" data-testid={`${testIdPrefix}-relay-failed-checks`}>
                    {failed.map((c) => (
                        <li key={c.url}>
                            <code className="font-mono">{c.url}</code> is not offered: {c.verdict === "fails" ? c.reason : ""}.
                        </li>
                    ))}
                </ul>
            )}
            {receipt && <p data-testid={`${testIdPrefix}-relay-receipt`}>{relayReceiptLine(receipt)}</p>}
            {settingForm}
            {refused && <p className="text-xs text-error-fg">This browser refused to keep the relay setting.</p>}
        </section>
    );
}
