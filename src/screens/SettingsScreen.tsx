import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { createDemoDataset } from '../domain/demoData';
import { majorToMinor, minorToMajor } from '../domain/money';
import type { AiReasoningEffort } from '../domain/types';
import {
  API_KEY_STORAGE,
  applyExpoUpdate,
  checkForAppUpdates,
  createCapabilityAwareAiService,
  deleteApiKey,
  downloadAndInstallGitHubApk,
  exportDatasetBackup,
  getApiKey,
  getReasoningEffortSupport,
  pickDatasetBackup,
  saveApiKey,
  type ReasoningEffortSupport,
  isCurrentScreenCaptureEnabled,
  isGitHubReleaseNewer,
  openCurrentScreenCaptureSettings,
  showCurrentScreenCaptureNotification,
  hideCurrentScreenCaptureNotification,
  isScreenCaptureOverlayPermissionGranted,
  openScreenCaptureOverlaySettings,
  openGitHubReleasePage,
  isScreenCaptureOverlayRunning,
  startScreenCaptureOverlay,
  stopScreenCaptureOverlay,
  getPendingScreenCaptureCount,
  CURRENT_APP_VERSION,
} from '../services';
import type { AppUpdateCheckResult } from '../services';
import { DEFAULT_PAYMENT_CHANNEL_DEFINITIONS } from '../domain/paymentChannels';
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

export type SettingsSection = 'home' | 'budget' | 'ledger' | 'ai' | 'system' | 'data';
export type SettingsDetailSection = Exclude<SettingsSection, 'home'>;

function settingsSectionTitle(section: SettingsSection): string {
  return {
    home: '设置',
    budget: '预算与外观',
    ledger: '账本设置',
    ai: 'AI 识别',
    system: '系统与更新',
    data: '数据管理',
  }[section];
}

function settingsSectionSubtitle(section: SettingsDetailSection): string {
  return {
    budget: '调整预算和界面主题',
    ledger: '管理分类、支付渠道和固定支出',
    ai: '配置接口并控制批量识别',
    system: '查看版本并设置系统截图入口',
    data: '导入、导出或清理本地账本',
  }[section];
}

