# ENS/IPFS Skinning Hooks Guide

This guide documents the key CSS classes and extension points for designers who want to create custom skins for Figaro using ENS or IPFS.

## Principles
- All UI uses neutral, colorless classes (bg-white, text-black, border-gray-200, etc.)
- No hardcoded branding or color tokens—skins can override any class
- All main sections and cards use semantic, composable class names

## Main Extension Points

### Cards and Panels
- `.bg-white`, `.text-black`, `.border-gray-200`, `.rounded`, `.shadow-sm`, `.p-6`, `.p-8`
- Used in: ProtocolStats, TokenBalances, OrderControls, OrderStatusCard

### Buttons
- `.bg-white`, `.text-black`, `.border-gray-300`, `.rounded`, `.hover:bg-gray-100`, `.focus-visible:ring-black`
- Used in: all action buttons, including onboarding dismiss

### Headings
- `.text-2xl`, `.font-bold`, `.text-black`, `.mb-6`
- Used in: section headers, order forms

### Dividers
- `.border-gray-100`, `.my-2`, `.my-4`
- Used for subtle section separation

### Onboarding/Info Banners
- `.bg-gray-100`, `.border-b`, `.border-gray-200`, `.text-black`
- Used in: onboarding banner, info sections

## How to Apply a Skin
- Runtime-bound institution shells now expose `data-skin` on the root skin wrapper when a matched subject resolves branding assets.
- Runtime-shell scaffolding, seller setup panels, seller-facing mechanism cards, deeper delivery/disclosure mechanism panels, buyer-side discovery/cart surfaces, driver-side job-market surfaces, the handoff panels, the FIG panel, and generic runtime wrappers like auction-actions/process-graph can also expose the same `data-skin` marker when they consume the resolved runtime skin bundle.
- The current runtime can resolve shell skins from manifest-backed binding asset documents keyed by `assetURI`, falling back to seller metadata when no asset document is present.
- If the runtime only has an `assetURI`, the shell can now hydrate that asset document over the selected evidence-transport service and then apply the resulting skin.
- Use a custom CSS file loaded via ENS/IPFS through binding asset documents or seller metadata `assets.cssURI`.
- Target the above classes to override colors, backgrounds, borders, or add backgrounds/images
- For advanced skins, use `[data-skin]` attributes for global theming

## Example: Override Card Background
```css
.bg-white {
  background: #f5f5f5 !important;
}
```

## Data Attributes
- Root institution shell skin wrappers, runtime-shell scaffolding cards, seller setup panels, seller-facing mechanism cards, delivery/disclosure attestation panels, buyer-side discovery/cart surfaces, driver-side job-market surfaces, handoff panels, the FIG panel, and generic runtime wrappers can now expose `data-skin` for easy targeting
- Example: `<div data-skin="binding-bobs-pizza-palace-local-anvil"> ... </div>`

---
For questions or to propose new hooks, open an issue or PR.
