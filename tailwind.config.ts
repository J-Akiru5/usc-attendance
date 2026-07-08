import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#142850',
          deep: '#0C1B36',
          light: '#1E4A9E',
        },
        gold: {
          DEFAULT: '#C9A24B',
          soft: '#E4CD8E',
          dark: '#8A6D2F',
        },
        paper: {
          DEFAULT: '#F7F5F0',
          panel: '#FFFFFF',
        },
        ink: '#1B1B1D',
        slate: '#5C6773',
        line: '#DCD6C8',
        success: '#3F7D5C',
        danger: '#A23E3E',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
} satisfies Config
