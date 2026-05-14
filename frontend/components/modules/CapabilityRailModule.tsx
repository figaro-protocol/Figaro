"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { CapabilityRail as CapabilityRailBase } from "@/components/core/CapabilityRail";

export function CapabilityRailModule({ context }: ModuleProps) {
    return (
        <CapabilityRailBase
            capabilities={context.capabilities}
            executableCapabilityIds={context.executableCapabilityIds}
            executingCapabilityId={context.executingCapabilityId}
            onExecute={context.onExecuteCapability}
            contextLabel={context.shellPresentation.title}
        />
    );
}
