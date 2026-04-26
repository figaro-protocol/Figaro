export default function TerminalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="container mx-auto px-4 sm:px-6 py-8 space-y-6">
            {children}
        </div>
    );
}
