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
          icon="arrow-back"
          label={backLabel}
          onPress={onBack}
          disabled={backDisabled}
        />
      ) : null}
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
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
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.pageTitle,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: typography.label,
    lineHeight: 19,
  },
});
