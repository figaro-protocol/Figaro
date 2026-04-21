import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                <h1 className="text-6xl font-bold text-black mb-4">404</h1>
                <h2 className="text-xl font-semibold text-black mb-3">
                    Page not found
                </h2>
                <p className="text-gray-500 mb-8">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-black text-white font-semibold rounded-md hover:bg-gray-800 transition-colors"
                >
                    Back to home
                </Link>
            </div>
        </div>
    );
}
