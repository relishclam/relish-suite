/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'relish-purple': '#6B21A8',
        'relish-teal':   '#2DD4BF',
        'relish-orange': '#EA580C',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'Arial', 'sans-serif'],
        mono: ['"DM Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
};
