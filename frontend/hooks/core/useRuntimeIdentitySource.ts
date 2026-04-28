"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    DEFAULT_RUNTIME_IDENTITY_SERVICE,
    type RuntimeIdentityService,
} from '@/lib/shared/runtimeIdentityService';

export type RuntimeSourceStatus = 'bundled' | 'loading' | 'remote' | 'error';

interface Options {
    runtimeIdentityUrl?: string;
    service?: RuntimeIdentityService;
}

export function useRuntimeIdentitySource({
    runtimeIdentityUrl,
    service = DEFAULT_RUNTIME_IDENTITY_SERVICE,
}: Options) {
    const [identityUrlInputValue, setIdentityUrlInputValue] = useState(runtimeIdentityUrl ?? '');
    const [activeRuntimeIdentityUrl, setActiveRuntimeIdentityUrl] = useState<string | undefined>(runtimeIdentityUrl);
    const [remoteRuntimeSource, setRemoteRuntimeSource] = useState<RuntimeIdentityDataSource | null>(null);
    const [runtimeSourceStatus, setRuntimeSourceStatus] = useState<RuntimeSourceStatus>('bundled');
    const [runtimeSourceError, setRuntimeSourceError] = useState<string | null>(null);
    const fallbackRuntimeSource = useMemo(() => service.getFallbackSource(), [service]);

    useEffect(() => {
        setIdentityUrlInputValue(runtimeIdentityUrl ?? '');
        setActiveRuntimeIdentityUrl(runtimeIdentityUrl);
    }, [runtimeIdentityUrl]);

    useEffect(() => {
        let cancelled = false;

        if (!activeRuntimeIdentityUrl) {
            setRemoteRuntimeSource(null);
            setRuntimeSourceStatus('bundled');
            setRuntimeSourceError(null);
            return () => {
                cancelled = true;
            };
        }

        setRuntimeSourceStatus('loading');
        setRuntimeSourceError(null);

        service.loadSourceFromUrl(activeRuntimeIdentityUrl)
            .then((dataSource) => {
                if (cancelled) return;

                setRemoteRuntimeSource(dataSource);
                setRuntimeSourceStatus('remote');
            })
            .catch((error: unknown) => {
                if (cancelled) return;

                setRemoteRuntimeSource(null);
                setRuntimeSourceStatus('error');
                setRuntimeSourceError(error instanceof Error ? error.message : 'Failed to load runtime manifest.');
            });

        return () => {
            cancelled = true;
        };
    }, [activeRuntimeIdentityUrl, service]);

    const activeRuntimeSource = remoteRuntimeSource ?? fallbackRuntimeSource;
    const resolveAssemblyContext = useCallback((slug: string, networkTarget?: string) => (
        service.resolveAssemblyContext(slug, networkTarget, activeRuntimeSource)
    ), [activeRuntimeSource, service]);

    const applyIdentityOverride = () => {
        const normalizedValue = identityUrlInputValue.trim();
        setActiveRuntimeIdentityUrl(normalizedValue.length > 0 ? normalizedValue : undefined);
    };

    const resetIdentityOverride = () => {
        setIdentityUrlInputValue('');
        setActiveRuntimeIdentityUrl(undefined);
    };

    return {
        identityUrlInputValue,
        setIdentityUrlInputValue,
        activeRuntimeIdentityUrl,
        activeRuntimeSource,
        resolveAssemblyContext,
        runtimeSourceStatus,
        runtimeSourceError,
        applyIdentityOverride,
        resetIdentityOverride,
    };
}