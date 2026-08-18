/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './constants.tsx',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        azure: {
          50: '#eff8ff',
          100: '#dbeefe',
          200: '#bfe3fe',
          300: '#93d4fd',
          400: '#60bbfa',
          500: '#389cf4',
          600: '#247fe8',
          700: '#1d67d5',
        },
      },
    },
  },
  plugins: [],
};
