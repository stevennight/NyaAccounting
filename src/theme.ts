import { ColorSchemeName } from 'react-native';

export type AppTheme = {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    primaryPressed: string;
    primarySoft: string;
    accent: string;
    info: string;
    warning: string;
    success: string;
    danger: string;
    overlay: string;
  };
};

const lightTheme: AppTheme = {
  dark: false,
  colors: {
    background: '#F7F8F6',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF1EE',
    text: '#17201B',
    textMuted: '#68716B',
    border: '#DDE3DF',
    primary: '#167A52',
    primaryPressed: '#10623F',
    primarySoft: '#E1F2E9',
    accent: '#D9674A',
    info: '#3F6F9F',
    warning: '#A66B0A',
    success: '#187B4F',
    danger: '#B84343',
    overlay: 'rgba(12, 18, 15, 0.42)',
  },
};

const darkTheme: AppTheme = {
  dark: true,
  colors: {
    background: '#111512',
    surface: '#1B211D',
    surfaceMuted: '#252D28',
    text: '#F3F7F4',
    textMuted: '#AAB3AD',
    border: '#36423B',
    primary: '#55BC88',
    primaryPressed: '#72CAA0',
    primarySoft: '#203B2E',
    accent: '#F08A68',
    info: '#86A6D0',
    warning: '#D5A84B',
    success: '#63C395',
    danger: '#EF837C',
    overlay: 'rgba(0, 0, 0, 0.62)',
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

export const radii = {
  sm: 4,
  md: 8,
  pill: 999,
};

export const typography = {
  heroNumber: 36,
  pageTitle: 26,
  sectionTitle: 18,
  body: 15,
  label: 13,
  caption: 12,
};

export const categoryColors = [
  '#287A59',
  '#D96A4A',
  '#4E6F9E',
  '#B7821E',
  '#8A669E',
  '#3E8B91',
  '#B4556A',
  '#6D756F',
];
