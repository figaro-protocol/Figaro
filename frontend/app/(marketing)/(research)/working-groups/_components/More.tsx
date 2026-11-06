"use client";

import { useState, type ReactNode } from "react";
import { Disclosure } from "@/components/ui/Disclosure";

/**
 * A closed-by-default "more" under a row of the working-groups index. It owns
 * the open state and hands the rest to the shared `Disclosure`, so the index
 * reads as one line per entry and the detail is one press away.
 */
export function More({ id, label, children }: { id: string; label: string; children: ReactNode }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <Disclosure
            id={id}
            label={<span>{label}</span>}
            expanded={expanded}
            onToggle={() => setExpanded((open) => !open)}
            triggerClassName="w-auto justify-start text-xs text-ink-muted hover:text-ink-heading"
            panelClassName="pb-2"
        >
            {children}
        </Disclosure>
    );
}
