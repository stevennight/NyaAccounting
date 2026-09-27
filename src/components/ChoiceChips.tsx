import { useRef } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  /** Placed on a colored container (e.g. the amount card): selected chips use the page color. */
  onContainer?: boolean;
  testID?: string;
};

export function ChoiceChips<T extends string>({
  theme,
  value,
  options,
  onChange,
  scrollable = true,
  onContainer = false,
  testID,
}: ChoiceChipsProps<T>) {
  const selectedBackground = onContainer
    ? theme.colors.background
    : theme.colors.primarySoft;
  const scrollRef = useRef<ScrollView>(null);

  const scrollSelectedIntoView = (
    event: LayoutChangeEvent,
    selected: boolean,
  ) => {
    if (!selected) {
      return;
    }
    const { x } = event.nativeEvent.layout;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: Math.max(0, x - spacing.md),
        animated: true,
      });
    });
  };

  const content = (
    <View
      style={[
        styles.row,
        !scrollable && styles.segmented,
        !scrollable && { backgroundColor: theme.colors.surfaceMuted },
      ]}
      testID={testID}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            onLayout={(event) =>
              scrollSelectedIntoView(event, selected)
            }
            style={({ pressed }) => [
              styles.chip,
              !scrollable && styles.segmentedChip,
              {
                // M3 filter chips (scrollable) / segmented button.
                backgroundColor: selected ? selectedBackground : 'transparent',
                borderColor: selected
                  ? selectedBackground
                  : scrollable && !onContainer
                    ? theme.colors.border
                    : 'transparent',
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: selected
                    ? onContainer
                      ? theme.colors.text
                      : theme.colors.onPrimarySoft
                    : onContainer
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.textMuted,
                  fontWeight: selected ? '600' : '500',
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
      ref={scrollRef}
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
    gap: spacing.sm,
  },
  segmented: {
    width: '100%',
    gap: spacing.xs,
    borderRadius: radii.pill,
    padding: spacing.xs,
  },
  chip: {
    minHeight: 36,
    minWidth: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentedChip: {
    minHeight: 40,
    borderRadius: radii.pill,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontSize: typography.label,
  },
});
