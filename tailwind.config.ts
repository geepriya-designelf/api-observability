import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./preview/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070D1A",
          900: "#0A1222",
          850: "#0E1729",
          800: "#121D33",
          750: "#17233D",
          700: "#1E2B48",
          600: "#2A3A5E",
          500: "#3B4D75",
        },
        text: {
          primary: "#E6ECF8",
          secondary: "#A9B6D3",
          muted: "#8492B4",
        },
        accent: {
          DEFAULT: "#5B7BF0",
          soft: "#8FA6FF",
          cyan: "#1AA3B8",
          cyanSoft: "#5FD4E4",
        },
        status: {
          healthy: "#22C55E",
          elevated: "#F5A524",
          degraded: "#F97316",
          unavailable: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.5)" },
          "70%": { boxShadow: "0 0 0 6px rgba(239,68,68,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        "fade-in": "fade-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
