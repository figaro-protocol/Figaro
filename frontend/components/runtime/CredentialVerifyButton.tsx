"use client";

/**
 * CredentialVerifyButton — the reader's verification affordance for a DECLARED
 * credential leaf. Renders for any clause data declaring BOTH
 * `credentialRegisterUri` (the authority's public register, a URI template
 * with an `{id}` placeholder) and `credentialId` (the declared identifier) —
 * discovered by declared field, never by clause id, so a never-seen clause
 * declaring the same fields participates.
 *
 * A LINK, not a gate: it opens the authority's own record (the register is the
 * source of truth; the reader interprets it). Nothing is fetched, parsed, or
 * stored — verification status is the reader's read-time judgment. https-only,
 * mirroring the forum deep-link rule (`block.composes.forumUrl`).
 */

export function CredentialVerifyButton({ data }: { data: Record<string, unknown> }) {
    const template = data.credentialRegisterUri;
    const id = data.credentialId;
    if (typeof template !== "string" || typeof id !== "string" || !template || !id) return null;
    const href = template.replace("{id}", encodeURIComponent(id));
    if (!href.startsWith("https://")) return null;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="credential-verify"
            className="ml-2 whitespace-nowrap text-blue-600 hover:text-blue-800 underline"
        >
            Verify ↗
        </a>
    );
}
