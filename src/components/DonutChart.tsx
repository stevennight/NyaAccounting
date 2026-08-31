import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppTheme, spacing, typography } from '../theme';

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  theme: AppTheme;
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  size?: number;
};

export function DonutChart({
  theme,
  segments,
  centerLabel,
  centerValue,
  size = 168,
}: DonutChartProps) {
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  let offset = 0;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.colors.surfaceMuted}
          strokeWidth={strokeWidth}
        />
        {total > 0
          ? segments.map((segment) => {
              const fraction = Math.max(segment.value, 0) / total;
              const dash = Math.max(fraction * circumference - 2, 0);
              const dashOffset = -offset * circumference;
              offset += fraction;
              return (
                <Circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
            })
          : null}
      </Svg>
      <View style={styles.center}>
        <Text
          style={[styles.value, { color: theme.colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
        >
          {centerValue}
        </Text>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  value: {
    fontSize: 19,
    fontWeight: '900',
    maxWidth: 110,
  },
  label: {
    fontSize: typography.caption,
  },
});
