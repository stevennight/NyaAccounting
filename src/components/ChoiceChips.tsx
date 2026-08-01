import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
};

type ChoiceChipsProps<T extends string> = {
  theme: AppTheme;
  value: T | null;
  options: ReadonlyArray<ChoiceOption<T>>;
  onChange: (value: T) => void;
  scrollable?: boolean;
  testID?: string;
};

export function ChoiceChips<T extends string>({
  theme,
  value,
  options,
  onChange,
  scrollable = true,
  testID,
}: ChoiceChipsProps<T>) {
  const content = (
    <View style={styles.row} testID={testID}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                opacity: pressed ? 0.68 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected ? theme.colors.primary : theme.colors.text,
                  fontWeight: selected ? '800' : '600',
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) {
    return content;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingRight: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 38,
    minWidth: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: typography.label,
  },
});
