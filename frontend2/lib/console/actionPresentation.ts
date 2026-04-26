import type { CommitSubOrderAction, ProposedAction } from "@figaro/core/agent";
import { DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS } from "@/lib/shared/runtimeServices";
import type { QueuedBuildAction } from "./buildProvider";
import type { ConsoleEntry, ConsoleQueueItem } from "./consoleQueue";

export interface ConsoleCreateOrderPrefill {
    seller: string;
    payment: string;
    currency: string;
    agreementHash: string;
    isSubOrder: boolean;
    processId: string;
}

export type ConsoleActionExecutionType = "transaction" | "interactive" | "build";

export interface ConsoleActionPresentation {
    label: string;
    description: string;
    toneClass: string;
    executionType: ConsoleActionExecutionType;
    executeLabel: string;
}

export interface ConsoleRuntimeContextPresentation {
    summary: string;
    providers: string;
}

function assertNever(_value: never): never {
    throw new Error("Unhandled console action presentation state.");
}

export function describeOperatingAction(action: ProposedAction): ConsoleActionPresentation {
    switch (action.type) {
        case "resolve-process":
            return {
                label: "Resolve Process",
                description: action.description,
                toneClass: "bg-blue-900/40 text-blue-300 border-blue-700/50",
                executionType: "transaction",
                executeLabel: "Execute",
            };
        case "commit-sub-order":
            return {
                label: "Commit Sub-Order",
                description: action.description,
                toneClass: "bg-amber-900/40 text-amber-300 border-amber-700/50",
                executionType: "interactive",
                executeLabel: "Open Form",
            };
        case "attest-as-seller":
            return {
                label: "Attest (Seller)",
                description: action.description,
                toneClass: "bg-purple-900/40 text-purple-300 border-purple-700/50",
                executionType: "transaction",
                executeLabel: "Execute",
            };
        case "attest-as-buyer":
            return {
                label: "Attest (Buyer)",
                description: action.description,
                toneClass: "bg-purple-900/40 text-purple-300 border-purple-700/50",
                executionType: "transaction",
                executeLabel: "Execute",
            };
        default:
            return assertNever(action);
    }
}

export function describeBuildAction(action: QueuedBuildAction): ConsoleActionPresentation {
    switch (action.type) {
        case "publish-assembly":
            return {
                label: "Publish Assembly",
                description: action.description,
                toneClass: "bg-purple-900/40 text-purple-300 border-purple-700/50",
                executionType: "build",
                executeLabel: "Execute",
            };
        case "register-schema":
            return {
                label: "Register Schema",
                description: action.description,
                toneClass: "bg-purple-900/40 text-purple-300 border-purple-700/50",
                executionType: "build",
                executeLabel: "Execute",
            };
        default:
            return assertNever(action);
    }
}

export function describeConsoleEntry(entry: ConsoleEntry): ConsoleActionPresentation {
    return entry.kind === "operating"
        ? describeOperatingAction(entry.action)
        : describeBuildAction(entry.action);
}

export function describeQueueItem(item: ConsoleQueueItem): ConsoleActionPresentation {
    return describeConsoleEntry(item.entry);
}

export function describeQueueRuntimeContext(
    item: ConsoleQueueItem,
): ConsoleRuntimeContextPresentation | undefined {
    const snapshot = item.runtimeSnapshot;

    if (!snapshot || item.entry.kind !== "operating") {
        return undefined;
    }

    const roleLabel = snapshot.runtime.selectedRole?.displayName ?? snapshot.runtime.selectedRole?.roleKind;
    const providerEntries = [
        ["catalogue", snapshot.runtime.selectedServiceProviderKeys.catalogue],
        ["evidenceTransport", snapshot.runtime.selectedServiceProviderKeys.evidenceTransport],
        ["coordinationMessaging", snapshot.runtime.selectedServiceProviderKeys.coordinationMessaging],
    ] as const;
    const nonDefaultEntries = providerEntries.filter(
        ([serviceKey, providerKey]) => providerKey !== DEFAULT_RUNTIME_SERVICE_PROVIDER_KEYS[serviceKey],
    );
    const displayedEntries = nonDefaultEntries.length > 0 ? nonDefaultEntries : providerEntries;

    return {
        summary: `Runtime: ${snapshot.runtime.selectedShellPresentation.title} · ${snapshot.assembly.identity.name}${roleLabel ? ` · ${roleLabel}` : ""}`,
        providers: `Providers: ${displayedEntries.map(([serviceKey, providerKey]) => `${serviceKey}=${providerKey}`).join(", ")}`,
    };
}

export function buildCreateOrderPrefill(action: CommitSubOrderAction): ConsoleCreateOrderPrefill {
    return {
        seller: "",
        payment: "0.01",
        currency: action.currency,
        agreementHash: "",
        isSubOrder: true,
        processId: action.processId,
    };
}