// This ESLint config enforces only allowed Tailwind classes (white, black, gray) and blocks forbidden color classes.
module.exports = {
    extends: ["next", "next/core-web-vitals", "plugin:tailwindcss/recommended"],
    plugins: ["tailwindcss"],
    rules: {
        // Disallow forbidden Tailwind color classes
        "tailwindcss/no-custom-classname": [
            "error",
            {
                "config": "./frontend/tailwind.config.ts",
                "whitelist": [
                    "white", "black", "gray-50", "gray-100", "gray-200", "gray-300", "gray-400", "gray-500", "gray-600", "gray-700", "gray-800", "gray-900"
                ]
            }
        ],
        // Optionally, enforce a style guide for class order, etc.
        "tailwindcss/classnames-order": "warn"
    }
};
