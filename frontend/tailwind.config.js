module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5fbff",
          100: "#e6f4ff",
          500: "#0ea5b7",
          700: "#0b7285",
        },
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
