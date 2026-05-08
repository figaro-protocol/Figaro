import { Button } from "@/components/ui/Button";
import { CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";
import type { ResolvedAssemblySkinBundle } from "@/lib/shared/runtimeResolution";

interface Props {
    capabilities: CapabilityModel[];
    executableCapabilityIds?: Set<string>;
    executingCapabilityId?: string | null;
    onExecute?: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
    contextLabel?: string;
    skin?: ResolvedAssemblySkinBundle;
}

export function CapabilityRail({
    capabilities,
    executableCapabilityIds,
    executingCapabilityId,
    onExecute,
    contextLabel,
    skin,
}: Props) {
    const sorted = capabilities.slice().sort((left, right) => (right.uiPriority ?? 0) - (left.uiPriority ?? 0));
    const accentColor = skin?.branding.branding.accentColor;

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4" data-skin={skin?.skinId}>
            <p
                className="text-xs font-semibold text-neutral-500 mb-1"
                style={accentColor ? { color: accentColor } : undefined}
            >
                What You Can Do
            </p>
            {contextLabel && (
                <p className="mb-3 text-sm font-medium text-neutral-600">{contextLabel}</p>
            )}
            <div className="space-y-2">
                {sorted.map((capability) => (
                    <div
                        key={capability.id}
                        className="rounded border border-neutral-200 p-3"
                        style={accentColor && executableCapabilityIds?.has(capability.id)
                            ? { borderColor: accentColor }
                            : undefined}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-black text-sm">{capability.label}</p>
                        </div>
                        {capability.preconditions.length > 0 && (
                            <p className="text-xs text-neutral-500 mt-1">{capability.preconditions.join(", ")}</p>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-3">
                            {onExecute && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={accentColor ? "bg-white" : undefined}
                                    disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId}
                                    onClick={() => onExecute(capability)}
                                    style={accentColor
                                        ? {
                                            borderColor: accentColor,
                                            color: accentColor,
                                        }
                                        : undefined}
                                >
                                    {executingCapabilityId === capability.id ? "Processing..." : capability.label}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && <p className="text-sm text-neutral-500">No capabilities derived.</p>}
            </div>
        </div>
    );
}