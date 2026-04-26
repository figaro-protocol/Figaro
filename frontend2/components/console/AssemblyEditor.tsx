"use client";

/**
 * AssemblyEditor — Section-based editor for the selected assembly draft.
 * Each section renders as a collapsible JSON textarea.
 * Validates on demand and shows issues inline.
 */

import { useState, useCallback } from "react";
import { useBuilder } from "@/lib/console/buildProvider";
import { useFigaro } from "@/lib/console/provider";
import type { AssemblyValidationIssue } from "@/lib/shared/assemblyValidation";
import type { PublishAssemblyAction, RegisterSchemaAction } from "@/lib/console/buildProvider";

const SECTIONS = [
    { key: "identity", label: "Identity" },
    { key: "contracts", label: "Contracts" },
    { key: "mechanisms", label: "Mechanisms" },
    { key: "roles", label: "Roles" },
    { key: "views", label: "Views" },
    { key: "modules", label: "Modules" },
    { key: "capabilityPresentation", label: "Capability Presentation" },
    { key: "visibilityDefaults", label: "Visibility Defaults" },
    { key: "narrative", label: "Narrative" },
    { key: "builderMetadata", label: "Builder Metadata" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

function SectionEditor({
    sectionKey,
    label,
    value,
    issues,
    onUpdate,
}: {
    sectionKey: string;
    label: string;
    value: string;
    issues: AssemblyValidationIssue[];
    onUpdate: (json: string) => boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const [parseError, setParseError] = useState<string | null>(null);

    const handleSave = () => {
        const ok = onUpdate(localValue);
        if (!ok) {
            setParseError("Invalid JSON");
        } else {
            setParseError(null);
        }
    };

    const sectionIssues = issues.filter((i) => i.path.startsWith(sectionKey));

    return (
        <div className="border-b border-zinc-800">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-zinc-800/30"
            >
                <span className="font-medium text-zinc-300">{label}</span>
                <span className="flex items-center gap-2">
                    {sectionIssues.length > 0 && (
                        <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] text-red-400">
                            {sectionIssues.length} issue{sectionIssues.length !== 1 ? "s" : ""}
                        </span>
                    )}
                    <span className="text-zinc-600">{expanded ? "▼" : "▶"}</span>
                </span>
            </button>
            {expanded && (
                <div className="px-3 pb-3">
                    <textarea
                        value={localValue}
                        onChange={(e) => {
                            setLocalValue(e.target.value);
                            setParseError(null);
                        }}
                        rows={Math.min(20, localValue.split("\n").length + 2)}
                        className="w-full rounded bg-zinc-900 p-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                        spellCheck={false}
                    />
                    <div className="mt-1 flex items-center gap-2">
                        <button
                            onClick={handleSave}
                            className="rounded bg-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors"
                        >
                            Apply
                        </button>
                        {parseError && (
                            <span className="text-xs text-red-400">{parseError}</span>
                        )}
                    </div>
                    {sectionIssues.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                            {sectionIssues.map((issue, i) => (
                                <div
                                    key={i}
                                    className={`rounded px-2 py-1 text-xs ${issue.severity === "error"
                                        ? "bg-red-900/30 text-red-300"
                                        : "bg-yellow-900/30 text-yellow-300"
                                        }`}
                                >
                                    <span className="font-medium">{issue.severity}:</span> {issue.message}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function AssemblyEditor() {
    const { selectedDraft, selectedDraftSlug, updateDraftSection, validateDraft, deleteDraft } = useBuilder();
    const { enqueueBuildAction } = useFigaro();

    if (!selectedDraft || !selectedDraftSlug) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">
                Select or create a draft to edit.
            </div>
        );
    }

    const { assembly, validation } = selectedDraft;
    const issues = validation?.issues ?? [];

    const handleValidate = () => {
        validateDraft(selectedDraftSlug);
    };

    const handlePublish = () => {
        const action: PublishAssemblyAction = {
            type: "publish-assembly",
            description: `Publish assembly "${assembly.identity.name}" (${selectedDraftSlug})`,
            slug: selectedDraftSlug,
            assembly,
        };
        enqueueBuildAction(action);
    };

    const handleRegisterSchema = () => {
        // Queue a schema registration for the assembly's primary schema key
        const schemaKey = `figaro:assembly:${selectedDraftSlug}`;
        const action: RegisterSchemaAction = {
            type: "register-schema",
            description: `Register schema "${schemaKey}" v${assembly.identity.version} on-chain`,
            slug: selectedDraftSlug,
            schemaKey,
            version: parseInt(assembly.identity.version, 10) || 1,
        };
        enqueueBuildAction(action);
    };

    const sectionValues: Record<SectionKey, string> = {
        identity: JSON.stringify(assembly.identity, null, 2),
        contracts: JSON.stringify(assembly.contracts, null, 2),
        mechanisms: JSON.stringify(assembly.mechanisms, null, 2),
        roles: JSON.stringify(assembly.roles, null, 2),
        views: JSON.stringify(assembly.views, null, 2),
        modules: JSON.stringify(assembly.modules, null, 2),
        capabilityPresentation: JSON.stringify(assembly.capabilityPresentation, null, 2),
        visibilityDefaults: JSON.stringify(assembly.visibilityDefaults, null, 2),
        narrative: JSON.stringify(assembly.narrative ?? {}, null, 2),
        builderMetadata: JSON.stringify(assembly.builderMetadata, null, 2),
    };

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                    <h3 className="text-sm font-medium text-zinc-200">
                        {assembly.identity.name}
                    </h3>
                    <span className="font-mono text-xs text-zinc-500">
                        {selectedDraftSlug} · v{assembly.identity.version}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleValidate}
                        className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors"
                    >
                        Validate
                    </button>
                    <button
                        onClick={handleRegisterSchema}
                        className="rounded bg-purple-900/60 px-3 py-1 text-xs text-purple-300 hover:bg-purple-900/80 transition-colors"
                    >
                        Register Schema
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={validation ? !validation.ok : true}
                        className="rounded bg-emerald-900/60 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/80 disabled:opacity-40 transition-colors"
                    >
                        Publish
                    </button>
                    <button
                        onClick={() => deleteDraft(selectedDraftSlug)}
                        className="rounded bg-red-900/50 px-3 py-1 text-xs text-red-300 hover:bg-red-900/80 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Validation summary */}
            {validation && (
                <div className={`border-b px-4 py-2 text-xs ${validation.ok
                    ? "border-emerald-800/50 bg-emerald-900/20 text-emerald-400"
                    : "border-red-800/50 bg-red-900/20 text-red-400"
                    }`}>
                    {validation.ok
                        ? `Valid — ${assembly.mechanisms.length} mechanisms, ${assembly.roles.length} roles, ${assembly.modules.length} modules`
                        : `${issues.filter((i) => i.severity === "error").length} errors, ${issues.filter((i) => i.severity === "warning").length} warnings`
                    }
                </div>
            )}

            {/* Section editors */}
            <div className="flex-1 overflow-y-auto">
                {SECTIONS.map(({ key, label }) => (
                    <SectionEditor
                        key={key}
                        sectionKey={key}
                        label={label}
                        value={sectionValues[key]}
                        issues={issues}
                        onUpdate={(json) => updateDraftSection(selectedDraftSlug, key, json)}
                    />
                ))}
            </div>
        </div>
    );
}
