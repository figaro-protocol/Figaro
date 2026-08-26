"use client";

/**
 * The analyst prompt box — free-form questions of the same graphs, answered by
 * whichever ANALYST this reader points at.
 *
 * It renders ONLY when an analyst endpoint resolves (`getAnalystUrl()`): with
 * none configured there is no box at all, because there is no reader here to
 * ask — the deterministic views above are unaffected, since this browser reads
 * them from the chain itself. Where an endpoint IS configured but its host set
 * up no model, the box says so in the host's own words rather than pretending
 * to answer from nothing.
 *
 * Nothing an analyst says is privileged. Every answer names the TRUTH BOUNDARY
 * of what it reports, and the tool trace beneath it lists the deterministic
 * routes the answer was built from — the reader can re-run any of them against
 * the same endpoint, or check them against the views on this page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { useMounted } from "@/hooks/useMounted";
import {
    askAnalyst,
    getAnalystUrl,
    readAnalystStatus,
    type AnalystOutcome,
    type AnalystStatus,
} from "@/lib/data/analystEndpoint";

export function AnalystPrompt() {
    // The endpoint may come from THIS BROWSER's own overrides (localStorage),
    // so the first render must match the prerendered shell.
    const mounted = useMounted();
    const [status, setStatus] = useState<AnalystStatus | null>(null);
    const [question, setQuestion] = useState("");
    const [asking, setAsking] = useState(false);
    const [outcome, setOutcome] = useState<AnalystOutcome | null>(null);

    const endpoint = mounted ? getAnalystUrl() : null;

    useEffect(() => {
        if (!endpoint) return;
        let cancelled = false;
        readAnalystStatus().then((s) => {
            if (!cancelled) setStatus(s);
        });
        return () => {
            cancelled = true;
        };
    }, [endpoint]);

    if (!endpoint) return null;

    const promptAvailable = status?.prompt?.available !== false;

    async function ask(e: React.FormEvent) {
        e.preventDefault();
        if (!question.trim() || asking) return;
        setAsking(true);
        setOutcome(null);
        setOutcome(await askAnalyst(question.trim()));
        setAsking(false);
    }

    return (
        <Card className="p-6 space-y-4" data-testid="analyst-prompt">
            <div className="space-y-1">
                <h2 className="text-heading-h3 text-ink-heading">Ask the analyst</h2>
                <p className="text-xs text-ink-muted leading-relaxed max-w-3xl">
                    Answered by the analyst at <code className="font-mono">{endpoint}</code>
                    {status?.syncedToBlock ? `, synced to block ${status.syncedToBlock}` : ""}
                    {status?.prompt?.model ? `, model ${status.prompt.model}` : ""}. It reads the
                    same public record this page does, holds no key, signs nothing and writes
                    nothing. Point this at{" "}
                    <Link href="/members/edit/endpoints" className="underline hover:text-ink-heading">
                        your own analyst
                    </Link>{" "}
                    to include the substance your wallet owns or bought.
                </p>
            </div>

            {!promptAvailable ? (
                <p className="text-sm text-ink-muted" data-testid="analyst-no-prompt">
                    This analyst serves its deterministic routes only &mdash; its host configured no
                    model{status?.prompt?.reason ? ` (${status.prompt.reason})` : ""}. The views above
                    answer the same questions without one.
                </p>
            ) : (
                <form onSubmit={ask} className="space-y-3">
                    <Textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        rows={3}
                        placeholder="What has this market settled, and in which denominations?"
                        aria-label="Question for the analyst"
                        data-testid="analyst-question"
                    />
                    <Button type="submit" disabled={asking || question.trim() === ""} data-testid="analyst-ask">
                        {asking ? "Asking…" : "Ask"}
                    </Button>
                </form>
            )}

            {outcome ? <Outcome outcome={outcome} /> : null}
        </Card>
    );
}

function Outcome({ outcome }: { outcome: AnalystOutcome }) {
    if (outcome.state === "answered") {
        const { answer, trace, truncated } = outcome.answer;
        return (
            <div className="space-y-3" data-testid="analyst-answer">
                {answer ? (
                    <p className="text-sm text-ink-body leading-relaxed whitespace-pre-wrap">{answer}</p>
                ) : (
                    <p className="text-sm text-ink-muted">
                        The analyst stopped before answering{truncated ? " (it ran out of turns)" : ""}.
                    </p>
                )}
                {trace.length > 0 ? (
                    <p className="text-xs text-ink-muted" data-testid="analyst-trace">
                        Built from {trace.length} deterministic call{trace.length === 1 ? "" : "s"}:{" "}
                        {trace.map((t) => t.tool).join(", ")} &mdash; each one a route you can re-run and
                        check against the views above.
                    </p>
                ) : null}
            </div>
        );
    }
    if (outcome.state === "no-prompt") {
        return (
            <p className="text-sm text-ink-muted" data-testid="analyst-no-prompt">
                No prompt endpoint on this analyst &mdash; {outcome.reason}.
            </p>
        );
    }
    return (
        <p className="text-sm text-ink-muted" data-testid="analyst-error">
            {outcome.state === "refused" ? "The analyst refused the question" : "The analyst could not be reached"}
            : {outcome.error}
        </p>
    );
}