type SettingsScreenProps = {
  theme: AppTheme;
  section?: SettingsSection;
  onOpenSection?: (section: SettingsDetailSection) => void;
  onBack?: () => void;
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

function SettingsNavigationRow({
  theme,
  icon,
  title,
  detail,
  onPress,
  testID,
  isLast = false,
}: {
  theme: AppTheme;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  onPress: () => void;
  testID: string;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.navigationRow,
        {
          opacity: pressed ? 0.72 : 1,
          borderBottomColor: theme.colors.border,
        },
        isLast && styles.navigationRowLast,
      ]}
    >
      <View style={[styles.navigationIcon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name={icon} size={21} color={theme.colors.primary} />
      </View>
      <View style={styles.navigationCopy}>
        <Text style={[styles.navigationTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.navigationDetail, { color: theme.colors.textMuted }]}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

export function SettingsScreen({
  theme,
  section = 'home',
  onOpenSection,
  onBack,
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
  const [maxConcurrentRecognitions, setMaxConcurrentRecognitions] = useState(
    String(settings.ai.maxConcurrentRecognitions),
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
  const [updateCheck, setUpdateCheck] = useState<AppUpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [applyingOta, setApplyingOta] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);
  const [screenCaptureEnabled, setScreenCaptureEnabled] = useState(false);
  const [captureNotificationEnabled, setCaptureNotificationEnabled] =
    useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState(false);
  const [overlayRunning, setOverlayRunning] = useState(false);
  const [pendingScreenshotCount, setPendingScreenshotCount] = useState(0);
  const [newPaymentChannelLabel, setNewPaymentChannelLabel] = useState('');

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

  const refreshScreenCaptureStatus = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }
    const [serviceEnabled, overlayAllowed, running, pendingCount] =
      await Promise.all([
        isCurrentScreenCaptureEnabled().catch(() => false),
        isScreenCaptureOverlayPermissionGranted().catch(() => false),
        isScreenCaptureOverlayRunning().catch(() => false),
        getPendingScreenCaptureCount().catch(() => 0),
      ]);
    setScreenCaptureEnabled(serviceEnabled);
    setOverlayPermissionGranted(overlayAllowed);
    setOverlayRunning(running);
    setPendingScreenshotCount(pendingCount);
  }, []);

  useEffect(() => {
    if (section !== 'system') {
      return;
    }
    void refreshScreenCaptureStatus();
  }, [refreshScreenCaptureStatus, section]);

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
    setMaxConcurrentRecognitions(String(settings.ai.maxConcurrentRecognitions));
    setReasoningEffort(settings.ai.reasoningEffort);
  }, [
    settings.ai.endpoint,
    settings.ai.maxConcurrentRecognitions,
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
    const concurrency = Number(maxConcurrentRecognitions);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      setNotice({ tone: 'danger', message: '批量识别并发数需要是 1 到 8 之间的整数。' });
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
          maxConcurrentRecognitions: concurrency,
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

  const addPaymentChannel = () => {
    const label = newPaymentChannelLabel.trim();
    if (!label) {
      setNotice({ tone: 'warning', message: '请先填写支付渠道名称。' });
      return;
    }
    if (
      settings.paymentChannels.some(
        (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      )
    ) {
      setNotice({ tone: 'warning', message: '这个支付渠道已经存在。' });
      return;
    }
    const id = `custom_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    updateSettingSafely({
      paymentChannels: [...settings.paymentChannels, { id, label }],
    });
    setNewPaymentChannelLabel('');
    setNotice({ tone: 'success', message: '支付渠道已添加。' });
  };

  const removePaymentChannel = (id: string) => {
    if (
      DEFAULT_PAYMENT_CHANNEL_DEFINITIONS.some((item) => item.id === id)
    ) {
      return;
    }
    if (
      dataset.transactions.some((item) => item.paymentChannel === id) ||
      dataset.recurringExpenses.some((item) => item.paymentChannel === id)
    ) {
      setNotice({
        tone: 'warning',
        message: '已有账单或固定支出使用这个渠道，暂时不能删除。',
      });
      return;
    }
    updateSettingSafely({
      paymentChannels: settings.paymentChannels.filter((item) => item.id !== id),
      ...(settings.defaultPaymentChannel === id
        ? { defaultPaymentChannel: 'unknown' }
        : {}),
    });
    setNotice({ tone: 'success', message: '支付渠道已删除。' });
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
        paymentChannels: settings.paymentChannels,
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
        message: '通知栏截图按钮已开启。截图不会自动打开应用，完成后点“打开待录账单”。',
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

  const handleOpenOverlaySettings = async () => {
    try {
      await openScreenCaptureOverlaySettings();
      setNotice({
        tone: 'info',
        message: '请允许 Nya 记账显示在其他应用上层，然后返回这里开启悬浮球。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '无法打开悬浮窗设置。',
      });
    }
  };

  const handleStartOverlay = async () => {
    try {
      const allowed = await isScreenCaptureOverlayPermissionGranted();
      setOverlayPermissionGranted(allowed);
      if (!allowed) {
        await handleOpenOverlaySettings();
        return;
      }
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setNotice({ tone: 'warning', message: '通知权限未开启，无法运行悬浮球服务。' });
          return;
        }
      }
      const started = await startScreenCaptureOverlay();
      if (!started) {
        throw new Error('悬浮球未能启动，请检查通知权限和悬浮窗权限。');
      }
      setOverlayRunning(true);
      setCaptureNotificationEnabled(true);
      setNotice({
        tone: 'success',
        message: '悬浮球已开启。点击悬浮球只会截图，不会打断当前页面；完成后从通知栏打开待录账单。',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '无法开启悬浮球。',
      });
    }
  };

  const handleStopOverlay = async () => {
    try {
      await stopScreenCaptureOverlay();
      setOverlayRunning(false);
      setNotice({ tone: 'success', message: '悬浮球已关闭。' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '无法关闭悬浮球。',
      });
    }
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

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setNotice(null);
    try {
      const result = await checkForAppUpdates();
      setUpdateCheck(result);
      if (isGitHubReleaseNewer(result.githubRelease, result.currentVersion)) {
        setNotice({
          tone: 'info',
          message: result.githubRelease?.apkAsset
            ? `发现 v${result.githubRelease.version}，可以下载 APK 更新。`
            : `发现 v${result.githubRelease?.version}，但这个 Release 尚未提供 APK。`,
        });
      } else if (result.otaAvailable) {
        setNotice({ tone: 'info', message: '发现可应用的代码更新。' });
      } else if (result.githubError) {
        setNotice({ tone: 'warning', message: result.githubError });
      } else if (!result.repository) {
        setNotice({
          tone: 'warning',
          message: '未配置 GitHub 仓库，GitHub 更新检查未启用。',
        });
      } else {
        setNotice({ tone: 'success', message: '当前已经是最新版本。' });
      }
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '更新检查失败。',
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateCheck?.githubRelease) {
      return;
    }
    setDownloadingUpdate(true);
    setNotice(null);
    try {
      await downloadAndInstallGitHubApk(updateCheck.githubRelease);
      if (Platform.OS !== 'android') {
        setNotice({ tone: 'success', message: '已打开 GitHub Release 页面。' });
      }
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '更新下载失败。',
      });
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const handleApplyOta = async () => {
    setApplyingOta(true);
    setNotice(null);
    try {
      const applied = await applyExpoUpdate();
      setNotice({
        tone: applied ? 'success' : 'info',
        message: applied ? '代码更新已应用。' : '没有可应用的代码更新。',
      });
      if (!applied) {
        setUpdateCheck((current) =>
          current ? { ...current, otaAvailable: false } : current,
        );
      }
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '代码更新应用失败。',
      });
    } finally {
      setApplyingOta(false);
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

  const hasBinaryUpdate = isGitHubReleaseNewer(
    updateCheck?.githubRelease ?? null,
    updateCheck?.currentVersion,
  );
  const updateStatusMessage = !updateCheck
    ? '启动后会检查 GitHub Release 和 Expo Updates。'
    : updateCheck.githubError
      ? updateCheck.githubError
      : !updateCheck.repository && !updateCheck.otaAvailable
        ? '未配置 GitHub 仓库，GitHub 更新检查未启用。'
      : hasBinaryUpdate
        ? `发现 GitHub Release v${updateCheck.githubRelease?.version}。`
        : updateCheck.otaAvailable
          ? '发现可应用的代码更新。'
          : '当前已经是最新版本。';
  const updateStatusTone: 'info' | 'success' | 'warning' = !updateCheck
    ? 'info'
    : updateCheck.githubError
      ? 'warning'
      : !updateCheck.repository && !updateCheck.otaAvailable
        ? 'warning'
      : hasBinaryUpdate || updateCheck.otaAvailable
        ? 'info'
        : 'success';

  return (
    <Screen theme={theme} keyboard testID="settings-screen">
      <PageHeader
        theme={theme}
        title={section === 'home' ? '设置' : settingsSectionTitle(section)}
        subtitle={section === 'home' ? '预算、AI 与本地数据' : settingsSectionSubtitle(section)}
        onBack={section === 'home' ? undefined : onBack}
        backLabel="返回设置"
      />

      {notice ? (
        <View style={styles.notice}>
          <InlineNotice theme={theme} tone={notice.tone} message={notice.message} />
        </View>
      ) : null}

      {section === 'home' ? (
        <View style={styles.section}>
          <SectionHeader title="设置分类" subtitle="选择要调整的内容" theme={theme} />
          <View
            style={[
              styles.navigationList,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <SettingsNavigationRow
              theme={theme}
              icon="wallet-outline"
              title="预算与外观"
              detail={`月度预算${settings.monthlyBudgetMinor > 0 ? ` ${minorToMajor(settings.monthlyBudgetMinor, settings.currency)}` : '未设置'} · ${settings.theme === 'system' ? '跟随系统' : settings.theme === 'light' ? '浅色' : '深色'}`}
              onPress={() => onOpenSection?.('budget')}
              testID="settings-section-budget"
            />
            <SettingsNavigationRow
              theme={theme}
              icon="book-outline"
              title="账本设置"
              detail={`${settings.categories.length} 个分类 · ${settings.paymentChannels.length} 个支付渠道 · ${dataset.recurringExpenses.length} 个固定支出`}
              onPress={() => onOpenSection?.('ledger')}
              testID="settings-section-ledger"
            />
            <SettingsNavigationRow
              theme={theme}
              icon="sparkles-outline"
              title="AI 识别"
              detail={settings.ai.enabled ? `已启用 · 最大并发 ${settings.ai.maxConcurrentRecognitions}` : '未启用'}
              onPress={() => onOpenSection?.('ai')}
              testID="settings-section-ai"
            />
            <SettingsNavigationRow
              theme={theme}
              icon="phone-portrait-outline"
              title="系统与更新"
              detail={`当前版本 v${CURRENT_APP_VERSION}`}
              onPress={() => onOpenSection?.('system')}
              testID="settings-section-system"
            />
            <SettingsNavigationRow
              theme={theme}
              icon="cloud-outline"
              title="数据管理"
              detail={`${dataset.transactions.length} 笔账目 · 本地备份与清理`}
              onPress={() => onOpenSection?.('data')}
              testID="settings-section-data"
              isLast
            />
          </View>
        </View>
      ) : null}

      {section === 'budget' ? <View style={styles.section}>
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
        <AppButton
          label="保存预算设置"
          icon="save-outline"
          onPress={() => void saveGeneralSettings()}
          theme={theme}
          loading={savingSettings}
        />
      </View> : null}

      {section === 'ledger' ? <View style={styles.section}>
        <SectionHeader
          title="支付渠道"
          subtitle="识别和表单使用这里的渠道；可以添加个人常用渠道。"
          theme={theme}
        />
        <FormField
          theme={theme}
          label="新增支付渠道"
          value={newPaymentChannelLabel}
          onChangeText={setNewPaymentChannelLabel}
          placeholder="例如：京东支付、公司报销"
          testID="settings-new-payment-channel"
        />
        <AppButton
          label="添加渠道"
          icon="add-circle-outline"
          onPress={addPaymentChannel}
          theme={theme}
          variant="secondary"
          compact
        />
        <View style={styles.channelList}>
          {settings.paymentChannels.map((channel) => {
            const builtIn = DEFAULT_PAYMENT_CHANNEL_DEFINITIONS.some(
              (item) => item.id === channel.id,
            );
            return (
              <View
                key={channel.id}
                style={[
                  styles.channelRow,
                  {
                    borderBottomColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[styles.channelName, { color: theme.colors.text }]}>
                  {channel.label}
                </Text>
                {!builtIn ? (
                  <AppButton
                    label="删除"
                    icon="trash-outline"
                    onPress={() => removePaymentChannel(channel.id)}
                    theme={theme}
                    variant="quiet"
                    compact
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </View> : null}

      {section === 'ledger' ? <View style={styles.section}>
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
      </View> : null}

      {section === 'ledger' ? <View style={styles.section}>
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
      </View> : null}

      {section === 'ai' ? <View style={styles.section}>
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
        <FormField
          theme={theme}
          label="批量识别最大并发数"
          value={maxConcurrentRecognitions}
          onChangeText={setMaxConcurrentRecognitions}
          keyboardType="number-pad"
          placeholder="3"
          hint="同时处理的截图数量，范围为 1 到 8。数值越大速度越快，也更容易触发接口限流。"
          testID="settings-max-concurrent-recognitions"
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
          label="保存 AI 设置"
          icon="save-outline"
          onPress={() => void saveGeneralSettings()}
          theme={theme}
          loading={savingSettings}
        />
      </View> : null}

      {section === 'system' ? <View style={styles.section}>
        <SectionHeader
          title="版本与更新"
          subtitle={`当前版本 v${CURRENT_APP_VERSION}`}
          theme={theme}
        />
        <InlineNotice
          theme={theme}
          tone={updateStatusTone}
          message={updateStatusMessage}
        />
        <View style={styles.buttonRow}>
          <AppButton
            label="检查更新"
            icon="refresh-outline"
            onPress={() => void handleCheckUpdates()}
            theme={theme}
            loading={checkingUpdates}
            variant="secondary"
            testID="settings-check-updates"
            compact
          />
          {hasBinaryUpdate && updateCheck?.githubRelease ? (
            <AppButton
              label={
                Platform.OS === 'android' && updateCheck.githubRelease.apkAsset
                  ? '下载 APK'
                  : '查看 Release'
              }
              icon={
                Platform.OS === 'android' && updateCheck.githubRelease.apkAsset
                  ? 'download-outline'
                  : 'open-outline'
              }
              onPress={() =>
                void (Platform.OS === 'android' && updateCheck.githubRelease?.apkAsset
                  ? handleDownloadUpdate()
                  : openGitHubReleasePage(updateCheck.githubRelease))
              }
              theme={theme}
              loading={downloadingUpdate}
              compact
            />
          ) : null}
          {updateCheck?.otaAvailable ? (
            <AppButton
              label="应用代码更新"
              icon="cloud-download-outline"
              onPress={() => void handleApplyOta()}
              theme={theme}
              variant="secondary"
              loading={applyingOta}
              compact
            />
          ) : null}
        </View>
        <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>GitHub Release 提供完整 APK 更新；Expo Updates 只替换 JavaScript 和资源，不替换原生模块。</Text>
      </View> : null}

      {section === 'system' && Platform.OS === 'android' ? (
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
          <View style={styles.buttonRow}>
            <AppButton
              label={overlayPermissionGranted ? '刷新悬浮窗权限' : '允许显示悬浮球'}
              icon="layers-outline"
              onPress={() => void handleOpenOverlaySettings()}
              theme={theme}
              variant="secondary"
              compact
            />
            <AppButton
              label={
                overlayPermissionGranted
                  ? overlayRunning
                    ? '关闭悬浮球'
                    : '开启悬浮球'
                  : '先允许悬浮窗'
              }
              icon={overlayRunning ? 'close-circle-outline' : 'radio-button-on-outline'}
              onPress={() =>
                void (overlayRunning ? handleStopOverlay() : handleStartOverlay())
              }
              theme={theme}
              variant={overlayRunning ? 'danger' : 'secondary'}
              disabled={!screenCaptureEnabled && !overlayRunning}
              compact
            />
          </View>
          <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
            悬浮球截图只写入待录队列，不会每次打开 Nya 记账；当前待录截图 {pendingScreenshotCount} 张，完成后从通知栏点击“打开待录账单”。
          </Text>
          <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
            通知栏可以随时开启或关闭悬浮球。首次使用需要同时启用无障碍截图服务、通知权限和悬浮窗权限。
          </Text>
        </View>
      ) : null}

      {section === 'data' ? <View style={styles.section}>
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
      </View> : null}
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
  navigationList: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  navigationRow: {
    minHeight: 70,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  navigationRowLast: {
    borderBottomWidth: 0,
  },
  navigationIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  navigationTitle: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  navigationDetail: {
    fontSize: typography.caption,
    lineHeight: 18,
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
  channelList: {
    gap: spacing.xs,
  },
  channelRow: {
    minHeight: 44,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  channelName: {
    flex: 1,
    fontSize: typography.body,
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
