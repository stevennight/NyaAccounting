import { StyleSheet, Text, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

type ProgressBarProps = {
  theme: AppTheme;
  value: number;
  label?: string;
  detail?: string;
  tone?: 'primary' | 'warning' | 'danger';
};

export function ProgressBar({
  theme,
  value,
  label,
  detail,
  tone = 'primary',
}: ProgressBarProps) {
  const normalized = Math.max(0, Math.min(value, 1));
  const color =
    tone === 'danger'
      ? theme.colors.danger
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.primary;

  return (
    <View style={styles.wrapper}>
      {label || detail ? (
        <View style={styles.labels}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
          <Text style={[styles.detail, { color: theme.colors.textMuted }]}>{detail}</Text>
        </View>
      ) : null}
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${normalized * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    flex: 1,
    fontSize: typography.label,
    fontWeight: '700',
  },
  detail: {
    fontSize: typography.caption,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});

