import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1723',
        slate: '#172033',
        mist: '#edf2f7',
        signal: '#ff7a18',
        lagoon: '#0b7285',
        aurora: '#f6c453',
        cloud: '#f8fafc',
        steel: '#94a3b8',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 80px rgba(15, 23, 35, 0.12)',
      },
      backgroundImage: {
        'hero-grid':
          'radial-gradient(circle at top left, rgba(246, 196, 83, 0.35), transparent 32%), radial-gradient(circle at 80% 0%, rgba(11, 114, 133, 0.28), transparent 28%), linear-gradient(135deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))',
      },
    },
  },
  plugins: [],
} satisfies Config
