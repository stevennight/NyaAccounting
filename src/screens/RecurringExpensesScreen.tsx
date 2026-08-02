import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../components/AppButton';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import {
  getCategoryDefinition,
  PAYMENT_CHANNEL_LABELS,
} from '../domain/categories';
import { formatLocalDate, isLocalDate } from '../domain/date';
import {
  formatMoneyMinor,
  minorToMajor,
  parseMoneyToMinor,
} from '../domain/money';
import { createDomainId } from '../domain/normalize';
import { getMonthlyEquivalentMinor } from '../domain/recurring';
import {
  AppSettings,
  CategoryDefinition,
  CategoryId,
  PAYMENT_CHANNELS,
  PaymentChannel,
  RecurrenceCadence,
  RecurringExpense,
} from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { useHardwareBack } from '../hooks/useHardwareBack';

type RecurringExpensesScreenProps = {
  theme: AppTheme;
  onBack: () => void;
  startCreating?: boolean;
};

type Notice = {
  tone: 'success' | 'danger' | 'warning';
  message: string;
};

type FormState = {
  name: string;
  amount: string;
  currency: string;
  categoryId: CategoryId;
  subcategoryId: string;
  cadence: RecurrenceCadence;
  interval: string;
  startDate: string;
  endDate: string;
  paymentChannel: PaymentChannel;
  note: string;
  active: boolean;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const categoryIconNames: Readonly<Record<string, IoniconName>> = {
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

const cadenceOptions: Array<ChoiceOption<RecurrenceCadence>> = [
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
];

const channelOptions: Array<ChoiceOption<PaymentChannel>> =
  PAYMENT_CHANNELS.map((value) => ({
    value,
    label: PAYMENT_CHANNEL_LABELS[value],
  }));

const cadenceLabels: Record<RecurrenceCadence, string> = {
  weekly: '周',
  monthly: '月',
  quarterly: '季度',
  yearly: '年',
};

function createBlankForm(
  settings: Pick<
    AppSettings,
    'currency' | 'defaultCategoryId' | 'defaultPaymentChannel'
  >,
): FormState {
  return {
    name: '',
    amount: '',
    currency: settings.currency.toUpperCase(),
    categoryId: settings.defaultCategoryId,
    subcategoryId: '',
    cadence: 'monthly',
    interval: '1',
    startDate: formatLocalDate(new Date()),
    endDate: '',
    paymentChannel: settings.defaultPaymentChannel,
    note: '',
    active: true,
  };
}

function formFromExpense(expense: RecurringExpense): FormState {
  return {
    name: expense.name,
    amount: String(minorToMajor(expense.amountMinor, expense.currency)),
    currency: expense.currency.toUpperCase(),
    categoryId: expense.categoryId,
    subcategoryId: expense.subcategoryId ?? '',
    cadence: expense.cadence,
    interval: String(expense.interval),
    startDate: expense.startDate,
    endDate: expense.endDate ?? '',
    paymentChannel: expense.paymentChannel,
    note: expense.note ?? '',
    active: expense.active,
  };
}

function formsMatch(left: FormState, right: FormState): boolean {
  return (
    left.name === right.name &&
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.categoryId === right.categoryId &&
    left.subcategoryId === right.subcategoryId &&
    left.cadence === right.cadence &&
    left.interval === right.interval &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.paymentChannel === right.paymentChannel &&
    left.note === right.note &&
    left.active === right.active
  );
}

function scheduleLabel(
  cadence: RecurrenceCadence,
  interval: number,
): string {
  if (interval === 1) {
    switch (cadence) {
      case 'weekly':
        return '每周';
      case 'monthly':
        return '每月';
      case 'quarterly':
        return '每季度';
      case 'yearly':
        return '每年';
    }
  }

  return `每 ${interval} ${cadenceLabels[cadence]}`;
}

function subcategoryLabel(
  expense: RecurringExpense,
  categories: readonly CategoryDefinition[],
): string | undefined {
  if (!expense.subcategoryId) {
    return undefined;
  }

  return getCategoryDefinition(expense.categoryId, categories).subcategories.find(
    (subcategory) => subcategory.id === expense.subcategoryId,
  )?.label;
}

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      Boolean(globalThis.confirm?.(`${title}\n\n${message}`)),
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (!settled) {
        settled = true;
        resolve(confirmed);
      }
    };

    Alert.alert(
      title,
      message,
      [
        { text: '取消', style: 'cancel', onPress: () => finish(false) },
        {
          text: confirmLabel,
          style: 'destructive',
          onPress: () => finish(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      },
    );
  });
}

