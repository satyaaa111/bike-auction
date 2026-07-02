import type { Config } from "tailwindcss";

// Design tokens — see docs/ARCHITECTURE.md is the engineering doc; this is
// the visual language: a garage/workshop feel (not a generic SaaS look).
// charcoal surfaces + brass accent (chrome/headlight warmth) + a red-orange
// reserved only for "LIVE" / urgent bidding states.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#17171A",
        surface: "#232326",
        surfaceRaised: "#2C2C30",
        brass: "#C68A3B",
        brassLight: "#E0AE66",
        live: "#D6472B",
        bone: "#EDEAE3",
        muted: "#8A8780",
        border: "#39393E",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      letterSpacing: {
        wide2: "0.08em",
      },
    },
  },
  plugins: [],
};

export default config;
