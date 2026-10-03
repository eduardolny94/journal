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
        // Contraste: los grises 500/600 de Tailwind no llegan a 4,5:1 sobre el fondo (#060a08) en texto pequeño.
        // Se aclaran un punto (500 ≈ 6,3:1, 600 ≈ 4,6:1) sin tocar el resto de la escala.
        gray: { 500: '#8b94a3', 600: '#6e7786' },
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
        inter: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
