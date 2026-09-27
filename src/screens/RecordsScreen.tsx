import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { calculateBudgetFromSettings } from '../domain/analytics';
import { formatLocalDate, formatMonthKey, shiftMonthKey } from '../domain/date';
import { formatMoneyMinor } from '../domain/money';
import {
  compareTransactionDateTime,
  getSpendingImpactMinor,
} from '../domain/transactions';
import { Transaction, TransactionKind } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { AppButton } from '../components/AppButton';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { Screen } from '../components/Screen';
import { SearchField } from '../components/SearchField';
import { TransactionRow } from '../components/TransactionRow';

type RecordFilter = 'all' | TransactionKind;
type CurrencyFilter = 'all' | 'default' | 'foreign' | `currency:${string}`;

const filterOptions: Array<ChoiceOption<RecordFilter>> = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'refund', label: '退款' },
  { value: 'transfer', label: '转账' },
  { value: 'repayment', label: '还款' },
  { value: 'investment', label: '投资' },
];

/** Space kept under the list so the floating "记一笔" button never covers a row. */
const FAB_CLEARANCE = 96;

type RecordsScreenProps = {
  theme: AppTheme;
  onAdd: () => void;
  onOpenTransaction: (transaction: Transaction) => void;
  onOpenBudgetSettings: () => void;
};

function monthLabel(month: string, currentMonth: string): string {
  const [year, numericMonth] = month.split('-');
  return year === currentMonth.slice(0, 4)
    ? `${Number(numericMonth)} 月`
    : `${year} 年 ${Number(numericMonth)} 月`;
}

function dateLabel(date: string, today: string): string {
  if (date === today) {
    return '今天';
  }
  const [, month, day] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );
  return `${month} 月 ${day} 日 ${weekday}`;
}

