/**
 * scenarioSlugs.mjs — the ONE source of truth for each scenario's
 * content-derived assembly slug.
 *
 * Since `40bbe6a` the published slug is `asm-<contentHash[2..18]>`, derived
 * deterministically from the composition (clauses + values + DAG) — there is
 * no user-chosen name. populate-test-data (which seeds seller bindings BEFORE
 * the scenario publishes) therefore cannot read the slug off-chain; it must
 * COMPUTE it. This module computes it from each scenario's composition, exactly
 * the way the designer does (`lib/designer/assemblyTemplate.ts`), so the seller
 * binding, the scenario's publish, and the runtime's discovery all agree.
 *
 * Plain `.mjs` (not `.ts`) so the node populate script imports it directly; the
 * Playwright `.ts` specs import it too. Each scenario spec asserts
 * `publishedTemplate.slug === SCENARIO_SLUG[name]` — a drift guard: if a
 * composition here diverges from what the UI emits, that spec fails loudly.
 */
import { keccak256, toHex } from 'viem';

/** Stable JSON — sorted object keys at every depth, arrays preserved. Mirrors
 *  `canonicalize` in lib/designer/assemblyTemplate.ts byte-for-byte. */
function canonicalize(value) {
    return JSON.stringify(value, (_key, raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const sorted = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = raw[k];
        return sorted;
    });
}

/** `asm-<contentHash[2..18]>` — matches deriveAssemblySlug(serialize(...)). */
function deriveSlug(template) {
    return `asm-${keccak256(toHex(canonicalize(template))).slice(2, 18)}`;
}

const root = (clauses) => ({ id: 'order-0', clauses: { ...clauses, 'figaro-topology': { parentOrderIds: [] } } });
const child = (id, clauses) => ({ id, clauses: { ...clauses, 'figaro-topology': { parentOrderIds: ['order-0'] } } });

const COURIER_EDGE = {
    'figaro-handoff': { handoff: ['face-to-face'] },
    'figaro-proximity-policy': { bands: ['zone-wifi'] },
};

/** Each scenario's composition — the no-hash assembly template the designer
 *  emits (orders + per-order clause values; topology folded in by the helpers).
 *  Keyed by the human scenario name used throughout the test code. */
const COMPOSITIONS = {
    'direct-sale': {
        orders: [root({
            'figaro-modalities': { modality: 'consume-onsite' },
            'figaro-handoff': { handoff: ['face-to-face'] },
            'figaro-proximity-policy': { bands: ['zone-wifi'] },
            'figaro-merchant-process': {},
        })],
    },
    'kiosk-sale': {
        orders: [root({ 'figaro-modalities': { modality: 'pickup' } })],
    },
    'local-commerce-buyer-assigned': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'buyer-assigned' },
                'figaro-handoff': { handoff: ['face-to-face'] },
                'figaro-proximity-policy': { bands: ['zone-wifi'] },
                'figaro-merchant-process': {},
            }),
            child('order-1', { 'figaro-courier-process': {}, ...COURIER_EDGE }),
        ],
    },
    'local-commerce-seller-assigned': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'seller-assigned' },
                'figaro-handoff': { handoff: ['face-to-face'] },
                'figaro-proximity-policy': { bands: ['zone-wifi'] },
                'figaro-merchant-process': {},
            }),
            child('order-1', { 'figaro-courier-process': {}, ...COURIER_EDGE }),
        ],
    },
    'local-commerce-dutch': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'dutch-auction' },
                'figaro-handoff': { handoff: ['face-to-face'] },
                'figaro-proximity-policy': { bands: ['zone-wifi'] },
                'figaro-merchant-process': {},
            }),
            child('order-1', { 'figaro-courier-process': {}, ...COURIER_EDGE }),
        ],
    },
    'local-commerce-dispute': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'seller-assigned' },
                'figaro-handoff': { handoff: ['face-to-face'] },
                'figaro-proximity-policy': { bands: ['zone-wifi'] },
                'figaro-merchant-process': {},
                'figaro-arbitration-kleros': { klerosCourt: 'general' },
            }),
            child('order-1', { 'figaro-courier-process': {}, ...COURIER_EDGE }),
        ],
    },
    'local-commerce-offset': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'seller-assigned' },
                'figaro-handoff': { handoff: ['face-to-face'] },
                'figaro-proximity-policy': { bands: ['zone-wifi'] },
                'figaro-merchant-process': {},
                'figaro-ghg': { standard: 'ISO 14064' },
            }),
            child('order-1', { 'figaro-courier-process': {}, 'figaro-ghg': { standard: 'ISO 14064' }, ...COURIER_EDGE }),
        ],
    },
    'local-food-basket': {
        orders: [
            root({
                'figaro-modalities': { modality: 'delivery' },
                'figaro-coordination': { coordination: 'seller-assigned' },
                'figaro-merchant-process': {},
            }),
            child('order-1', {}),
            child('order-2', {}),
            child('order-3', { 'figaro-courier-process': {}, ...COURIER_EDGE }),
        ],
    },
};

/** scenario name → content-derived `asm-<hash>` slug. */
export const SCENARIO_SLUG = Object.fromEntries(
    Object.entries(COMPOSITIONS).map(([name, template]) => [name, deriveSlug(template)]),
);
