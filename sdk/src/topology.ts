/**
 * topology.ts — generic order-topology math.
 *
 * Topology is organizational (reconstruction + seller coordination) and
 * independent of bonding, which is ALWAYS linear and on-chain. This is the
 * pure math over parent edges — no agreement reading, no chain access,
 * structural types only.
 */

/**
 * Topological order of `ids` — every node after all its in-set parents.
 * Parents outside `ids` and self-parents are ignored. Stable: ready nodes emit
 * in input order. `onCycle`: "throw" rejects a cyclic topology (commit-path
 * guard); "break" emits unsettled nodes in input order (display degrades).
 */
export function topologicalOrder(
    ids: string[],
    parentIdsOf: (id: string) => string[],
    onCycle: "throw" | "break",
): string[] {
    const idSet = new Set(ids);
    const parentsOf = (id: string) =>
        parentIdsOf(id).filter((parentId) => parentId !== id && idSet.has(parentId));
    const settled = new Set<string>();
    const ordered: string[] = [];
    const pending = [...ids];
    while (pending.length > 0) {
        const idx = pending.findIndex((id) => parentsOf(id).every((p) => settled.has(p)));
        if (idx === -1) {
            if (onCycle === "throw") {
                throw new Error("Topology has a cycle — a node's parents are unresolvable.");
            }
            for (const id of pending) { settled.add(id); ordered.push(id); }
            break;
        }
        const [next] = pending.splice(idx, 1);
        settled.add(next);
        ordered.push(next);
    }
    return ordered;
}

/**
 * Depth per node over in-set parent edges — a root (no in-set parents) is
 * depth 0, a child is max(parent depths) + 1. The 0-rooted convention is the
 * shipped UI's (the frontend draft-depth derivation). Parents outside `ids`
 * and self-parents are ignored. A cyclic topology degrades via
 * `topologicalOrder`'s "break" mode: nodes on a cycle take depth from
 * whichever parents settled before them.
 */
export function depthsOverParents(
    ids: string[],
    parentIdsOf: (id: string) => string[],
): Map<string, number> {
    const idSet = new Set(ids);
    const depths = new Map<string, number>();
    for (const id of topologicalOrder(ids, parentIdsOf, "break")) {
        const parents = parentIdsOf(id).filter((p) => p !== id && idSet.has(p));
        depths.set(
            id,
            parents.length === 0
                ? 0
                : 1 + parents.reduce((max, p) => Math.max(max, depths.get(p) ?? 0), 0),
        );
    }
    return depths;
}
