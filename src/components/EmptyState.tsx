import { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme, radii, spacing, typography } from '../theme';
import { AppButton } from './AppButton';

type EmptyStateProps = {
  theme: AppTheme;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  theme,
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name={icon} size={24} color={theme.colors.primary} />
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} theme={theme} compact />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sectionTitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 380,
  },
});
