'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log error to console in development
        console.error('Page error:', error)
    }, [error])

    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-paper border border-default rounded-lg p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-subtle rounded-full mb-6">
                    <AlertTriangle className="w-8 h-8 text-ink-primary" aria-hidden="true" />
                </div>

                <h2 className="text-2xl font-bold text-ink-primary mb-3">
                    Something went wrong
                </h2>

                <p className="text-ink-body mb-6">
                    An unexpected error occurred while loading this page.
                    {error.digest && (
                        <span className="block text-xs text-ink-muted mt-2">
                            Error ID: {error.digest}
                        </span>
                    )}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-paper border border-default text-ink-primary font-semibold rounded-lg hover:bg-subtle transition-colors"
                    >
                        Try again
                    </button>

                    <a
                        href="/"
                        className="px-6 py-3 bg-paper border border-default text-ink-primary font-semibold rounded-lg hover:bg-subtle transition-colors"
                    >
                        Go home
                    </a>
                </div>

                {process.env.NODE_ENV === 'development' && (
                    <details className="mt-6 text-left">
                        <summary className="text-sm text-ink-muted cursor-pointer hover:text-ink-primary">
                            Error details (dev only)
                        </summary>
                        <pre className="mt-2 p-3 bg-subtle rounded-sm text-xs text-ink-body overflow-x-auto">
                            {error.message}
                            {error.stack && `\n\n${error.stack}`}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    )
}
