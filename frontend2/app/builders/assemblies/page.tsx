import { AssemblyInspector } from "@/components/core/AssemblyInspector";
import { listRegisteredAssemblies } from "@/lib/shared/assemblyRegistry";
import Link from "next/link";

export default function BuilderAssembliesPage() {
    const artifacts = listRegisteredAssemblies();

    return (
        <section className="container mx-auto px-4 py-20">
            <div className="mx-auto mb-12 max-w-5xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Assemblies
                </p>
                <h1 className="mb-4 text-5xl font-bold text-black">Browse Assemblies</h1>
                <p className="mb-4 max-w-3xl text-lg text-black">
                    An assembly is a packaged configuration of roles, mechanisms, policies,
                    and UI surfaces that the runtime renders into a live process. Each assembly
                    below was validated against the{" "}
                    <Link href="/builders" className="underline hover:text-neutral-600">
                        assembly schema
                    </Link>{" "}
                    and projected into a derived assembly model.
                </p>
                <p className="max-w-3xl text-sm text-neutral-600">
                    Inspect the role definitions, mechanism bindings, module layouts, and risk boundaries
                    for each assembly. When ready, prototype a live instance from any assembly.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                        href="/builders"
                        className="inline-flex rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                        Back to Builders
                    </Link>
                </div>
            </div>

            <div className="mx-auto max-w-5xl space-y-10">
                {artifacts.map((artifact) => (
                    <AssemblyInspector
                        key={artifact.assembly.identity.id}
                        assembly={artifact.assembly}
                        validation={artifact.validation}
                        model={artifact.model}
                        riskBoundaries={artifact.riskBoundaries}
                    />
                ))}
            </div>
        </section>
    );
}