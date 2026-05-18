import { Card } from "@/components/ui/Card";
import { GuaranteeModel, MechanismModel, RiskBoundaryModel } from "@/lib/semantic/models";
import { GuaranteeBadge } from "@/components/core/GuaranteeBadge";
import { RiskBoundaryPanel } from "@/components/core/RiskBoundaryPanel";

interface Props {
    mechanism: MechanismModel;
    riskBoundary?: RiskBoundaryModel;
}

export function MechanismInspectorCard({ mechanism, riskBoundary }: Props) {
    const guarantees: GuaranteeModel[] = mechanism.guarantees;
    const visibleAttachments = mechanism.attachments.filter((attachment) => attachment.visibleByDefault);

    return (
        <Card className="p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-xl font-bold text-black">{mechanism.name}</h3>
                    <p className="text-sm text-neutral-600">{mechanism.description}</p>
                </div>
                <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                    {mechanism.riskClass}
                </span>
            </div>

            <div className="mb-4">
                <p className="text-xs font-semibold text-neutral-500 mb-2">Guarantees</p>
                <div className="flex flex-wrap gap-2">
                    {guarantees.map((guarantee) => (
                        <GuaranteeBadge key={guarantee.id} guarantee={guarantee} />
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-4 text-sm text-black md:grid-cols-2">
                <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold text-neutral-500 mb-2">Mechanism Scope</p>
                    <p>Kind: <span className="font-mono">{mechanism.kind}</span></p>
                    <p>Contracts: <span className="font-mono">{mechanism.contracts.join(", ") || "none"}</span></p>
                </div>
                <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-xs font-semibold text-neutral-500 mb-2">Module Bindings</p>
                    <p className="font-mono text-xs text-neutral-700 break-words">{mechanism.moduleBindings.join(", ") || "none"}</p>
                </div>
            </div>

            {visibleAttachments.length > 0 && (
                <div className="mb-4">
                    <p className="text-xs font-semibold text-neutral-500 mb-2">Attachments</p>
                    <div className="flex flex-wrap gap-2">
                        {visibleAttachments.map((attachment) => (
                            <span
                                key={attachment.id}
                                title={attachment.description ?? attachment.label}
                                className="rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-[11px] text-neutral-700"
                            >
                                {attachment.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {riskBoundary && <RiskBoundaryPanel riskBoundary={riskBoundary} />}
        </Card>
    );
}
