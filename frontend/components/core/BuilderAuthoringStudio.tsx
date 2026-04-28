"use client";

import Link from "next/link";
import { ChangeEvent, startTransition, useDeferredValue, useEffect, useState } from "react";
import {
    publishAssemblyAction,
    unregisterAssemblyAction,
} from "@/app/(app)/builders/authoring/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RegisteredAssemblyWorkspace } from "@/components/core/RegisteredAssemblyWorkspace";
import { RegisteredAssembly } from "@/lib/shared/assemblyRegistry";
import {
    buildBlankAssembly,
    buildDraftRegisteredAssembly,
    buildAssemblySectionText,
    cloneAssemblyDraft,
    ASSEMBLY_SECTION_KEYS,
    AssemblySectionKey,
    AssemblySectionText,
    serializeAssemblyDocument,
} from "@/lib/shared/assemblyDraft";
import { Assembly } from "@/lib/shared/assembly";
import { parseAssemblyDocument } from "@/lib/shared/assemblyParser";
import { AssemblyValidationIssue } from "@/lib/shared/assemblyValidation";

interface Props {
    artifacts: RegisteredAssembly[];
}

type SectionErrorMap = Partial<Record<AssemblySectionKey, string>>;

interface PublicationNotice {
    kind: "success" | "error";
    title: string;
    details: string[];
    prototypePath?: string;
}

interface PendingUnregisterIntent {
    slug: string;
    deleteFile: boolean;
}

interface PendingDraftReplacement {
    assembly: Assembly;
    selectedTemplateSlug: string;
    title: string;
    description: string;
    importStatus?: string | null;
}

interface RegisteredAssemblyRowProps {
    artifact: RegisteredAssembly;
    selected: boolean;
    deleteOnUnregister: boolean;
    pending: boolean;
    onLoad: (slug: string) => void;
    onUnregister: (slug: string) => void;
}

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

function issueSectionKey(path: string): AssemblySectionKey | undefined {
    const [section] = path.split(".");
    return ASSEMBLY_SECTION_KEYS.find((entry) => entry === section);
}

function groupIssuesBySection(issues: AssemblyValidationIssue[]) {
    const grouped: Partial<Record<AssemblySectionKey, AssemblyValidationIssue[]>> = {};

    for (const issue of issues) {
        const sectionKey = issueSectionKey(issue.path);
        if (!sectionKey) {
            continue;
        }
        grouped[sectionKey] = [...(grouped[sectionKey] ?? []), issue];
    }

    return grouped;
}

function areSectionTextEqual(
    left: AssemblySectionText,
    right: AssemblySectionText
): boolean {
    return ASSEMBLY_SECTION_KEYS.every((sectionKey) => left[sectionKey] === right[sectionKey]);
}

function updateAssemblySection(
    assembly: Assembly,
    sectionKey: AssemblySectionKey,
    sectionValue: unknown
): Assembly {
    return parseAssemblyDocument({
        ...deepClone(assembly),
        [sectionKey]: sectionValue,
    }, "builder authoring draft");
}

function rewriteSlugReferences(assembly: Assembly, nextSlug: string): Assembly {
    const previousSlug = assembly.identity.slug;
    const previousDashboardViewId = `${previousSlug}-dashboard`;
    const nextDashboardViewId = `${nextSlug}-dashboard`;

    return parseAssemblyDocument({
        ...deepClone(assembly),
        identity: {
            ...assembly.identity,
            slug: nextSlug,
            id: `${nextSlug}-reference`,
        },
        roles: assembly.roles.map((role) => ({
            ...role,
            defaultLandingView: role.defaultLandingView === previousDashboardViewId
                ? nextDashboardViewId
                : role.defaultLandingView,
        })),
        views: assembly.views.map((view) => ({
            ...view,
            viewId: view.viewId === previousDashboardViewId ? nextDashboardViewId : view.viewId,
            route: view.route === `/${previousSlug}` ? `/${nextSlug}` : view.route,
        })),
    }, "builder authoring slug rewrite");
}

