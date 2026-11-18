/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tema de prueba: Cyberpunk (índigo + cian neón + magenta)
        bg: '#0a0b1e',
        panel: '#131538',
        border: '#2a2e70',
        steel: { DEFAULT: '#4b4f96', light: '#8f93d6', dark: '#1b1d45' },
        profit: '#00ffa3',
        loss: '#ff3d71',
        accent: { DEFAULT: '#00e5ff', dark: '#00b8d4', soft: '#9af6ff' },
        tech: '#ff2bd6',
        warn: '#fcee0a',
        gray: { 50: '#f6f7ff', 100: '#e9ebff', 200: '#d6d9f7', 300: '#b9bde6', 400: '#979cd0', 500: '#868bc6', 600: '#777cb8', 700: '#3d4183', 800: '#262a5c', 900: '#181b44', 950: '#111333' },
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
