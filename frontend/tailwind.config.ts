import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        mint: {
          DEFAULT: '#10b77f',
          50: 'rgba(16,183,127,0.06)',
          100: 'rgba(16,183,127,0.12)',
          200: 'rgba(16,183,127,0.20)',
          500: '#10b77f',
          600: '#0ea571',
        },
      },
    },
  },
  plugins: [],
}
export default config
