import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";

export default function WorkbenchLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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