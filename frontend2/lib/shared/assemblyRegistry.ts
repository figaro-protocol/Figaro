import { Assembly } from "@/lib/shared/assembly";
import {
    REFERENCE_ASSEMBLIES_INDEX,
    validateAssemblyIndex,
} from "@/lib/shared/assemblyIndex";
import {
    deriveAssemblyModel,
    deriveAssemblyRiskBoundaries,
} from "@/lib/semantic/deriveAssemblyModel";
import { AssemblyModel, RiskBoundaryModel } from "@/lib/semantic/models";
import { AssemblyValidationResult } from "@/lib/shared/assemblyValidation";

const INDEX_VALIDATION = validateAssemblyIndex(REFERENCE_ASSEMBLIES_INDEX);
const ASSEMBLIES: Assembly[] = REFERENCE_ASSEMBLIES_INDEX.map((entry) => entry.assembly);

export interface RegisteredAssembly {
    assembly: Assembly;
    validation: AssemblyValidationResult;
    model: AssemblyModel;
    riskBoundaries: Record<string, RiskBoundaryModel>;
}

export interface AssemblySelectorCardModel {
    id: string;
    slug: string;
    name: string;
    description?: string;
    assemblyClass: string;
    compositionLevel: number;
    mechanismCount: number;
    roleCount: number;
    networkTargets: string[];
    validationOk: boolean;
}

function resolveAssemblyArtifact(assembly: Assembly): RegisteredAssembly {
    const indexResult = INDEX_VALIDATION.perAssembly.find((entry) => entry.slug === assembly.identity.slug)?.result;

    return {
        assembly,
        validation: indexResult ?? { ok: false, issues: [{ severity: "error", path: assembly.identity.slug, message: "Assembly missing from index validation." }] },
        model: deriveAssemblyModel(assembly),
        riskBoundaries: deriveAssemblyRiskBoundaries(assembly),
    };
}

export function listAssemblies(): Assembly[] {
    return ASSEMBLIES;
}

export function listRegisteredAssemblies(): RegisteredAssembly[] {
    return ASSEMBLIES.map(resolveAssemblyArtifact);
}

export function listAssemblySelectorCards(): AssemblySelectorCardModel[] {
    return listRegisteredAssemblies().map((artifact) => ({
        id: artifact.assembly.identity.id,
        slug: artifact.assembly.identity.slug,
        name: artifact.assembly.identity.name,
        description: artifact.assembly.identity.description,
        assemblyClass: artifact.assembly.builderMetadata.assemblyClass,
        compositionLevel: artifact.assembly.builderMetadata.compositionLevel,
        mechanismCount: artifact.model.mechanisms.length,
        roleCount: artifact.model.roles.length,
        networkTargets: artifact.assembly.identity.networkTargets,
        validationOk: artifact.validation.ok,
    }));
}

export function getAssemblyBySlug(slug: string): Assembly | undefined {
    return ASSEMBLIES.find((assembly) => assembly.identity.slug === slug);
}

export function getRegisteredAssemblyBySlug(slug: string): RegisteredAssembly | undefined {
    const assembly = getAssemblyBySlug(slug);
    return assembly ? resolveAssemblyArtifact(assembly) : undefined;
}

export function getAssemblyById(id: string): Assembly | undefined {
    return ASSEMBLIES.find((assembly) => assembly.identity.id === id);
}

export function getRegisteredAssemblyById(id: string): RegisteredAssembly | undefined {
    const assembly = getAssemblyById(id);
    return assembly ? resolveAssemblyArtifact(assembly) : undefined;
}

export function validateRegisteredAssemblies() {
    return INDEX_VALIDATION.perAssembly;
}

export function getRegisteredAssemblyIndexValidation() {
    return INDEX_VALIDATION;
}