export function RecurringExpensesScreen({
  theme,
  onBack,
  startCreating = false,
}: RecurringExpensesScreenProps) {
  const {
    dataset,
    addRecurringExpense,
    updateRecurringExpense,
    removeRecurringExpense,
  } = useAppStore();
  const initialBlank = createBlankForm(dataset.settings);
  const [form, setForm] = useState<FormState>(initialBlank);
  const [initialForm, setInitialForm] = useState<FormState>(initialBlank);
  const [formOpen, setFormOpen] = useState(startCreating);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const expenses = useMemo(
    () =>
      [...dataset.recurringExpenses].sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          left.name.localeCompare(right.name, dataset.settings.locale),
      ),
    [dataset.recurringExpenses, dataset.settings.locale],
  );
  const editingExpense = editingId
    ? dataset.recurringExpenses.find((expense) => expense.id === editingId)
    : undefined;
  const categoryOptions = useMemo<Array<ChoiceOption<CategoryId>>>(
    () =>
      dataset.settings.categories.map((category) => ({
        value: category.id,
        label: category.shortLabel,
      })),
    [dataset.settings.categories],
  );
  const selectedCategory = getCategoryDefinition(
    form.categoryId,
    dataset.settings.categories,
  );
  const subcategoryOptions = useMemo(
    () => [
      { value: '', label: '未细分' },
      ...selectedCategory.subcategories.map((subcategory) => ({
        value: subcategory.id,
        label: subcategory.label,
      })),
    ],
    [selectedCategory],
  );
  const hasChanges = !formsMatch(form, initialForm);

  const amountMinor = parseMoneyToMinor(form.amount, form.currency);
  const nameError = form.name.trim() ? undefined : '请填写固定支出名称。';
  const currencyError = /^[A-Z]{3}$/.test(form.currency)
    ? undefined
    : '币种需使用 3 位代码，例如 CNY。';
  const amountError =
    amountMinor !== null && amountMinor > 0
      ? undefined
      : '请输入大于 0 的金额。';
  const intervalValue = Number(form.interval);
  const intervalError =
    Number.isSafeInteger(intervalValue) &&
    intervalValue >= 1 &&
    intervalValue <= 999
      ? undefined
      : '间隔需为 1 到 999 的整数。';
  const startDateError = isLocalDate(form.startDate)
    ? undefined
    : '请输入 YYYY-MM-DD 格式的有效日期。';
  const endDateError = !form.endDate.trim()
    ? undefined
    : !isLocalDate(form.endDate)
      ? '请输入 YYYY-MM-DD 格式的有效日期。'
      : !startDateError && form.endDate < form.startDate
        ? '结束日期不能早于开始日期。'
        : undefined;
  const amountHint =
    !amountError && !currencyError && amountMinor !== null
      ? `每次 ${formatMoneyMinor(amountMinor, form.currency)}`
      : undefined;
  const canSave =
    !nameError &&
    !currencyError &&
    !amountError &&
    !intervalError &&
    !startDateError &&
    !endDateError;

  const closeFormImmediately = () => {
    setFormOpen(false);
    setEditingId(null);
    setNotice(null);
  };

  const requestCloseForm = async () => {
    if (
      hasChanges &&
      !(await confirmAction(
        '放弃未保存的修改？',
        '当前表单内容不会保存。',
        '放弃',
      ))
    ) {
      return;
    }
    closeFormImmediately();
  };

  useHardwareBack(() => {
    if (formOpen) {
      void requestCloseForm();
    } else {
      onBack();
    }
    return true;
  });

  const beginCreate = () => {
    const nextForm = createBlankForm(dataset.settings);
    setForm(nextForm);
    setInitialForm(nextForm);
    setEditingId(null);
    setFormOpen(true);
    setNotice(null);
  };

  const beginEdit = (expense: RecurringExpense) => {
    const nextForm = formFromExpense(expense);
    setForm(nextForm);
    setInitialForm(nextForm);
    setEditingId(expense.id);
    setFormOpen(true);
    setNotice(null);
  };

  const save = async () => {
    if (!canSave || amountMinor === null) {
      setNotice({
        tone: 'danger',
        message: '请先修正表单中标红的字段。',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextExpense: RecurringExpense = {
      schemaVersion: 1,
      id: editingExpense?.id ?? createDomainId('recurring'),
      name: form.name.trim(),
      amountMinor,
      currency: form.currency,
      categoryId: form.categoryId,
      ...(form.subcategoryId
        ? { subcategoryId: form.subcategoryId }
        : {}),
      cadence: form.cadence,
      interval: intervalValue,
      startDate: form.startDate,
      ...(form.endDate.trim() ? { endDate: form.endDate } : {}),
      active: form.active,
      paymentChannel: form.paymentChannel,
      ...(editingExpense?.merchant
        ? { merchant: editingExpense.merchant }
        : {}),
      ...(editingExpense?.fundingInstrument
        ? { fundingInstrument: editingExpense.fundingInstrument }
        : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      createdAt: editingExpense?.createdAt ?? now,
      updatedAt: now,
    };

    setSaving(true);
    setNotice(null);
    try {
      if (editingExpense) {
        await updateRecurringExpense(nextExpense);
      } else {
        await addRecurringExpense(nextExpense);
      }
      closeFormImmediately();
      setNotice({
        tone: 'success',
        message: editingExpense
          ? '固定支出已更新。'
          : '固定支出已添加。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error
            ? `固定支出尚未保存：${error.message}`
            : '固定支出尚未保存，请重试。',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleExpense = async (expense: RecurringExpense) => {
    setTogglingId(expense.id);
    setNotice(null);
    try {
      await updateRecurringExpense({
        ...expense,
        active: !expense.active,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error
            ? `启用状态尚未保存：${error.message}`
            : '启用状态尚未保存，请重试。',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const deleteExpense = async (expense: RecurringExpense) => {
    const confirmed = await confirmAction(
      '删除固定支出？',
      `“${expense.name}”会从固定支出中永久删除，已有账目不会被删除。`,
      '删除',
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(expense.id);
    setNotice(null);
    try {
      await removeRecurringExpense(expense.id);
      if (editingId === expense.id) {
        closeFormImmediately();
      }
      setNotice({ tone: 'success', message: '固定支出已删除。' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error
            ? `固定支出尚未删除：${error.message}`
            : '固定支出尚未删除，请重试。',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (formOpen) {
    return (
      <Screen
        theme={theme}
        keyboard
        bottomNavigation={false}
        testID="recurring-expense-form"
      >
        <PageHeader
          theme={theme}
          title={editingExpense ? '编辑固定支出' : '新增固定支出'}
          subtitle="按计划预留预算，不维护支付账户余额"
          onBack={() => void requestCloseForm()}
          backLabel="返回固定支出列表"
          backDisabled={saving || deletingId !== null}
        />

        {notice ? (
          <View style={styles.notice}>
            <InlineNotice
              theme={theme}
              tone={notice.tone}
              message={notice.message}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            theme={theme}
            title="基本信息"
            subtitle="金额表示每次发生的固定支出"
          />
          <FormField
            theme={theme}
            label="名称"
            value={form.name}
            onChangeText={(name) => setForm((current) => ({ ...current, name }))}
            placeholder="例如：Cursor、房租、云服务器"
            maxLength={80}
            error={nameError}
            testID="recurring-name"
          />
          <View style={styles.amountRow}>
            <View style={styles.amountField}>
              <FormField
                theme={theme}
                label="每次金额"
                value={form.amount}
                onChangeText={(amount) =>
                  setForm((current) => ({ ...current, amount }))
                }
                placeholder="例如 140"
                keyboardType="decimal-pad"
                error={amountError}
                hint={amountHint}
                testID="recurring-amount"
              />
            </View>
            <View style={styles.currencyField}>
              <FormField
                theme={theme}
                label="币种"
                value={form.currency}
                onChangeText={(currency) =>
                  setForm((current) => ({
                    ...current,
                    currency: currency
                      .replace(/[^a-z]/gi, '')
                      .slice(0, 3)
                      .toUpperCase(),
                  }))
                }
                placeholder="CNY"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={3}
                error={currencyError}
                testID="recurring-currency"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader theme={theme} title="分类" />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            大类
          </Text>
          <ChoiceChips
            theme={theme}
            value={form.categoryId}
            options={categoryOptions}
            onChange={(categoryId) =>
              setForm((current) => ({
                ...current,
                categoryId,
                subcategoryId: '',
              }))
            }
            testID="recurring-category"
          />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            子分类
          </Text>
          <ChoiceChips
            theme={theme}
            value={form.subcategoryId}
            options={subcategoryOptions}
            onChange={(subcategoryId) =>
              setForm((current) => ({ ...current, subcategoryId }))
            }
            testID="recurring-subcategory"
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            theme={theme}
            title="发生计划"
            subtitle="开始日期是第一次预计扣款日期"
          />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            频率
          </Text>
          <ChoiceChips
            theme={theme}
            value={form.cadence}
            options={cadenceOptions}
            onChange={(cadence) =>
              setForm((current) => ({ ...current, cadence }))
            }
            scrollable={false}
            testID="recurring-cadence"
          />
          <FormField
            theme={theme}
            label="间隔"
            value={form.interval}
            onChangeText={(interval) =>
              setForm((current) => ({
                ...current,
                interval: interval.replace(/\D/g, '').slice(0, 3),
              }))
            }
            keyboardType="number-pad"
            error={intervalError}
            hint={`例如填 2，表示每 2 ${cadenceLabels[form.cadence]}一次。`}
            testID="recurring-interval"
          />
          <FormField
            theme={theme}
            label="开始日期"
            value={form.startDate}
            onChangeText={(startDate) =>
              setForm((current) => ({ ...current, startDate }))
            }
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            error={startDateError}
            testID="recurring-start-date"
          />
          <FormField
            theme={theme}
            label="结束日期（可选）"
            value={form.endDate}
            onChangeText={(endDate) =>
              setForm((current) => ({ ...current, endDate }))
            }
            placeholder="长期有效可留空"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            error={endDateError}
            testID="recurring-end-date"
          />
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text
                style={[styles.switchTitle, { color: theme.colors.text }]}
              >
                启用
              </Text>
              <Text
                style={[
                  styles.switchDetail,
                  { color: theme.colors.textMuted },
                ]}
              >
                停用后不再为它预留预算，记录仍会保留。
              </Text>
            </View>
            <Switch
              value={form.active}
              onValueChange={(active) =>
                setForm((current) => ({ ...current, active }))
              }
              trackColor={{
                false: theme.colors.surfaceMuted,
                true: theme.colors.primarySoft,
              }}
              thumbColor={
                form.active ? theme.colors.primary : theme.colors.textMuted
              }
              testID="recurring-active"
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            theme={theme}
            title="支付信息"
            subtitle="只作为标签，不参与余额对账"
          />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            支付渠道
          </Text>
          <ChoiceChips
            theme={theme}
            value={form.paymentChannel}
            options={channelOptions}
            onChange={(paymentChannel) =>
              setForm((current) => ({ ...current, paymentChannel }))
            }
            testID="recurring-payment-channel"
          />
          <FormField
            theme={theme}
            label="备注（可选）"
            value={form.note}
            onChangeText={(note) =>
              setForm((current) => ({ ...current, note }))
            }
            placeholder="例如：每月 3 日自动续费"
            multiline
            maxLength={500}
            testID="recurring-note"
          />
        </View>

        <View style={styles.formActions}>
          <AppButton
            theme={theme}
            label={editingExpense ? '保存修改' : '添加固定支出'}
            icon="save-outline"
            onPress={() => void save()}
            loading={saving}
            disabled={!canSave || deletingId !== null}
            testID="recurring-save"
          />
          {editingExpense ? (
            <AppButton
              theme={theme}
              label="删除固定支出"
              icon="trash-outline"
              onPress={() => void deleteExpense(editingExpense)}
              variant="danger"
              loading={deletingId === editingExpense.id}
              disabled={saving}
              testID="recurring-delete"
            />
          ) : null}
          <AppButton
            theme={theme}
            label="取消"
            onPress={() => void requestCloseForm()}
            variant="quiet"
            disabled={saving || deletingId !== null}
          />
        </View>
      </Screen>
    );
  }

  const activeCount = expenses.filter((expense) => expense.active).length;

  return (
    <Screen
      theme={theme}
      bottomNavigation={false}
      testID="recurring-expenses-screen"
    >
      <PageHeader
        theme={theme}
        title="固定支出"
        subtitle="订阅、房租和周期性服务"
        onBack={onBack}
        backLabel="返回设置"
      />

      {notice ? (
        <View style={styles.notice}>
          <InlineNotice
            theme={theme}
            tone={notice.tone}
            message={notice.message}
          />
        </View>
      ) : null}

      <View style={styles.listSection}>
        <SectionHeader
          theme={theme}
          title="固定项目"
          subtitle={`${activeCount} 个启用 · 共 ${expenses.length} 个`}
          action={
            <IconButton
              theme={theme}
              icon="add"
              label="新增固定支出"
              onPress={beginCreate}
              disabled={togglingId !== null || deletingId !== null}
              testID="recurring-add"
            />
          }
        />

        {expenses.length === 0 ? (
          <EmptyState
            theme={theme}
            icon="repeat-outline"
            title="还没有固定支出"
            message="添加订阅或周期性付款后，可以提前从月度预算中预留。"
            actionLabel="添加第一项"
            onAction={beginCreate}
          />
        ) : (
          <View style={styles.expenseList}>
            {expenses.map((expense) => {
              const category = getCategoryDefinition(
                expense.categoryId,
                dataset.settings.categories,
              );
              const childLabel = subcategoryLabel(
                expense,
                dataset.settings.categories,
              );
              const busy = togglingId !== null || deletingId !== null;
              return (
                <View
                  key={expense.id}
                  style={[
                    styles.expenseCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      opacity: expense.active ? 1 : 0.64,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: `${category.color}18` },
                      ]}
                    >
                      <Ionicons
                        name={
                          categoryIconNames[category.id] ??
                          'pricetag-outline'
                        }
                        size={20}
                        color={category.color}
                      />
                    </View>
                    <View style={styles.cardCopy}>
                      <Text
                        style={[styles.expenseName, { color: theme.colors.text }]}
                        numberOfLines={2}
                      >
                        {expense.name}
                      </Text>
                      <Text
                        style={[
                          styles.expenseCategory,
                          { color: theme.colors.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {[category.label, childLabel].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Switch
                      value={expense.active}
                      onValueChange={() => void toggleExpense(expense)}
                      disabled={busy}
                      accessibilityLabel={`${expense.active ? '停用' : '启用'}${expense.name}`}
                      trackColor={{
                        false: theme.colors.surfaceMuted,
                        true: theme.colors.primarySoft,
                      }}
                      thumbColor={
                        expense.active
                          ? theme.colors.primary
                          : theme.colors.textMuted
                      }
                      testID={`recurring-toggle-${expense.id}`}
                    />
                  </View>

                  <View style={styles.amountSummary}>
                    <View style={styles.amountCopy}>
                      <Text
                        style={[
                          styles.expenseAmount,
                          { color: theme.colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {formatMoneyMinor(
                          expense.amountMinor,
                          expense.currency,
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.schedule,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {scheduleLabel(expense.cadence, expense.interval)}
                      </Text>
                    </View>
                    <View style={styles.monthlyCopy}>
                      <Text
                        style={[
                          styles.monthlyLabel,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        折合每月
                      </Text>
                      <Text
                        style={[
                          styles.monthlyAmount,
                          { color: theme.colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {formatMoneyMinor(
                          getMonthlyEquivalentMinor(expense),
                          expense.currency,
                        )}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[styles.meta, { color: theme.colors.textMuted }]}
                  >
                    {[
                      PAYMENT_CHANNEL_LABELS[expense.paymentChannel],
                      expense.endDate
                        ? `${expense.startDate} 至 ${expense.endDate}`
                        : `${expense.startDate} 起`,
                    ].join(' · ')}
                  </Text>

                  {expense.note ? (
                    <Text
                      style={[styles.note, { color: theme.colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {expense.note}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.cardActions,
                      { borderTopColor: theme.colors.border },
                    ]}
                  >
                    <IconButton
                      theme={theme}
                      icon="create-outline"
                      label={`编辑${expense.name}`}
                      onPress={() => beginEdit(expense)}
                      disabled={busy}
                      testID={`recurring-edit-${expense.id}`}
                    />
                    <IconButton
                      theme={theme}
                      icon="trash-outline"
                      label={`删除${expense.name}`}
                      onPress={() => void deleteExpense(expense)}
                      disabled={busy}
                      testID={`recurring-remove-${expense.id}`}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  listSection: {
    gap: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  amountField: {
    flex: 1,
    minWidth: 0,
  },
  currencyField: {
    width: 112,
  },
  switchRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchTitle: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  switchDetail: {
    fontSize: typography.caption,
    lineHeight: 17,
  },
  formActions: {
    gap: spacing.md,
  },
  expenseList: {
    gap: spacing.md,
  },
  expenseCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  expenseName: {
    fontSize: typography.body,
    fontWeight: '800',
    lineHeight: 20,
  },
  expenseCategory: {
    fontSize: typography.caption,
  },
  amountSummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  expenseAmount: {
    fontSize: typography.sectionTitle,
    fontWeight: '900',
  },
  schedule: {
    fontSize: typography.caption,
  },
  monthlyCopy: {
    alignItems: 'flex-end',
    maxWidth: '48%',
    gap: 2,
  },
  monthlyLabel: {
    fontSize: typography.caption,
  },
  monthlyAmount: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  meta: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  note: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  cardActions: {
    minHeight: 43,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
