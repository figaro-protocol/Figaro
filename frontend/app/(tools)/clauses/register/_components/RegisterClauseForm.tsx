"use client";

/**
 * RegisterClauseForm — paste a clause spec, validate it, register it.
 *
 * Validation is the generic Layer-A surface from `@figaro-protocol/sdk/clauses`
 * (`parseClauseSpec`) — the SAME well-formedness gate that runs at sign-time,
 * no per-clause code and no bundled clause list. It runs live (walletless): a
 * visitor can check a spec without connecting. Only the register WRITE needs a
 * wallet — gated inline via `WalletGate` (connect is a signing prerequisite,
 * not a login).
 *
 * On valid + registered: pin the RAW spec (incl. `block`) to IPFS and anchor it
 * on `ClauseRegistry.registerClause`, then hold a receipt naming the registered
 * id with a link to the live `/clauses` inventory where it now appears.
 */

import { useMemo, useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import Link from "next/link";
import { parseClauseSpec, type SpecParseError } from "@figaro-protocol/sdk/clauses";
import { WalletGate } from "@/components/runtime/WalletGate";
import { Button } from "@/components/ui/Button";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";
import { useMounted } from "@/hooks/useMounted";
import {
    useRegisterClause,
    type RegisterClauseOutcome,
} from "@/lib/protocol/useClauseRegistry";

export type Validation =
    | { state: "empty" }
    | { state: "syntax"; message: string }
    | { state: "invalid"; errors: SpecParseError[] }
    | { state: "valid"; raw: Record<string, unknown> };

/** Pure — exported for unit testing. Discriminates the pasted text into the
 *  UI's validation states via `JSON.parse` + the generic Layer-A
 *  `parseClauseSpec` (the same well-formedness gate that runs at sign-time). */
export function validate(specText: string): Validation {
    const text = specText.trim();
    if (!text) return { state: "empty" };
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (err) {
        return { state: "syntax", message: extractErrorMessage(err, "The spec is not valid JSON.") };
    }
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) return { state: "invalid", errors: parsed.errors };
    // parseClauseSpec succeeds only when `raw` is an object; narrow for the pin.
    return { state: "valid", raw: raw as Record<string, unknown> };
}

export function RegisterClauseForm() {
    const mounted = useMounted();
    const { register } = useRegisterClause();
    const [specText, setSpecText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<RegisterClauseOutcome | null>(null);

    const validation = useMemo(() => validate(specText), [specText]);

    async function handleRegister() {
        if (validation.state !== "valid") return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const outcome = await register(validation.raw);
            setReceipt(outcome);
        } catch (err) {
            setSubmitError(extractErrorMessage(err, "Registering the clause failed."));
        } finally {
            setSubmitting(false);
        }
    }

    // Receipt state: registration confirmed on-chain.
    if (receipt) {
        return (
            <TransactionReceipt
                testId="clause-register-receipt"
                className="rounded-lg border border-default bg-paper p-6 space-y-4"
                heading="Registered."
                headingClassName="text-base font-semibold text-ink-heading"
                prose={
                    <>
                        <code data-testid="receipt-clause-id">{receipt.clauseId}</code> (version {receipt.version}) is now anchored on the <code>ClauseRegistry</code>. It appears in the live{" "}
                        <Link href="/clauses" className="underline">clauses inventory</Link>{" "}
                        grouped by its <code>block.design.article</code>.
                    </>
                }
                proseClassName="text-sm text-ink-body"
                rows={[
                    { label: "Clause key (idHash)", value: receipt.idHash },
                    { label: "Transaction", value: receipt.hash },
                    { label: "Spec URI", value: receipt.contentURI },
                ]}
                actions={
                    <button
                        type="button"
                        onClick={() => {
                            setReceipt(null);
                            setSpecText("");
                        }}
                        className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-heading"
                        data-testid="clause-register-again"
                    >
                        Register another
                    </button>
                }
            />
        );
    }

    return (
        <div className="space-y-4">
            <label htmlFor="clause-spec-input" className="block text-sm font-medium text-ink-heading">
                Clause spec (JSON)
            </label>
            <textarea
                id="clause-spec-input"
                data-testid="clause-spec-input"
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                spellCheck={false}
                rows={16}
                placeholder={'{\n  "clauseId": "figaro-my-clause",\n  "version": 1,\n  "title": "My clause",\n  "description": "…",\n  "fields": [ { "name": "note", "type": "string", "required": true } ]\n}'}
                className="w-full font-mono text-xs text-ink-body bg-paper border border-default rounded-section p-4 focus:border-default-strong focus:outline-none resize-y"
            />

            {/* Validation feedback — derived live from the pasted text. */}
            {validation.state === "syntax" && (
                <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4"
                    data-testid="clause-validation-errors"
                    role="alert"
                >
                    <p className="text-sm font-semibold text-red-800">Not valid JSON</p>
                    <p className="text-xs text-red-700 mt-1 font-mono break-words">{validation.message}</p>
                </div>
            )}
            {validation.state === "invalid" && (
                <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4"
                    data-testid="clause-validation-errors"
                    role="alert"
                >
                    <p className="text-sm font-semibold text-red-800 mb-2">
                        Spec is not well-formed — fix {validation.errors.length} issue{validation.errors.length === 1 ? "" : "s"}:
                    </p>
                    <ul className="space-y-1">
                        {validation.errors.map((err, i) => (
                            <li
                                key={`${err.path}-${i}`}
                                className="text-xs text-red-700 flex gap-2"
                                data-testid="clause-validation-error"
                            >
                                <code className="font-mono shrink-0 text-red-800">{err.path}</code>
                                <span>{err.message}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {validation.state === "valid" && (
                <p className="text-sm text-green-700" data-testid="clause-validation-ok">
                    Spec is well-formed. Registering pins it to IPFS, posts the registration deposit, and anchors it on-chain — permanent per (name, version).
                </p>
            )}

            {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
                    <p className="text-sm text-red-700" data-testid="clause-register-error">
                        Registration failed: {submitError}
                    </p>
                </div>
            )}

            {mounted && validation.state === "valid" && (
                <WalletGate hint="Connect a wallet to sign the registration and post the deposit.">
                    <Button
                        type="button"
                        onClick={handleRegister}
                        disabled={submitting}
                        className="font-semibold"
                        data-testid="clause-register-button"
                    >
                        {submitting ? "Registering…" : "Register clause"}
                    </Button>
                </WalletGate>
            )}
        </div>
    );
}
