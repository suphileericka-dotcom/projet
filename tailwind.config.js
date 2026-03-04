import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Important pour le dark mode
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#19e6c4', // Ton turquoise
          light: '#93c8bf',
        },
        background: {
          light: '#ffffff',
          dark: '#0f172a',
        }
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
} satisfies Config