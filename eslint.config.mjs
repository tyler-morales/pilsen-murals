import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

export default [
    {
        ignores: [
            ".next/**",
            "node_modules/**",
            "dist/**",
            "build/**",
            "*.config.js",
            "*.config.mjs",
            "*.config.ts",
            "next-env.d.ts",
            "scripts/**",
        ],
    },
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
        },
    },
];