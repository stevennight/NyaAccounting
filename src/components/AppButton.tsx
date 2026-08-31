import { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme, radii, spacing, typography } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type AppButtonProps = {
  label: string;
  onPress: () => void;
  theme: AppTheme;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  testID?: string;
};

export function AppButton({
  label,
  onPress,
  theme,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
  testID,
}: AppButtonProps) {
  const palette =
    variant === 'primary'
      ? {
          background: theme.colors.primary,
          pressed: theme.colors.primaryPressed,
          foreground: '#FFFFFF',
          border: theme.colors.primary,
        }
      : variant === 'danger'
        ? {
            background: theme.colors.danger,
            pressed: `${theme.colors.danger}DD`,
            foreground: '#FFFFFF',
            border: theme.colors.danger,
          }
        : variant === 'secondary'
          ? {
              background: theme.colors.surface,
              pressed: theme.colors.surfaceMuted,
              foreground: theme.colors.text,
              border: theme.colors.border,
            }
          : {
              background: 'transparent',
              pressed: theme.colors.primarySoft,
              foreground: theme.colors.primary,
              border: 'transparent',
            };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.compact : styles.regular,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.foreground} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={compact ? 17 : 19} color={palette.foreground} /> : null}
          <Text style={[styles.label, { color: palette.foreground }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  regular: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  compact: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
});
