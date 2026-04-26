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
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white border border-gray-300 rounded-lg p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-6">
                    <AlertTriangle className="w-8 h-8 text-black" aria-hidden="true" />
                </div>

                <h2 className="text-2xl font-bold text-black mb-3">
                    Something went wrong
                </h2>

                <p className="text-gray-700 mb-6">
                    An unexpected error occurred while loading this page.
                    {error.digest && (
                        <span className="block text-xs text-gray-500 mt-2">
                            Error ID: {error.digest}
                        </span>
                    )}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-white border border-gray-300 text-black font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Try again
                    </button>

                    <a
                        href="/"
                        className="px-6 py-3 bg-white border border-gray-300 text-black font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Go home
                    </a>
                </div>

                {process.env.NODE_ENV === 'development' && (
                    <details className="mt-6 text-left">
                        <summary className="text-sm text-gray-500 cursor-pointer hover:text-black">
                            Error details (dev only)
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-100 rounded-sm text-xs text-gray-700 overflow-x-auto">
                            {error.message}
                            {error.stack && `\n\n${error.stack}`}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    )
}
