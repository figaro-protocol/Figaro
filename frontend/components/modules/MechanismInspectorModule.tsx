"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { MechanismInspectorCard } from "@/components/core/MechanismInspectorCard";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";

export function MechanismInspectorModule({ context }: ModuleProps) {
    if (context.mechanisms.length === 0) {
        const { cardStyle, labelStyle } = deriveModuleChrome(context);
        return (
            <ModuleEmptyStateCard
                testId="mechanism-inspector-empty"
                skinId={context.skinBundle?.skinId}
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Mechanisms"
                message="No mechanism modules active for this process."
            />
        );
    }

    return (
        <div className="space-y-4">
            {context.mechanisms.map((mechanism) => (
                <MechanismInspectorCard
                    key={mechanism.id}
                    mechanism={mechanism}
                    riskBoundary={context.riskBoundaries[mechanism.id]}
                    skin={context.skinBundle}
                />
            ))}
        </div>
    );
}
