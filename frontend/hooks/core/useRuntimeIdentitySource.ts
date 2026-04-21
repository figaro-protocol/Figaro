"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    DEFAULT_RUNTIME_IDENTITY_SERVICE,
    type RuntimeIdentityService,
} from '@/lib/shared/runtimeIdentityService';

export type RuntimeSourceStatus = 'bundled' | 'loading' | 'remote' | 'error';

interface Options {
    runtimeManifestUrl?: string;
    service?: RuntimeIdentityService;
}

export function useRuntimeIdentitySource({
    runtimeManifestUrl,
    service = DEFAULT_RUNTIME_IDENTITY_SERVICE,
}: Options) {
    const [manifestInputValue, setManifestInputValue] = useState(runtimeManifestUrl ?? '');
    const [activeRuntimeManifestUrl, setActiveRuntimeManifestUrl] = useState<string | undefined>(runtimeManifestUrl);
    const [remoteRuntimeSource, setRemoteRuntimeSource] = useState<RuntimeIdentityDataSource | null>(null);
    const [runtimeSourceStatus, setRuntimeSourceStatus] = useState<RuntimeSourceStatus>('bundled');
    const [runtimeSourceError, setRuntimeSourceError] = useState<string | null>(null);
    const fallbackRuntimeSource = useMemo(() => service.getFallbackSource(), [service]);

    useEffect(() => {
        setManifestInputValue(runtimeManifestUrl ?? '');
        setActiveRuntimeManifestUrl(runtimeManifestUrl);
    }, [runtimeManifestUrl]);

    useEffect(() => {
        let cancelled = false;

        if (!activeRuntimeManifestUrl) {
            setRemoteRuntimeSource(null);
            setRuntimeSourceStatus('bundled');
            setRuntimeSourceError(null);
            return () => {
                cancelled = true;
            };
        }

        setRuntimeSourceStatus('loading');
        setRuntimeSourceError(null);

        service.loadSourceFromUrl(activeRuntimeManifestUrl)
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
    }, [activeRuntimeManifestUrl, service]);

    const activeRuntimeSource = remoteRuntimeSource ?? fallbackRuntimeSource;
    const resolveAssemblyContext = useCallback((slug: string, networkTarget?: string) => (
        service.resolveAssemblyContext(slug, networkTarget, activeRuntimeSource)
    ), [activeRuntimeSource, service]);

    const applyManifestOverride = () => {
        const normalizedValue = manifestInputValue.trim();
        setActiveRuntimeManifestUrl(normalizedValue.length > 0 ? normalizedValue : undefined);
    };

    const resetManifestOverride = () => {
        setManifestInputValue('');
        setActiveRuntimeManifestUrl(undefined);
    };

    return {
        manifestInputValue,
        setManifestInputValue,
        activeRuntimeManifestUrl,
        activeRuntimeSource,
        resolveAssemblyContext,
        runtimeSourceStatus,
        runtimeSourceError,
        applyManifestOverride,
        resetManifestOverride,
    };
}