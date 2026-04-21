import { BuilderAuthoringStudio } from "@/components/core/BuilderAuthoringStudio";
import { listInstitutionArtifacts } from "@/lib/shared/institutionAssemblyRegistry";

export default function BuilderAuthoringPage() {
    const artifacts = listInstitutionArtifacts();
    return <BuilderAuthoringStudio artifacts={artifacts} />;
}
