/**
 * Starkies shared design-system foundations.
 * Keep shared scales here; app-specific themes override semantic colors in CSS.
 */
export const DS_COLORS = {
  primary: '#6750a4',
  onPrimary: '#ffffff',
  primaryContainer: '#eaddff',
  onPrimaryContainer: '#21005d',
  secondary: '#625b71',
  surface: '#fffbfe',
  surfaceContainer: '#f3edf7',
  page: '#f7f2fa',
  text: '#1d1b20',
  textMuted: '#49454f',
  outline: '#79747e',
  outlineVariant: '#cac4d0',
  success: '#386a20',
  warning: '#7d5700',
  error: '#b3261e',
} as const;

export const DS_SPACING = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const DS_SIZES = {
  controlSm: '32px',
  controlMd: '40px',
  controlLg: '48px',
  contentMaxWidth: '1280px',
} as const;

export const DS_SHAPES = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '28px',
  full: '9999px',
} as const;

export const DS_TYPOGRAPHY = {
  fontFamily: "'Roboto', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sizeXs: '12px',
  sizeSm: '14px',
  sizeMd: '16px',
  sizeLg: '18px',
  sizeXl: '22px',
  size2xl: '28px',
  sizeDisplay: '36px',
} as const;

export const DS_ELEVATION = {
  level1: '0 1px 2px rgb(25 18 35 / 8%), 0 1px 3px rgb(25 18 35 / 6%)',
  level2: '0 4px 12px rgb(25 18 35 / 10%)',
  level3: '0 12px 32px rgb(25 18 35 / 14%)',
} as const;
