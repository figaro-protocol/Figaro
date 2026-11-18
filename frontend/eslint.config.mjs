import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// The ESLint flat config. Next 16 removed `next lint` and the legacy
// `.eslintrc` format of eslint-config-next; `npm run lint` runs the ESLint CLI
// over the directories `next lint` covered (app, components, lib).

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
            // eslint-plugin-react-hooks 7 (bundled by eslint-config-next 16)
            // adds the React Compiler's rules. The compiler is not enabled
            // here; these five fire on code written before them, and are off
            // until that code is reworked. The plugin's other rules stay on.
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/refs": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/static-components": "off",
            "react-hooks/immutability": "off",
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
    {
        files: ["tests/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-syntax": "off",
            "no-restricted-imports": "off",
        },
    },
];

export default eslintConfig;
