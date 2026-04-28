import Link from "next/link";
import { notFound } from "next/navigation";
import {
    getRegisteredAssemblyBySlug,
    listRegisteredAssemblies,
} from "@/lib/shared/assemblyRegistry";
import { AssemblyRuntimeView } from "./AssemblyRuntimeView";

interface Props {
    params: { slug: string };
}

export default function AssemblyInstancePage({ params }: Props) {
    const artifact = getRegisteredAssemblyBySlug(params.slug);

    if (!artifact) {
        const options = listRegisteredAssemblies();
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                    Assembly not found
                </p>
                <h1 className="text-3xl font-bold text-black mb-6">
                    No assembly registered for slug &ldquo;{params.slug}&rdquo;.
                </h1>
                <p className="text-sm text-gray-600 mb-4">Registered assemblies:</p>
                <ul className="space-y-2">
                    {options.map((a) => (
                        <li key={a.assembly.identity.slug}>
                            <Link
                                href={`/i/${a.assembly.identity.slug}`}
                                className="text-sm underline text-black hover:text-gray-600"
                            >
                                {a.assembly.identity.name}{" "}
                                <span className="text-gray-400">/{a.assembly.identity.slug}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return <AssemblyRuntimeView artifact={artifact} slug={params.slug} />;
}

export function generateStaticParams() {
    return listRegisteredAssemblies().map((a) => ({ slug: a.assembly.identity.slug }));
}
