import { InstitutionPageShell } from "./InstitutionPageShell";

interface Props {
    params: {
        slug: string;
    };
}

export default function InstitutionSlugPage({ params }: Props) {
    return (
        <section className="max-w-6xl mx-auto">
            <InstitutionPageShell slug={params.slug} />
        </section>
    );
}
