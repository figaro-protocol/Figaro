import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                <h1 className="text-6xl font-bold text-ink-primary mb-4">404</h1>
                <h2 className="text-xl font-semibold text-ink-primary mb-3">
                    Page not found
                </h2>
                <p className="text-ink-muted mb-8">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-ink-primary text-paper font-semibold rounded-md hover:bg-ink-body transition-colors"
                >
                    Back to home
                </Link>
            </div>
        </div>
    );
}
