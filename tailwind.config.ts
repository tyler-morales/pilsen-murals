import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
