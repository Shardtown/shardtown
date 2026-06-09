/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        moveVertical: {
          "0%":   { transform: "translateY(-50%)" },
          "50%":  { transform: "translateY(50%)"  },
          "100%": { transform: "translateY(-50%)" },
        },
        moveInCircle: {
          "0%":   { transform: "rotate(0deg)"   },
          "50%":  { transform: "rotate(180deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        moveHorizontal: {
          "0%":   { transform: "translateX(-50%) translateY(-10%)" },
          "50%":  { transform: "translateX(50%)  translateY(10%)"  },
          "100%": { transform: "translateX(-50%) translateY(-10%)" },
        },
      },
      animation: {
        first:  "moveVertical 30s ease infinite",
        second: "moveInCircle 20s reverse infinite",
        third:  "moveInCircle 40s linear infinite",
        fourth: "moveHorizontal 40s ease infinite",
        fifth:  "moveInCircle 20s ease infinite",
      },
    },
  },
  plugins: [],
};
