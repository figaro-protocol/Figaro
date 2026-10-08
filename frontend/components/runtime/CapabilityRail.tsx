import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ModalChrome } from "@/components/ui/ModalChrome";
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
    // The card whose chooser is open, by capability id. A card that is no
    // longer derived (its last choice landed) renders nothing, so its chooser
    // closes with it.
    const [openChooserId, setOpenChooserId] = useState<string | null>(null);

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
     *  value — display-level gating; enforcement stays off-chain validation at execution. */
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
        <div className="rounded-lg border border-default bg-paper p-4" data-testid="capability-rail">
            <p className="text-xs font-semibold text-ink-muted mb-1">
                What You Can Do
            </p>
            {contextLabel && (
                <p className="mb-3 text-sm font-medium text-ink-body">{contextLabel}</p>
            )}
            <div className="space-y-2">
                {sorted.map((capability) => (
                    <div
                        key={capability.id}
                        className="rounded border border-default p-3"
                        data-testid={`capability-${capability.actionKind}`}
                        data-clause-id={attestClauseId(capability)}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-ink-primary text-sm">{capability.label}</p>
                        </div>
                        {capability.orderLabel && (
                            <p className="mt-1 text-xs text-ink-muted" data-testid="capability-order-label">{capability.orderLabel}</p>
                        )}
                        {capability.action?.executionType === "choice" && openChooserId === capability.id && (
                            <ModalChrome
                                onClose={() => setOpenChooserId(null)}
                                aria-labelledby={`capability-chooser-title-${capability.id}`}
                                panelClassName="bg-paper rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4"
                                panelTestId={`capability-chooser-${capability.actionKind}`}
                            >
                                <p id={`capability-chooser-title-${capability.id}`} className="text-sm font-semibold text-ink-primary">
                                    {capability.label}
                                </p>
                                {capability.orderLabel && (
                                    <p className="mt-1 text-xs text-ink-muted">{capability.orderLabel}</p>
                                )}
                                <p className="mt-1 mb-3 text-xs text-ink-muted">Choose a section to re-assert. Each is its own transaction.</p>
                                <ul className="space-y-2">
                                    {capability.action.choices.map((choice) => (
                                        <li
                                            key={choice.id}
                                            className="flex items-center justify-between gap-3 rounded border border-default p-3"
                                            data-testid={`capability-choice-${choice.actionKind}`}
                                            data-clause-id={attestClauseId(choice)}
                                        >
                                            <p className="text-sm text-ink-primary">{choice.label}</p>
                                            {onExecute && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    data-testid={`capability-execute-${choice.actionKind}`}
                                                    data-clause-id={attestClauseId(choice)}
                                                    // A choice is executable when the card that carries it is.
                                                    disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId}
                                                    onClick={() => onExecute(choice)}
                                                >
                                                    {executingCapabilityId === choice.id ? "Processing..." : "Re-assert"}
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3 flex justify-end">
                                    <Button type="button" size="sm" variant="outline" onClick={() => setOpenChooserId(null)}>
                                        Close
                                    </Button>
                                </div>
                            </ModalChrome>
                        )}
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
                                    onClick={() => capability.action?.executionType === "choice"
                                        ? setOpenChooserId(capability.id)
                                        : onExecute(capability, executionInput(capability))}
                                >
                                    {executingCapabilityId === capability.id ? "Processing..." : capability.label}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && <p className="text-sm text-ink-muted" data-testid="capability-rail-empty">No capabilities derived.</p>}
            </div>
        </div>
    );
}
