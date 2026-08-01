import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppTheme, spacing, typography } from '../theme';

type PageHeaderProps = {
  theme: AppTheme;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function PageHeader({ theme, title, subtitle, action }: PageHeaderProps) {
  return (
    <View style={styles.row}>
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
    alignItems: 'flex-start',
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

