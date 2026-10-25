/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        titanium: {
          950: '#0a0d12',
          900: '#0f141c',
          800: '#161d28',
          700: '#222c3d',
        },
        cyan: {
          400: '#00f0ff',
          500: '#00c8e0',
          600: '#0088cc',
        },
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        'cyan-glow': '0 0 18px rgba(0, 240, 255, 0.45)',
        'cyan-glow-lg': '0 0 32px rgba(0, 240, 255, 0.65)',
        'emerald-glow': '0 0 18px rgba(16, 185, 129, 0.35)',
      },
    },
  },
  plugins: [],
};
