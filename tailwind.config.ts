import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Mobile typography gold standard: body 16–18px, caption 13–14px, H1 30–32px, H2 24–26px, H3 20–22px
      fontSize: {
        "mobile-body": ["17px", { lineHeight: "1.5" }],
        caption: ["14px", { lineHeight: "1.4" }],
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
