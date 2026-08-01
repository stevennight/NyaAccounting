import { StyleSheet, Text, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

export type MonthlyBarDatum = {
  label: string;
  value: number;
  isCurrent?: boolean;
};

type MonthlyBarChartProps = {
  theme: AppTheme;
  data: MonthlyBarDatum[];
  formatValue: (value: number) => string;
};

export function MonthlyBarChart({ theme, data, formatValue }: MonthlyBarChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <View style={styles.chart}>
      <View style={styles.bars}>
        {data.map((item) => {
          const height = Math.max((item.value / maxValue) * 122, item.value > 0 ? 6 : 2);
          return (
            <View key={item.label} style={styles.column}>
              <Text
                style={[styles.value, { color: theme.colors.textMuted }]}
                numberOfLines={1}
              >
                {item.value > 0 ? formatValue(item.value) : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: item.isCurrent
                        ? theme.colors.accent
                        : theme.colors.info,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: item.isCurrent ? theme.colors.text : theme.colors.textMuted,
                    fontWeight: item.isCurrent ? '800' : '600',
                  },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    minHeight: 174,
    width: '100%',
  },
  bars: {
    minHeight: 174,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  column: {
    flex: 1,
    minWidth: 34,
    alignItems: 'center',
    gap: spacing.xs,
  },
  value: {
    height: 16,
    fontSize: 10,
    maxWidth: 52,
  },
  barTrack: {
    height: 124,
    width: '100%',
    maxWidth: 34,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    minHeight: 2,
  },
  label: {
    fontSize: typography.caption,
  },
});

