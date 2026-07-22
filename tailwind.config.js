/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        yt: {
          dark: '#0f0f0f',
          paper: '#1f1f1f',
          hover: '#272727',
          active: '#3f3f3f',
          red: '#ff0000',
          redHover: '#cc0000',
          text: '#f1f1f1',
          muted: '#aaa',
          border: '#383838'
        }
      },
      fontFamily: {
        sans: ['Roboto', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 15px rgba(255, 0, 0, 0.25)',
        'panel': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }
    },
  },
  plugins: [],
}
