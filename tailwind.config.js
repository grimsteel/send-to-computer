import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./frontend/**/*.ts", "./static/index.html"],
  theme: {
    extend: {},
  },
  plugins: [forms()],
}
