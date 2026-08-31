import { ReactNode, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

type FormFieldProps = TextInputProps & {
  label: string;
  theme: AppTheme;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
};

export function FormField({
  label,
  theme,
  hint,
  error,
  trailing,
  multiline,
  style,
  onBlur,
  onFocus,
  ...inputProps
}: FormFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
        {trailing}
      </View>
      <TextInput
        {...inputProps}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.primary
                : theme.colors.border,
            color: theme.colors.text,
          },
          style,
        ]}
      />
      {error || hint ? (
        <Text
          style={[
            styles.hint,
            { color: error ? theme.colors.danger : theme.colors.textMuted },
          ]}
        >
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  labelRow: {
    minHeight: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: typography.body,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
