/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#28242c",
        muted: "#746f7c",
        paper: "#f8f1e4",
        panel: "#fffdf7",
        line: "#ddd2c1",
        linka: "#7760dc",
        signal: "#34779a",
        caution: "#a56818",
        danger: "#aa463c",
        success: "#2f7b66",
      },
      fontFamily: {
        sans: ["Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
        mono: ["SFMono-Regular", "Cascadia Code", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        rail: "0 16px 44px rgba(92, 72, 34, 0.10)",
        sketch: "2px 3px 0 rgba(111, 88, 40, 0.08)",
        insetline: "inset 0 0 0 1px rgba(130, 105, 60, 0.12)",
      },
    },
  },
  plugins: [],
};
