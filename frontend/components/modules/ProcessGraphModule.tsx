"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { AssemblyProcessWorkspace } from "@/components/core/AssemblyProcessWorkspace";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";

export function ProcessGraphModule({ context }: ModuleProps) {
    const { shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!context.processModel) {
        return (
            <ModuleEmptyStateCard
                testId="process-graph-module"
                skinId={context.skinBundle?.skinId}
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title={shellLabel}
                message="Select a process from the sidebar to view its graph."
            />
        );
    }

    return (
        <div
            data-testid="process-graph-module"
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500" style={labelStyle}>
                {shellLabel}
            </p>
            <AssemblyProcessWorkspace
                process={context.processModel}
                executableCapabilityIds={context.executableCapabilityIds}
                executingCapabilityId={context.executingCapabilityId}
                onExecuteCapability={context.onExecuteCapability}
                onSelectOrder={context.onSelectOrder}
            />
        </div>
    );
}
