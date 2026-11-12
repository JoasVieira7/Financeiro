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
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          muted: '#F1F5F9',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
        'card': '0 1px 3px 0 rgba(15, 23, 42, 0.03), 0 4px 16px -2px rgba(15, 23, 42, 0.04)',
        'card-hover': '0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.02)',
        'elevated': '0 12px 32px -4px rgba(15, 23, 42, 0.1), 0 4px 12px -2px rgba(15, 23, 42, 0.04)',
        'button-green': '0 4px 14px 0 rgba(0, 210, 106, 0.35)',
        'button-hover': '0 6px 20px 0 rgba(0, 210, 106, 0.45)',
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '32px',
      }
    },
  },
  plugins: [],
}
