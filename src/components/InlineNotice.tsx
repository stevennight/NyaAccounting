import { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme, radii, spacing, typography } from '../theme';

type InlineNoticeProps = {
  theme: AppTheme;
  message: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
};

export function InlineNotice({ theme, message, tone = 'info' }: InlineNoticeProps) {
  const color = theme.colors[tone];
  const icon: ComponentProps<typeof Ionicons>['name'] =
    tone === 'danger'
      ? 'alert-circle'
      : tone === 'warning'
        ? 'warning'
        : tone === 'success'
          ? 'checkmark-circle'
          : 'information-circle';

  return (
    <View style={[styles.notice, { backgroundColor: `${color}18`, borderColor: `${color}55` }]}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: typography.label,
    lineHeight: 19,
  },
});

