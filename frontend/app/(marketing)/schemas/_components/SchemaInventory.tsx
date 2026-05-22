"use client";

import { useMemo } from "react";
import { keccak256, toBytes } from "viem";
import { useAllRegisteredSchemas } from "@/lib/mechanisms/useSchemaRegistry";
import { SCHEMAS_BY_FAMILY } from "@/lib/shared/schemaCategories";

/** keccak256 of a human-readable schemaId — the on-chain digest, matching
 *  Solidity's `keccak256("figaro-foo-v1")`. */
function schemaIdHash(schemaId: string): string {
    return keccak256(toBytes(schemaId)).toLowerCase();
}

/**
 * The `/schemas` inventory, read live from `SchemaRegistry`.
 *
 * The on-chain `SchemaRegistered` event set is the source of truth for WHICH
 * schemas exist. The bundled spec registry (`SCHEMAS_BY_FAMILY`) is only the
 * content store — it supplies each registered schema's title, description,
 * and editorial family. A schema registered on-chain whose spec this build
 * does not carry is counted, not named.
 *
 * This is a client component because the marketing tier mounts no wallet
 * provider; `useAllRegisteredSchemas` reads through the standalone viem
 * client. The page that embeds it stays a server component — it keeps the
 * route metadata and the static prose.
 */
export function SchemaInventory() {
    const { data } = useAllRegisteredSchemas();

    const inventory = useMemo(() => {
        if (data === null) return null;
        const onChain = new Set(data.map((e) => e.schemaIdHash.toLowerCase()));
        const families = SCHEMAS_BY_FAMILY.map((group) => ({
            family: group.family,
            label: group.label,
            schemas: group.schemas.filter((s) => onChain.has(schemaIdHash(s.schemaId))),
        })).filter((group) => group.schemas.length > 0);
        const liveKnown = families.reduce((n, g) => n + g.schemas.length, 0);
        const knownHashes = new Set(
            SCHEMAS_BY_FAMILY.flatMap((g) => g.schemas.map((s) => schemaIdHash(s.schemaId))),
        );
        const unbundled = data.filter(
            (e) => !knownHashes.has(e.schemaIdHash.toLowerCase()),
        ).length;
        return { families, liveKnown, unbundled, total: data.length };
    }, [data]);

    if (inventory === null) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">Reading the registry&hellip;</p>
        );
    }

    if (inventory.total === 0) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">
                No schemas are registered on the network this site is reading. This
                inventory is event-driven &mdash; it populates from{" "}
                <code>SchemaRegistry</code> once a deployment is reachable.
            </p>
        );
    }

    if (inventory.families.length === 0) {
        return (
            <p className="text-sm text-ink-muted leading-relaxed">
                {inventory.total}{" "}
                {inventory.total === 1 ? "schema is" : "schemas are"} registered on{" "}
                <code>SchemaRegistry</code>, none of whose specs this build carries.
            </p>
        );
    }

    const { families, liveKnown, unbundled } = inventory;

    return (
        <>
            <p className="text-sm text-ink-body leading-relaxed mb-6">
                {liveKnown} {liveKnown === 1 ? "schema is" : "schemas are"} registered on{" "}
                <code>SchemaRegistry</code> across {families.length}{" "}
                {families.length === 1 ? "family" : "families"}, read live from on-chain{" "}
                <code>SchemaRegistered</code> events &mdash; exactly what the connected
                network holds, not a bundled copy.
                {unbundled > 0 ? (
                    <>
                        {" "}
                        A further {unbundled}{" "}
                        {unbundled === 1 ? "schema is" : "schemas are"} registered whose
                        spec this build does not carry, shown here only as a count.
                    </>
                ) : null}
            </p>
            <div className="space-y-8">
                {families.map((group) => (
                    <div key={group.family}>
                        <h3 className="text-base font-semibold text-ink-heading mb-3">
                            {group.label}
                        </h3>
                        <ul className="space-y-3">
                            {group.schemas.map((schema) => (
                                <li
                                    key={schema.schemaId}
                                    id={`schema-${schema.schemaId}`}
                                    className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24"
                                >
                                    <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0">
                                        {schema.schemaId}
                                    </span>
                                    <span className="text-sm text-ink-body">
                                        {schema.description}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </>
    );
}
