import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { createDemoDataset } from '../domain/demoData';
import { majorToMinor, minorToMajor } from '../domain/money';
import type { AiReasoningEffort } from '../domain/types';
import {
  API_KEY_STORAGE,
  createCapabilityAwareAiService,
  deleteApiKey,
  exportDatasetBackup,
  getApiKey,
  getReasoningEffortSupport,
  pickDatasetBackup,
  saveApiKey,
  type ReasoningEffortSupport,
  isCurrentScreenCaptureEnabled,
  openCurrentScreenCaptureSettings,
  showCurrentScreenCaptureNotification,
  hideCurrentScreenCaptureNotification,
} from '../services';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { AppButton } from '../components/AppButton';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { FormField } from '../components/FormField';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { VOICE_CAPTURE_ENABLED } from '../config/features';

type ThemeChoice = 'system' | 'light' | 'dark';

const themeOptions: Array<ChoiceOption<ThemeChoice>> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const reasoningOptions: Array<ChoiceOption<AiReasoningEffort>> = [
  { value: 'auto', label: '自动（兼容）' },
  { value: 'none', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' },
  { value: 'max', label: '最大' },
];

type SettingsScreenProps = {
  theme: AppTheme;
  onOpenCategories: () => void;
  onOpenRecurringExpenses: () => void;
};

type DataAction = 'export' | 'import' | 'demo';

function confirmReplacement(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(Boolean(globalThis.confirm?.(`${title}\n\n${message}`)));
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

function SwitchRow({
  theme,
  title,
  detail,
  value,
  onChange,
}: {
  theme: AppTheme;
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={[styles.switchTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.switchDetail, { color: theme.colors.textMuted }]}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.primarySoft }}
        thumbColor={value ? theme.colors.primary : theme.colors.textMuted}
      />
    </View>
  );
}

