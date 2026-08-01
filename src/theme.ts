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
    background: '#F4F6F4',
    surface: '#FFFFFF',
    surfaceMuted: '#E9EEEA',
    text: '#17211D',
    textMuted: '#647069',
    border: '#D6DED9',
    primary: '#287A59',
    primaryPressed: '#1F6247',
    primarySoft: '#D9EEE4',
    accent: '#D96A4A',
    info: '#4E6F9E',
    warning: '#A87416',
    success: '#247B55',
    danger: '#B94C45',
    overlay: 'rgba(12, 18, 15, 0.42)',
  },
};

const darkTheme: AppTheme = {
  dark: true,
  colors: {
    background: '#111614',
    surface: '#1A211E',
    surfaceMuted: '#232C28',
    text: '#F3F7F4',
    textMuted: '#A8B2AC',
    border: '#34413B',
    primary: '#58B88A',
    primaryPressed: '#73CAA0',
    primarySoft: '#213C30',
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
  heroNumber: 38,
  pageTitle: 24,
  sectionTitle: 17,
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

