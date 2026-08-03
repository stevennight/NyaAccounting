import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatMonthKey, shiftMonthKey } from '../domain/date';
import { formatMoneyMinor } from '../domain/money';
import {
  compareTransactionDateTime,
  getSpendingImpactMinor,
} from '../domain/transactions';
import { Transaction, TransactionKind } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';

type RecordFilter = 'all' | TransactionKind;

const filterOptions: Array<ChoiceOption<RecordFilter>> = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'refund', label: '退款' },
  { value: 'transfer', label: '转账' },
  { value: 'repayment', label: '还款' },
  { value: 'investment', label: '投资' },
];

type RecordsScreenProps = {
  theme: AppTheme;
  onAdd: () => void;
  onOpenTransaction: (transaction: Transaction) => void;
};

function monthLabel(month: string): string {
  const [year, numericMonth] = month.split('-');
  return `${year} 年 ${Number(numericMonth)} 月`;
}

export function RecordsScreen({
  theme,
  onAdd,
  onOpenTransaction,
}: RecordsScreenProps) {
  const { dataset } = useAppStore();
  const [month, setMonth] = useState(() => formatMonthKey(new Date()));
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [query, setQuery] = useState('');

  const visibleTransactions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return dataset.transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .filter((transaction) => filter === 'all' || transaction.kind === filter)
      .filter((transaction) => {
        if (!needle) {
          return true;
        }
        return [transaction.merchant, transaction.description, transaction.note, ...transaction.tags]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(needle));
      })
      .sort((left, right) => compareTransactionDateTime(right, left));
  }, [dataset.transactions, filter, month, query]);

  const netSpendingMinor = useMemo(
    () =>
      visibleTransactions.reduce(
        (sum, transaction) =>
          sum +
          getSpendingImpactMinor(transaction, dataset.settings.currency),
        0,
      ),
    [dataset.settings.currency, visibleTransactions],
  );
  const foreignCurrencyCount = visibleTransactions.filter(
    (transaction) =>
      transaction.currency !== dataset.settings.currency &&
      getSpendingImpactMinor(transaction) !== 0,
  ).length;

  const grouped = useMemo(() => {
    const groups: Array<{ date: string; rows: Transaction[] }> = [];
    for (const transaction of visibleTransactions) {
      const current = groups[groups.length - 1];
      if (!current || current.date !== transaction.date) {
        groups.push({ date: transaction.date, rows: [transaction] });
      } else {
        current.rows.push(transaction);
      }
    }
    return groups;
  }, [visibleTransactions]);

  return (
    <Screen theme={theme} testID="records-screen">
      <PageHeader
        theme={theme}
        title="账目"
        subtitle="只记录消费事实，不维护账户余额"
        action={
          <IconButton
            theme={theme}
            icon="add"
            label="新增账目"
            onPress={onAdd}
            testID="records-add"
          />
        }
      />

      <View style={styles.monthSwitcher}>
        <IconButton
          theme={theme}
          icon="chevron-back"
          label="上个月"
          onPress={() => setMonth((current) => shiftMonthKey(current, -1))}
        />
        <Text style={[styles.month, { color: theme.colors.text }]}>{monthLabel(month)}</Text>
        <IconButton
          theme={theme}
          icon="chevron-forward"
          label="下个月"
          onPress={() => setMonth((current) => shiftMonthKey(current, 1))}
        />
      </View>

      <View
        style={[
          styles.summary,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>本页净消费</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
            {formatMoneyMinor(Math.max(netSpendingMinor, 0), dataset.settings.currency)}
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>记录</Text>
          <Text style={[styles.summaryCount, { color: theme.colors.text }]}>
            {visibleTransactions.length} 笔
          </Text>
        </View>
      </View>

      {foreignCurrencyCount > 0 ? (
        <View style={styles.notice}>
          <InlineNotice
            theme={theme}
            tone="warning"
            message={`${foreignCurrencyCount} 笔外币消费保留在列表中，但没有换算或计入本页净消费。`}
          />
        </View>
      ) : null}

      <View style={styles.filters}>
        <ChoiceChips
          theme={theme}
          value={filter}
          options={filterOptions}
          onChange={setFilter}
        />
        <FormField
          theme={theme}
          label="搜索"
          value={query}
          onChangeText={setQuery}
          placeholder="商户、备注或标签"
          returnKeyType="search"
          testID="records-search"
        />
      </View>

      {grouped.length === 0 ? (
        <EmptyState
          theme={theme}
          icon="receipt-outline"
          title="这个月还没有匹配的账目"
          message={query || filter !== 'all' ? '试试清除搜索或切换筛选条件。' : '从一张消费截图开始即可。'}
          actionLabel={!query && filter === 'all' ? '记第一笔' : undefined}
          onAction={!query && filter === 'all' ? onAdd : undefined}
        />
      ) : (
        <View style={styles.groups}>
          {grouped.map((group) => (
            <View key={group.date}>
              <Text style={[styles.dateHeading, { color: theme.colors.textMuted }]}>
                {group.date.slice(5).replace('-', ' 月 ')} 日
              </Text>
              <View
                style={[
                  styles.group,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                {group.rows.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categories={dataset.settings.categories}
                    paymentChannels={dataset.settings.paymentChannels}
                    theme={theme}
                    onPress={() => onOpenTransaction(transaction)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthSwitcher: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  month: {
    fontSize: typography.sectionTitle,
    fontWeight: '800',
  },
  summary: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.xl,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '900',
  },
  summaryCount: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  filters: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  notice: {
    marginBottom: spacing.xl,
  },
  groups: {
    gap: spacing.lg,
  },
  dateHeading: {
    fontSize: typography.caption,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  group: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
});
