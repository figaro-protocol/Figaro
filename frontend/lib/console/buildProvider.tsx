"use client";

/**
 * BuildProvider — React context for the building side of the console.
 *
 * Manages:
 * - Assembly drafts (create, edit, validate, publish)
 * - Queued build mutations that feed into the shared ActionQueue
 * - Schema registration proposals
 *
 * Shares the ActionQueue from FigaroProvider via the enqueueAction callback.
 */

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import type { InstitutionAssembly } from "@/lib/shared/institutionAssembly";
import { buildBlankInstitutionAssembly, cloneInstitutionAssemblyDraft } from "@/lib/shared/institutionAssemblyDraft";
import { validateInstitutionAssembly, type AssemblyValidationResult } from "@/lib/shared/institutionAssemblyValidation";
import { listInstitutionAssemblies } from "@/lib/shared/institutionAssemblyRegistry";
import type { ConsoleQueueItem } from "@/lib/console/consoleQueue";

// ── Build action types (parallel to ProposedAction on the operating side) ───

export type BuildActionType =
    | "publish-assembly"
    | "register-schema";

export interface BuildAction {
    type: BuildActionType;
    description: string;
    /** Assembly slug this action targets. */
    slug: string;
}

export interface PublishAssemblyAction extends BuildAction {
    type: "publish-assembly";
    assembly: InstitutionAssembly;
}

export interface RegisterSchemaAction extends BuildAction {
    type: "register-schema";
    schemaKey: string;
    version: number;
}

export type QueuedBuildAction = PublishAssemblyAction | RegisterSchemaAction;

// ── Draft state ─────────────────────────────────────────────────────────────

export interface AssemblyDraft {
    assembly: InstitutionAssembly;
    validation: AssemblyValidationResult | null;
    dirty: boolean;
}

// ── Context shape ───────────────────────────────────────────────────────────

interface BuildProviderState {
    /** All registered (published) assemblies. */
    registeredAssemblies: InstitutionAssembly[];

    /** In-progress drafts keyed by slug. */
    drafts: Map<string, AssemblyDraft>;
    /** Currently selected draft slug. */
    selectedDraftSlug: string | null;
    /** The selected draft (convenience). */
    selectedDraft: AssemblyDraft | null;

    /** Create a new blank draft. */
    createDraft: (name: string, slug: string) => void;
    /** Clone a registered assembly into a draft. */
    forkAssembly: (slug: string) => void;
    /** Select a draft for editing. */
    selectDraft: (slug: string | null) => void;
    /** Update a draft's assembly. Marks as dirty. */
    updateDraft: (slug: string, assembly: InstitutionAssembly) => void;
    /** Validate the selected draft. */
    validateDraft: (slug: string) => AssemblyValidationResult;
    /** Delete a draft. */
    deleteDraft: (slug: string) => void;

    /** Update a specific section of the selected draft via JSON text. */
    updateDraftSection: (slug: string, section: string, jsonText: string) => boolean;
}

