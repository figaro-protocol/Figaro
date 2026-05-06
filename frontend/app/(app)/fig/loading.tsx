export default function Loading() {
    return (
        <div className="min-h-screen bg-canvas">
            <div className="container mx-auto px-4 sm:px-6 py-10 max-w-2xl space-y-8">
                <div className="h-8 w-32 bg-subtle animate-pulse rounded" />
                <div className="h-4 w-72 bg-subtle animate-pulse rounded" />
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-40 bg-subtle animate-pulse rounded-lg border border-default" />
                    ))}
                </div>
            </div>
        </div>
    );
}
