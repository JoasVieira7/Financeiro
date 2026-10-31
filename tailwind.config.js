/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          400: '#34D399',
          500: '#00D26A',
          600: '#00C853',
          700: '#00A344',
          accent: '#00D26A',
        },
        pix: '#00D26A',
        surface: {
          bg: '#FAFAFC',
          card: '#FFFFFF',
          border: '#F1F5F9',
          muted: '#F8FAFC',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 12px -2px rgba(0, 0, 0, 0.04), 0 1px 3px 0 rgba(0, 0, 0, 0.02)',
        'card-hover': '0 8px 24px -4px rgba(0, 0, 0, 0.08)',
        'button-green': '0 8px 20px -4px rgba(0, 210, 106, 0.35)',
      },
      borderRadius: {
        '3xl': '24px',
        '4xl': '32px',
      }
    },
  },
  plugins: [],
}
