import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

type SearchFieldProps = {
  theme: AppTheme;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  testID?: string;
};

export function SearchField({
  theme,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
}: SearchFieldProps) {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Ionicons name="search" size={19} color={theme.colors.textMuted} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
        style={[styles.input, { color: theme.colors.text }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="清除搜索"
          onPress={() => onChangeText('')}
          hitSlop={4}
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close-circle" size={19} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    minWidth: 0,
    flex: 1,
    minHeight: 46,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    fontSize: typography.body,
  },
  clear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