/** 明细: the month's budget at a glance, then every record grouped by day. */
export function RecordsScreen({
  theme,
  onAdd,
  onOpenTransaction,
  onOpenBudgetSettings,
}: RecordsScreenProps) {
  const { dataset, persistenceError } = useAppStore();
  const today = formatLocalDate(new Date());
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(() => formatMonthKey(new Date()));
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const currency = dataset.settings.currency;

  const foreignCurrencies = useMemo(
    () =>
      Array.from(
        new Set(dataset.transactions.map((transaction) => transaction.currency)),
      )
        .filter((value) => value !== currency)
        .sort(),
    [currency, dataset.transactions],
  );

  const currencyOptions = useMemo<Array<ChoiceOption<CurrencyFilter>>>(
    () => [
      { value: 'all', label: '全部币种' },
      { value: 'default', label: `本位币 ${currency}` },
      { value: 'foreign', label: '外币' },
      ...foreignCurrencies.map((value) => ({
        value: `currency:${value}` as CurrencyFilter,
        label: value,
      })),
    ],
    [currency, foreignCurrencies],
  );

  const budgetSummary = useMemo(
    () =>
      calculateBudgetFromSettings(
        dataset.transactions,
        dataset.settings,
        month,
        dataset.recurringExpenses,
        today,
      ),
    [dataset.recurringExpenses, dataset.settings, dataset.transactions, month, today],
  );

  const visibleTransactions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return dataset.transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .filter((transaction) => filter === 'all' || transaction.kind === filter)
      .filter((transaction) => {
        if (currencyFilter === 'all') return true;
        if (currencyFilter === 'default') {
          return transaction.currency === currency;
        }
        if (currencyFilter === 'foreign') {
          return transaction.currency !== currency;
        }
        return transaction.currency === currencyFilter.slice('currency:'.length);
      })
      .filter((transaction) => {
        if (!needle) {
          return true;
        }
        return [transaction.merchant, transaction.description, transaction.note, ...transaction.tags]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(needle));
      })
      .sort((left, right) => compareTransactionDateTime(right, left));
  }, [currency, currencyFilter, dataset.transactions, filter, month, query]);

  const netSpendingMinor = useMemo(
    () =>
      visibleTransactions.reduce(
        (sum, transaction) => sum + getSpendingImpactMinor(transaction, currency),
        0,
      ),
    [currency, visibleTransactions],
  );
  const unconvertedForeignCurrencyCount = visibleTransactions.filter(
    (transaction) =>
      transaction.currency !== currency &&
      getSpendingImpactMinor(transaction, currency) === 0 &&
      getSpendingImpactMinor(transaction) !== 0,
  ).length;

  const grouped = useMemo(() => {
    const groups: Array<{ date: string; rows: Transaction[]; netMinor: number }> = [];
    for (const transaction of visibleTransactions) {
      const impact = getSpendingImpactMinor(transaction, currency);
      const current = groups[groups.length - 1];
      if (!current || current.date !== transaction.date) {
        groups.push({ date: transaction.date, rows: [transaction], netMinor: impact });
      } else {
        current.rows.push(transaction);
        current.netMinor += impact;
      }
    }
    return groups;
  }, [currency, visibleTransactions]);

  const filtersActive =
    filter !== 'all' || currencyFilter !== 'all' || query.trim().length > 0;
  const budgetMinor = dataset.settings.monthlyBudgetMinor;
  const remainingMinor = budgetSummary.remainingMinor;
  const overBudget = remainingMinor < 0;
  const isCurrentMonth = month === currentMonth;

  const header = (
    <View style={styles.topBar}>
      <IconButton
        theme={theme}
        icon="chevron-back"
        label="上个月"
        onPress={() => setMonth((value) => shiftMonthKey(value, -1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isCurrentMonth ? '当前月份' : '回到本月'}
        onPress={() => setMonth(currentMonth)}
        style={styles.monthButton}
      >
        <Text
          accessibilityRole="header"
          style={[styles.monthTitle, { color: theme.colors.text }]}
        >
          {monthLabel(month, currentMonth)}
        </Text>
        {!isCurrentMonth ? (
          <Text style={[styles.monthHint, { color: theme.colors.primary }]}>回到本月</Text>
        ) : null}
      </Pressable>
      <IconButton
        theme={theme}
        icon="chevron-forward"
        label="下个月"
        onPress={() => setMonth((value) => shiftMonthKey(value, 1))}
      />
      <View style={styles.topBarSpacer} />
      <IconButton
        theme={theme}
        icon="search"
        label={searchOpen ? '收起搜索和筛选' : '搜索和筛选'}
        selected={searchOpen || filtersActive}
        onPress={() => setSearchOpen((open) => !open)}
        testID="records-search-toggle"
      />
    </View>
  );

  return (
    <Screen
      theme={theme}
      header={header}
      contentStyle={{ paddingBottom: FAB_CLEARANCE }}
      testID="records-screen"
    >
      {persistenceError ? (
        <View style={styles.block}>
          <InlineNotice theme={theme} tone="danger" message={persistenceError} />
        </View>
      ) : null}

      {budgetMinor > 0 ? (
        <View
          style={[
            styles.budgetCard,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
          testID="records-budget"
        >
          <Text style={[styles.budgetLabel, { color: theme.colors.onPrimaryContainer }]}>
            {overBudget ? '已超出预算' : '预算剩余'}
          </Text>
          <Text
            style={[
              styles.budgetAmount,
              { color: overBudget ? theme.colors.danger : theme.colors.onPrimaryContainer },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatMoneyMinor(Math.abs(remainingMinor), currency)}
          </Text>
          <View style={[styles.budgetTrack, { backgroundColor: theme.colors.background }]}>
            <View
              style={[
                styles.budgetFill,
                {
                  width: `${Math.min(budgetSummary.usedRatio ?? 0, 1) * 100}%`,
                  backgroundColor:
                    budgetSummary.health === 'over' || budgetSummary.health === 'danger'
                      ? theme.colors.danger
                      : budgetSummary.health === 'watch'
                        ? theme.colors.warning
                        : theme.colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.budgetChips}>
            <BudgetChip
              theme={theme}
              label={`已花 ${formatMoneyMinor(Math.max(budgetSummary.netSpentMinor, 0), currency)}`}
            />
            <BudgetChip
              theme={theme}
              label={`预算 ${formatMoneyMinor(budgetMinor, currency)}`}
            />
            {isCurrentMonth && !overBudget && budgetSummary.daysRemaining > 0 ? (
              <BudgetChip
                theme={theme}
                label={`日均可花 ${formatMoneyMinor(budgetSummary.dailyAvailableMinor, currency)} · 剩 ${budgetSummary.daysRemaining} 天`}
              />
            ) : null}
          </View>
          {budgetSummary.recurringReservedMinor > 0 ? (
            <Text style={[styles.budgetNote, { color: theme.colors.onPrimaryContainer }]}>
              已为未入账的固定支出预留{' '}
              {formatMoneyMinor(budgetSummary.recurringReservedMinor, currency)}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.setupCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.setupCopy}>
            <Text style={[styles.setupTitle, { color: theme.colors.text }]}>设置月度预算</Text>
            <Text style={[styles.setupText, { color: theme.colors.textMuted }]}>
              只按预算和已确认消费计算还能花多少，不需要记录钱包余额。
            </Text>
          </View>
          <AppButton
            theme={theme}
            label="设置"
            onPress={onOpenBudgetSettings}
            variant="secondary"
            compact
          />
        </View>
      )}

      {budgetSummary.foreignCurrencyTransactionCount > 0 ||
      unconvertedForeignCurrencyCount > 0 ? (
        <View style={styles.block}>
          <InlineNotice
            theme={theme}
            tone="warning"
            message={`${Math.max(budgetSummary.foreignCurrencyTransactionCount, unconvertedForeignCurrencyCount)} 笔外币消费尚未换算为${currency}，因此没有计入预算。点开账目即可补录。`}
          />
        </View>
      ) : null}

      {searchOpen ? (
        <View style={styles.filters}>
          <SearchField
            theme={theme}
            value={query}
            onChangeText={setQuery}
            placeholder="商户、备注或标签"
            accessibilityLabel="搜索账目"
            testID="records-search"
          />
          <ChoiceChips theme={theme} value={filter} options={filterOptions} onChange={setFilter} />
          {foreignCurrencies.length > 0 ? (
            <ChoiceChips
              theme={theme}
              value={currencyFilter}
              options={currencyOptions}
              onChange={setCurrencyFilter}
              testID="records-currency-filter"
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: theme.colors.text }]}>
          {filtersActive ? '筛选结果' : '账单'}
        </Text>
        <Text style={[styles.listMeta, { color: theme.colors.textMuted }]}>
          {visibleTransactions.length} 笔 · 净消费{' '}
          {formatMoneyMinor(Math.max(netSpendingMinor, 0), currency)}
        </Text>
      </View>

      {grouped.length === 0 ? (
        <EmptyState
          theme={theme}
          icon="receipt-outline"
          title={filtersActive ? '没有匹配的账目' : '这个月还没有账目'}
          message={filtersActive ? '试试清除搜索或切换筛选条件。' : '点右下角“记一笔”，从一张消费截图开始。'}
          actionLabel={filtersActive ? undefined : '记一笔'}
          onAction={filtersActive ? undefined : onAdd}
        />
      ) : (
        <View style={styles.groups}>
          {grouped.map((group) => (
            <View key={group.date}>
              <View style={styles.dateHeader}>
                <Text style={[styles.dateHeading, { color: theme.colors.textMuted }]}>
                  {dateLabel(group.date, today)}
                </Text>
                {group.netMinor !== 0 ? (
                  <Text style={[styles.dateTotal, { color: theme.colors.textMuted }]}>
                    {group.netMinor > 0 ? '支出 ' : '退回 '}
                    {formatMoneyMinor(Math.abs(group.netMinor), currency)}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
                {group.rows.map((transaction, index) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categories={dataset.settings.categories}
                    paymentChannels={dataset.settings.paymentChannels}
                    theme={theme}
                    last={index === group.rows.length - 1}
                    showDate={false}
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

function BudgetChip({ theme, label }: { theme: AppTheme; label: string }) {
  return (
    <View style={[styles.budgetChip, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.budgetChipText, { color: theme.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: -spacing.sm,
    marginRight: -spacing.sm,
  },
  monthButton: {
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 22,
    fontWeight: '500',
  },
  monthHint: {
    fontSize: typography.caption,
  },
  topBarSpacer: {
    flex: 1,
  },
  block: {
    marginBottom: spacing.lg,
  },
  budgetCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  budgetLabel: {
    fontSize: typography.label,
  },
  budgetAmount: {
    fontSize: 34,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  budgetTrack: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  budgetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  budgetChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  budgetChipText: {
    fontSize: typography.caption,
    fontWeight: '500',
  },
  budgetNote: {
    fontSize: typography.caption,
    opacity: 0.8,
  },
  setupCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  setupCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  setupTitle: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  setupText: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  filters: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  listTitle: {
    fontSize: typography.sectionTitle,
    fontWeight: '500',
  },
  listMeta: {
    fontSize: typography.caption,
  },
  groups: {
    gap: spacing.md,
  },
  dateHeader: {
    minHeight: 30,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dateHeading: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '500',
  },
  dateTotal: {
    fontSize: typography.caption,
  },
  group: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
});
