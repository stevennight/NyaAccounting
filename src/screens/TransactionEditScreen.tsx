import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import {
  CATEGORY_DEFINITIONS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_STATUS_LABELS,
} from '../domain/categories';
import {
  isLocalDate,
  normalizeLocalTime,
} from '../domain/date';
import {
  formatMoneyMinor,
  majorToMinor,
  minorToMajor,
} from '../domain/money';
import { getTransactionLocalTime } from '../domain/transactions';
import {
  FUNDING_INSTRUMENT_TYPES,
  FundingInstrumentType,
  PAYMENT_CHANNELS,
  PaymentChannel,
  RecurringExpense,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../domain/types';
import { AppTheme, spacing, typography } from '../theme';
import { AppButton } from '../components/AppButton';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { FormField } from '../components/FormField';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';

type TransactionEditScreenProps = {
  theme: AppTheme;
  transaction: Transaction;
  recurringExpenses: readonly RecurringExpense[];
  onSave: (transaction: Transaction) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCancel: () => void;
};

const kindOptions: Array<ChoiceOption<TransactionKind>> = TRANSACTION_KINDS.map(
  (value) => ({ value, label: TRANSACTION_KIND_LABELS[value] }),
);

const statusOptions: Array<ChoiceOption<TransactionStatus>> =
  TRANSACTION_STATUSES.map((value) => ({
    value,
    label: TRANSACTION_STATUS_LABELS[value],
  }));

const categoryOptions = CATEGORY_DEFINITIONS.map((category) => ({
  value: category.id,
  label: category.shortLabel,
}));

const channelOptions: Array<ChoiceOption<PaymentChannel>> = PAYMENT_CHANNELS.map(
  (value) => ({ value, label: PAYMENT_CHANNEL_LABELS[value] }),
);

const fundingTypeLabels: Record<FundingInstrumentType, string> = {
  credit_card: '信用卡',
  debit_card: '储蓄卡',
  platform_balance: '平台余额',
  credit_line: '花呗/白条',
  cash: '现金',
  other: '其他',
  unknown: '未识别',
};

const fundingTypeOptions: Array<ChoiceOption<FundingInstrumentType>> =
  FUNDING_INSTRUMENT_TYPES.map((value) => ({
    value,
    label: fundingTypeLabels[value],
  }));

const NO_RECURRING_EXPENSE = '__none__';
const NO_SUBCATEGORY = '__none__';

export function TransactionEditScreen({
  theme,
  transaction,
  recurringExpenses,
  onSave,
  onDelete,
  onCancel,
}: TransactionEditScreenProps) {
  const [amount, setAmount] = useState(() =>
    String(minorToMajor(transaction.amountMinor, transaction.currency)),
  );
  const [currency, setCurrency] = useState(transaction.currency.toUpperCase());
  const [merchant, setMerchant] = useState(transaction.merchant);
  const [description, setDescription] = useState(transaction.description ?? '');
  const [date, setDate] = useState(transaction.date);
  const [time, setTime] = useState(
    () => getTransactionLocalTime(transaction) ?? '',
  );
  const [kind, setKind] = useState(transaction.kind);
  const [status, setStatus] = useState(transaction.status);
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(
    transaction.subcategoryId ?? NO_SUBCATEGORY,
  );
  const [paymentChannel, setPaymentChannel] = useState(transaction.paymentChannel);
  const [fundingType, setFundingType] = useState<FundingInstrumentType>(
    transaction.fundingInstrument?.type ?? 'unknown',
  );
  const [issuer, setIssuer] = useState(transaction.fundingInstrument?.issuer ?? '');
  const [fundingLabel, setFundingLabel] = useState(
    transaction.fundingInstrument?.label ?? '',
  );
  const [last4, setLast4] = useState(transaction.fundingInstrument?.last4 ?? '');
  const [recurringExpenseId, setRecurringExpenseId] = useState(
    transaction.recurringExpenseId ?? NO_RECURRING_EXPENSE,
  );
  const [note, setNote] = useState(transaction.note ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const recurringOptions = useMemo<Array<ChoiceOption<string>>>(
    () => [
      { value: NO_RECURRING_EXPENSE, label: '不关联' },
      ...recurringExpenses
        .filter(
          (expense) =>
            expense.currency === currency &&
            (expense.active || expense.id === transaction.recurringExpenseId),
        )
        .map((expense) => ({
          value: expense.id,
          label: expense.name,
        })),
    ],
    [currency, recurringExpenses, transaction.recurringExpenseId],
  );
  const subcategoryOptions = useMemo<Array<ChoiceOption<string>>>(
    () => {
      const category = CATEGORY_DEFINITIONS.find(
        (definition) => definition.id === categoryId,
      );
      return [
        { value: NO_SUBCATEGORY, label: '不细分' },
        ...(category?.subcategories.map((subcategory) => ({
          value: subcategory.id,
          label: subcategory.label,
        })) ?? []),
      ];
    },
    [categoryId],
  );

  useEffect(() => {
    if (
      recurringExpenseId !== NO_RECURRING_EXPENSE &&
      !recurringOptions.some((option) => option.value === recurringExpenseId)
    ) {
      setRecurringExpenseId(NO_RECURRING_EXPENSE);
    }
  }, [recurringExpenseId, recurringOptions]);

  const hasChanges =
    amount !== String(minorToMajor(transaction.amountMinor, transaction.currency)) ||
    currency !== transaction.currency ||
    merchant !== transaction.merchant ||
    description !== (transaction.description ?? '') ||
    date !== transaction.date ||
    time !== (getTransactionLocalTime(transaction) ?? '') ||
    kind !== transaction.kind ||
    status !== transaction.status ||
    categoryId !== transaction.categoryId ||
    (subcategoryId === NO_SUBCATEGORY ? undefined : subcategoryId) !==
      transaction.subcategoryId ||
    paymentChannel !== transaction.paymentChannel ||
    fundingType !== (transaction.fundingInstrument?.type ?? 'unknown') ||
    issuer !== (transaction.fundingInstrument?.issuer ?? '') ||
    fundingLabel !== (transaction.fundingInstrument?.label ?? '') ||
    last4 !== (transaction.fundingInstrument?.last4 ?? '') ||
    (recurringExpenseId === NO_RECURRING_EXPENSE
      ? undefined
      : recurringExpenseId) !== transaction.recurringExpenseId ||
    note !== (transaction.note ?? '');

  const amountMinor = useMemo(
    () => majorToMinor(Number(amount), currency),
    [amount, currency],
  );
  const amountError =
    amount.trim() && amountMinor !== null && amountMinor > 0
      ? undefined
      : '请输入大于 0 的金额。';
  const dateError = isLocalDate(date) ? undefined : '请输入 YYYY-MM-DD 格式的有效日期。';
  const normalizedTime = time.trim() ? normalizeLocalTime(time) : null;
  const timeError =
    time.trim() && !normalizedTime
      ? '时间格式应为 HH:mm 或 HH:mm:ss。'
      : undefined;
  const currencyError = /^[A-Z]{3}$/.test(currency)
    ? undefined
    : '币种需使用 3 位代码，例如 CNY。';
  const amountHint =
    !amountError && !currencyError && amountMinor !== null
      ? `按 ${currency} 保存：${formatMoneyMinor(amountMinor, currency)}`
      : undefined;
  const merchantError = merchant.trim() ? undefined : '请填写消费内容或商户。';
  const last4Error =
    !last4.trim() || /^\d{4}$/.test(last4.trim())
      ? undefined
      : '卡号尾号应为 4 位数字。';

  const save = async () => {
    if (
      amountError ||
      currencyError ||
      dateError ||
      timeError ||
      merchantError ||
      last4Error ||
      amountMinor === null
    ) {
      setNotice('请先修正标红的字段。');
      return;
    }

    const now = new Date().toISOString();
    const {
      confirmedAt: _confirmedAt,
      description: _description,
      time: _time,
      fundingInstrument: _fundingInstrument,
      recurringExpenseId: _recurringExpenseId,
      subcategoryId: _subcategoryId,
      note: _note,
      ...base
    } = transaction;
    const hasFundingDetails =
      fundingType !== 'unknown' ||
      Boolean(issuer.trim() || fundingLabel.trim() || last4.trim());

    const nextTransaction: Transaction = {
      ...base,
      amountMinor,
      currency,
      merchant: merchant.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      date,
      ...(normalizedTime ? { time: normalizedTime } : {}),
      tags: transaction.tags.filter(
        (tag) => !/^time:\d{2}:\d{2}(?::\d{2})?$/.test(tag),
      ),
      kind,
      status,
      categoryId,
      ...(subcategoryId !== NO_SUBCATEGORY ? { subcategoryId } : {}),
      paymentChannel,
      ...(hasFundingDetails
        ? {
            fundingInstrument: {
              type: fundingType,
              ...(issuer.trim() ? { issuer: issuer.trim() } : {}),
              ...(fundingLabel.trim() ? { label: fundingLabel.trim() } : {}),
              ...(last4.trim() ? { last4: last4.trim() } : {}),
            },
          }
        : {}),
      ...(recurringExpenseId !== NO_RECURRING_EXPENSE
        ? { recurringExpenseId }
        : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      updatedAt: now,
      ...(status === 'confirmed'
        ? { confirmedAt: transaction.confirmedAt ?? now }
        : {}),
    };

    setSaving(true);
    setNotice(null);
    try {
      await onSave(nextTransaction);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `修改尚未写入本地存储：${error.message}`
          : '修改尚未写入本地存储，请重试。',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    const run = async () => {
      setDeleting(true);
      setNotice(null);
      try {
        await onDelete(transaction.id);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? `删除尚未写入本地存储：${error.message}`
            : '删除尚未写入本地存储，请重试。',
        );
      } finally {
        setDeleting(false);
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('确定删除这笔账目吗？此操作不可撤销。')) {
        void run();
      }
      return;
    }
    Alert.alert('删除账目', '这笔账目会从本机永久删除。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const requestCancel = () => {
    if (!hasChanges) {
      onCancel();
      return;
    }
    const message = '尚未保存的修改会被丢弃。';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`放弃修改？\n\n${message}`)) {
        onCancel();
      }
      return;
    }
    Alert.alert('放弃修改？', message, [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: onCancel },
    ]);
  };

  return (
    <Screen
      theme={theme}
      keyboard
      bottomNavigation={false}
      testID="transaction-edit-screen"
    >
      <PageHeader
        theme={theme}
        title="编辑账目"
        subtitle={`来源：${transaction.source} · 创建后可随时修正`}
        action={
          <AppButton
            label="取消"
            onPress={requestCancel}
            theme={theme}
            variant="quiet"
            compact
            disabled={saving || deleting}
          />
        }
      />

      {notice ? (
        <View style={styles.notice}>
          <InlineNotice theme={theme} tone="danger" message={notice} />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="核心信息" theme={theme} />
        <View style={styles.twoColumns}>
          <View style={styles.flexField}>
            <FormField
              theme={theme}
              label="金额"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              error={amountError}
              hint={amountHint}
              testID="edit-amount"
            />
          </View>
          <View style={styles.last4Field}>
            <FormField
              theme={theme}
              label="币种"
              value={currency}
              onChangeText={(value) => setCurrency(value.trim().toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              error={currencyError}
              testID="edit-currency"
            />
          </View>
        </View>
        <FormField
          theme={theme}
          label="消费内容 / 商户"
          value={merchant}
          onChangeText={setMerchant}
          error={merchantError}
          testID="edit-merchant"
        />
        <FormField
          theme={theme}
          label="具体内容（可选）"
          value={description}
          onChangeText={setDescription}
          placeholder="例如：午餐、Cursor 月费"
        />
        <View style={styles.twoColumns}>
          <View style={styles.flexField}>
            <FormField
              theme={theme}
              label="日期"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              error={dateError}
              testID="edit-date"
            />
          </View>
          <View style={styles.last4Field}>
            <FormField
              theme={theme}
              label="时间（可选）"
              value={time}
              onChangeText={setTime}
              placeholder="HH:mm:ss"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              error={timeError}
              testID="edit-time"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="如何统计" theme={theme} />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>交易类型</Text>
        <ChoiceChips
          theme={theme}
          value={kind}
          options={kindOptions}
          onChange={setKind}
        />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>状态</Text>
        <ChoiceChips
          theme={theme}
          value={status}
          options={statusOptions}
          onChange={setStatus}
          scrollable={false}
        />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>分类</Text>
        <ChoiceChips
          theme={theme}
          value={categoryId}
          options={categoryOptions}
          onChange={(value) => {
            setCategoryId(value);
            setSubcategoryId(NO_SUBCATEGORY);
          }}
        />
        {subcategoryOptions.length > 1 ? (
          <>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              子分类
            </Text>
            <ChoiceChips
              theme={theme}
              value={subcategoryId}
              options={subcategoryOptions}
              onChange={setSubcategoryId}
              testID="edit-subcategory"
            />
          </>
        ) : null}
        <Text style={[styles.help, { color: theme.colors.textMuted }]}>
          只有“已确认”的支出与退款会影响预算；转账、还款和投资不会计入消费。
        </Text>
        {recurringOptions.length > 1 ? (
          <>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              固定支出关联
            </Text>
            <ChoiceChips
              theme={theme}
              value={recurringExpenseId}
              options={recurringOptions}
              onChange={setRecurringExpenseId}
              testID="edit-recurring-expense"
            />
            <Text style={[styles.help, { color: theme.colors.textMuted }]}>
              关联后，这次实际扣款会抵扣对应的预算预留，避免重复计算。
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="支付信息"
          subtitle="只作为账目标签，不计算账户余额"
          theme={theme}
        />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>支付渠道</Text>
        <ChoiceChips
          theme={theme}
          value={paymentChannel}
          options={channelOptions}
          onChange={setPaymentChannel}
        />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>实际扣款工具</Text>
        <ChoiceChips
          theme={theme}
          value={fundingType}
          options={fundingTypeOptions}
          onChange={setFundingType}
        />
        <View style={styles.twoColumns}>
          <View style={styles.flexField}>
            <FormField
              theme={theme}
              label="银行 / 机构（可选）"
              value={issuer}
              onChangeText={setIssuer}
              placeholder="例如：招商银行"
            />
          </View>
          <View style={styles.last4Field}>
            <FormField
              theme={theme}
              label="尾号（可选）"
              value={last4}
              onChangeText={(value) => setLast4(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              error={last4Error}
              placeholder="4821"
            />
          </View>
        </View>
        <FormField
          theme={theme}
          label="显示名称（可选）"
          value={fundingLabel}
          onChangeText={setFundingLabel}
          placeholder="例如：Visa、花呗"
        />
        <FormField
          theme={theme}
          label="备注（可选）"
          value={note}
          onChangeText={setNote}
          multiline
        />
      </View>

      <View style={styles.actions}>
        <AppButton
          label="保存修改"
          icon="save-outline"
          onPress={() => void save()}
          theme={theme}
          loading={saving}
          disabled={deleting}
          testID="edit-save"
        />
        <AppButton
          label="删除这笔"
          icon="trash-outline"
          onPress={confirmDelete}
          theme={theme}
          variant="danger"
          loading={deleting}
          disabled={saving}
          testID="edit-delete"
        />
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
  fieldLabel: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  help: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  twoColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  flexField: {
    flex: 1,
    minWidth: 0,
  },
  last4Field: {
    width: 124,
  },
  actions: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
});
