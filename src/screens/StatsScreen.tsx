import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  buildSixMonthSeries,
  calculateMonthAnalytics,
} from '../domain/analytics';
import {
  formatLocalDate,
  formatMonthKey,
  shiftMonthKey,
} from '../domain/date';
import { formatMoneyMinor, minorToMajor } from '../domain/money';
import type { CurrencyCode } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { DonutChart } from '../components/DonutChart';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { MonthlyBarChart } from '../components/MonthlyBarChart';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';

type StatsScreenProps = {
  theme: AppTheme;
};

function monthLabel(month: string): string {
  const [year, numericMonth] = month.split('-');
  return `${year} 年 ${Number(numericMonth)} 月`;
}

function compactMoney(
  amountMinor: number,
  currency: CurrencyCode,
): string {
  const amount = minorToMajor(amountMinor, currency);
  if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(amount >= 100_000 ? 0 : 1)}万`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}k`;
  }
  return `${Math.round(amount)}`;
}

export function StatsScreen({ theme }: StatsScreenProps) {
  const { dataset } = useAppStore();
  const currentMonth = formatMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);

  const analytics = useMemo(
    () =>
      calculateMonthAnalytics(
        {
          transactions: dataset.transactions,
          month,
          budgetMinor: dataset.settings.monthlyBudgetMinor,
          currency: dataset.settings.currency,
          recurringExpenses: dataset.recurringExpenses,
          reserveRecurringExpenses: dataset.settings.reserveRecurringExpenses,
          asOfDate: formatLocalDate(new Date()),
          warningRatio: dataset.settings.budgetWarningRatio,
          dangerRatio: dataset.settings.budgetDangerRatio,
        },
        dataset.settings.categoryBudgetsMinor,
        dataset.settings.categories,
      ),
    [
      dataset.recurringExpenses,
      dataset.settings,
      dataset.transactions,
      month,
    ],
  );

  const monthSpendingMinor = Math.max(analytics.budget.netSpentMinor, 0);
  const categoryData = analytics.categories
    .filter((category) => category.chartAmountMinor > 0)
    .map((category) => ({
      id: category.categoryId,
      label: category.label,
      value: category.chartAmountMinor,
      color: category.color,
      shareRatio: category.shareRatio,
    }));

  const sixMonthData = useMemo(() => {
    return buildSixMonthSeries(dataset.transactions, month, {
      currency: dataset.settings.currency,
      budgetMinor: dataset.settings.monthlyBudgetMinor,
      recurringExpenses: dataset.recurringExpenses,
      reserveRecurringExpenses: dataset.settings.reserveRecurringExpenses,
      asOfDate: formatLocalDate(new Date()),
    }).map((point) => ({
      label: point.shortLabel,
      value: Math.max(point.netSpentMinor, 0),
      isCurrent: point.isAnchorMonth,
    }));
  }, [
    dataset.recurringExpenses,
    dataset.settings.currency,
    dataset.settings.monthlyBudgetMinor,
    dataset.settings.reserveRecurringExpenses,
    dataset.transactions,
    month,
  ]);

  const confirmedSpendingCount = analytics.budget.countedTransactionCount;
  const daysInSelectedMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const averageDailyMinor = Math.floor(monthSpendingMinor / Math.max(daysInSelectedMonth, 1));
  const budgetMinor = dataset.settings.monthlyBudgetMinor;
  const focusCategories = categoryData.slice(0, 2);

  return (
    <Screen theme={theme} testID="stats-screen">
      <PageHeader
        theme={theme}
        title="统计"
        subtitle="分类占比与消费趋势"
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
          styles.kpis,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.primaryKpi}>
          <Text style={[styles.kpiLabel, { color: theme.colors.textMuted }]}>净消费</Text>
          <Text style={[styles.kpiValue, { color: theme.colors.text }]} numberOfLines={1}>
            {formatMoneyMinor(monthSpendingMinor, dataset.settings.currency)}
          </Text>
        </View>
        <View style={styles.secondaryKpi}>
          <Text style={[styles.kpiLabel, { color: theme.colors.textMuted }]}>日均</Text>
          <Text style={[styles.kpiDetail, { color: theme.colors.text }]}>
            {formatMoneyMinor(averageDailyMinor, dataset.settings.currency)}
          </Text>
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>
            {confirmedSpendingCount} 笔
          </Text>
        </View>
      </View>

      {analytics.budget.foreignCurrencyTransactionCount > 0 ? (
        <View style={styles.notice}>
          <InlineNotice
            theme={theme}
            tone="warning"
            message={`${analytics.budget.foreignCurrencyTransactionCount} 笔外币消费未换算，因此没有计入本页。`}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="分类占比" theme={theme} />
        {categoryData.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            这个月还没有可统计的消费。
          </Text>
        ) : (
          <View style={styles.donutSection}>
            <DonutChart
              theme={theme}
              segments={categoryData}
              centerLabel="净消费"
              centerValue={formatMoneyMinor(monthSpendingMinor, dataset.settings.currency)}
            />
            <View style={styles.legend}>
              {categoryData.slice(0, 6).map((item) => (
                <View key={item.id} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text style={[styles.legendLabel, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[styles.legendValue, { color: theme.colors.textMuted }]}>
                    {`${Math.round(item.shareRatio * 100)}%`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {analytics.merchants.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="商户排行" subtitle="按本月净消费" theme={theme} />
          <View style={styles.merchantRows}>
            {analytics.merchants.map((merchant, index) => (
              <View key={merchant.merchant} style={styles.merchantRow}>
                <Text style={[styles.merchantRank, { color: theme.colors.textMuted }]}>
                  {index + 1}
                </Text>
                <Text
                  style={[styles.merchantName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {merchant.merchant}
                </Text>
                <Text style={[styles.merchantAmount, { color: theme.colors.text }]}>
                  {formatMoneyMinor(
                    merchant.netSpentMinor,
                    dataset.settings.currency,
                  )}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="近六个月" subtitle="净消费趋势" theme={theme} />
        <View
          style={[
            styles.chartPanel,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <MonthlyBarChart
            theme={theme}
            data={sixMonthData}
            formatValue={(value) =>
              compactMoney(value, dataset.settings.currency)
            }
          />
        </View>
      </View>

      {focusCategories.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="重点类别" subtitle="本月消费最多的类别" theme={theme} />
          <View style={styles.focusRows}>
            {focusCategories.map((category) => (
              <ProgressBar
                key={category.id}
                theme={theme}
                value={budgetMinor > 0 ? category.value / budgetMinor : 0}
                label={category.label}
                detail={formatMoneyMinor(
                  category.value,
                  dataset.settings.currency,
                )}
              />
            ))}
          </View>
        </View>
      ) : null}
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
  kpis: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  primaryKpi: {
    flex: 1,
    gap: spacing.xs,
  },
  secondaryKpi: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  kpiLabel: {
    fontSize: typography.caption,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  kpiDetail: {
    fontSize: typography.sectionTitle,
    fontWeight: '800',
  },
  count: {
    fontSize: typography.caption,
  },
  section: {
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  notice: {
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: typography.body,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  donutSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  legend: {
    minWidth: 160,
    flex: 1,
    gap: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  legendLabel: {
    flex: 1,
    fontSize: typography.label,
    fontWeight: '700',
  },
  legendValue: {
    fontSize: typography.caption,
  },
  chartPanel: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  focusRows: {
    gap: spacing.xl,
  },
  merchantRows: {
    gap: spacing.md,
  },
  merchantRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  merchantRank: {
    width: 20,
    fontSize: typography.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
  merchantName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  merchantAmount: {
    fontSize: typography.label,
    fontWeight: '800',
  },
});
