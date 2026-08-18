import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

type CheckboxRowProps = {
  theme: AppTheme;
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
};

export function CheckboxRow({
  theme,
  title,
  detail,
  value,
  onChange,
  testID,
}: CheckboxRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: value ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: value ? theme.colors.primary : 'transparent',
            borderColor: value ? theme.colors.primary : theme.colors.border,
          },
        ]}
      >
        {value ? (
          <Ionicons name="checkmark" size={17} color={theme.colors.surface} />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  box: {
    width: 24,
    height: 24,
    flexShrink: 0,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: radii.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  detail: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
