export default function Loading() {
    return (
        <main className="min-h-screen bg-white">
            <div className="container mx-auto px-4 sm:px-6 py-10 max-w-2xl space-y-8">
                <div className="h-8 w-32 bg-gray-100 animate-pulse rounded" />
                <div className="h-4 w-72 bg-gray-50 animate-pulse rounded" />
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-40 bg-gray-50 animate-pulse rounded-lg border border-gray-200" />
                    ))}
                </div>
            </div>
        </main>
    );
}
