import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { MechanismInspectorCard } from "@/components/core/MechanismInspectorCard";
import { getEffectiveMechanismModuleBindings } from "@/lib/mechanisms/packageDefaults";
import {
    InstitutionAssembly,
    MechanismRiskClass,
} from "@/lib/shared/institutionAssembly";
import {
    AssemblyValidationIssue,
    AssemblyValidationResult,
} from "@/lib/shared/institutionAssemblyValidation";
import { InstitutionModel, RiskBoundaryModel } from "@/lib/semantic/models";

interface Props {
    assembly: InstitutionAssembly;
    validation: AssemblyValidationResult;
    model: InstitutionModel;
    riskBoundaries: Record<string, RiskBoundaryModel>;
}

function formatRiskLabel(riskClass: MechanismRiskClass): string {
    switch (riskClass) {
        case "read-only-inherited":
            return "Read-only inherited";
        case "low-risk-coordinator":
            return "Low-risk coordinator";
        case "medium-risk-extension":
            return "Medium-risk extension";
        case "high-risk-economic":
            return "High-risk economic";
    }
}

function IssueList({ issues }: { issues: AssemblyValidationIssue[] }) {
    if (issues.length === 0) {
        return <p className="text-sm text-green-700">No validation issues.</p>;
    }

    return (
        <div className="space-y-2">
            {issues.map((issue) => (
                <div
                    key={`${issue.path}-${issue.message}`}
                    className={`rounded border px-3 py-2 text-sm ${issue.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-yellow-200 bg-yellow-50 text-yellow-800"
                        }`}
                >
                    <p className="font-semibold">{issue.severity.toUpperCase()}</p>
                    <p>{issue.message}</p>
                    <p className="text-xs opacity-80">{issue.path}</p>
                </div>
            ))}
        </div>
    );
}

export function InstitutionAssemblyInspector({ assembly, validation, model, riskBoundaries }: Props) {
    const knownModuleIds = new Set(assembly.modules.map((module) => module.moduleId));

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                            Institution Assembly
                        </p>
                        <h2 className="text-3xl font-bold text-black">{assembly.identity.name}</h2>
                        <p className="text-sm text-neutral-600 mt-2 max-w-2xl">
                            {assembly.identity.description || "No description provided."}
                        </p>
                    </div>
                    <div className="text-right text-sm text-neutral-600 shrink-0">
                        <p>Slug: <span className="font-mono text-black">{assembly.identity.slug}</span></p>
                        <p>Version: <span className="font-mono text-black">{assembly.identity.version}</span></p>
                        <p>Composition level: <span className="font-mono text-black">{assembly.builderMetadata.compositionLevel}</span></p>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-xl font-bold text-black mb-4">Validation</h3>
                    <p className={`text-sm font-semibold mb-3 ${validation.ok ? "text-green-700" : "text-red-700"}`}>
                        {validation.ok ? "Assembly is structurally valid." : "Assembly has structural errors."}
                    </p>
                    <IssueList issues={validation.issues} />
                </Card>
                <Card className="p-6">
                    <h3 className="text-xl font-bold text-black mb-4">Mechanism Summary</h3>
                    <div className="space-y-3 text-sm text-black">
                        {assembly.mechanisms.map((mechanism) => {
                            const moduleBindings = getEffectiveMechanismModuleBindings(mechanism, knownModuleIds);

                            return (
                                <div key={mechanism.mechanismId} className="rounded border border-neutral-200 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-black">{mechanism.displayName}</p>
                                            <p className="text-xs text-neutral-500">{mechanism.kind}</p>
                                        </div>
                                        <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                                            {formatRiskLabel(mechanism.riskClass)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-2">Modules: {moduleBindings.join(", ") || "None"}</p>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {model.mechanisms.map((mechanism) => (
                    <MechanismInspectorCard
                        key={mechanism.id}
                        mechanism={mechanism}
                        riskBoundary={riskBoundaries[mechanism.id]}
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-xl font-bold text-black mb-4">Modules</h3>
                    <div className="space-y-2 text-sm text-black">
                        {assembly.modules.map((module) => (
                            <div key={module.moduleId} className="rounded border border-neutral-200 p-3">
                                <p className="font-semibold">{module.componentKind}</p>
                                <p className="text-xs text-neutral-500">{module.moduleId} · {module.semanticInput} · slot {module.slot}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-xl font-bold text-black mb-4">Derived Model Snapshot</h3>
                    <div className="space-y-2 text-sm text-black">
                        <p>Network: <span className="font-mono">{model.network}</span></p>
                        <p>Enabled mechanisms: <span className="font-mono">{model.mechanisms.length}</span></p>
                        <p>Risk profile: <span className="font-mono">{model.riskProfile.join(", ") || "none"}</span></p>
                        <p>Processes in derived model: <span className="font-mono">{model.processes.length}</span></p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                        <Link href="/builders" className="text-sm font-semibold text-black hover:underline">
                            Back to builders
                        </Link>
                    </div>
                </Card>
            </div>
        </div>
    );
}