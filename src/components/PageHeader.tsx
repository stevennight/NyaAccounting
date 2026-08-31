import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppTheme, spacing, typography } from '../theme';
import { IconButton } from './IconButton';

type PageHeaderProps = {
  theme: AppTheme;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
};

export function PageHeader({
  theme,
  title,
  subtitle,
  action,
  onBack,
  backLabel = '返回',
  backDisabled = false,
}: PageHeaderProps) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <IconButton
          theme={theme}
          icon="chevron-back"
          label={backLabel}
          onPress={onBack}
          disabled={backDisabled}
        />
      ) : null}
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.colors.text }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.pageTitle,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: typography.label,
    lineHeight: 20,
  },
});
