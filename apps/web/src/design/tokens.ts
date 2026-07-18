/**
 * Design tokens — single source of truth for every visual value in the app
 * (Rule Zero of the sketch-theme redesign: no hardcoded hex, radius, or
 * stroke width anywhere else — components import from here).
 *
 * `color` / `font` / `space` / `sketch` / `motion` / `concept` / `component`
 * are the v2 "sketch theme" system. The `colors` / `radii` / `shadows` /
 * `typography` block below (plural / legacy names) is the v1 palette, kept
 * alive only so screens not yet migrated to the sketch theme keep rendering
 * correctly. New/rebuilt components use the v2 namespaces; the legacy block
 * can be deleted once every screen has migrated.
 */

const color = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#FBFCFD',
  ink: '#1F2937',
  inkSoft: '#4B5563',
  muted: '#8A94A6',
  line: '#DDE1E7',
  lineSoft: '#ECEEF1',

  teal: '#2BB3A3',
  tealSoft: '#E6F6F4',
  tealDeep: '#1E8C80',

  coral: '#F16C61',
  coralSoft: '#FDECEA',
  coralDeep: '#B4453C',

  yellow: '#FFD029',
  yellowSoft: '#FFF7DC',
  yellowDeep: '#6B5300',
} as const;

const font = {
  family: '"Nunito", system-ui, sans-serif',
  size: {
    hero: 34,
    xl: 22,
    lg: 17,
    base: 15,
    sm: 12.5,
    xs: 11,
    // Stats — spec gives a 30-48px range rather than a fixed size.
    num: { min: 30, max: 48 },
  },
  weight: {
    body: 600,
    semi: 700,
    bold: 800,
  },
  lineHeight: {
    body: 1.5,
    display: 1.15,
  },
} as const;

const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 32,
} as const;

const sketch = {
  // Tier 1 — CSS border-radius hack, rotated across siblings.
  radiusA: '255px 15px 225px 15px / 15px 225px 15px 255px',
  radiusB: '15px 225px 15px 255px / 225px 15px 255px 15px',
  radiusC: '225px 15px 255px 15px / 15px 255px 15px 225px',

  // Tier 2 — generated double-stroke SVG border (SketchBox).
  jitterMain: 1.6,
  jitterSecond: 2.4,
  strokeMain: 2,
  strokeSecond: 1.4,
  secondOpacity: 0.55,
  cornerRadius: 16,
  samplesPerEdge: 14,
} as const;

const motion = {
  spring: 'cubic-bezier(.34,1.56,.64,1)',
  ease: 'cubic-bezier(.22,.61,.36,1)',
  fast: 120,
  base: 250,
  slow: 800,
} as const;

const concept = {
  word: {
    new: { fill: color.surface, text: color.muted },
    learning: { fill: color.tealSoft, text: color.tealDeep },
    mastered: { fill: color.teal, text: '#FFFFFF' },
    rusty: { fill: color.coralSoft, text: color.coralDeep, opacity: 0.65 },
    incomplete: { dot: color.coral },
  },
  answer: {
    correct: { fill: color.tealSoft, text: color.teal },
    wrong: { fill: color.coralSoft, text: color.coral },
  },
  progress: { fill: color.yellow, track: color.line },
  streak: { fill: color.yellowSoft, text: color.yellowDeep },
  confetti: { colors: [color.teal, color.coral, color.yellow], opacity: 0.35 },
} as const;

// Exact numeric specs from §4/§7 that would otherwise be hardcoded per-component.
const component = {
  button: { height: 48, paddingX: 24, paddingY: 14, iconGap: 6, pressScale: 0.96 },
  card: { padding: space.lg, hoverLift: -3 },
  chip: { paddingX: 10, paddingY: 4 },
  input: { paddingX: 16, paddingY: 14, focusRingWidth: 3 },
  optionRow: { paddingX: 14, paddingY: 13, radius: 14, keyChipSize: 26 },
  progressBar: { height: 10 },
  iconBubble: { min: 44, max: 50, radius: 16 },
  nav: { sidebarWidth: 240, itemHeight: 48, mobileBarHeight: 56, fabSize: 56, fabFloat: 16 },
  confetti: { minSize: 4, maxSize: 8, countMin: 6, countMax: 8 },
  touchTargetMin: 44,
} as const;

export const tokens = {
  color,
  font,
  space,
  sketch,
  motion,
  concept,
  component,

  // ---- v1 legacy palette — kept only for screens not yet migrated ----
  colors: {
    pageBg: '#FDEAE7',
    primary: '#6C5CE7',
    deep: '#2E2A5C',
    muted: color.muted,
    accent: '#FFA940',
    coral: color.coral,
    success: '#3DDC97',
    gold: '#E8A800',
    goldLight: '#FFC94D',
    cardBg: color.surface,
    lilac: '#EFEDFC',
  },
  radii: {
    card: '24px',
    pill: '999px',
    chip: '999px',
  },
  shadows: {
    card: '0 8px 24px rgba(108,92,231,0.10)',
  },
  typography: {
    family: '"Nunito", "Baloo 2", system-ui, sans-serif',
  },
} as const;

export type WordConceptState = keyof typeof tokens.concept.word;
