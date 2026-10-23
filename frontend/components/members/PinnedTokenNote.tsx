"use client";

import type { Assembly } from "@figaro-protocol/sdk";
import { readUtilityTokenPin } from "@figaro-protocol/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";

/**
 * PinnedTokenNote — what a seller accepts by binding an assembly whose
 * designer pinned its token.
 *
 * The pin is an assembly-scoped term of the design (read by its declared
 * field through `readUtilityTokenPin`, never by clause id), folded into every
 * agreement at checkout, where it overrides the buyer's selection. A seller
 * that binds the assembly therefore accepts that token for every payment and
 * bond under it, so the binding surface says so before the checkbox is ticked.
 * The pin is read from the loaded specs, so while they are still being read
 * the note says that, never silence a seller would read as "no pin"; it
 * renders nothing for an assembly with no pin once the specs are read.
 */
export function PinnedTokenNote({ assembly, slug }: { assembly: Assembly; slug: string }) {
    const { loaded } = useClauseSpecs();
    const pin = loaded ? readUtilityTokenPin(assembly.assemblyClauses ?? {}, specSource()) : undefined;
    const { data: symbol } = useTokenSymbol(pin ?? "");
    if (!loaded) {
        return (
            <p className="mt-3 text-xs text-ink-muted" data-testid={`seller-assembly-terms-reading-${slug}`}>
                Reading the assembly&rsquo;s terms&hellip;
            </p>
        );
    }
    if (!pin) return null;
    return (
        <p className="mt-3 text-xs text-ink-muted" data-testid={`seller-assembly-pinned-token-${slug}`}>
            By binding this assembly you accept {symbol ? `${symbol} (${pin})` : pin} for every payment and
            bond under it: its designer pinned the token.
        </p>
    );
}
