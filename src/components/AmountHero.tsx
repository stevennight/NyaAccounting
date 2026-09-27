import { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppTheme, radii, spacing, typography } from '../theme';

type AmountHeroProps = {
  theme: AppTheme;
  /** Optional content above the amount, e.g. the transaction kind chips. */
  header?: ReactNode;
  amount: string;
  onChangeAmount: (value: string) => void;
  amountError?: string;
  /** Shown under the fields when there is no error. */
  hint?: string;
  currency: string;
  onChangeCurrency: (value: string) => void;
  currencyError?: string;
  date: string;
  onChangeDate: (value: string) => void;
  dateError?: string;
  time: string;
  onChangeTime: (value: string) => void;
  timeError?: string;
  testIDPrefix: string;
};

/**
 * Review/edit hero card: the amount is the one thing that must be right, so
 * it gets the large type; currency, date and time sit next to it as pills.
 */
export function AmountHero({
  theme,
  header,
  amount,
  onChangeAmount,
  amountError,
  hint,
  currency,
  onChangeCurrency,
  currencyError,
  date,
  onChangeDate,
  dateError,
  time,
  onChangeTime,
  timeError,
  testIDPrefix,
}: AmountHeroProps) {
  const errors = [amountError, currencyError, dateError, timeError].filter(
    (value): value is string => Boolean(value),
  );
  const onContainer = theme.colors.onPrimaryContainer;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]}>
      {header}
      <View style={styles.amountRow}>
        <TextInput
          value={currency}
          onChangeText={onChangeCurrency}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          placeholder="CNY"
          placeholderTextColor={`${onContainer}88`}
          selectionColor={theme.colors.primary}
          accessibilityLabel="币种"
          style={[
            styles.currency,
            {
              color: onContainer,
              backgroundColor: theme.colors.background,
              borderColor: currencyError ? theme.colors.danger : 'transparent',
            },
          ]}
          testID={`${testIDPrefix}-currency`}
        />
        <TextInput
          value={amount}
          onChangeText={onChangeAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={`${onContainer}66`}
          selectionColor={theme.colors.primary}
          accessibilityLabel="金额"
          style={[
            styles.amount,
            {
              color: amountError ? theme.colors.danger : onContainer,
            },
          ]}
          testID={`${testIDPrefix}-amount`}
        />
      </View>
      <View style={styles.metaRow}>
        <TextInput
          value={date}
          onChangeText={onChangeDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.textMuted}
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          selectionColor={theme.colors.primary}
          accessibilityLabel="日期"
          style={[
            styles.pill,
            styles.datePill,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
              borderColor: dateError ? theme.colors.danger : 'transparent',
            },
          ]}
          testID={`${testIDPrefix}-date`}
        />
        <TextInput
          value={time}
          onChangeText={onChangeTime}
          placeholder="时间（可选）"
          placeholderTextColor={theme.colors.textMuted}
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          selectionColor={theme.colors.primary}
          accessibilityLabel="时间（可选）"
          style={[
            styles.pill,
            styles.timePill,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
              borderColor: timeError ? theme.colors.danger : 'transparent',
            },
          ]}
          testID={`${testIDPrefix}-time`}
        />
      </View>
      {errors.length > 0 ? (
        <Text style={[styles.error, { color: theme.colors.danger }]}>
          {errors.join(' ')}
        </Text>
      ) : hint ? (
        <Text style={[styles.error, { color: onContainer }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currency: {
    width: 64,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: typography.label,
    fontWeight: '600',
    paddingVertical: 0,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    fontSize: 38,
    fontWeight: '500',
    paddingVertical: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    fontSize: typography.label,
  },
  datePill: {
    flex: 3,
    minWidth: 0,
  },
  timePill: {
    flex: 2,
    minWidth: 0,
  },
  error: {
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