function SectionIssueList({ issues }: { issues: AssemblyValidationIssue[] | undefined }) {
    if (!issues || issues.length === 0) {
        return <p className="text-xs text-neutral-500">No validation issues in this section.</p>;
    }

    return (
        <div className="space-y-2">
            {issues.map((issue) => (
                <div
                    key={`${issue.path}-${issue.message}`}
                    className={`rounded border px-3 py-2 text-xs ${issue.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-yellow-200 bg-yellow-50 text-yellow-800"
                        }`}
                >
                    <p className="font-semibold">{issue.message}</p>
                    <p className="opacity-80">{issue.path}</p>
                </div>
            ))}
        </div>
    );
}

function JsonSectionEditor(props: {
    sectionKey: AssemblySectionKey;
    label: string;
    value: string;
    onChange: (sectionKey: AssemblySectionKey, value: string) => void;
    syntaxError?: string;
    issues?: AssemblyValidationIssue[];
}) {
    const issueCount = props.issues?.length ?? 0;

    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-black">{props.label}</p>
                    <p className="text-xs text-neutral-500">Top-level assembly section: {props.sectionKey}</p>
                </div>
                <div className="text-right text-xs text-neutral-500">
                    <p>{issueCount} validation issue{issueCount === 1 ? "" : "s"}</p>
                    {props.syntaxError ? <p className="text-red-700">JSON parse error</p> : null}
                </div>
            </div>

            <textarea
                data-testid={`assembly-section-${props.sectionKey}`}
                value={props.value}
                onChange={(event) => props.onChange(props.sectionKey, event.target.value)}
                spellCheck={false}
                className={`min-h-[220px] w-full rounded-md border bg-white px-3 py-2 font-mono text-xs text-black focus:outline-none focus:ring-1 ${props.syntaxError ? "border-red-300 focus:ring-red-300" : "border-gray-300 focus:ring-gray-400"
                    }`}
            />

            {props.syntaxError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {props.syntaxError}
                </div>
            ) : null}

            <SectionIssueList issues={props.issues} />
        </Card>
    );
}

