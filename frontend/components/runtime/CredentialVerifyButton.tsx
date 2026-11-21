"use client";

/**
 * CredentialVerifyButton — the reader's verification affordance for a clause
 * whose spec marks a link to an outside register (`block.checkout.registerLink`):
 * the field that holds the register's URI template, with an `{id}`
 * placeholder, and the field that holds the identifier. Read through the mark,
 * never through the names of the fields or a clause id, so a never-seen clause
 * that declares the mark participates under its own field names
 * (`clauseRegisterLink`).
 *
 * A LINK, not a gate: it opens the authority's own entry (the register is the
 * source of truth; the reader interprets it). Nothing is fetched, parsed, or
 * stored — verification status is the reader's read-time judgment. https-only,
 * mirroring the forum deep-link rule (`block.design.composes.forumUrl`).
 */

import { clauseRegisterLink } from "@/lib/shared/clauseSpecSource";

export function CredentialVerifyButton({ clauseKey, data }: { clauseKey: string; data: Record<string, unknown> | undefined }) {
    const mark = clauseRegisterLink(clauseKey);
    if (!mark || !data) return null;
    const registerUri = data[mark.uri];
    const id = data[mark.id];
    if (typeof registerUri !== "string" || typeof id !== "string" || !registerUri || !id) return null;
    const href = registerUri.replace("{id}", encodeURIComponent(id));
    if (!href.startsWith("https://")) return null;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="credential-verify"
            className="ml-2 whitespace-nowrap text-ink-heading hover:text-ink-body underline"
        >
            Verify ↗
        </a>
    );
}
