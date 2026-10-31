/**
 * The one line a page shows when a registry read THREW: the read failed, and
 * the provider's own answer (`rpcErrorText`, carried as a scan's `error`).
 * A failed read is unknown chain state, never resolved-empty, so the page
 * never shows a count or an empty-registry state in its place. Shared by the
 * registry explorer (/registries) and the member discovery list (/discover).
 */
export function RegistryReadFailed({ error }: { error: string | null }) {
    return (
        <p className="text-sm text-ink-muted" data-testid="registry-failed">
            The registry read failed on this network &mdash; nothing is shown rather than a stale copy.
            {error ? <> The RPC endpoint answered: <code className="font-mono break-all">{error}</code></> : null}
        </p>
    );
}
