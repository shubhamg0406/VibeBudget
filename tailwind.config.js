/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: "0px",
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
};
