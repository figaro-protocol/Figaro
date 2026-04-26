import { BuilderAuthoringStudio } from "@/components/core/BuilderAuthoringStudio";
import { listRegisteredAssemblies } from "@/lib/shared/assemblyRegistry";

export default function BuilderAuthoringPage() {
    const artifacts = listRegisteredAssemblies();
    return <BuilderAuthoringStudio artifacts={artifacts} />;
}
