import { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme, radii } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  theme: AppTheme;
  selected?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function IconButton({
  icon,
  label,
  onPress,
  theme,
  selected = false,
  disabled = false,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.64 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={21}
        color={selected ? theme.colors.primary : theme.colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

