import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  getCategoryDefinition,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_STATUS_LABELS,
} from '../domain/categories';
import { formatMoneyMinor } from '../domain/money';
import { getTransactionLocalTime } from '../domain/transactions';
import { CategoryId, Transaction } from '../domain/types';
import { AppTheme, radii, spacing, typography } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const categoryIcons: Record<CategoryId, IconName> = {
  food: 'restaurant-outline',
  digital: 'hardware-chip-outline',
  transport: 'train-outline',
  daily: 'bag-handle-outline',
  housing: 'home-outline',
  health: 'medkit-outline',
  learning: 'book-outline',
  leisure: 'game-controller-outline',
  social: 'people-outline',
  travel: 'airplane-outline',
  other: 'ellipsis-horizontal-outline',
};

type TransactionRowProps = {
  transaction: Transaction;
  theme: AppTheme;
  onPress?: () => void;
};

export function TransactionRow({ transaction, theme, onPress }: TransactionRowProps) {
  const category = getCategoryDefinition(transaction.categoryId);
  const isConfirmed = transaction.status === 'confirmed';
  const isRefund = transaction.kind === 'refund';
  const counted =
    isConfirmed && (transaction.kind === 'expense' || isRefund);
  const amountColor = !isConfirmed
    ? theme.colors.textMuted
    : isRefund
    ? theme.colors.success
    : counted
      ? theme.colors.text
      : theme.colors.textMuted;
  const amountPrefix = counted
    ? isRefund
      ? '+'
      : '-'
    : '';
  const merchant = transaction.merchant || TRANSACTION_KIND_LABELS[transaction.kind];
  const transactionTime = getTransactionLocalTime(transaction);
  const meta = [
    category?.label ?? '其他',
    PAYMENT_CHANNEL_LABELS[transaction.paymentChannel],
    `${transaction.date.slice(5).replace('-', '/')}${
      transactionTime ? ` ${transactionTime}` : ''
    }`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border, opacity: pressed ? 0.64 : 1 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Ionicons
          name={categoryIcons[transaction.categoryId]}
          size={20}
          color={theme.colors.textMuted}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.merchant, { color: theme.colors.text }]} numberOfLines={1}>
          {merchant}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.amountBox}>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {amountPrefix}
          {formatMoneyMinor(transaction.amountMinor, transaction.currency)}
        </Text>
        {!isConfirmed || transaction.kind !== 'expense' ? (
          <Text
            style={[
              styles.kind,
              {
                color:
                  transaction.status === 'pending'
                    ? theme.colors.warning
                    : !isConfirmed
                      ? theme.colors.danger
                      : theme.colors.textMuted,
              },
            ]}
          >
            {!isConfirmed
              ? TRANSACTION_STATUS_LABELS[transaction.status]
              : TRANSACTION_KIND_LABELS[transaction.kind]}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  merchant: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  meta: {
    fontSize: typography.caption,
  },
  amountBox: {
    maxWidth: 132,
    alignItems: 'flex-end',
    gap: 2,
  },
  amount: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  kind: {
    fontSize: typography.caption,
  },
});
