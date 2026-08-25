"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="p-6 text-center">
                    <h2 className="text-lg font-semibold text-ink-primary mb-2">Something went wrong</h2>
                    <p className="text-ink-muted text-sm mb-4">
                        {this.state.error?.message ?? "An unexpected error occurred."}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-4 py-2 bg-ink-heading text-paper rounded-lg text-sm hover:bg-ink-primary"
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
