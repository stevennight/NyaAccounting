import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  type DuplicateCandidate,
  type DuplicateReason,
  getTransactionLocalTime,
} from '../domain';
import { formatMoneyMinor } from '../domain/money';
import { AppTheme, radii, spacing, typography } from '../theme';
import { AppButton } from './AppButton';

type DuplicateWarningProps = {
  theme: AppTheme;
  candidates: readonly DuplicateCandidate[];
  locale: string;
  saving: boolean;
  onSaveAnyway: () => void;
  onReview: () => void;
};

const reasonLabels: Record<DuplicateReason, string> = {
  source_fingerprint: '输入来源相同',
  same_amount: '金额相同',
  same_date: '日期相同',
  near_date: '日期接近',
  same_time: '时间相同',
  near_time: '时间接近',
  same_merchant: '商户相同',
  similar_merchant: '商户相似',
  same_description: '消费内容相同',
  similar_description: '消费内容相似',
  same_payment_channel: '支付渠道相同',
  same_funding_instrument: '支出账户相同',
};

function summarizeReasons(reasons: readonly DuplicateReason[]): string {
  return reasons
    .filter((reason) => reason !== 'same_amount')
    .slice(0, 4)
    .map((reason) => reasonLabels[reason])
    .join('、');
}

export function DuplicateWarning({
  theme,
  candidates,
  locale,
  saving,
  onSaveAnyway,
  onReview,
}: DuplicateWarningProps) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: `${theme.colors.warning}12`,
          borderColor: `${theme.colors.warning}66`,
        },
      ]}
      testID="duplicate-warning"
    >
      <View style={styles.titleRow}>
        <Ionicons name="copy-outline" size={19} color={theme.colors.warning} />
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            保存前发现疑似重复
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            已按金额、前后 2 天、具体时间及商户/消费内容相似度检查
          </Text>
        </View>
      </View>

      {candidates.slice(0, 3).map((candidate) => {
        const transactionTime = getTransactionLocalTime(candidate.transaction);
        const reasonSummary = summarizeReasons(candidate.reasons);

        return (
          <View key={candidate.transaction.id} style={styles.candidate}>
            <View style={styles.candidateHeader}>
              <Text style={[styles.candidateTitle, { color: theme.colors.text }]}>
                {candidate.transaction.merchant}
              </Text>
              <Text style={[styles.score, { color: theme.colors.warning }]}>
                匹配度 {Math.round(candidate.score * 100)}%
              </Text>
            </View>
            <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
              {candidate.transaction.date}
              {transactionTime ? ` ${transactionTime}` : ''} ·{' '}
              {formatMoneyMinor(
                candidate.transaction.amountMinor,
                candidate.transaction.currency,
                locale,
              )}
            </Text>
            {candidate.transaction.description ? (
              <Text
                style={[styles.detail, { color: theme.colors.textMuted }]}
                numberOfLines={2}
              >
                {candidate.transaction.description}
              </Text>
            ) : null}
            {reasonSummary ? (
              <Text style={[styles.reasons, { color: theme.colors.textMuted }]}>
                {reasonSummary}
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.actions}>
        <AppButton
          theme={theme}
          label="返回检查"
          icon="arrow-back"
          onPress={onReview}
          variant="secondary"
          disabled={saving}
          compact
          testID="duplicate-review"
        />
        <AppButton
          theme={theme}
          label="仍然保存"
          icon="checkmark"
          onPress={onSaveAnyway}
          loading={saving}
          compact
          testID="duplicate-save-anyway"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.sectionTitle,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  candidate: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.35)',
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  candidateHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  candidateTitle: {
    flex: 1,
    minWidth: 140,
    fontSize: typography.body,
    fontWeight: '700',
  },
  score: {
    fontSize: typography.label,
    fontWeight: '800',
  },
  detail: {
    fontSize: typography.label,
    lineHeight: 19,
  },
  reasons: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
