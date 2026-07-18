import type { Config } from 'tailwindcss';
import { tokens } from './src/design/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v1 legacy — unchanged, still used by screens pending sketch-theme migration.
        // `muted` and `coral` are deliberately backed by the v2 hex below: same role in
        // both palettes, close enough in value that repointing them is a safe no-op visually.
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

        // v2 sketch theme
        bg: tokens.color.bg,
        surface: tokens.color.surface,
        'surface-alt': tokens.color.surfaceAlt,
        ink: tokens.color.ink,
        'ink-soft': tokens.color.inkSoft,
        line: tokens.color.line,
        'line-soft': tokens.color.lineSoft,
        teal: tokens.color.teal,
        'teal-soft': tokens.color.tealSoft,
        'teal-deep': tokens.color.tealDeep,
        'coral-soft': tokens.color.coralSoft,
        'coral-deep': tokens.color.coralDeep,
        yellow: tokens.color.yellow,
        'yellow-soft': tokens.color.yellowSoft,
        'yellow-deep': tokens.color.yellowDeep,
      },
      borderRadius: {
        card: tokens.radii.card,
        pill: tokens.radii.pill,
        chip: tokens.radii.chip,
        sketch: `${tokens.sketch.cornerRadius}px`,
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
