/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202421",
        muted: "#66716a",
        paper: "#f7f4ee",
        panel: "#fffdf8",
        line: "#ded7c9",
        linka: "#0b6b57",
        signal: "#2d6f90",
        caution: "#9a5d00",
        danger: "#a33a2f",
      },
      fontFamily: {
        sans: ["Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
        mono: ["SFMono-Regular", "Cascadia Code", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        rail: "0 18px 60px rgba(44, 36, 24, 0.08)",
      },
    },
  },
  plugins: [],
};
