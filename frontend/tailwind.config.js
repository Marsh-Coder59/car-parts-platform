/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6a0a',
          700: '#c2510a',
          800: '#9a3f0f',
          900: '#7c3410',
          950: '#431a09',
        },
        dark: {
          900: '#0f0f0f',
          800: '#1a1a1a',
          700: '#242424',
          600: '#2e2e2e',
        },
        // Permanent dark-navy brand surface (the admin sidebar, regardless
        // of the app-wide light/dark mode toggle) — distinct from the
        // grayscale `dark` palette above, which is what the toggle uses.
        navy: {
          950: '#0b1120',
          900: '#0f172a',
          800: '#16213f',
          700: '#243352',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bounce-dot': 'bounceDot 1.2s ease-in-out infinite',
      },
      keyframes: {
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-10px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
