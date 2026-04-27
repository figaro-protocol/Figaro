export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-2xl mx-auto space-y-4">
                <div className="h-6 w-56 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
                <div className="space-y-3 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-white animate-pulse rounded-lg border border-gray-200" />
                    ))}
                </div>
            </div>
        </div>
    );
}
