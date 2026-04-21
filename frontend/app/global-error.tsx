'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Copy, Check } from 'lucide-react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // Log critical error
        console.error('Global error:', error)
    }, [error])

    const copyError = () => {
        const text = `Error: ${error.message}${error.digest ? `\nDigest: ${error.digest}` : ''}\n${error.stack ?? ''}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <html lang="en">
            <body className="bg-white text-black">
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-white border border-gray-300 rounded-lg p-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-6">
                            <AlertTriangle className="w-8 h-8 text-black" aria-hidden="true" />
                        </div>

                        <h2 className="text-2xl font-bold mb-3">
                            Critical Error
                        </h2>

                        <p className="text-gray-700 mb-6">
                            A critical error occurred. Please refresh the page to continue.
                            {error.digest && (
                                <span className="block text-xs text-gray-500 mt-2">
                                    Error ID: {error.digest}
                                </span>
                            )}
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={reset}
                                className="px-6 py-3 bg-white border border-gray-300 text-black font-semibold rounded-lg"
                            >
                                Try again
                            </button>

                            <button
                                onClick={copyError}
                                className="px-6 py-3 bg-white border border-gray-300 text-black font-semibold rounded-lg inline-flex items-center justify-center gap-2"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied' : 'Copy Error Details'}
                            </button>

                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-6 py-3 bg-white border border-gray-300 text-black font-semibold rounded-lg"
                            >
                                Go home
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}
