/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"JetBrains Mono"', 'monospace'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        surface: {
          950: '#0f1419',
          900: '#141c25',
          800: '#1a2332',
          700: '#243447',
          600: '#2d4059',
        },
        accent: {
          DEFAULT: '#00d4aa',
          50: '#edfff9',
          100: '#c4ffe9',
          200: '#7dffd1',
          300: '#3dffc0',
          400: '#00d4aa',
          500: '#00b894',
          600: '#009678',
          700: '#00705a',
          800: '#005544',
          900: '#003d31',
        },
        signal: { DEFAULT: '#ff6b35', light: '#ff8f62', dark: '#cc5229' },
        text: { primary: '#e8edf4', secondary: '#7a8ba0', muted: '#4d5f73' },
        ok: '#00d4aa',
        warn: '#ffb347',
        danger: '#ff4757',
      },
      minHeight: { touch: '48px' },
      boxShadow: {
        glow: '0 0 20px rgba(0, 212, 170, 0.15)',
        'glow-strong': '0 0 30px rgba(0, 212, 170, 0.25)',
        'glow-danger': '0 0 20px rgba(255, 71, 87, 0.2)',
      },
    },
  },
  plugins: [],
};
