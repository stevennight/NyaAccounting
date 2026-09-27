import { ColorSchemeName } from 'react-native';

// Material 3 tonal palette generated from the "mist blue" seed (#405F90).
// The older semantic keys (surface, primarySoft, ...) map onto M3 roles so
// existing screens pick up the new look without per-screen changes.
export type AppTheme = {
  dark: boolean;
  colors: {
    /** M3 surface: page canvas. */
    background: string;
    /** M3 surfaceContainerLow: cards, list groups, text fields. */
    surface: string;
    /** M3 surfaceContainerHigh: tracks, segmented backgrounds, sheets. */
    surfaceMuted: string;
    /** M3 surfaceContainer: navigation bar. */
    surfaceContainer: string;
    text: string;
    textMuted: string;
    /** M3 outlineVariant: hairlines and outlined controls. */
    border: string;
    outline: string;
    primary: string;
    onPrimary: string;
    primaryPressed: string;
    /** M3 secondaryContainer: selected chips, nav indicator, tonal buttons. */
    primarySoft: string;
    onPrimarySoft: string;
    primaryContainer: string;
    onPrimaryContainer: string;
    tertiaryContainer: string;
    onTertiaryContainer: string;
    accent: string;
    info: string;
    warning: string;
    success: string;
    danger: string;
    onDanger: string;
    overlay: string;
  };
};

const lightTheme: AppTheme = {
  dark: false,
  colors: {
    background: '#F9F9FF',
    surface: '#F1F3FA',
    surfaceMuted: '#E4E7F0',
    surfaceContainer: '#EBEDF5',
    text: '#191C20',
    textMuted: '#44474E',
    border: '#D8DBE5',
    outline: '#74777F',
    primary: '#405F90',
    onPrimary: '#FFFFFF',
    primaryPressed: '#34507D',
    primarySoft: '#DAE2F9',
    onPrimarySoft: '#131C2B',
    primaryContainer: '#D6E3FF',
    onPrimaryContainer: '#001B3E',
    tertiaryContainer: '#FAD8FD',
    onTertiaryContainer: '#28132E',
    accent: '#7A5580',
    info: '#405F90',
    warning: '#855400',
    success: '#2E6B3A',
    danger: '#BA1A1A',
    onDanger: '#FFFFFF',
    overlay: 'rgba(15, 20, 30, 0.42)',
  },
};

const darkTheme: AppTheme = {
  dark: true,
  colors: {
    background: '#111318',
    surface: '#1B1E23',
    surfaceMuted: '#2A2D33',
    surfaceContainer: '#1F2227',
    text: '#E2E2E9',
    textMuted: '#C4C6D0',
    border: '#353941',
    outline: '#8E9099',
    primary: '#AAC7FF',
    onPrimary: '#0A305F',
    primaryPressed: '#C3D7FF',
    primarySoft: '#3E4759',
    onPrimarySoft: '#DAE2F9',
    primaryContainer: '#284777',
    onPrimaryContainer: '#D6E3FF',
    tertiaryContainer: '#573E5C',
    onTertiaryContainer: '#FAD8FD',
    accent: '#E7B9EC',
    info: '#AAC7FF',
    warning: '#F3BD6E',
    success: '#8FD69B',
    danger: '#FFB4AB',
    onDanger: '#690005',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

export function getTheme(colorScheme: ColorSchemeName): AppTheme {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// M3 shape scale: small (chips), medium (cards), large (grouped lists),
// extra-large (sheets, hero cards), full (buttons, indicators).
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  pill: 999,
};

export const typography = {
  heroNumber: 36,
  pageTitle: 24,
  sectionTitle: 17,
  body: 15,
  label: 13,
  caption: 12,
};

export const categoryColors = [
  '#3F6CA8',
  '#C0663F',
  '#2F8578',
  '#A77A1C',
  '#8261A8',
  '#3C8AA8',
  '#B0506E',
  '#6B707C',
];
