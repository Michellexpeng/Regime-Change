import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:     '#0b0f19',
        panel:  '#0f1520',
        card:   '#141b2d',
        hover:  '#1a2238',
        border: '#1e2d45',
        t1:     '#e8edf5',
        t2:     '#9db3cc',
        t3:     '#6b849e',
        blue:   '#3b82f6',
        green:  '#22c55e',
        red:    '#ef4444',
        amber:  '#f59e0b',
        // dim backgrounds for badges / row highlights
        'blue-dim':  '#1e3a5f',
        'green-dim': '#14532d',
        'red-dim':   '#450a0a',
        'amber-dim': '#451a03',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
