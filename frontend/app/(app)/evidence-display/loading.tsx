export default function Loading() {
    return (
        <div className="min-h-screen bg-canvas p-4 sm:p-6">
            <div className="max-w-2xl mx-auto space-y-4">
                <div className="h-6 w-56 bg-subtle-hover animate-pulse rounded" />
                <div className="h-4 w-40 bg-subtle animate-pulse rounded" />
                <div className="space-y-3 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-paper animate-pulse rounded-lg border border-default" />
                    ))}
                </div>
            </div>
        </div>
    );
}
