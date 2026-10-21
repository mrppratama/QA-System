/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#f0fbfa',
          100: '#d7f6f4',
          200: '#b0ece8',
          300: '#81d8d0',
          400: '#3ec7be',
          500: '#0abab5',
          600: '#089e9a',
          700: '#077d7a',
          800: '#096361',
          900: '#0b5150',
          950: '#053131',
        },
        tiffany: {
          50: '#f0fbfa',
          100: '#d7f6f4',
          200: '#b0ece8',
          300: '#81d8d0',
          400: '#3ec7be',
          500: '#0abab5',
          600: '#089e9a',
          700: '#077d7a',
          800: '#096361',
          900: '#0b5150',
          950: '#053131',
        },
        brand: {
          50: '#f0fbfa',
          100: '#d7f6f4',
          300: '#81d8d0',
          500: '#0abab5',
          600: '#089e9a',
          700: '#077d7a',
          900: '#0b5150',
        },
      },
    },
  },
  plugins: [],
};
