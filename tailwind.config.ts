import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        accent: 'var(--color-accent)',
        alert: 'var(--color-alert)',
        info: 'var(--color-info)',
        positive: 'var(--color-positive)',
        content: 'var(--color-content)',
        muted: 'var(--color-muted)',
      },
      fontFamily: {
        condensed: ['var(--font-condensed)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseAccent: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 85, 0, 0.35)' },
          '50%': { boxShadow: '0 0 0 14px rgba(255, 85, 0, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        gaugeGrow: {
          '0%': { strokeDashoffset: '220' },
        },
        barGrow: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'pulse-accent': 'pulseAccent 2s infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'bar-grow': 'barGrow 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
}

export default config
