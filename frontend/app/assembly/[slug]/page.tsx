import { AssemblyPageShell } from "./AssemblyPageShell";

interface Props {
    params: { slug: string };
}

export default function AssemblyPage({ params }: Props) {
    return <AssemblyPageShell slug={params.slug} />;
}
