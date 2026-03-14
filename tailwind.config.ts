import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // iOS 18 Dynamic Type (Large): Body 17pt, Subheadline 15pt, Footnote 13pt, Caption 2 11pt
      fontSize: {
        "mobile-body": ["17px", { lineHeight: "1.47" }],
        "mobile-subhead": ["15px", { lineHeight: "1.4" }],
        "mobile-footnote": ["13px", { lineHeight: "1.38" }],
        "mobile-caption": ["11px", { lineHeight: "1.36" }],
      },
      lineHeight: {
        heading: "1.25",
      },
      colors: {
        mural: {
          dark: "#0a0a0b",
          surface: "#141416",
          border: "#27272a",
          muted: "#71717a",
        },
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 20px 4px var(--glow)" },
          "50%": { opacity: "0.85", boxShadow: "0 0 28px 8px var(--glow)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
