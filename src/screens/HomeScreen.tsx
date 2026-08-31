import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  calculateBudgetFromSettings,
  calculateCategoryAnalytics,
} from '../domain/analytics';
import { formatLocalDate, formatMonthKey } from '../domain/date';
import { formatMoneyMinor } from '../domain/money';
import { compareTransactionDateTime } from '../domain/transactions';
import type { Transaction } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { InlineNotice } from '../components/InlineNotice';
import { IconButton } from '../components/IconButton';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { TransactionRow } from '../components/TransactionRow';

type HomeScreenProps = {
  theme: AppTheme;
  onCapture: () => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onOpenRecords: () => void;
  onOpenTransaction: (transaction: Transaction) => void;
};

export function HomeScreen({
  theme,
  onCapture,
  onOpenSettings,
  onOpenStats,
  onOpenRecords,
  onOpenTransaction,
}: HomeScreenProps) {
  const { dataset, persistenceError } = useAppStore();
  const today = new Date();
  const month = formatMonthKey(today);
  const monthTransactions = useMemo(
    () =>
      dataset.transactions
        .filter(
          (transaction) =>
            transaction.date.startsWith(month) && transaction.status === 'confirmed',
        )
        .sort((left, right) => compareTransactionDateTime(right, left)),
    [dataset.transactions, month],
  );

  const budgetSummary = useMemo(
    () =>
      calculateBudgetFromSettings(
        dataset.transactions,
        dataset.settings,
        month,
        dataset.recurringExpenses,
        formatLocalDate(today),
      ),
    [
      dataset.recurringExpenses,
      dataset.settings,
      dataset.transactions,
      month,
      today,
    ],
  );

  const categoryTotals = useMemo(
    () =>
      calculateCategoryAnalytics({
        transactions: dataset.transactions,
        month,
        currency: dataset.settings.currency,
        categories: dataset.settings.categories,
        categoryBudgetsMinor: dataset.settings.categoryBudgetsMinor,
      })
        .filter((item) => item.chartAmountMinor > 0)
        .map((item) => ({
          id: item.categoryId,
          label: item.label,
          value: item.chartAmountMinor,
          color: item.color,
          shareRatio: item.shareRatio,
        })),
    [
      dataset.settings.categoryBudgetsMinor,
      dataset.settings.categories,
      dataset.settings.currency,
      dataset.transactions,
      month,
    ],
  );

  const budgetMinor = dataset.settings.monthlyBudgetMinor;
  const spendingMinor = Math.max(budgetSummary.netSpentMinor, 0);
  const remainingMinor = budgetSummary.remainingMinor;
  const spendRatio = budgetSummary.usedRatio ?? 0;
  const remainingDays = budgetSummary.daysRemaining;
  const suggestedDailyMinor = budgetSummary.dailyAvailableMinor;
  const topCategory = categoryTotals[0];
  const paceTone =
    budgetSummary.health === 'over' || budgetSummary.health === 'danger'
      ? 'danger'
      : budgetSummary.health === 'watch'
        ? 'warning'
        : 'primary';

  return (
    <Screen theme={theme} testID="home-screen">
      <PageHeader
        theme={theme}
        title="本月"
        subtitle={`${today.getFullYear()} 年 ${today.getMonth() + 1} 月 · 已确认账目`}
        action={
          <IconButton
            theme={theme}
            icon="add"
            label="记一笔"
            onPress={onCapture}
            testID="home-add"
          />
        }
      />

      {persistenceError ? (
        <View style={styles.noticeSpacing}>
          <InlineNotice theme={theme} tone="danger" message={persistenceError} />
        </View>
      ) : null}

      {budgetMinor <= 0 ? (
        <View style={styles.block}>
          <EmptyState
            theme={theme}
            icon="speedometer-outline"
            title="先设置本月消费上限"
            message="预算剩余不会读取钱包余额，只根据你设定的上限和已确认消费计算。"
            actionLabel="设置预算"
            onAction={onOpenSettings}
          />
        </View>
      ) : (
        <View
          style={[
            styles.budgetBand,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.budgetTopRow}>
            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
              {remainingMinor >= 0 ? '预算剩余' : '预算已超出'}
            </Text>
            <View
              style={[
                styles.budgetTag,
                {
                  backgroundColor:
                    remainingMinor >= 0
                      ? theme.colors.primarySoft
                      : `${theme.colors.danger}18`,
                },
              ]}
            >
              <Text
                style={[
                  styles.budgetTagText,
                  {
                    color:
                      remainingMinor >= 0
                        ? theme.colors.primary
                        : theme.colors.danger,
                  },
                ]}
              >
                {remainingMinor >= 0 ? `剩余 ${remainingDays} 天` : '需要调整预算'}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.remaining, { color: theme.colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {formatMoneyMinor(Math.abs(remainingMinor), dataset.settings.currency)}
          </Text>
          <Text style={[styles.budgetMeta, { color: theme.colors.textMuted }]}>
            本月预算 {formatMoneyMinor(budgetMinor, dataset.settings.currency)}
          </Text>
          {budgetSummary.recurringReservedMinor > 0 ? (
            <Text style={[styles.reserveText, { color: theme.colors.textMuted }]}>
              另为尚未入账的固定支出预留{' '}
              {formatMoneyMinor(
                budgetSummary.recurringReservedMinor,
                dataset.settings.currency,
              )}
            </Text>
          ) : null}
          <ProgressBar
            theme={theme}
            value={spendRatio}
            tone={paceTone}
            label={`已使用 ${Math.round(spendRatio * 100)}%`}
            detail={remainingMinor >= 0 ? '预算进度' : '已超过预算'}
          />
          <View style={[styles.dailyRow, { borderTopColor: theme.colors.border }]}>
            <View style={styles.metricBlock}>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>本月已花</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text }]}>
                {formatMoneyMinor(spendingMinor, dataset.settings.currency)}
              </Text>
            </View>
            <View style={[styles.metricBlock, styles.metricRight]}>
              <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>参考日均</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text }]}>
                {formatMoneyMinor(suggestedDailyMinor, dataset.settings.currency)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {budgetSummary.foreignCurrencyTransactionCount > 0 ? (
        <View style={styles.foreignNotice}>
          <InlineNotice
            theme={theme}
            tone="warning"
            message={`${budgetSummary.foreignCurrencyTransactionCount} 笔外币消费未换算，因此没有计入本月预算。`}
          />
        </View>
      ) : null}

      {categoryTotals.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title="花到哪里"
            subtitle={topCategory ? `最多是${topCategory.label}` : undefined}
            theme={theme}
            action={
              <AppButton
                label="查看统计"
                onPress={onOpenStats}
                theme={theme}
                variant="quiet"
                compact
              />
            }
          />
          <View style={styles.categoryList}>
            {categoryTotals.slice(0, 4).map((item) => (
              <View key={item.id} style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
                <View style={styles.categoryProgress}>
                  <ProgressBar
                    theme={theme}
                    value={item.shareRatio}
                    label={item.label}
                    detail={formatMoneyMinor(item.value, dataset.settings.currency)}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="最近账目"
          theme={theme}
          action={
            <AppButton
              label="全部账目"
              onPress={onOpenRecords}
              theme={theme}
              variant="quiet"
              compact
            />
          }
        />
        {monthTransactions.length === 0 ? (
          <View
            style={[
              styles.recentEmpty,
              { backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <Ionicons name="receipt-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.recentEmptyText, { color: theme.colors.textMuted }]}>
              本月还没有已确认记录
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.recentList,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            {monthTransactions.slice(0, 5).map((transaction) => (
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
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeSpacing: {
    marginBottom: spacing.lg,
  },
  block: {
    marginBottom: spacing.xl,
  },
  budgetBand: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.xl,
    gap: spacing.md,
  },
  budgetTopRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  budgetTag: {
    minHeight: 28,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetTagText: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  eyebrow: {
    fontSize: typography.label,
    fontWeight: '800',
  },
  remaining: {
    fontSize: typography.heroNumber,
    fontWeight: '900',
  },
  budgetMeta: {
    fontSize: typography.label,
  },
  reserveText: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  foreignNotice: {
    marginTop: spacing.lg,
  },
  dailyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricBlock: {
    flex: 1,
    minWidth: 0,
  },
  metricRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: typography.sectionTitle,
    fontWeight: '800',
  },
  section: {
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  categoryList: {
    gap: spacing.lg,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  categoryProgress: {
    flex: 1,
  },
  recentEmpty: {
    minHeight: 64,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  recentEmptyText: {
    fontSize: typography.label,
  },
  recentList: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
});
