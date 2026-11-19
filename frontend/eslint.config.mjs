import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// The ESLint flat config. Next 16 removed `next lint` and the legacy
// `.eslintrc` format of eslint-config-next; `npm run lint` runs the ESLint CLI
// over app, components, lib, hooks and tests.

const JSON_RULE = {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='json'][arguments.length=0]",
    message:
        "Use safeJsonFromResponse() from @/lib/shared/safeJson instead of .json() to defend against prototype-pollution from network-fetched JSON. If this is a controlled internal endpoint where pollution risk is bounded, add: // eslint-disable-next-line no-restricted-syntax -- <reason>",
};

const INNER_HTML_RULE = {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
        "Raw HTML is the one XSS sink React leaves open, and this app renders permissionless registry and IPFS content. Only components/papers/Math.tsx (KaTeX output of the site's own formulas) may use it.",
};

const SIGN_RULE = {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='signTypedData']",
    message:
        "A typed-data signature is a commitment: it is requested only in lib/checkout/orderCommitmentFlow.ts, behind the sign gate (assertAgreementSignable) and the confirm modal.",
};

const eslintConfig = [
    ...nextCoreWebVitals,
    {
        ignores: [".next/**", ".next-e2e/**", "out/**", "node_modules/**", "next-env.d.ts"],
    },
    {
        rules: {
            "no-restricted-syntax": ["error", JSON_RULE, INNER_HTML_RULE, SIGN_RULE],
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "wagmi",
                            importNames: ["useSignTypedData"],
                            message:
                                "Typed-data signing lives in lib/checkout/orderCommitmentFlow.ts alone, behind the sign gate and the confirm modal.",
                        },
                        {
                            name: "wagmi/actions",
                            importNames: ["signTypedData"],
                            message: "Typed-data signing lives in lib/checkout/orderCommitmentFlow.ts alone.",
                        },
                        {
                            name: "@wagmi/core",
                            importNames: ["signTypedData"],
                            message: "Typed-data signing lives in lib/checkout/orderCommitmentFlow.ts alone.",
                        },
                        {
                            name: "@/lib/core/useFigaroActions",
                            message:
                                "FigaroCore is written from lib/checkout/orderCommitmentFlow.ts (commit, behind the sign gate) and hooks/useSemanticProcessWorkspace.ts (the buyer's resolve) alone.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["lib/shared/safeJson.ts"],
        rules: {
            "no-restricted-syntax": ["error", INNER_HTML_RULE, SIGN_RULE],
        },
    },
    {
        files: ["components/papers/Math.tsx"],
        rules: {
            "no-restricted-syntax": ["error", JSON_RULE, SIGN_RULE],
        },
    },
    {
        files: ["lib/checkout/orderCommitmentFlow.ts"],
        rules: {
            "no-restricted-syntax": ["error", JSON_RULE, INNER_HTML_RULE],
            "no-restricted-imports": "off",
        },
    },
    {
        files: ["hooks/useSemanticProcessWorkspace.ts"],
        rules: {
            "no-restricted-imports": "off",
        },
    },
    // React Compiler rules kept off for one file each, where the flagged code
    // cannot change without changing what the page does. Every other file is
    // held to them; `lib/shared/useDepsChanged.ts` is the pattern most fixes
    // took (a reset made during render, on the render its inputs change).
    {
        // `set-state-in-effect`: the state is set from browser storage, or from
        // what a write to it returned, and a render may neither write storage
        // nor read it before hydration ends.
        //  - DesignerCanvas: the mount restores the draft or the autosave
        //    (clearing a stale one), and the autosave stamps its time after
        //    each write.
        //  - ViewAssemblyClient: the resolution reads the named draft first,
        //    then steps a retry counter kept in a ref through the registry scan.
        //  - PrivateFilingsPanel: the count it shows is what keeping the
        //    confirmed filings in storage returned.
        //  - useCeremonyChannel: "requested this session" is read from the
        //    keypair in sessionStorage when the channel opens.
        //  - onboardingState: the draft is read on a wallet switch, and a
        //    wallet adopts the anonymous draft by writing it and removing the
        //    anonymous copy.
        //  - useMemberProfileEditor: the seed writes the form's draft through
        //    the caller's `update`, and `seeded`, which the render's gate
        //    reads, turns true only after it.
        files: [
            "app/(tools)/assemblies/designer/_components/DesignerCanvas.tsx",
            "app/(tools)/assemblies/designer/view/ViewAssemblyClient.tsx",
            "components/runtime/PrivateFilingsPanel.tsx",
            "lib/handoff/useCeremonyChannel.ts",
            "lib/member/onboardingState.ts",
            "lib/member/useMemberProfileEditor.ts",
        ],
        rules: { "react-hooks/set-state-in-effect": "off" },
    },
    {
        // `set-state-in-effect`: `asked` must turn true only after the effect
        // has put a failed agreement back in flight; set during render, that
        // agreement would read as absent for one render before its retry.
        files: ["hooks/useProcessAgreements.ts"],
        rules: { "react-hooks/set-state-in-effect": "off" },
    },
    {
        // `refs`: the checkout keeps each order's blinding values in a ref
        // that the render fills and reads: `withCheckoutBlinding` draws a
        // missing value during render and keeps it there, so the value drawn
        // once is the value the commit later signs. Holding it in state would
        // move the draw out of the render that first needs it.
        files: ["app/(app)/s/checkout/_components/CheckoutView.tsx"],
        rules: { "react-hooks/refs": "off" },
    },
    {
        // `static-components`: the string input for a declared format is looked
        // up in the format registry (`getFieldFormatInput`), a module-level
        // map of components registered once. The lookup returns the same
        // component on every render; the compiler cannot see that.
        files: ["components/runtime/FieldControl.tsx"],
        rules: { "react-hooks/static-components": "off" },
    },
    {
        files: ["tests/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-syntax": "off",
            "no-restricted-imports": "off",
        },
    },
];

export default eslintConfig;