function RegisteredAssemblyRow({
    artifact,
    selected,
    deleteOnUnregister,
    pending,
    onLoad,
    onUnregister,
}: RegisteredAssemblyRowProps) {
    return (
        <div className="rounded border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-black">{artifact.assembly.identity.name}</p>
                    <p className="text-xs text-neutral-500">{artifact.assembly.identity.slug} · level {artifact.assembly.builderMetadata.compositionLevel}</p>
                </div>
                {selected ? (
                    <span className="rounded border border-black px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-black">
                        Selected
                    </span>
                ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Button type="button" onClick={() => onLoad(artifact.assembly.identity.slug)}>
                    Load into Studio
                </Button>
                <Link href={`/builders/prototype/${artifact.assembly.identity.slug}`} className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                    Open Prototype
                </Link>
                <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onUnregister(artifact.assembly.identity.slug)}
                >
                    {deleteOnUnregister ? "Unregister and Delete" : "Unregister Only"}
                </Button>
            </div>
        </div>
    );
}

export function BuilderAuthoringStudio({ artifacts }: Props) {
    const [registeredArtifacts, setRegisteredArtifacts] = useState<RegisteredAssembly[]>(artifacts);
    const initialAssembly = cloneAssemblyDraft(registeredArtifacts[0]?.assembly ?? buildBlankAssembly());
    const initialSectionText = buildAssemblySectionText(initialAssembly);
    const [draftAssembly, setDraftAssembly] = useState<Assembly>(initialAssembly);
    const [sectionText, setSectionText] = useState<AssemblySectionText>(initialSectionText);
    const [sectionErrors, setSectionErrors] = useState<SectionErrorMap>({});
    const [selectedTemplateSlug, setSelectedTemplateSlug] = useState(registeredArtifacts[0]?.assembly.identity.slug ?? "");
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [publicationNotice, setPublicationNotice] = useState<PublicationNotice | null>(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isUnregistering, setIsUnregistering] = useState(false);
    const [deleteOnUnregister, setDeleteOnUnregister] = useState(false);
    const [pendingUnregisterIntent, setPendingUnregisterIntent] = useState<PendingUnregisterIntent | null>(null);
    const [savedAssemblyJson, setSavedAssemblyJson] = useState(serializeAssemblyDocument(initialAssembly));
    const [savedSectionText, setSavedSectionText] = useState<AssemblySectionText>(initialSectionText);
    const [pendingDraftReplacement, setPendingDraftReplacement] = useState<PendingDraftReplacement | null>(null);

    const deferredAssembly = useDeferredValue(draftAssembly);
    const draftArtifact = buildDraftRegisteredAssembly(
        deferredAssembly,
        registeredArtifacts.map((artifact) => artifact.assembly)
    );
    const issuesBySection = groupIssuesBySection(draftArtifact.publication.issues);
    const hasSyntaxErrors = Object.values(sectionErrors).some(Boolean);
    const structuralReady = draftArtifact.validation.ok && !hasSyntaxErrors;
    const publicationReady = draftArtifact.publication.ok && !hasSyntaxErrors;
    const hasUnsavedChanges =
        serializeAssemblyDocument(draftAssembly) !== savedAssemblyJson
        || !areSectionTextEqual(sectionText, savedSectionText);
    const assemblyOutputPath = `lib/shared/assemblies/${draftAssembly.identity.slug || "assembly"}.reference.json`;
    const registryOutputPath = "lib/shared/assembly.ts";
    const prototypeOutputPath = `/builders/prototype/${draftAssembly.identity.slug || "assembly"}`;
    const duplicateIdentityIssues = draftArtifact.publication.issues.filter((issue) =>
        issue.path === "identity.slug" || issue.path === "identity.id"
    );

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) {
                return;
            }

            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        (window as Window & { __FIGARO_HAS_UNSAVED_BUILDER_DRAFT__?: boolean }).__FIGARO_HAS_UNSAVED_BUILDER_DRAFT__ = hasUnsavedChanges;

        return () => {
            (window as Window & { __FIGARO_HAS_UNSAVED_BUILDER_DRAFT__?: boolean }).__FIGARO_HAS_UNSAVED_BUILDER_DRAFT__ = false;
        };
    }, [hasUnsavedChanges]);

    function applyAssembly(nextAssembly: Assembly, options?: { selectedTemplateSlug?: string; importStatus?: string | null }) {
        const nextSectionText = buildAssemblySectionText(nextAssembly);
        setDraftAssembly(nextAssembly);
        setSectionText(nextSectionText);
        setSectionErrors({});
        setImportStatus(options?.importStatus ?? null);
        setSavedAssemblyJson(serializeAssemblyDocument(nextAssembly));
        setSavedSectionText(nextSectionText);
        if (options?.selectedTemplateSlug !== undefined) {
            setSelectedTemplateSlug(options.selectedTemplateSlug);
        }
    }

    function requestDraftReplacement(intent: PendingDraftReplacement) {
        if (!hasUnsavedChanges) {
            applyAssembly(intent.assembly, {
                selectedTemplateSlug: intent.selectedTemplateSlug,
                importStatus: intent.importStatus,
            });
            return;
        }

        setPendingDraftReplacement(intent);
        setPublicationNotice(null);
    }

    function cancelDraftReplacement() {
        setPendingDraftReplacement(null);
    }

    function confirmDraftReplacement() {
        if (!pendingDraftReplacement) {
            return;
        }

        applyAssembly(pendingDraftReplacement.assembly, {
            selectedTemplateSlug: pendingDraftReplacement.selectedTemplateSlug,
            importStatus: pendingDraftReplacement.importStatus,
        });
        setPendingDraftReplacement(null);
        setPublicationNotice(null);
    }

    function updateIdentityField(field: "name" | "slug" | "description", value: string) {
        const nextAssembly = field === "slug"
            ? rewriteSlugReferences(draftAssembly, value)
            : updateAssemblySection(draftAssembly, "identity", {
                ...draftAssembly.identity,
                [field]: value,
                id: `${draftAssembly.identity.slug}-reference`,
            });

        setDraftAssembly(nextAssembly);
        setSectionText((current) => ({
            ...current,
            identity: `${JSON.stringify(nextAssembly.identity, null, 4)}\n`,
            roles: `${JSON.stringify(nextAssembly.roles, null, 4)}\n`,
            views: `${JSON.stringify(nextAssembly.views, null, 4)}\n`,
        }));
        setSectionErrors((current) => ({ ...current, identity: undefined }));
        setImportStatus(null);
        setPublicationNotice(null);
    }

    function updateBuilderMetadataField(field: "assemblyClass" | "compositionLevel", value: string | number) {
        const nextBuilderMetadata = {
            ...draftAssembly.builderMetadata,
            [field]: value,
        };
        const nextAssembly = updateAssemblySection(draftAssembly, "builderMetadata", nextBuilderMetadata);
        setDraftAssembly(nextAssembly);
        setSectionText((current) => ({
            ...current,
            builderMetadata: `${JSON.stringify(nextAssembly.builderMetadata, null, 4)}\n`,
        }));
        setSectionErrors((current) => ({ ...current, builderMetadata: undefined }));
        setImportStatus(null);
        setPublicationNotice(null);
    }

    function updateSection(sectionKey: AssemblySectionKey, value: string) {
        setSectionText((current) => ({ ...current, [sectionKey]: value }));
        setPublicationNotice(null);
        setImportStatus(null);

        try {
            const parsedSection = JSON.parse(value) as unknown;
            const nextAssembly = updateAssemblySection(draftAssembly, sectionKey, parsedSection);
            setDraftAssembly(nextAssembly);
            setSectionErrors((current) => ({ ...current, [sectionKey]: undefined }));
        } catch (error) {
            setSectionErrors((current) => ({
                ...current,
                [sectionKey]: error instanceof Error ? error.message : String(error),
            }));
        }
    }

    function handleBlankDraft() {
        const blank = buildBlankAssembly({
            name: "Draft Assembly",
            slug: "draft-assembly",
            description: "New builder-authored assembly.",
            assemblyClass: "reference-template",
            compositionLevel: 1,
        });
        requestDraftReplacement({
            assembly: blank,
            selectedTemplateSlug: blank.identity.slug,
            title: "Discard current draft changes?",
            description: "Switch to a new blank draft and discard any unsaved edits in the current authoring session.",
        });
        setPublicationNotice(null);
    }

    function handleCloneSelected() {
        const selected = registeredArtifacts.find((artifact) => artifact.assembly.identity.slug === selectedTemplateSlug);
        if (!selected) {
            return;
        }

        requestDraftReplacement({
            assembly: cloneAssemblyDraft(selected.assembly),
            selectedTemplateSlug: selected.assembly.identity.slug,
            title: "Discard current draft changes?",
            description: `Load ${selected.assembly.identity.slug} into the studio and discard the current unsaved draft edits.`,
        });
        setPublicationNotice(null);
    }

    async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            const parsedAssembly = parseAssemblyDocument(JSON.parse(text), file.name);
            requestDraftReplacement({
                assembly: parsedAssembly,
                selectedTemplateSlug: parsedAssembly.identity.slug,
                title: "Discard current draft changes?",
                description: `Import ${file.name} and replace the current draft with the parsed document.`,
                importStatus: `Imported ${file.name}`,
            });
        } catch (error) {
            setImportStatus(error instanceof Error ? error.message : String(error));
        }

        event.target.value = "";
    }

    function handleLoadRegisteredAssembly(slug: string) {
        const selected = registeredArtifacts.find((artifact) => artifact.assembly.identity.slug === slug);
        if (!selected) {
            return;
        }

        requestDraftReplacement({
            assembly: cloneAssemblyDraft(selected.assembly),
            selectedTemplateSlug: slug,
            title: "Discard current draft changes?",
            description: `Load the registered assembly ${slug} into the studio and discard the current unsaved draft edits.`,
        });
        setPublicationNotice(null);
    }

    async function handleExport() {
        if (hasSyntaxErrors) {
            setPublicationNotice({
                kind: "error",
                title: "Cannot export while section JSON is invalid.",
                details: ["Fix the highlighted JSON parse errors before exporting the draft document."],
            });
            return;
        }

        const blob = new Blob([serializeAssemblyDocument(draftAssembly)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${draftAssembly.identity.slug || "assembly"}.reference.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    async function handlePublish() {
        if (hasSyntaxErrors) {
            setPublicationNotice({
                kind: "error",
                title: "Cannot publish with invalid section JSON.",
                details: ["Resolve the section parse errors before publishing the draft into the workspace registry."],
            });
            return;
        }

        if (!draftArtifact.publication.ok) {
            setPublicationNotice({
                kind: "error",
                title: "Publication checks failed.",
                details: draftArtifact.publication.issues.map((issue) => `${issue.path}: ${issue.message}`),
            });
            return;
        }

        setIsPublishing(true);
        setPublicationNotice(null);

        startTransition(async () => {
            try {
                const result = await publishAssemblyAction(serializeAssemblyDocument(draftAssembly));

                if (!result.ok) {
                    setPublicationNotice({
                        kind: "error",
                        title: "Publication failed.",
                        details: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
                    });
                    return;
                }

                setPublicationNotice({
                    kind: "success",
                    title: `Published ${result.slug}.`,
                    details: [
                        `Created ${result.outputPath}`,
                        `Updated ${result.registryPath}`,
                    ],
                    prototypePath: result.prototypePath,
                });
                setSavedAssemblyJson(serializeAssemblyDocument(result.assembly));
                setSavedSectionText(buildAssemblySectionText(result.assembly));
                setRegisteredArtifacts((current) => [
                    ...current,
                    buildDraftRegisteredAssembly(result.assembly, current.map((artifact) => artifact.assembly)),
                ]);
                setSelectedTemplateSlug(result.slug);
            } catch (error) {
                setPublicationNotice({
                    kind: "error",
                    title: "Publication failed.",
                    details: [error instanceof Error ? error.message : String(error)],
                });
            } finally {
                setIsPublishing(false);
            }
        });
    }

    function requestUnregister(slug: string) {
        setPendingUnregisterIntent({
            slug,
            deleteFile: deleteOnUnregister,
        });
        setPublicationNotice(null);
    }

    function cancelUnregister() {
        setPendingUnregisterIntent(null);
    }

    async function handleUnregister(slug: string, shouldDeleteFile: boolean) {
        setIsUnregistering(true);
        setPublicationNotice(null);

        startTransition(async () => {
            try {
                const result = await unregisterAssemblyAction(slug, shouldDeleteFile);

                if (!result.ok) {
                    setPublicationNotice({
                        kind: "error",
                        title: "Unregister failed.",
                        details: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
                    });
                    return;
                }

                setRegisteredArtifacts((current) => current.filter((artifact) => artifact.assembly.identity.slug !== slug));
                const remainingArtifacts = registeredArtifacts.filter((artifact) => artifact.assembly.identity.slug !== slug);
                setSelectedTemplateSlug((current) => {
                    if (current !== slug) {
                        return current;
                    }

                    return remainingArtifacts[0]?.assembly.identity.slug ?? "";
                });
                setPublicationNotice({
                    kind: "success",
                    title: `Unregistered ${result.slug}.`,
                    details: [
                        `Updated ${result.registryPath}`,
                        result.deletedFile ? `Deleted ${result.outputPath}` : `Kept ${result.outputPath}`,
                    ],
                });
                setPendingUnregisterIntent(null);
            } catch (error) {
                setPublicationNotice({
                    kind: "error",
                    title: "Unregister failed.",
                    details: [error instanceof Error ? error.message : String(error)],
                });
            } finally {
                setIsUnregistering(false);
            }
        });
    }

    return (
        <div className="space-y-10">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <div className="space-y-6">
                    <Card className="p-6 space-y-6">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">Builder Authoring UI</p>
                            <h1 className="text-5xl font-bold text-black mb-4">Assembly Authoring Studio</h1>
                            <p className="text-lg text-black max-w-3xl">
                                Edit a draft assembly, validate it against the live parser and registry rules, preview the derived assembly shell, and publish a new registered prototype into the workspace.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField label="Assembly Name" inputId="authoring-name-input">
                                <Input
                                    id="authoring-name-input"
                                    data-testid="authoring-name-input"
                                    value={draftAssembly.identity.name}
                                    onChange={(event) => updateIdentityField("name", event.target.value)}
                                />
                            </FormField>
                            <FormField label="Assembly Slug" inputId="authoring-slug-input">
                                <Input
                                    id="authoring-slug-input"
                                    data-testid="authoring-slug-input"
                                    value={draftAssembly.identity.slug}
                                    onChange={(event) => updateIdentityField("slug", toSlug(event.target.value))}
                                />
                            </FormField>
                            <FormField label="Description" className="md:col-span-2" inputId="authoring-description-input">
                                <Input
                                    id="authoring-description-input"
                                    value={draftAssembly.identity.description ?? ""}
                                    onChange={(event) => updateIdentityField("description", event.target.value)}
                                />
                            </FormField>
                            <FormField label="Assembly Class" inputId="authoring-assembly-class-input">
                                <Input
                                    id="authoring-assembly-class-input"
                                    value={draftAssembly.builderMetadata.assemblyClass}
                                    onChange={(event) => updateBuilderMetadataField("assemblyClass", event.target.value)}
                                />
                            </FormField>
                            <FormField label="Composition Level" inputId="authoring-composition-level-select">
                                <select
                                    id="authoring-composition-level-select"
                                    value={draftAssembly.builderMetadata.compositionLevel}
                                    onChange={(event) => updateBuilderMetadataField("compositionLevel", Number(event.target.value) as 1 | 2 | 3)}
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-gray-400"
                                >
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                </select>
                            </FormField>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,1fr,auto]">
                            <FormField label="Clone Existing Assembly" inputId="authoring-clone-select">
                                <select
                                    id="authoring-clone-select"
                                    data-testid="authoring-clone-select"
                                    value={selectedTemplateSlug}
                                    onChange={(event) => setSelectedTemplateSlug(event.target.value)}
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-gray-400"
                                >
                                    {registeredArtifacts.map((artifact) => (
                                        <option key={artifact.assembly.identity.slug} value={artifact.assembly.identity.slug}>
                                            {artifact.assembly.identity.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Import Assembly JSON" inputId="authoring-import-json-input">
                                <Input id="authoring-import-json-input" type="file" accept="application/json" onChange={handleImportFile} />
                            </FormField>
                            <div className="flex items-end gap-3">
                                <Button type="button" data-testid="authoring-blank-button" onClick={handleBlankDraft}>New Blank Draft</Button>
                                <Button type="button" data-testid="authoring-clone-button" onClick={handleCloneSelected}>Clone</Button>
                            </div>
                        </div>

                        {importStatus ? (
                            <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-black">
                                {importStatus}
                            </div>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                            <Button type="button" data-testid="authoring-export-button" onClick={handleExport}>Export JSON</Button>
                            <Button type="button" data-testid="authoring-publish-button" onClick={handlePublish} disabled={isPublishing}>
                                {isPublishing ? "Publishing..." : "Publish and Register"}
                            </Button>
                            <Link href="/builders/prototype" className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                                Registered Prototypes
                            </Link>
                        </div>

                        {publicationNotice ? (
                            <div className={`rounded border px-4 py-3 text-sm ${publicationNotice.kind === "success"
                                ? "border-green-200 bg-green-50 text-green-800"
                                : "border-red-200 bg-red-50 text-red-700"
                                }`}>
                                <p className="font-semibold">{publicationNotice.title}</p>
                                <div className="mt-2 space-y-1">
                                    {publicationNotice.details.map((detail) => (
                                        <p key={detail}>{detail}</p>
                                    ))}
                                </div>
                                {publicationNotice.prototypePath ? (
                                    <div className="mt-3">
                                        <Link href={publicationNotice.prototypePath} className="font-semibold underline underline-offset-4">
                                            Open published prototype
                                        </Link>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {pendingDraftReplacement ? (
                            <div
                                data-testid="discard-draft-confirmation"
                                className="rounded border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
                            >
                                <p className="font-semibold">{pendingDraftReplacement.title}</p>
                                <p className="mt-2">{pendingDraftReplacement.description}</p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        data-testid="discard-draft-cancel-button"
                                        onClick={cancelDraftReplacement}
                                    >
                                        Keep Editing
                                    </Button>
                                    <Button
                                        type="button"
                                        data-testid="discard-draft-confirm-button"
                                        onClick={confirmDraftReplacement}
                                    >
                                        Discard and Continue
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </Card>

                    {hasSyntaxErrors ? (
                        <Card className="p-4 border-red-200">
                            <p className="text-sm font-semibold text-red-700">Draft has pending JSON parse errors.</p>
                            <p className="mt-1 text-sm text-red-700">
                                Live preview and export use the last valid parsed draft until the highlighted section errors are resolved.
                            </p>
                        </Card>
                    ) : null}

                    <div className="grid grid-cols-1 gap-5">
                        {ASSEMBLY_SECTION_KEYS.map((sectionKey) => (
                            <JsonSectionEditor
                                key={sectionKey}
                                sectionKey={sectionKey}
                                label={sectionKey}
                                value={sectionText[sectionKey]}
                                onChange={updateSection}
                                syntaxError={sectionErrors[sectionKey]}
                                issues={issuesBySection[sectionKey]}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    <Card className="p-6 space-y-4 sticky top-6">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Publication Readiness</p>
                            <h2 className="text-2xl font-bold text-black">Draft Status</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-black">
                            <div className="rounded border border-neutral-200 p-3">
                                <p className="text-xs uppercase tracking-widest text-neutral-500">Structural validation</p>
                                <p className={structuralReady ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                                    {structuralReady ? "Valid" : "Invalid"}
                                </p>
                            </div>
                            <div className="rounded border border-neutral-200 p-3">
                                <p className="text-xs uppercase tracking-widest text-neutral-500">Publication</p>
                                <p className={publicationReady ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                                    {publicationReady ? "Ready" : "Blocked"}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-black">
                            <p>Slug: <span className="font-mono">{draftAssembly.identity.slug}</span></p>
                            <p>Id: <span className="font-mono">{draftAssembly.identity.id}</span></p>
                            <p>Roles: <span className="font-mono">{draftArtifact.model.roles.length}</span></p>
                            <p>Mechanisms: <span className="font-mono">{draftArtifact.model.mechanisms.length}</span></p>
                            <p>Networks: <span className="font-mono">{draftAssembly.identity.networkTargets.join(", ")}</span></p>
                        </div>

                        <SectionIssueList issues={draftArtifact.publication.issues} />
                        {hasSyntaxErrors ? (
                            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                Section JSON parse errors are pending. Export and publication are blocked until those edits are resolved.
                            </div>
                        ) : null}
                    </Card>

                    <Card className="p-6 space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Publish Preflight</p>
                            <h2 className="text-2xl font-bold text-black">Workspace Write Plan</h2>
                        </div>

                        <div className="space-y-2 text-sm text-black">
                            <p>Draft dirty: <span className="font-mono">{hasUnsavedChanges ? "yes" : "no"}</span></p>
                            <p>Section JSON parse state: <span className="font-mono">{hasSyntaxErrors ? "blocked" : "clean"}</span></p>
                            <p>Structural validation: <span className="font-mono">{draftArtifact.validation.ok ? "passing" : "failing"}</span></p>
                            <p>Registry collision status: <span className="font-mono">{duplicateIdentityIssues.length > 0 ? "conflict" : "clear"}</span></p>
                            <p>Assembly document path: <span className="font-mono">{assemblyOutputPath}</span></p>
                            <p>Registry source path: <span className="font-mono">{registryOutputPath}</span></p>
                            <p>Prototype route: <span className="font-mono">{prototypeOutputPath}</span></p>
                        </div>

                        {duplicateIdentityIssues.length > 0 ? (
                            <div className="space-y-2">
                                {duplicateIdentityIssues.map((issue) => (
                                    <div key={`${issue.path}-${issue.message}`} className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                                        <p className="font-semibold">{issue.message}</p>
                                        <p className="opacity-80">{issue.path}</p>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className={`rounded border px-3 py-2 text-sm ${publicationReady ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                            {publicationReady
                                ? "Publish is ready: this will write the authored JSON document and register it in assembly.ts."
                                : "Publish is blocked: resolve the listed validation or parse issues before writing workspace files."}
                        </div>
                    </Card>

                    <Card className="p-6 space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Publication and Registration Flow</p>
                            <h2 className="text-2xl font-bold text-black">Registered Assemblies</h2>
                            <p className="text-sm text-neutral-600 mt-2">
                                Load a registered assembly into the studio or remove it from the workspace registry. This uses the same source mutation path as CLI registration.
                            </p>
                        </div>

                        <label className="flex items-center gap-3 text-sm text-black">
                            <input
                                type="checkbox"
                                checked={deleteOnUnregister}
                                onChange={(event) => setDeleteOnUnregister(event.target.checked)}
                            />
                            Delete the authored JSON file when unregistering
                        </label>

                        <div className="space-y-3">
                            {registeredArtifacts.map((artifact) => (
                                <RegisteredAssemblyRow
                                    key={artifact.assembly.identity.slug}
                                    artifact={artifact}
                                    selected={artifact.assembly.identity.slug === selectedTemplateSlug}
                                    deleteOnUnregister={deleteOnUnregister}
                                    pending={isUnregistering}
                                    onLoad={handleLoadRegisteredAssembly}
                                    onUnregister={requestUnregister}
                                />
                            ))}
                        </div>

                        {pendingUnregisterIntent ? (
                            <div
                                data-testid="unregister-confirmation"
                                className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                            >
                                <p className="font-semibold">Confirm unregister</p>
                                <p className="mt-2">
                                    Remove <span className="font-mono">{pendingUnregisterIntent.slug}</span> from the registered assembly set.
                                </p>
                                <p className="mt-1">
                                    {pendingUnregisterIntent.deleteFile
                                        ? "The authored JSON document will also be deleted from lib/shared/assemblies/."
                                        : "The authored JSON document will be kept on disk."}
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        data-testid="unregister-cancel-button"
                                        onClick={cancelUnregister}
                                        disabled={isUnregistering}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        data-testid="unregister-confirm-button"
                                        onClick={() => handleUnregister(pendingUnregisterIntent.slug, pendingUnregisterIntent.deleteFile)}
                                        disabled={isUnregistering}
                                    >
                                        {isUnregistering
                                            ? "Unregistering..."
                                            : pendingUnregisterIntent.deleteFile
                                                ? "Confirm Unregister and Delete"
                                                : "Confirm Unregister"}
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </Card>

                    <Card className="p-6 space-y-6">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Live Preview</p>
                            <h2 className="text-2xl font-bold text-black">Derived Assembly Shell</h2>
                            <p className="text-sm text-neutral-600 mt-2">
                                The preview below reuses the same derived assembly workspace used by published prototype routes.
                            </p>
                        </div>

                        <RegisteredAssemblyWorkspace
                            artifact={{
                                assembly: draftArtifact.assembly,
                                validation: draftArtifact.validation,
                                model: draftArtifact.model,
                                riskBoundaries: draftArtifact.riskBoundaries,
                            }}
                            shellLabel="draft-preview"
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}