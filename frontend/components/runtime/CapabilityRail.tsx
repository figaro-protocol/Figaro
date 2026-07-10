import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldControl } from "@/components/runtime/FieldControl";
import { CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";

interface Props {
    capabilities: CapabilityModel[];
    executableCapabilityIds?: Set<string>;
    executingCapabilityId?: string | null;
    onExecute?: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
    contextLabel?: string;
}

export function CapabilityRail({
    capabilities,
    executableCapabilityIds,
    executingCapabilityId,
    onExecute,
    contextLabel,
}: Props) {
    const sorted = capabilities.slice().sort((left, right) => (right.uiPriority ?? 0) - (left.uiPriority ?? 0));
    // Witness-form values, keyed by capability id → field name. The form is
    // generated from the capability's declared `inputFields` (a witness
    // stage's field set) through the ONE generic FieldControl — no clause and
    // no stage is named here.
    const [inputValues, setInputValues] = useState<Record<string, Record<string, unknown>>>({});

    /** The readable clauseId of an attestation capability (undefined for every
     *  other kind) — stamped as `data-clause-id` so a consumer can target one
     *  clause's capability without depending on the humanized label. */
    const attestClauseId = (capability: CapabilityModel): string | undefined =>
        capability.action?.executionType === "transaction" && capability.action.kind === "submit-clause-attestation"
            ? capability.action.clauseId
            : undefined;

    const executionInput = (capability: CapabilityModel): CapabilityExecutionInput | undefined => {
        if (!capability.inputFields?.length) return undefined;
        return { kind: "submit-clause-attestation", values: inputValues[capability.id] ?? {} };
    };

    /** A witness form submits only once every required declared field holds a
     *  value — display-level gating; enforcement stays Layer A at execution. */
    const inputsIncomplete = (capability: CapabilityModel): boolean => {
        if (!capability.inputFields?.length) return false;
        const values = inputValues[capability.id] ?? {};
        return capability.inputFields.some((field) => {
            if (!field.required) return false;
            const v = values[field.name];
            return v === undefined || v === null || v === "";
        });
    };

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="capability-rail">
            <p className="text-xs font-semibold text-neutral-500 mb-1">
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
                        data-testid={`capability-${capability.actionKind}`}
                        data-clause-id={attestClauseId(capability)}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-black text-sm">{capability.label}</p>
                        </div>
                        {capability.inputFields && capability.inputFields.length > 0 && (
                            <div className="mt-3 space-y-3" data-testid={`capability-inputs-${capability.id}`}>
                                {capability.inputFields.map((field) => (
                                    <FieldControl
                                        key={field.name}
                                        field={field}
                                        mode="runtime"
                                        value={inputValues[capability.id]?.[field.name]}
                                        onChange={(next) => setInputValues((prev) => ({
                                            ...prev,
                                            [capability.id]: { ...prev[capability.id], [field.name]: next },
                                        }))}
                                        testId={`capability-input-${attestClauseId(capability) ?? capability.id}-${field.name}`}
                                    />
                                ))}
                            </div>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-3">
                            {onExecute && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    data-testid={`capability-execute-${capability.actionKind}`}
                                    data-event-code={capability.eventCode}
                                    data-clause-id={attestClauseId(capability)}
                                    disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId || inputsIncomplete(capability)}
                                    onClick={() => onExecute(capability, executionInput(capability))}
                                >
                                    {executingCapabilityId === capability.id ? "Processing..." : capability.label}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && <p className="text-sm text-neutral-500" data-testid="capability-rail-empty">No capabilities derived.</p>}
            </div>
        </div>
    );
}