export function SettingsScreen({
  theme,
  onOpenCategories,
  onOpenRecurringExpenses,
}: SettingsScreenProps) {
  const { dataset, updateSettings, replaceDataset, clearAll } = useAppStore();
  const settings = dataset.settings;
  const [budget, setBudget] = useState(() =>
    settings.monthlyBudgetMinor > 0
      ? String(minorToMajor(settings.monthlyBudgetMinor, settings.currency))
      : '',
  );
  const [endpoint, setEndpoint] = useState(settings.ai.endpoint);
  const [model, setModel] = useState(settings.ai.model);
  const [transcriptionModel, setTranscriptionModel] = useState(
    settings.ai.transcriptionModel ?? 'gpt-4o-mini-transcribe',
  );
  const [reasoningEffort, setReasoningEffort] = useState(
    settings.ai.reasoningEffort,
  );
  const [reasoningSupport, setReasoningSupport] =
    useState<ReasoningEffortSupport>('unknown');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyStatusLoading, setKeyStatusLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dataAction, setDataAction] = useState<DataAction | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);
  const [screenCaptureEnabled, setScreenCaptureEnabled] = useState(false);
  const [captureNotificationEnabled, setCaptureNotificationEnabled] =
    useState(false);

  const updateSettingSafely = (
    patch: Parameters<typeof updateSettings>[0],
  ) => {
    void updateSettings(patch).catch((error: unknown) => {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : '设置尚未写入本地存储。',
      });
    });
  };

  useEffect(() => {
    let active = true;
    getApiKey()
      .then((key) => {
        if (active) {
          setHasApiKey(Boolean(key));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            tone: 'danger',
            message: error instanceof Error ? error.message : '无法读取 API Key。',
          });
        }
      })
      .finally(() => {
        if (active) {
          setKeyStatusLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    isCurrentScreenCaptureEnabled()
      .then(setScreenCaptureEnabled)
      .catch(() => setScreenCaptureEnabled(false));
  }, []);

  useEffect(() => {
    setBudget(
      settings.monthlyBudgetMinor > 0
        ? String(minorToMajor(settings.monthlyBudgetMinor, settings.currency))
        : '',
    );
    setEndpoint(settings.ai.endpoint);
    setModel(settings.ai.model);
    setTranscriptionModel(
      settings.ai.transcriptionModel ?? 'gpt-4o-mini-transcribe',
    );
    setReasoningEffort(settings.ai.reasoningEffort);
  }, [
    settings.ai.endpoint,
    settings.ai.model,
    settings.ai.reasoningEffort,
    settings.ai.transcriptionModel,
    settings.currency,
    settings.monthlyBudgetMinor,
  ]);

  useEffect(() => {
    if (
      reasoningEffort === 'auto' ||
      !endpoint.trim() ||
      !model.trim()
    ) {
      setReasoningSupport('unknown');
      return;
    }

    let active = true;
    getReasoningEffortSupport(endpoint, model)
      .then((support) => {
        if (active) {
          setReasoningSupport(support);
        }
      })
      .catch(() => {
        if (active) {
          setReasoningSupport('unknown');
        }
      });
    return () => {
      active = false;
    };
  }, [endpoint, model, reasoningEffort]);

  const budgetError = useMemo(() => {
    if (!budget.trim()) {
      return null;
    }
    const numeric = Number(budget);
    return Number.isFinite(numeric) && numeric >= 0 ? null : '请输入不小于 0 的金额。';
  }, [budget]);

  const saveGeneralSettings = async () => {
    if (budgetError) {
      setNotice({ tone: 'danger', message: budgetError });
      return;
    }
    const amountMinor = budget.trim()
      ? majorToMinor(Number(budget), settings.currency)
      : 0;
    if (amountMinor === null) {
      setNotice({ tone: 'danger', message: '预算金额超出可保存范围。' });
      return;
    }
    setSavingSettings(true);
    setNotice(null);
    try {
      await updateSettings({
        monthlyBudgetMinor: amountMinor,
        ai: {
          endpoint: endpoint.trim(),
          model: model.trim(),
          transcriptionModel: transcriptionModel.trim(),
          reasoningEffort,
        },
      });
      setNotice({ tone: 'success', message: '设置已保存在本机。' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : '设置尚未写入本地存储。',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveKey = async () => {
    setSavingKey(true);
    setNotice(null);
    try {
      await saveApiKey(apiKeyInput);
      setApiKeyInput('');
      setHasApiKey(true);
      setNotice({ tone: 'success', message: 'API Key 已保存。' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'API Key 保存失败。',
      });
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    try {
      await deleteApiKey();
      setHasApiKey(false);
      await updateSettings({ ai: { enabled: false } });
      setNotice({ tone: 'success', message: 'API Key 已移除，AI 已关闭。' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'API Key 移除失败。',
      });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('请先保存 API Key。');
      }
      const service = await createCapabilityAwareAiService(
        {
          baseUrl: endpoint,
          model,
          reasoningEffort,
          apiKey,
          timeoutMs: settings.ai.requestTimeoutMs,
        },
        { forceReasoningProbe: true },
      );
      const result = await service.extractTransaction({
        text: '测试：今天午饭 12.30 元，微信支付。',
        categories: settings.categories,
        todayLocal: new Date().toISOString().slice(0, 10),
        locale: settings.locale,
        defaultCurrency: settings.currency,
      });
      if (result.amountMinor !== 1230) {
        throw new Error('接口可以访问，但结构化结果不符合预期。请检查模型是否支持图片与 JSON。');
      }
      const detectedSupport =
        reasoningEffort === 'auto'
          ? 'unknown'
          : await getReasoningEffortSupport(endpoint, model).catch(
              () => 'unknown' as const,
            );
      setReasoningSupport(detectedSupport);
      setNotice(
        result.reasoningEffortFallback
          ? {
              tone: 'warning',
              message:
                '连接正常，但当前接口或模型不支持所选思考级别，实际会按自动模式运行。',
            }
          : {
              tone: 'success',
              message: '连接正常，模型可以生成结构化账目。',
            },
      );
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '连接测试失败。',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleOpenScreenCaptureSettings = async () => {
    try {
      await openCurrentScreenCaptureSettings();
      setNotice({
        tone: 'info',
        message: '请在系统无障碍服务列表中启用 Nya 记账，然后返回这里刷新状态。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '无法打开系统设置。',
      });
    }
  };

  const handleShowScreenCaptureNotification = async () => {
    try {
      const enabled = await isCurrentScreenCaptureEnabled();
      setScreenCaptureEnabled(enabled);
      if (!enabled) {
        setNotice({
          tone: 'warning',
          message: '请先启用 Nya 记账的无障碍截图服务。',
        });
        return;
      }
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setNotice({ tone: 'warning', message: '通知权限未开启，无法显示截图按钮。' });
          return;
        }
      }
      const shown = await showCurrentScreenCaptureNotification();
      if (!shown) {
        throw new Error('通知权限未开启，无法显示截图按钮。');
      }
      setCaptureNotificationEnabled(true);
      setNotice({
        tone: 'success',
        message: '通知栏截图按钮已开启。打开支付宝等页面后，点通知中的“截图记账”即可。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '无法开启通知栏截图按钮。',
      });
    }
  };

  const handleHideScreenCaptureNotification = async () => {
    await hideCurrentScreenCaptureNotification();
    setCaptureNotificationEnabled(false);
    setNotice({ tone: 'success', message: '通知栏截图按钮已关闭。' });
  };

  const handleExport = async () => {
    setDataAction('export');
    setNotice(null);
    try {
      const result = await exportDatasetBackup(dataset);
      setNotice({
        tone: 'success',
        message:
          result.method === 'download'
            ? `备份已下载：${result.fileName}`
            : `备份分享流程已完成：${result.fileName}`,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '导出备份失败。',
      });
    } finally {
      setDataAction(null);
    }
  };

  const handleImport = async () => {
    setDataAction('import');
    setNotice(null);
    try {
      const picked = await pickDatasetBackup();
      if (!picked) {
        return;
      }

      const nextTransactions = picked.dataset.transactions.length;
      const nextRecurring = picked.dataset.recurringExpenses.length;
      const confirmed = await confirmReplacement(
        '替换本地账本',
        `将用“${picked.fileName}”中的 ${nextTransactions} 笔账目和 ${nextRecurring} 个订阅，替换当前的 ${dataset.transactions.length} 笔账目和 ${dataset.recurringExpenses.length} 个订阅。此操作不可撤销，API Key 不会从备份中导入。`,
        '确认替换',
      );
      if (!confirmed) {
        return;
      }

      const importedDataset = hasApiKey
        ? picked.dataset
        : {
            ...picked.dataset,
            settings: {
              ...picked.dataset.settings,
              ai: {
                ...picked.dataset.settings.ai,
                enabled: false,
              },
            },
          };
      await replaceDataset(importedDataset);
      setNotice({
        tone: 'success',
        message: `已导入 ${nextTransactions} 笔账目和 ${nextRecurring} 个订阅${picked.legacy ? '（旧版备份已兼容转换）' : ''}。${hasApiKey ? '' : '未检测到本机 API Key，AI 已保持关闭。'}`,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '导入备份失败。',
      });
    } finally {
      setDataAction(null);
    }
  };

  const handleLoadDemo = async () => {
    setDataAction('demo');
    setNotice(null);
    try {
      const demo = createDemoDataset();
      const confirmed = await confirmReplacement(
        '载入示例数据',
        `将用 ${demo.transactions.length} 笔示例账目和 ${demo.recurringExpenses.length} 个示例订阅，替换当前的 ${dataset.transactions.length} 笔账目和 ${dataset.recurringExpenses.length} 个订阅。此操作不可撤销。`,
        '载入示例',
      );
      if (!confirmed) {
        return;
      }

      await replaceDataset(demo);
      setNotice({
        tone: 'success',
        message: '示例数据已载入，可以用来查看预算和统计效果。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '示例数据载入失败。',
      });
    } finally {
      setDataAction(null);
    }
  };

  const confirmClear = () => {
    const run = () => {
      clearAll()
        .then(() => setNotice({ tone: 'success', message: '本地账本已清空。' }))
        .catch((error: unknown) =>
          setNotice({
            tone: 'danger',
            message: error instanceof Error ? error.message : '清空失败。',
          }),
        );
    };
    if (Platform.OS === 'web') {
      if (
        globalThis.confirm?.(
          '确定清空本地账本和设置吗？账目与预算会删除，API Key 会保留。此操作不可撤销。',
        )
      ) {
        run();
      }
      return;
    }
    Alert.alert(
      '清空账本与设置',
      '这会删除本机账目、订阅与预算设置，但保留 API Key。此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        { text: '清空', style: 'destructive', onPress: run },
      ],
    );
  };

  return (
    <Screen theme={theme} keyboard testID="settings-screen">
      <PageHeader theme={theme} title="设置" subtitle="预算、AI 与本地数据" />

      {notice ? (
        <View style={styles.notice}>
          <InlineNotice theme={theme} tone={notice.tone} message={notice.message} />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="预算" theme={theme} />
        <FormField
          theme={theme}
          label="每月消费上限"
          value={budget}
          onChangeText={setBudget}
          placeholder="例如 6000"
          keyboardType="decimal-pad"
          error={budgetError ?? undefined}
          hint="用于计算预算剩余，不代表银行卡可用余额。"
          testID="settings-budget"
        />
        <ChoiceChips
          theme={theme}
          value={settings.theme}
          options={themeOptions}
          onChange={(value) => updateSettingSafely({ theme: value })}
          scrollable={false}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="分类与子分类"
          subtitle={`${settings.categories.length} 个分类`}
          theme={theme}
        />
        <AppButton
          label="管理分类"
          icon="pricetags-outline"
          onPress={onOpenCategories}
          theme={theme}
          variant="secondary"
          testID="settings-categories"
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="固定支出与订阅"
          subtitle={
            dataset.recurringExpenses.length > 0
              ? `${dataset.recurringExpenses.length} 个项目`
              : '还没有固定项目'
          }
          theme={theme}
        />
        <AppButton
          label={
            dataset.recurringExpenses.length > 0
              ? '管理固定支出'
              : '添加固定支出'
          }
          icon="repeat-outline"
          onPress={onOpenRecurringExpenses}
          theme={theme}
          variant="secondary"
          testID="settings-recurring-expenses"
        />
        {dataset.recurringExpenses.length > 0 ? (
          <SwitchRow
            theme={theme}
            title="预留固定支出"
            detail={`根据账本中的 ${dataset.recurringExpenses.length} 个固定项目，为尚未入账的金额预留预算。`}
            value={settings.reserveRecurringExpenses}
            onChange={(value) =>
              updateSettingSafely({ reserveRecurringExpenses: value })
            }
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="AI 识别"
          subtitle="兼容 OpenAI 风格的多模态接口"
          theme={theme}
        />
        <SwitchRow
          theme={theme}
          title="启用 AI"
          detail={hasApiKey ? '截图和文字会发往你配置的接口。' : '保存 API Key 后才能启用。'}
          value={settings.ai.enabled}
          onChange={(value) => {
            if (value && !hasApiKey) {
              setNotice({ tone: 'warning', message: '请先保存 API Key。' });
              return;
            }
            updateSettingSafely({ ai: { enabled: value } });
          }}
        />
        <FormField
          theme={theme}
          label="API 地址"
          value={endpoint}
          onChangeText={setEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://api.openai.com/v1"
          testID="settings-endpoint"
        />
        <FormField
          theme={theme}
          label="多模态模型"
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="gpt-4.1-mini"
          testID="settings-model"
        />
        <View style={styles.settingGroup}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>思考级别</Text>
          <ChoiceChips
            theme={theme}
            value={reasoningEffort}
            options={reasoningOptions}
            onChange={setReasoningEffort}
            testID="settings-reasoning-effort"
          />
          <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
            {reasoningEffort === 'auto'
              ? '不发送 reasoning_effort，由模型使用默认值；兼容性最好。'
              : reasoningSupport === 'unsupported'
                ? '当前接口或模型不支持此参数，实际会按自动模式运行。测试连接可重新检测。'
                : reasoningSupport === 'supported'
                  ? '当前接口与模型已确认支持此思考级别。'
                  : '首次识别时自动检测；不支持时会降级并缓存 7 天。'}
          </Text>
        </View>
        {VOICE_CAPTURE_ENABLED ? (
          <FormField
            theme={theme}
            label="语音转写模型"
            value={transcriptionModel}
            onChangeText={setTranscriptionModel}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="gpt-4o-mini-transcribe"
            hint="自定义接口不支持默认转写模型时，可在这里单独修改。"
            testID="settings-transcription-model"
          />
        ) : null}
        <FormField
          theme={theme}
          label="API Key"
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={
            keyStatusLoading ? '正在检查…' : hasApiKey ? '已保存，输入新值可替换' : '输入个人 API Key'
          }
          hint={
            API_KEY_STORAGE.warning ??
            'Android 使用 Keystore，iOS 使用 Keychain；不会写入账本备份。'
          }
          testID="settings-api-key"
        />
        <View style={styles.buttonRow}>
          <AppButton
            label={hasApiKey ? '替换 Key' : '保存 Key'}
            icon="key-outline"
            onPress={handleSaveKey}
            theme={theme}
            disabled={!apiKeyInput.trim()}
            loading={savingKey}
            compact
          />
          <AppButton
            label="测试连接"
            icon="pulse-outline"
            onPress={handleTest}
            theme={theme}
            variant="secondary"
            disabled={!hasApiKey || !endpoint.trim() || !model.trim()}
            loading={testing}
            compact
          />
          {hasApiKey ? (
            <AppButton
              label="移除 Key"
              onPress={handleDeleteKey}
              theme={theme}
              variant="quiet"
              compact
            />
          ) : null}
        </View>
        <SwitchRow
          theme={theme}
          title="发送截图"
          detail={
            VOICE_CAPTURE_ENABLED
              ? '关闭后只把文字与语音转写交给模型。'
              : '关闭后只把文字内容交给模型。'
          }
          value={settings.ai.sendImages}
          onChange={(value) =>
            updateSettingSafely({ ai: { sendImages: value } })
          }
        />
        <AppButton
          label="保存预算与模型设置"
          icon="save-outline"
          onPress={() => void saveGeneralSettings()}
          theme={theme}
          loading={savingSettings}
        />
      </View>

      {Platform.OS === 'android' ? (
        <View style={styles.section}>
          <SectionHeader
            title="当前页面截图"
            subtitle="从通知栏截取支付宝等页面并直接进入识别"
            theme={theme}
          />
          <InlineNotice
            theme={theme}
            tone={screenCaptureEnabled ? 'success' : 'warning'}
            message={
              screenCaptureEnabled
                ? '无障碍截图服务已启用。截图只保存为本次识别的临时文件。'
                : '首次使用需要在系统设置中启用无障碍截图服务。'
            }
          />
          <View style={styles.buttonRow}>
            <AppButton
              label={screenCaptureEnabled ? '刷新服务状态' : '打开系统设置'}
              icon="accessibility-outline"
              onPress={() => void handleOpenScreenCaptureSettings()}
              theme={theme}
              variant="secondary"
              compact
            />
            <AppButton
              label={captureNotificationEnabled ? '关闭通知按钮' : '开启通知按钮'}
              icon={captureNotificationEnabled ? 'notifications-off-outline' : 'notifications-outline'}
              onPress={() =>
                void (captureNotificationEnabled
                  ? handleHideScreenCaptureNotification()
                  : handleShowScreenCaptureNotification())
              }
              theme={theme}
              disabled={!screenCaptureEnabled && !captureNotificationEnabled}
              compact
            />
          </View>
          <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
            开启后 Nya 记账会在通知栏常驻一个“截图记账”按钮；点击后会自动返回本应用，截图进入批量录入页。
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="数据" subtitle="账本只保存在本机" theme={theme} />
        <View
          style={[
            styles.dataPanel,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.dataCount, { color: theme.colors.text }]}>
            {dataset.transactions.length} 笔账目 · {dataset.recurringExpenses.length} 个订阅
          </Text>
          <Text style={[styles.dataDetail, { color: theme.colors.textMuted }]}>
            {VOICE_CAPTURE_ENABLED
              ? 'JSON 备份不包含 API Key，也不包含原始截图和录音。'
              : 'JSON 备份不包含 API Key，也不包含原始截图。'}
          </Text>
          <View style={styles.buttonRow}>
            <AppButton
              label="导出"
              icon="download-outline"
              onPress={() => void handleExport()}
              theme={theme}
              variant="secondary"
              disabled={dataAction !== null}
              loading={dataAction === 'export'}
              compact
            />
            <AppButton
              label="导入"
              icon="cloud-upload-outline"
              onPress={() => void handleImport()}
              theme={theme}
              variant="secondary"
              disabled={dataAction !== null}
              loading={dataAction === 'import'}
              compact
            />
            <AppButton
              label="示例数据"
              icon="flask-outline"
              onPress={() => void handleLoadDemo()}
              theme={theme}
              variant="quiet"
              disabled={dataAction !== null}
              loading={dataAction === 'demo'}
              compact
            />
          </View>
        </View>
        <AppButton
          label="清空账本（保留 API Key）"
          icon="trash-outline"
          onPress={confirmClear}
          theme={theme}
          variant="danger"
          disabled={dataAction !== null}
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
    gap: spacing.lg,
  },
  switchRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  settingGroup: {
    gap: spacing.sm,
  },
  settingLabel: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  settingHint: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  dataPanel: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  dataCount: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  dataDetail: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
