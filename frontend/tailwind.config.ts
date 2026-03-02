import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff3ef',
          100: '#ffe5dc',
          200: '#ffc6b3',
          300: '#ff9f83',
          400: '#ff6f47',
          500: '#f04a23',
          600: '#cf3614',
          700: '#ac2c12',
          800: '#8d2715',
          900: '#742416',
        },
      },
      boxShadow: {
        panel: '0 10px 30px -18px rgba(21, 34, 50, 0.55)',
      },
    },
  },
  plugins: [],
} satisfies Config;