const BuildCtx = createContext<BuildProviderState | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function BuildProvider({
    children,
    queueItems = [],
}: {
    children: ReactNode;
    queueItems?: ConsoleQueueItem[];
}) {
    const [registeredAssemblies, setRegisteredAssemblies] = useState<InstitutionAssembly[]>(() => listInstitutionAssemblies());
    const appliedExecutedBuildItems = useRef<Set<number>>(new Set());

    const [drafts, setDrafts] = useState<Map<string, AssemblyDraft>>(new Map());
    const [selectedDraftSlug, setSelectedDraftSlug] = useState<string | null>(null);

    const selectedDraft = selectedDraftSlug ? drafts.get(selectedDraftSlug) ?? null : null;

    useEffect(() => {
        const executedPublications = queueItems.filter((item) => {
            if (item.entry.kind !== "building") return false;
            if (item.entry.action.type !== "publish-assembly") return false;
            if (item.status !== "executed") return false;
            return !appliedExecutedBuildItems.current.has(item.id);
        });

        if (executedPublications.length === 0) return;

        setRegisteredAssemblies((current) => {
            const next = new Map(current.map((assembly) => [assembly.identity.slug, assembly]));

            for (const item of executedPublications) {
                const action = item.entry.action;
                if (action.type !== "publish-assembly") continue;
                next.set(action.slug, action.assembly);
            }

            return [...next.values()];
        });

        setDrafts((current) => {
            const next = new Map(current);

            for (const item of executedPublications) {
                const action = item.entry.action;
                if (action.type !== "publish-assembly") continue;
                const existing = next.get(action.slug);
                if (!existing) continue;
                next.set(action.slug, {
                    ...existing,
                    assembly: action.assembly,
                    dirty: false,
                });
            }

            return next;
        });

        for (const item of executedPublications) {
            appliedExecutedBuildItems.current.add(item.id);
        }
    }, [queueItems]);

    const createDraft = useCallback((name: string, slug: string) => {
        const assembly = buildBlankInstitutionAssembly({ name, slug });
        setDrafts((prev) => {
            const next = new Map(prev);
            next.set(slug, { assembly, validation: null, dirty: true });
            return next;
        });
        setSelectedDraftSlug(slug);
    }, []);

    const forkAssembly = useCallback((slug: string) => {
        const source = registeredAssemblies.find((a) => a.identity.slug === slug);
        if (!source) return;
        const forkedSlug = `${slug}-fork`;
        const assembly = cloneInstitutionAssemblyDraft(source);
        assembly.identity = {
            ...assembly.identity,
            id: `${assembly.identity.id}-fork`,
            slug: forkedSlug,
            name: `${assembly.identity.name} (Fork)`,
        };
        setDrafts((prev) => {
            const next = new Map(prev);
            next.set(forkedSlug, { assembly, validation: null, dirty: true });
            return next;
        });
        setSelectedDraftSlug(forkedSlug);
    }, [registeredAssemblies]);

    const selectDraft = useCallback((slug: string | null) => {
        setSelectedDraftSlug(slug);
    }, []);

    const updateDraft = useCallback((slug: string, assembly: InstitutionAssembly) => {
        setDrafts((prev) => {
            const next = new Map(prev);
            const existing = next.get(slug);
            next.set(slug, { assembly, validation: existing?.validation ?? null, dirty: true });
            return next;
        });
    }, []);

    const validateDraft = useCallback((slug: string): AssemblyValidationResult => {
        const draft = drafts.get(slug);
        if (!draft) return { ok: false, issues: [{ severity: "error" as const, message: "Draft not found", path: "identity" }] };
        const result = validateInstitutionAssembly(draft.assembly);
        setDrafts((prev) => {
            const next = new Map(prev);
            next.set(slug, { ...draft, validation: result });
            return next;
        });
        return result;
    }, [drafts]);

    const deleteDraft = useCallback((slug: string) => {
        setDrafts((prev) => {
            const next = new Map(prev);
            next.delete(slug);
            return next;
        });
        if (selectedDraftSlug === slug) {
            setSelectedDraftSlug(null);
        }
    }, [selectedDraftSlug]);

    const updateDraftSection = useCallback((slug: string, section: string, jsonText: string): boolean => {
        const draft = drafts.get(slug);
        if (!draft) return false;
        try {
            const parsed = JSON.parse(jsonText);
            const updated = { ...draft.assembly, [section]: parsed };
            updateDraft(slug, updated as InstitutionAssembly);
            return true;
        } catch {
            return false;
        }
    }, [drafts, updateDraft]);

    const value: BuildProviderState = {
        registeredAssemblies,
        drafts,
        selectedDraftSlug,
        selectedDraft,
        createDraft,
        forkAssembly,
        selectDraft,
        updateDraft,
        validateDraft,
        deleteDraft,
        updateDraftSection,
    };

    return <BuildCtx.Provider value={value}>{children}</BuildCtx.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useBuilder(): BuildProviderState {
    const ctx = useContext(BuildCtx);
    if (!ctx) throw new Error("useBuilder must be used within <BuildProvider>");
    return ctx;
}
