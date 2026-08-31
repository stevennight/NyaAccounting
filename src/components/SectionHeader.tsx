import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppTheme, spacing, typography } from '../theme';

type SectionHeaderProps = {
  title: string;
  theme: AppTheme;
  subtitle?: string;
  action?: ReactNode;
};

export function SectionHeader({ title, subtitle, action, theme }: SectionHeaderProps) {
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
    fontSize: typography.sectionTitle,
    fontWeight: '800',
    lineHeight: 24,
  },
  subtitle: {
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
