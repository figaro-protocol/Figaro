import { InstitutionAssembly } from "@/lib/shared/institutionAssembly";
import {
    REFERENCE_ASSEMBLY_MANIFEST,
    validateAssemblyManifest,
} from "@/lib/shared/institutionAssemblyManifest";
import {
    deriveInstitutionModelFromAssembly,
    deriveRiskBoundaryModelsFromAssembly,
} from "@/lib/semantic/deriveInstitutionFromAssembly";
import { InstitutionModel, RiskBoundaryModel } from "@/lib/semantic/models";
import { AssemblyValidationResult } from "@/lib/shared/institutionAssemblyValidation";

const MANIFEST_VALIDATION = validateAssemblyManifest(REFERENCE_ASSEMBLY_MANIFEST);
const ASSEMBLIES: InstitutionAssembly[] = REFERENCE_ASSEMBLY_MANIFEST.map((entry) => entry.assembly);

export interface RegisteredInstitutionArtifact {
    assembly: InstitutionAssembly;
    validation: AssemblyValidationResult;
    model: InstitutionModel;
    riskBoundaries: Record<string, RiskBoundaryModel>;
}

export interface InstitutionSelectorCardModel {
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

function resolveInstitutionArtifact(assembly: InstitutionAssembly): RegisteredInstitutionArtifact {
    const manifestResult = MANIFEST_VALIDATION.perAssembly.find((entry) => entry.slug === assembly.identity.slug)?.result;

    return {
        assembly,
        validation: manifestResult ?? { ok: false, issues: [{ severity: "error", path: assembly.identity.slug, message: "Assembly missing from manifest validation." }] },
        model: deriveInstitutionModelFromAssembly(assembly),
        riskBoundaries: deriveRiskBoundaryModelsFromAssembly(assembly),
    };
}

export function listInstitutionAssemblies(): InstitutionAssembly[] {
    return ASSEMBLIES;
}

export function listInstitutionArtifacts(): RegisteredInstitutionArtifact[] {
    return ASSEMBLIES.map(resolveInstitutionArtifact);
}

export function listInstitutionSelectorCards(): InstitutionSelectorCardModel[] {
    return listInstitutionArtifacts().map((artifact) => ({
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

export function getInstitutionAssemblyBySlug(slug: string): InstitutionAssembly | undefined {
    return ASSEMBLIES.find((assembly) => assembly.identity.slug === slug);
}

export function getInstitutionArtifactBySlug(slug: string): RegisteredInstitutionArtifact | undefined {
    const assembly = getInstitutionAssemblyBySlug(slug);
    return assembly ? resolveInstitutionArtifact(assembly) : undefined;
}

export function getInstitutionAssemblyById(id: string): InstitutionAssembly | undefined {
    return ASSEMBLIES.find((assembly) => assembly.identity.id === id);
}

export function getInstitutionArtifactById(id: string): RegisteredInstitutionArtifact | undefined {
    const assembly = getInstitutionAssemblyById(id);
    return assembly ? resolveInstitutionArtifact(assembly) : undefined;
}

export function validateRegisteredAssemblies() {
    return MANIFEST_VALIDATION.perAssembly;
}

export function getRegisteredAssemblyManifestValidation() {
    return MANIFEST_VALIDATION;
}