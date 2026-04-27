export default function Loading() {
    return (
        <div className="min-h-screen bg-white text-black">
            <div className="container mx-auto px-4 sm:px-6 py-8 space-y-6">
                <div className="h-8 w-48 bg-gray-100 animate-pulse rounded" />
                <div className="h-4 w-96 bg-gray-50 animate-pulse rounded" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 bg-gray-50 animate-pulse rounded-lg border border-gray-200" />
                    ))}
                </div>
                <div className="h-64 bg-gray-50 animate-pulse rounded-lg" />
            </div>
        </div>
    );
}
