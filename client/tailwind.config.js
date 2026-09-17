/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Global Traders FX: negro profundo, gris acero del escudo y verde neón.
        bg: '#060a08',
        panel: '#0e1512',
        border: '#1d2a23',
        steel: { DEFAULT: '#3b434a', light: '#6b7680', dark: '#232a2f' },
        profit: '#22d36f',
        loss: '#ff4d5e',
        accent: { DEFAULT: '#16f57a', dark: '#0fbf5e', soft: '#7dffb5' },
        warn: '#f5b400',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
