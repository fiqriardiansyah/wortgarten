import type { Config } from 'tailwindcss';
import { tokens } from './src/design/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: tokens.colors.pageBg,
        primary: tokens.colors.primary,
        deep: tokens.colors.deep,
        muted: tokens.colors.muted,
        accent: tokens.colors.accent,
        coral: tokens.colors.coral,
        success: tokens.colors.success,
        gold: tokens.colors.gold,
        'gold-light': tokens.colors.goldLight,
        card: tokens.colors.cardBg,
        lilac: tokens.colors.lilac,
      },
      borderRadius: {
        card: tokens.radii.card,
        pill: tokens.radii.pill,
        chip: tokens.radii.chip,
      },
      boxShadow: {
        card: tokens.shadows.card,
      },
      fontFamily: {
        sans: ['"Nunito"', '"Baloo 2"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        hero: ['36px', { fontWeight: '800', lineHeight: '1.1' }],
        'hero-sm': ['28px', { fontWeight: '800', lineHeight: '1.2' }],
        heading: ['22px', { fontWeight: '700', lineHeight: '1.3' }],
        'heading-sm': ['18px', { fontWeight: '700', lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
