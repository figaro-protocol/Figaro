import type { PublishAssemblyResult } from "@/lib/shared/assemblyPublication";
import type {
    PublishAssemblyAction,
    RegisterSchemaAction,
    QueuedBuildAction,
} from "@/lib/console/buildProvider";
import type { Hex } from "viem";

export interface LocalPublishedAssemblyResult {
    published: true;
    mode: "local";
    slug: string;
    assembly: PublishAssemblyAction["assembly"];
    prototypePath: string;
    localStorageKey: string;
    fallbackReason?: string;
}

export interface WorkspacePublishedAssemblyResult {
    published: true;
    mode: "workspace";
    slug: string;
    assembly: PublishAssemblyAction["assembly"];
    prototypePath: string;
    outputPath: string;
    registryPath: string;
}

export interface RegisteredSchemaResult {
    registered: true;
    schemaKey: string;
    version: number;
}

export type BuildActionExecutionResult =
    | LocalPublishedAssemblyResult
    | WorkspacePublishedAssemblyResult
    | RegisteredSchemaResult;

export interface BuildActionExecutionOutcome {
    txHash?: Hex;
    result: BuildActionExecutionResult;
}

export interface BuildActionExecutorDeps {
    registerSchema: (action: RegisterSchemaAction) => Promise<Hex>;
    publishAssembly: (action: PublishAssemblyAction) => Promise<PublishAssemblyResult>;
}

function formatPublicationIssues(result: Extract<PublishAssemblyResult, { ok: false }>): string {
    return result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" | ");
}

export function publishAssemblyToLocalRegistry(action: PublishAssemblyAction): LocalPublishedAssemblyResult {
    const localStorageKey = `figaro:assembly:${action.slug}`;
    localStorage.setItem(localStorageKey, JSON.stringify(action.assembly));

    return {
        published: true,
        mode: "local",
        slug: action.slug,
        assembly: action.assembly,
        prototypePath: `/i/${action.slug}`,
        localStorageKey,
    };
}

export async function executeBuildAction(
    action: QueuedBuildAction,
    deps: BuildActionExecutorDeps,
): Promise<BuildActionExecutionOutcome> {
    if (action.type === "register-schema") {
        const txHash = await deps.registerSchema(action);
        return {
            txHash,
            result: {
                registered: true,
                schemaKey: action.schemaKey,
                version: action.version,
            },
        };
    }

    if (action.type === "publish-assembly") {
        let published: PublishAssemblyResult;

        try {
            published = await deps.publishAssembly(action);
        } catch (error) {
            const fallback = publishAssemblyToLocalRegistry(action);
            return {
                result: {
                    ...fallback,
                    fallbackReason: error instanceof Error ? error.message : String(error),
                },
            };
        }

        if (!published.ok) {
            throw new Error(formatPublicationIssues(published));
        }

        return {
            result: {
                published: true,
                mode: "workspace",
                slug: published.slug,
                assembly: published.assembly,
                prototypePath: published.prototypePath,
                outputPath: published.outputPath,
                registryPath: published.registryPath,
            },
        };
    }

    const unreachable: never = action;
    throw new Error(`Unsupported build action: ${String(unreachable)}`);
}