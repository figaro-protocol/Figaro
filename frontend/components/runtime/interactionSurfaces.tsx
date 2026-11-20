/**
 * interactionSurfaces — the interaction-interface→surface-component registry.
 *
 * A clause may declare, in its `block.runtime.interaction`, the party↔party runtime
 * INTERACTION STANDARD its tasks use (the sibling of `block.design.composes`, which
 * names an on-network contract interface). This registry is the frontend
 * half of that seam: it maps the interaction interfaces THIS frontend has a
 * surface for (e.g. `"qr-challenge"` → the QR order-identity panel) to
 * the component that renders it beside the order's capability rail. An
 * interface with no entry renders nothing extra — the affordance is
 * progressive enhancement; the protocol never depends on it.
 *
 * The discipline (same as `fieldFormatInputs`): the KEY is a semantic the
 * clause spec DECLARES — never a clause id, a mechanism kind, or a component
 * name. A never-seen clause declaring a known interaction gets the surface
 * with zero code changes; a never-seen interaction degrades to nothing.
 */
import type { ComponentType } from "react";
import type { ResolutionUniverse } from "@figaro-protocol/sdk";
import { QrChallengePanel } from "@/components/runtime/QrChallengePanel";
import { AddressDetailPanel } from "@/components/runtime/AddressDetailPanel";
import { ContentDeliveryPanel } from "@/components/runtime/ContentDeliveryPanel";

/** The contract an interaction surface satisfies: the order it mounts on,
 *  identified — nothing clause-specific crosses this boundary. The order's
 *  two parties are part of the order's identity (FigaroCore star shape):
 *  a ceremony surface derives its own role from the connected wallet. */
export interface InteractionSurfaceProps {
    processId: string;
    orderHash: string;
    /** The clause that declared the interaction — for display attribution
     *  and clause anchoring, never for dispatch. */
    clauseKey: string;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    /** The path the order was committed on (`Order.path`). A surface whose
     *  send files an attestation through the attestation coordinator offers
     *  no send for an order on the batch path, which the coordinator does
     *  not know; requesting and receiving stay. */
    path?: ResolutionUniverse;
}

// The tenants. An interaction standard gains a surface in this frontend by
// an entry here; another frontend keeps a registry of its own.
const REGISTRY = new Map<string, ComponentType<InteractionSurfaceProps>>([
    ["qr-challenge", QrChallengePanel],
    ["ecdh-address", AddressDetailPanel],
    ["ecdh-content", ContentDeliveryPanel],
]);

/** The surface this frontend maps to a declared interaction interface, or
 *  null — the caller renders nothing extra. */
export function getInteractionSurface(
    interfaceId: string | undefined,
): ComponentType<InteractionSurfaceProps> | null {
    if (!interfaceId) return null;
    return REGISTRY.get(interfaceId) ?? null;
}
