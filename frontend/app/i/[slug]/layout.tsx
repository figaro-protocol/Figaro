import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";
import { getInstitutionArtifactBySlug } from "@/lib/shared/institutionAssemblyRegistry";

interface Props {
    children: React.ReactNode;
    params: {
        slug: string;
    };
}

export default function InstitutionRuntimeLayout({ children, params }: Props) {
    const artifact = getInstitutionArtifactBySlug(params.slug);

    return (
        <main className="min-h-screen bg-white text-black">
            <Header />

            <div className="container mx-auto px-4 sm:px-6 py-8 space-y-6">
                {children}
                <Footer />
            </div>
        </main>
    );
}