import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { ChoiceChips, ChoiceOption } from '../components/ChoiceChips';
import { DuplicateWarning } from '../components/DuplicateWarning';
import { FormField } from '../components/FormField';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { VOICE_CAPTURE_ENABLED } from '../config/features';
import {
  TRANSACTION_KIND_LABELS,
  TRANSACTION_STATUS_LABELS,
} from '../domain/categories';
import {
  formatLocalDate,
  isLocalDate,
  normalizeLocalTime,
} from '../domain/date';
import {
  majorToMinor,
  minorToMajor,
} from '../domain/money';
import {
  confirmTransactionDraft,
  findDuplicateCandidates,
  findRecurringExpenseMatch,
  mapWithConcurrency,
  normalizeTransactionDraft,
  validateTransactionDraft,
  type DuplicateCandidate,
} from '../domain';
import {
  FUNDING_INSTRUMENT_TYPES,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  type CategoryId,
  type DraftFieldName,
  type FundingInstrument,
  type FundingInstrumentType,
  type PaymentChannel,
  type Transaction,
  type TransactionDraft,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from '../domain/types';
import { paymentChannelOptions } from '../domain/paymentChannels';
import {
  AiServiceError,
  createCapabilityAwareAiService,
  getApiKey,
  MediaPreparationError,
  prepareScreenshot,
  type PreparedScreenshot,
} from '../services';
import { useAppStore } from '../store/AppStore';
import { AppTheme, radii, spacing, typography } from '../theme';
import { useHardwareBack } from '../hooks/useHardwareBack';

export type CaptureScreenProps = {
  theme: AppTheme;
  onSaved?: (transaction: Transaction) => void;
  onCancel?: () => void;
  initialScreenshotUris?: string[] | null;
  initialScreenshotError?: string | null;
  onInitialScreenshotConsumed?: () => void;
};

type Notice = {
  tone: 'info' | 'warning' | 'danger' | 'success';
  message: string;
};

type VoiceCapture = {
  uri: string;
  fileName: string;
  mimeType: string;
};

type CaptureImage = {
  id: string;
  asset: ImagePicker.ImagePickerAsset;
  text: string;
};

type ReviewQueueItem = {
  id: string;
  asset?: ImagePicker.ImagePickerAsset;
  text?: string;
  draft: TransactionDraft | null;
  error?: string;
};

type RecognitionInput = {
  id: string;
  asset?: ImagePicker.ImagePickerAsset;
  text: string;
};

type RecognitionProgress = {
  total: number;
  current: number;
  completed: number;
  succeeded: number;
  failed: number;
  concurrency: number;
};

type PermissionNotice = {
  message: string;
  canOpenSettings: boolean;
};

const NO_RECURRING_EXPENSE = '__none__';
const CAPTURE_INPUT_LABEL = VOICE_CAPTURE_ENABLED
  ? '截图、文字或语音'
  : '截图或文字';

const kindOptions: Array<ChoiceOption<TransactionKind>> =
  TRANSACTION_KINDS.map((value) => ({
    value,
    label: TRANSACTION_KIND_LABELS[value],
  }));

const unexpectedOptions: Array<ChoiceOption<'normal' | 'unexpected'>> = [
  { value: 'normal', label: '普通支出' },
  { value: 'unexpected', label: '预期外支出' },
];

const statusOptions: Array<ChoiceOption<TransactionStatus>> =
  TRANSACTION_STATUSES.map((value) => ({
    value,
    label: TRANSACTION_STATUS_LABELS[value],
  }));

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

const draftFieldLabels: Record<DraftFieldName, string> = {
  kind: '交易类型',
  status: '交易状态',
  amountMinor: '金额',
  currency: '币种',
  date: '日期',
  time: '时间',
  merchant: '商户',
  description: '消费内容',
  categoryId: '分类',
  subcategoryId: '子分类',
  paymentChannel: '支付渠道',
  fundingInstrument: '资金工具',
};

function formatDuration(durationMillis: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(bytes: number | undefined): string | null {
  if (!bytes || bytes < 1) {
    return null;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function voiceCaptureFromUri(uri: string): VoiceCapture {
  if (Platform.OS === 'web') {
    return {
      uri,
      fileName: 'voice-note.webm',
      mimeType: 'audio/webm',
    };
  }
  return {
    uri,
    fileName: 'voice-note.m4a',
    mimeType: 'audio/mp4',
  };
}

function deleteTemporaryUri(uri: string | null | undefined): void {
  if (!uri) {
    return;
  }

  try {
    if (Platform.OS === 'web' && uri.startsWith('blob:')) {
      globalThis.URL?.revokeObjectURL(uri);
      return;
    }

    const file = new ExpoFile(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cache cleanup is best effort and must not make a confirmed save fail.
  }
}

function sampledValue(value: string): string {
  if (value.length <= 6_144) {
    return value;
  }
  const middle = Math.floor(value.length / 2);
  return [
    value.length,
    value.slice(0, 2_048),
    value.slice(middle - 1_024, middle + 1_024),
    value.slice(-2_048),
  ].join(':');
}

function hashFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `capture_v1_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createSourceFingerprint({
  screenshot,
  imageAsset,
  text,
  transcript,
}: {
  screenshot?: PreparedScreenshot;
  imageAsset?: ImagePicker.ImagePickerAsset | null;
  text: string;
  transcript: string;
}): string {
  const imageBasis = screenshot
    ? sampledValue(screenshot.base64)
    : imageAsset
      ? [
          imageAsset.fileName ?? '',
          imageAsset.fileSize ?? '',
          imageAsset.width,
          imageAsset.height,
        ].join(':')
      : '';
  const normalizedText = text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const normalizedTranscript = transcript
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

  return hashFingerprint(
    `image:${imageBasis}|text:${normalizedText}|voice:${normalizedTranscript}`,
  );
}

function captureSource(
  hasImage: boolean,
  hasText: boolean,
  hasVoice: boolean,
): TransactionSource {
  const sources = [
    hasImage ? 'image' : null,
    hasText ? 'text' : null,
    hasVoice ? 'voice' : null,
  ].filter(Boolean);

  if (sources.length > 1) {
    return 'combined';
  }
  if (hasImage) {
    return 'image';
  }
  if (hasVoice) {
    return 'voice';
  }
  return 'text';
}

function userFacingError(error: unknown): string {
  if (error instanceof AiServiceError) {
    const messages: Partial<Record<AiServiceError['code'], string>> = {
      invalid_config: 'AI 配置不完整，请检查接口地址和模型。',
      missing_input: `请先添加${CAPTURE_INPUT_LABEL}。`,
      network_error: '无法连接 AI 接口，请检查网络和接口地址。',
      timeout: 'AI 接口响应超时，请稍后重试。',
      aborted: '本次识别已取消。',
      unauthorized: 'API Key 无效或没有访问权限。',
      rate_limited: 'AI 接口请求过于频繁，请稍后重试。',
      request_too_large: '媒体文件过大，无法发送给 AI。',
      provider_rejected: 'AI 接口拒绝了请求，请检查模型配置。',
      provider_unavailable: 'AI 服务暂时不可用，请稍后重试。',
      invalid_response: 'AI 返回了无法读取的内容。',
      invalid_output: 'AI 返回的账目字段不完整，请手动填写。',
      audio_unreadable: '无法读取录音文件，请重新录制。',
      refused: 'AI 未能处理这次输入，请手动填写。',
    };
    return messages[error.code] ?? error.message;
  }

  if (error instanceof MediaPreparationError) {
    const messages: Partial<Record<MediaPreparationError['code'], string>> = {
      invalid_input: '媒体输入无效，请重新选择。',
      image_processing_failed: '截图压缩失败，请重新选择图片。',
      unsupported_audio: '当前录音格式不受支持。',
      audio_too_large: '录音超过 25 MB，请缩短后重试。',
      audio_unreadable: '无法读取录音文件，请重新录制。',
    };
    return messages[error.code] ?? error.message;
  }

  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}

function isCancellationError(error: unknown): boolean {
  return error instanceof AiServiceError && error.code === 'aborted';
}

function cancelledRequestError(): AiServiceError {
  return new AiServiceError('aborted', 'The AI request was cancelled.');
}

function RecognitionProgressPanel({
  theme,
  progress,
}: {
  theme: AppTheme;
  progress: RecognitionProgress;
}) {
  const percent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;
  const current = Math.min(Math.max(progress.current, 1), progress.total);

  return (
    <View
      style={[
        styles.recognitionProgress,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      testID="capture-recognition-progress"
    >
      <View style={styles.progressHeader}>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
          正在并发识别 · 第 {current}/{progress.total} 张截图
        </Text>
        <Text style={[styles.progressPercent, { color: theme.colors.primary }]}>
          {percent}%
        </Text>
      </View>
      <View
        style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceMuted }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        testID="capture-recognition-progress-bar"
      >
        <View
          style={[
            styles.progressFill,
            { width: `${percent}%`, backgroundColor: theme.colors.primary },
          ]}
        />
      </View>
      <Text style={[styles.mediaMeta, { color: theme.colors.textMuted }]}>
        已完成 {progress.completed}/{progress.total} 张
        {' · '}最多同时处理 {progress.concurrency} 张
        {progress.succeeded > 0 ? ` · 成功 ${progress.succeeded}` : ''}
        {progress.failed > 0 ? ` · 失败 ${progress.failed}` : ''}
      </Text>
    </View>
  );
}

export function CaptureScreen({
  theme,
  onSaved,
  onCancel,
  initialScreenshotUris,
  initialScreenshotError,
  onInitialScreenshotConsumed,
}: CaptureScreenProps) {
  const { dataset, addTransaction } = useAppStore();
  const settings = dataset.settings;
  const channelOptions = useMemo(
    () => paymentChannelOptions(settings.paymentChannels),
    [settings.paymentChannels],
  );
  const [imageItems, setImageItems] = useState<CaptureImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [voiceCapture, setVoiceCapture] = useState<VoiceCapture | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [draft, setDraft] = useState<TransactionDraft | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [retryQueue, setRetryQueue] = useState<ReviewQueueItem[]>([]);
  const [recognitionProgress, setRecognitionProgress] =
    useState<RecognitionProgress | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [microphonePermissionNotice, setMicrophonePermissionNotice] =
    useState<PermissionNotice | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [stoppingRecording, setStoppingRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const recordingWasActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const leavingRef = useRef(false);
  const voiceCaptureRef = useRef<VoiceCapture | null>(null);
  const initialScreenshotLoadedRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const openFullscreenImage = useCallback((uri: string) => {
    setFullscreenImageUri(uri);
  }, []);

  const scrollCaptureToTop = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 0);
  }, []);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const audioRecorderRef = useRef(audioRecorder);
  audioRecorderRef.current = audioRecorder;

  const setVoiceCaptureSafely = useCallback((next: VoiceCapture | null) => {
    const current = voiceCaptureRef.current;
    if (current && current.uri !== next?.uri) {
      deleteTemporaryUri(current.uri);
    }
    voiceCaptureRef.current = next;
    if (mountedRef.current) {
      setVoiceCapture(next);
    }
  }, []);

  const cancelExtraction = useCallback(() => {
    extractionAbortRef.current?.abort();
  }, []);

  const cancelTranscription = useCallback(() => {
    transcriptionAbortRef.current?.abort();
  }, []);

  const updateTextInputFromUser = useCallback(
    (value: string) => {
      cancelExtraction();
      cancelTranscription();
      setTextInput(value);
    },
    [cancelExtraction, cancelTranscription],
  );

  const updateActiveImageText = useCallback(
    (value: string) => {
      cancelExtraction();
      cancelTranscription();
      if (!activeImageId) {
        setTextInput(value);
        return;
      }
      setImageItems((current) =>
        current.map((item) =>
          item.id === activeImageId ? { ...item, text: value } : item,
        ),
      );
    },
    [activeImageId, cancelExtraction, cancelTranscription],
  );

  const appendImageAssets = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      if (assets.length === 0) {
        return;
      }
      setImageItems((current) => {
        const existingUris = new Set(current.map((item) => item.asset.uri));
        const inheritedText = current.length === 0 ? textInput.trim() : '';
        const next = assets
          .filter((asset) => !existingUris.has(asset.uri))
          .map((asset, index) => ({
            id: `${asset.assetId ?? asset.uri}:${Date.now()}:${index}`,
            asset,
            text: index === 0 ? inheritedText : '',
          }));
        const merged = [...current, ...next];
        setActiveImageId((selected) => selected ?? next[0]?.id ?? null);
        return merged;
      });
      if (textInput.trim() && imageItems.length === 0) {
        setTextInput('');
      }
      setDraft(null);
      setReviewQueue([]);
      setRetryQueue([]);
      setRecognitionProgress(null);
      setAmountInput('');
      setTimeInput('');
      setDuplicateCandidates([]);
    },
    [textInput, imageItems.length],
  );

  useEffect(() => {
    const pendingUris = (initialScreenshotUris ?? []).filter(
      (uri) => uri && !initialScreenshotLoadedRef.current.has(uri),
    );
    if (pendingUris.length === 0) {
      if ((initialScreenshotUris ?? []).length > 0) {
        onInitialScreenshotConsumed?.();
      }
      return;
    }
    pendingUris.forEach((uri) => initialScreenshotLoadedRef.current.add(uri));
    appendImageAssets(
      pendingUris.map((uri) => ({
        uri,
        width: 0,
        height: 0,
        type: 'image',
        fileName: `当前页面截图-${Date.now()}.png`,
        mimeType: 'image/png',
      })),
    );
    onInitialScreenshotConsumed?.();
  }, [appendImageAssets, initialScreenshotUris, onInitialScreenshotConsumed]);

  useEffect(() => {
    if (initialScreenshotError) {
      setNotice({ tone: 'warning', message: initialScreenshotError });
      onInitialScreenshotConsumed?.();
    }
  }, [initialScreenshotError, onInitialScreenshotConsumed]);

  const updateVoiceTranscriptFromUser = useCallback(
    (value: string) => {
      cancelExtraction();
      cancelTranscription();
      setVoiceTranscript(value);
    },
    [cancelExtraction, cancelTranscription],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let active = true;
    ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (!active || !result) {
          return;
        }
        if ('canceled' in result && !result.canceled && result.assets.length) {
          cancelExtraction();
          appendImageAssets(result.assets);
        } else if ('message' in result) {
          setNotice({
            tone: 'danger',
            message: '系统未能恢复刚才选择的截图，请重新选择。',
          });
        }
      })
      .catch(() => {
        // A missing pending result is normal on most launches.
      });

    return () => {
      active = false;
    };
  }, [appendImageAssets, cancelExtraction]);

  useEffect(() => {
    const wasRecording = recordingWasActiveRef.current;
    if (
      wasRecording &&
      !recorderState.isRecording &&
      audioRecorder.uri &&
      !voiceCaptureRef.current &&
      !leavingRef.current
    ) {
      setVoiceCaptureSafely(voiceCaptureFromUri(audioRecorder.uri));
    }
    recordingWasActiveRef.current = recorderState.isRecording;
  }, [
    audioRecorder,
    recorderState.isRecording,
    setVoiceCaptureSafely,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    leavingRef.current = false;

    return () => {
      mountedRef.current = false;
      leavingRef.current = true;
      extractionAbortRef.current?.abort();
      transcriptionAbortRef.current?.abort();
      const voiceUri = voiceCaptureRef.current?.uri;
      voiceCaptureRef.current = null;
      deleteTemporaryUri(voiceUri);

      const recorder = audioRecorderRef.current;
      void (async () => {
        try {
          if (recorder.isRecording) {
            await recorder.stop();
          }
        } catch {
          // Unmount cleanup is best effort.
        } finally {
          deleteTemporaryUri(recorder.uri);
          void setAudioModeAsync({ allowsRecording: false });
        }
      })();
    };
  }, []);

  const hasVoiceInput =
    VOICE_CAPTURE_ENABLED &&
    Boolean(voiceCapture || voiceTranscript.trim());
  const hasInput = Boolean(
    imageItems.length > 0 || textInput.trim() || hasVoiceInput,
  );
  const activeImage = imageItems.find((item) => item.id === activeImageId) ??
    imageItems[0] ??
    null;
  const activeImageIndex = activeImage
    ? imageItems.findIndex((item) => item.id === activeImage.id)
    : -1;
  const selectImage = useCallback(
    (index: number) => {
      const item = imageItems[index];
      if (item) {
        setActiveImageId(item.id);
      }
    },
    [imageItems],
  );
  const moveActiveImage = useCallback(
    (offset: number) => {
      if (activeImageIndex < 0) {
        return;
      }
      const nextIndex = Math.min(
        imageItems.length - 1,
        Math.max(0, activeImageIndex + offset),
      );
      selectImage(nextIndex);
    },
    [activeImageIndex, imageItems.length, selectImage],
  );
  const canRecognize = Boolean(
    textInput.trim() ||
      imageItems.some(
        (item) => item.text.trim() || settings.ai.sendImages,
      ) ||
      hasVoiceInput,
  );
  const countsInSpending = Boolean(
    draft &&
      draft.status === 'confirmed' &&
      (draft.kind === 'expense' || draft.kind === 'refund'),
  );
  const categoryOptions = useMemo<Array<ChoiceOption<CategoryId>>>(
    () =>
      settings.categories.map((category) => ({
        value: category.id,
        label: category.shortLabel,
      })),
    [settings.categories],
  );
  const subcategoryOptions = useMemo<Array<ChoiceOption<string>>>(() => {
    const category = settings.categories.find(
      (definition) =>
        definition.id === (draft?.categoryId ?? settings.defaultCategoryId),
    );
    return [
      { value: '', label: '不细分' },
      ...(category?.subcategories.map((subcategory) => ({
        value: subcategory.id,
        label: subcategory.label,
      })) ?? []),
    ];
  }, [draft?.categoryId, settings.categories, settings.defaultCategoryId]);
  const recurringOptions = useMemo<Array<ChoiceOption<string>>>(
    () => [
      { value: NO_RECURRING_EXPENSE, label: '不关联' },
      ...dataset.recurringExpenses
        .filter(
          (expense) =>
            expense.currency === (draft?.currency ?? settings.currency) &&
            (expense.active || expense.id === draft?.recurringExpenseId),
        )
        .map((expense) => ({
          value: expense.id,
          label: expense.name,
        })),
    ],
    [
      dataset.recurringExpenses,
      draft?.currency,
      draft?.recurringExpenseId,
      settings.currency,
    ],
  );

  const leaveCapture = useCallback(async () => {
    leavingRef.current = true;
    extractionAbortRef.current?.abort();
    transcriptionAbortRef.current?.abort();
    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
    } catch {
      // Leaving the screen should not be blocked by recorder cleanup.
    }
    void setAudioModeAsync({ allowsRecording: false });
    const voiceUri = voiceCaptureRef.current?.uri;
    voiceCaptureRef.current = null;
    deleteTemporaryUri(voiceUri);
    deleteTemporaryUri(audioRecorder.uri);
    setFullscreenImageUri(null);
    onCancel?.();
  }, [audioRecorder, onCancel]);

  const requestCancel = useCallback(() => {
    if (!hasInput && !draft) {
      void leaveCapture();
      return;
    }
    const message = VOICE_CAPTURE_ENABLED
      ? '当前截图、文字、录音或未保存的修改会被丢弃。'
      : '当前截图、文字或未保存的修改会被丢弃。';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`放弃这次记录？\n\n${message}`)) {
        void leaveCapture();
      }
      return;
    }
    Alert.alert('放弃这次记录？', message, [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '放弃',
        style: 'destructive',
        onPress: () => void leaveCapture(),
      },
    ]);
  }, [draft, hasInput, leaveCapture]);

  const returnToInput = useCallback(() => {
    setDraft(null);
    setReviewQueue([]);
    setRetryQueue([]);
    setRecognitionProgress(null);
    setDuplicateCandidates([]);
    setNotice(null);
  }, []);

  useHardwareBack(() => {
    if (saving) {
      return true;
    }
    if (draft) {
      returnToInput();
    } else {
      requestCancel();
    }
    return true;
  });

  const amountError = useMemo(() => {
    if (!draft) {
      return undefined;
    }
    const currency = draft.currency ?? settings.currency;
    const parsed =
      /^(?:\d+|\d*\.\d+)$/.test(amountInput.trim()) &&
      Number(amountInput) > 0
        ? majorToMinor(Number(amountInput), currency)
        : null;
    return parsed !== null && parsed > 0
      ? undefined
      : '请输入大于 0 的有效金额。';
  }, [amountInput, draft, settings.currency]);

  const currencyError =
    draft && !/^[A-Z]{3}$/.test(draft.currency ?? '')
      ? '币种需使用 3 位代码，例如 CNY。'
      : undefined;
  const dateError =
    draft && !isLocalDate(draft.date)
      ? '日期格式应为 YYYY-MM-DD。'
      : undefined;
  const timeError =
    draft &&
    timeInput.trim() &&
    !normalizeLocalTime(timeInput)
      ? '时间格式应为 HH:mm 或 HH:mm:ss。'
      : undefined;
  const merchantError =
    draft && !draft.merchant.trim() ? '请填写商户。' : undefined;
  const last4Error =
    draft?.fundingInstrument?.last4 &&
    !/^\d{4}$/.test(draft.fundingInstrument.last4)
      ? '卡号尾号应为 4 位数字。'
      : undefined;

  const updateDraft = useCallback((patch: Partial<TransactionDraft>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const next: TransactionDraft = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...next,
        issues: validateTransactionDraft(next, settings.categories),
      };
    });
    setDuplicateCandidates([]);
  }, [settings.categories]);

  const beginReview = useCallback((nextDraft: TransactionDraft) => {
    const recurringMatch = nextDraft.recurringExpenseId
      ? null
      : findRecurringExpenseMatch(
          nextDraft,
          dataset.recurringExpenses,
        );
    const reviewDraft = recurringMatch
      ? { ...nextDraft, recurringExpenseId: recurringMatch.id }
      : nextDraft;
    setDraft(reviewDraft);
    setAmountInput(
      reviewDraft.amountMinor !== null && reviewDraft.currency
        ? String(minorToMajor(reviewDraft.amountMinor, reviewDraft.currency))
        : '',
    );
    setTimeInput(reviewDraft.time ?? '');
    setDuplicateCandidates([]);
    setNotice(null);
  }, [dataset.recurringExpenses]);

  const activateReviewQueueItem = useCallback(
    (item: ReviewQueueItem) => {
      setDuplicateCandidates([]);
      if (item.asset) {
        setActiveImageId(item.id);
      }
      if (item.draft) {
        beginReview(item.draft);
        return;
      }
      const manualDescription = item.text?.trim() || undefined;
      const manualDraft = normalizeTransactionDraft(
        {
          kind: 'expense',
          status: 'confirmed',
          amountMinor: null,
          currency: settings.currency,
          date: formatLocalDate(new Date()),
          merchant: '',
          categoryId: settings.defaultCategoryId,
          paymentChannel: settings.defaultPaymentChannel,
          fundingInstrument: settings.defaultFundingInstrument,
          ...(manualDescription ? { description: manualDescription } : {}),
          source: 'manual',
        },
        {
          defaultCurrency: settings.currency,
          defaultDate: formatLocalDate(new Date()),
          defaultCategoryId: settings.defaultCategoryId,
          defaultStatus: 'confirmed',
          defaultPaymentChannel: settings.defaultPaymentChannel,
          categories: settings.categories,
          source: 'manual',
        },
      );
      beginReview(manualDraft);
      setNotice({
        tone: 'warning',
        message: item.error ?? '识别失败，请手动填写或选择后续操作。',
      });
    },
    [beginReview, settings],
  );

  const configuredAiService = useCallback(async () => {
    if (!settings.ai.enabled) {
      throw new Error('AI 尚未启用；可前往设置启用，或直接手动填写。');
    }
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('尚未保存 API Key；可前往设置配置，或直接手动填写。');
    }
    return createCapabilityAwareAiService({
      baseUrl: settings.ai.endpoint,
      model: settings.ai.model,
      transcriptionModel: settings.ai.transcriptionModel,
      reasoningEffort: settings.ai.reasoningEffort,
      apiKey,
      timeoutMs: settings.ai.requestTimeoutMs,
    });
  }, [settings.ai]);

  const pickImage = useCallback(async () => {
    cancelExtraction();
    cancelTranscription();
    setPickingImage(true);
    setNotice(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 20,
        orderedSelection: true,
        quality: 1,
      });
      if (
        result.canceled ||
        result.assets.length === 0 ||
        !mountedRef.current ||
        leavingRef.current
      ) {
        return;
      }

      appendImageAssets(result.assets);
    } catch {
      if (mountedRef.current && !leavingRef.current) {
        setNotice({
          tone: 'danger',
          message: '无法打开系统图片选择器，请稍后重试。',
        });
      }
    } finally {
      if (mountedRef.current && !leavingRef.current) {
        setPickingImage(false);
      }
    }
  }, [
    cancelExtraction,
    cancelTranscription,
    appendImageAssets,
  ]);

  const removeImage = useCallback((imageId?: string) => {
    cancelExtraction();
    setImageItems((current) => {
      const targetId = imageId ?? activeImageId ?? current[0]?.id;
      if (!targetId) {
        return current;
      }
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) {
        return current;
      }
      const next = current.filter((item) => item.id !== targetId);
      setActiveImageId((selected) => {
        if (selected !== targetId) {
          return selected;
        }
        return next[Math.min(Math.max(targetIndex, 0), next.length - 1)]?.id ?? null;
      });
      return next;
    });
    setNotice({ tone: 'success', message: '已移除这张截图。' });
    setDraft(null);
    setReviewQueue([]);
    setRetryQueue([]);
    setRecognitionProgress(null);
    setDuplicateCandidates([]);
  }, [activeImageId, cancelExtraction]);

  const transcribeVoice = useCallback(
    async (capture: VoiceCapture, silent = false): Promise<string> => {
      transcriptionAbortRef.current?.abort();
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;
      setTranscribing(true);
      if (!silent) {
        setNotice(null);
      }

      try {
        const service = await configuredAiService();
        if (
          controller.signal.aborted ||
          transcriptionAbortRef.current !== controller ||
          !mountedRef.current ||
          leavingRef.current
        ) {
          throw cancelledRequestError();
        }
        const transcript = await service.transcribeAudio({
          ...capture,
          language: 'zh',
          prompt: textInput.trim() || undefined,
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          transcriptionAbortRef.current !== controller ||
          !mountedRef.current ||
          leavingRef.current
        ) {
          throw cancelledRequestError();
        }
        setVoiceTranscript(transcript);
        if (!silent) {
          setNotice({
            tone: 'success',
            message: '语音已转写，可以继续补充或直接识别。',
          });
        }
        return transcript;
      } catch (error) {
        const isCurrent = transcriptionAbortRef.current === controller;
        if (
          !silent &&
          isCurrent &&
          mountedRef.current &&
          !leavingRef.current &&
          !isCancellationError(error)
        ) {
          setNotice({ tone: 'danger', message: userFacingError(error) });
        }
        throw error;
      } finally {
        if (transcriptionAbortRef.current === controller) {
          transcriptionAbortRef.current = null;
          if (mountedRef.current && !leavingRef.current) {
            setTranscribing(false);
          }
        }
      }
    },
    [configuredAiService, textInput],
  );

  const startRecording = useCallback(async () => {
    cancelExtraction();
    cancelTranscription();
    setNotice(null);
    try {
      const permission =
        await AudioModule.requestRecordingPermissionsAsync();
      if (!mountedRef.current || leavingRef.current) {
        return;
      }
      if (!permission.granted) {
        setMicrophonePermissionNotice({
          message: permission.canAskAgain
            ? '需要麦克风权限才能录制语音。'
            : '麦克风权限已被关闭，请在系统设置中允许访问。',
          canOpenSettings: !permission.canAskAgain,
        });
        return;
      }

      setMicrophonePermissionNotice(null);
      setVoiceCaptureSafely(null);
      setVoiceTranscript('');
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      if (!mountedRef.current || leavingRef.current) {
        void setAudioModeAsync({ allowsRecording: false });
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      if (!mountedRef.current || leavingRef.current) {
        void setAudioModeAsync({ allowsRecording: false });
        return;
      }
      audioRecorder.record();
    } catch {
      if (mountedRef.current && !leavingRef.current) {
        setNotice({
          tone: 'danger',
          message:
            Platform.OS === 'web'
              ? '无法开始录音，请确认页面使用安全连接并允许麦克风访问。'
              : '无法开始录音，请检查麦克风权限后重试。',
        });
      }
      void setAudioModeAsync({ allowsRecording: false });
    }
  }, [
    audioRecorder,
    cancelExtraction,
    cancelTranscription,
    setVoiceCaptureSafely,
  ]);

  const stopAndTranscribe = useCallback(async () => {
    setStoppingRecording(true);
    setNotice(null);
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error('录音文件没有生成，请重新录制。');
      }
      if (!mountedRef.current || leavingRef.current) {
        deleteTemporaryUri(uri);
        return;
      }
      const capture = voiceCaptureFromUri(uri);
      setVoiceCaptureSafely(capture);
      await transcribeVoice(capture);
    } catch (error) {
      if (
        mountedRef.current &&
        !leavingRef.current &&
        !isCancellationError(error)
      ) {
        setNotice({ tone: 'danger', message: userFacingError(error) });
      }
    } finally {
      if (mountedRef.current && !leavingRef.current) {
        setStoppingRecording(false);
      }
    }
  }, [audioRecorder, setVoiceCaptureSafely, transcribeVoice]);

  const removeVoice = useCallback(() => {
    cancelExtraction();
    cancelTranscription();
    setVoiceCaptureSafely(null);
    setVoiceTranscript('');
    setMicrophonePermissionNotice(null);
  }, [
    cancelExtraction,
    cancelTranscription,
    setVoiceCaptureSafely,
  ]);

  const recognize = useCallback(async (requestedItems?: readonly RecognitionInput[]) => {
    const inputs: RecognitionInput[] = requestedItems
      ? [...requestedItems]
      : imageItems.length > 0
        ? imageItems
        : [{ id: 'text-input', asset: undefined, text: textInput }];
    const canRecognizeRequested = Boolean(
      inputs.some(
        (item) =>
          (Boolean(item.asset) && settings.ai.sendImages) ||
          Boolean(item.text.trim()),
      ) || hasVoiceInput,
    );
    if (!canRecognizeRequested || (!requestedItems && !canRecognize)) {
      setNotice({
        tone: 'warning',
        message:
          inputs.some((item) => item.asset) && !settings.ai.sendImages
            ? '当前设置不发送截图，请补充文字或在设置中开启“发送截图”。'
            : `请先添加${CAPTURE_INPUT_LABEL}。`,
      });
      return;
    }

    extractionAbortRef.current?.abort();
    const controller = new AbortController();
    extractionAbortRef.current = controller;
    setRecognizing(true);
    setRecognitionProgress({
      total: Math.max(1, inputs.length),
      current: 1,
      completed: 0,
      succeeded: 0,
      failed: 0,
      concurrency: Math.min(
        Math.max(1, settings.ai.maxConcurrentRecognitions),
        Math.max(1, inputs.length),
      ),
    });
    setNotice(null);

    try {
      const service = await configuredAiService();
      if (
        controller.signal.aborted ||
        extractionAbortRef.current !== controller ||
        !mountedRef.current ||
        leavingRef.current
      ) {
        throw cancelledRequestError();
      }
      let transcript = VOICE_CAPTURE_ENABLED
        ? voiceTranscript.trim()
        : '';
      let partialInputWarning: string | null = null;
      if (VOICE_CAPTURE_ENABLED && voiceCapture && !transcript) {
        try {
          transcript = await transcribeVoice(voiceCapture, true);
        } catch (error) {
          if (isCancellationError(error)) {
            throw error;
          }
          const availableSources = [
            imageItems.length > 0 && settings.ai.sendImages ? '截图' : null,
            imageItems.some((item) => item.text.trim()) || textInput.trim()
              ? '文字'
              : null,
          ].filter((value): value is string => Boolean(value));
          if (availableSources.length === 0) {
            throw error;
          }
          partialInputWarning = `语音转写失败，已先识别${availableSources.join('和')}：${userFacingError(error)}`;
        }
      }
      if (
        controller.signal.aborted ||
        extractionAbortRef.current !== controller ||
        !mountedRef.current ||
        leavingRef.current
      ) {
        throw cancelledRequestError();
      }
      const failedItems: string[] = [];
      const compatibilityWarnings = new Set<string>();
      const results = await mapWithConcurrency(
        inputs,
        settings.ai.maxConcurrentRecognitions,
        async (item, index): Promise<ReviewQueueItem> => {
        let screenshot: Awaited<ReturnType<typeof prepareScreenshot>> | null =
          null;
        try {
          if (
            controller.signal.aborted ||
            extractionAbortRef.current !== controller ||
            !mountedRef.current ||
            leavingRef.current
          ) {
            throw cancelledRequestError();
          }

          if (item.asset && settings.ai.sendImages) {
            screenshot = await prepareScreenshot(item.asset.uri);
          }
          const supplementalText = item.text.trim();
          const sendsImage = Boolean(item.asset && settings.ai.sendImages);
          const sendsText = Boolean(supplementalText);
          const sendsVoice = VOICE_CAPTURE_ENABLED && Boolean(transcript);
          if (!sendsImage && !sendsText && !sendsVoice) {
            const message = `第 ${index + 1} 张截图没有可发送内容`;
            setRecognitionProgress((current) =>
              current
                ? {
                    ...current,
                    completed: current.completed + 1,
                    failed: current.failed + 1,
                    current: Math.min(current.completed + 2, current.total),
                  }
                : current,
            );
            return {
              id: item.id,
              asset: item.asset,
              text: item.text,
              draft: null,
              error: message,
            };
          }

          const source = captureSource(sendsImage, sendsText, sendsVoice);
          const sourceFingerprint = createSourceFingerprint({
            screenshot: sendsImage ? screenshot ?? undefined : undefined,
            imageAsset: sendsImage ? item.asset : undefined,
            text: supplementalText,
            transcript,
          });
          const extracted = await service.extractTransaction({
            screenshot: sendsImage ? screenshot ?? undefined : undefined,
            text: supplementalText || undefined,
            voiceTranscript: transcript || undefined,
            categories: settings.categories,
            todayLocal: formatLocalDate(new Date()),
            locale: settings.locale,
            defaultCurrency: settings.currency,
            paymentChannels: settings.paymentChannels,
            signal: controller.signal,
          });
          if (
            controller.signal.aborted ||
            extractionAbortRef.current !== controller ||
            !mountedRef.current ||
            leavingRef.current
          ) {
            throw cancelledRequestError();
          }
          const normalized = normalizeTransactionDraft(
            {
              ...extracted,
              source,
              sourceFingerprint,
            },
            {
              defaultCurrency: settings.currency,
              defaultDate: formatLocalDate(new Date()),
              defaultCategoryId: settings.defaultCategoryId,
              defaultStatus: 'confirmed',
              defaultPaymentChannel: settings.defaultPaymentChannel,
              categories: settings.categories,
              source,
            },
          );
          const reviewItem = {
            id: item.id,
            asset: item.asset,
            text: item.text,
            draft: normalized,
          } satisfies ReviewQueueItem;
          setRecognitionProgress((current) =>
            current
              ? {
                  ...current,
                  completed: current.completed + 1,
                  succeeded: current.succeeded + 1,
                  current: Math.min(current.completed + 2, current.total),
                }
              : current,
          );
          if (extracted.reasoningEffortFallback) {
            compatibilityWarnings.add(
              '当前接口或模型不支持所选思考级别，已按自动模式完成识别。',
            );
          }
          return reviewItem;
        } catch (error) {
          if (isCancellationError(error)) {
            throw error;
          }
          const message =
            `第 ${index + 1} 张截图识别失败：${userFacingError(error)}`;
          setRecognitionProgress((current) =>
            current
              ? {
                  ...current,
                  completed: current.completed + 1,
                  failed: current.failed + 1,
                  current: Math.min(current.completed + 2, current.total),
                }
              : current,
          );
          return {
            id: item.id,
            asset: item.asset,
            text: item.text,
            draft: null,
            error: message,
          };
        } finally {
          deleteTemporaryUri(screenshot?.uri);
        }
      },
      );

      const reviewItems = results.filter(
        (item): item is ReviewQueueItem & { draft: TransactionDraft } =>
          Boolean(item.draft),
      );
      const failedReviewItems = results.filter(
        (item): item is ReviewQueueItem & { draft: null; error: string } =>
          !item.draft,
      );
      failedItems.push(
        ...failedReviewItems
          .map((item) => item.error)
          .filter((message): message is string => Boolean(message)),
      );
      const nextReviewQueue = [...reviewItems, ...failedReviewItems];
      if (nextReviewQueue.length === 0) {
        throw new Error(
          failedItems.join('；') || '没有可发送给 AI 的内容，请补充输入。',
        );
      }

      setRecognitionProgress((current) =>
        current
          ? { ...current, current: current.total, completed: current.total }
          : current,
      );
      setReviewQueue(nextReviewQueue);
      if (!requestedItems) {
        setRetryQueue([]);
      }
      activateReviewQueueItem(nextReviewQueue[0]);
      const recognitionWarnings = [
        inputs.length > 1
          ? `已完成 ${reviewItems.length}/${inputs.length} 张截图识别，失败项已放到最后。`
          : null,
        partialInputWarning,
        ...compatibilityWarnings,
        failedItems.length > 0 ? failedItems.join('；') : null,
      ].filter((value): value is string => Boolean(value));
      if (recognitionWarnings.length > 0) {
        setNotice({
          tone: failedItems.length > 0 ? 'warning' : 'info',
          message: recognitionWarnings.join(' '),
        });
      }
    } catch (error) {
      if (
        extractionAbortRef.current === controller &&
        mountedRef.current &&
        !leavingRef.current &&
        !isCancellationError(error)
      ) {
        setNotice({
          tone: 'danger',
          message: `${userFacingError(error)} 仍可选择“手动填写”。`,
        });
      }
    } finally {
      if (extractionAbortRef.current === controller) {
        extractionAbortRef.current = null;
        if (mountedRef.current && !leavingRef.current) {
          setRecognizing(false);
          setRecognitionProgress(null);
        }
      }
    }
  }, [
    activateReviewQueueItem,
    configuredAiService,
    canRecognize,
    imageItems,
    settings.ai.maxConcurrentRecognitions,
    settings.ai.sendImages,
    settings.categories,
    settings.currency,
    settings.defaultCategoryId,
    settings.defaultPaymentChannel,
    settings.locale,
    hasVoiceInput,
    textInput,
    transcribeVoice,
    voiceCapture,
    voiceTranscript,
    settings.paymentChannels,
  ]);

  const beginManualEntry = useCallback(() => {
    cancelExtraction();
    cancelTranscription();
    const manualDescription = [
      textInput.trim() || null,
      VOICE_CAPTURE_ENABLED ? voiceTranscript.trim() || null : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n');
    const manualDraft = normalizeTransactionDraft(
      {
        kind: 'expense',
        status: 'confirmed',
        amountMinor: null,
        currency: settings.currency,
        date: formatLocalDate(new Date()),
        merchant: '',
        categoryId: settings.defaultCategoryId,
        paymentChannel: settings.defaultPaymentChannel,
        fundingInstrument: settings.defaultFundingInstrument,
        ...(manualDescription
          ? { description: manualDescription }
          : {}),
        source: 'manual',
      },
      {
        defaultCurrency: settings.currency,
        defaultDate: formatLocalDate(new Date()),
        defaultCategoryId: settings.defaultCategoryId,
        defaultStatus: 'confirmed',
        defaultPaymentChannel: settings.defaultPaymentChannel,
        categories: settings.categories,
        source: 'manual',
      },
    );
    beginReview(manualDraft);
  }, [
    beginReview,
    cancelExtraction,
    cancelTranscription,
    settings.currency,
    settings.categories,
    settings.defaultCategoryId,
    settings.defaultFundingInstrument,
    settings.defaultPaymentChannel,
    textInput,
    voiceTranscript,
  ]);

  const updateAmount = useCallback(
    (value: string) => {
      setAmountInput(value);
      const currency = draft?.currency ?? settings.currency;
      const amountMinor =
        /^(?:\d+|\d*\.\d+)$/.test(value.trim()) && Number(value) > 0
          ? majorToMinor(Number(value), currency)
          : null;
      updateDraft({ amountMinor });
    },
    [draft?.currency, settings.currency, updateDraft],
  );

  const updateCurrency = useCallback(
    (value: string) => {
      const currency = value.trim().toUpperCase();
      const amountMinor =
        currency &&
        /^(?:\d+|\d*\.\d+)$/.test(amountInput.trim()) &&
        Number(amountInput) > 0
          ? majorToMinor(Number(amountInput), currency)
          : draft?.amountMinor ?? null;
      updateDraft({
        currency: currency || null,
        amountMinor,
      });
    },
    [amountInput, draft?.amountMinor, updateDraft],
  );

  const updateFundingInstrument = useCallback(
    (patch: Partial<FundingInstrument>) => {
      const current = draft?.fundingInstrument ?? { type: 'unknown' as const };
      const next: FundingInstrument = { ...current, ...patch };
      updateDraft({
        fundingInstrument: {
          type: next.type,
          ...(next.issuer?.trim() ? { issuer: next.issuer } : {}),
          ...(next.label?.trim() ? { label: next.label } : {}),
          ...(next.last4?.trim() ? { last4: next.last4 } : {}),
        },
      });
    },
    [draft?.fundingInstrument, updateDraft],
  );

  const resetAfterSave = useCallback(() => {
    setImageItems([]);
    setActiveImageId(null);
    setTextInput('');
    setVoiceCaptureSafely(null);
    setVoiceTranscript('');
    setDraft(null);
    setReviewQueue([]);
    setRetryQueue([]);
    setRecognitionProgress(null);
    setAmountInput('');
    setTimeInput('');
    setDuplicateCandidates([]);
  }, [setVoiceCaptureSafely]);

  const reviewItemToRecognitionInput = useCallback(
    (item: ReviewQueueItem): RecognitionInput => {
      const sourceInput = imageItems.find((candidate) => candidate.id === item.id);
      return {
        id: item.id,
        asset: item.asset ?? sourceInput?.asset,
        text: item.text ?? sourceInput?.text ?? (item.id === 'text-input' ? textInput : ''),
      };
    },
    [imageItems, textInput],
  );

  const runRetryRecognition = useCallback(
    async (items: readonly ReviewQueueItem[]) => {
      if (items.length === 0) {
        return;
      }
      setRetryQueue([]);
      setReviewQueue([]);
      setDraft(null);
      setNotice({ tone: 'info', message: '正在重新识别待重试账目。' });
      await recognize(items.map(reviewItemToRecognitionInput));
    },
    [recognize, reviewItemToRecognitionInput],
  );

  const advanceAfterReviewAction = useCallback(
    (nextRetryQueue: ReviewQueueItem[], message: string) => {
      const remainingQueue = reviewQueue.slice(1);
      setRetryQueue(nextRetryQueue);
      if (remainingQueue.length > 0) {
        setReviewQueue(remainingQueue);
        activateReviewQueueItem(remainingQueue[0]);
        scrollCaptureToTop();
        setNotice({ tone: 'success', message });
        return;
      }
      if (nextRetryQueue.length > 0) {
        void runRetryRecognition(nextRetryQueue);
        return;
      }
      resetAfterSave();
      setNotice({ tone: 'success', message });
    },
    [
      activateReviewQueueItem,
      resetAfterSave,
      reviewQueue,
      runRetryRecognition,
      scrollCaptureToTop,
    ],
  );

  const discardCurrentReview = useCallback(() => {
    if (!reviewQueue[0]) {
      resetAfterSave();
      setNotice({ tone: 'success', message: '已舍弃当前账目。' });
      return;
    }
    advanceAfterReviewAction(retryQueue, '已舍弃当前账目。');
  }, [advanceAfterReviewAction, resetAfterSave, retryQueue, reviewQueue]);

  const queueCurrentForRetry = useCallback(() => {
    const current = reviewQueue[0];
    if (!current) {
      return;
    }
    advanceAfterReviewAction(
      [...retryQueue, current],
      '已加入重新识别列表。',
    );
  }, [advanceAfterReviewAction, retryQueue, reviewQueue]);

  const saveDraft = useCallback(
    async (allowDuplicate = false) => {
      if (!draft) {
        return;
      }
      if (
        amountError ||
        currencyError ||
        dateError ||
        timeError ||
        merchantError ||
        last4Error
      ) {
        setNotice({
          tone: 'danger',
          message: '请先修正标红的字段。',
        });
        return;
      }

      const draftToConfirm: TransactionDraft = {
        ...draft,
        time: normalizeLocalTime(timeInput),
      };
      const result = confirmTransactionDraft(draftToConfirm, {
        categories: settings.categories,
      });
      if (!result.ok) {
        setDraft({
          ...draftToConfirm,
          issues: result.issues,
        });
        setNotice({
          tone: 'danger',
          message: '账目还缺少必要字段，请检查后再保存。',
        });
        return;
      }

      const duplicates = findDuplicateCandidates(
        result.transaction,
        dataset.transactions,
      );
      if (duplicates.length > 0 && !allowDuplicate) {
        setDuplicateCandidates(duplicates);
        setNotice(null);
        return;
      }

      setSaving(true);
      try {
        await addTransaction(result.transaction);
        const remainingQueue = reviewQueue.slice(1);
        if (remainingQueue.length > 0) {
          setReviewQueue(remainingQueue);
          activateReviewQueueItem(remainingQueue[0]);
          scrollCaptureToTop();
          if (mountedRef.current && !leavingRef.current) {
            setNotice({
              tone: 'success',
              message: `已保存当前账目，已切换到下一笔；还有 ${remainingQueue.length} 笔待核对。`,
            });
          }
          return;
        }
        if (retryQueue.length > 0) {
          setReviewQueue([]);
          setDraft(null);
          await runRetryRecognition(retryQueue);
          scrollCaptureToTop();
          return;
        }
        resetAfterSave();
        if (mountedRef.current && !leavingRef.current) {
          setNotice({ tone: 'success', message: '账目已保存。' });
        }
      } catch (error) {
        if (mountedRef.current && !leavingRef.current) {
          setNotice({
            tone: 'danger',
            message:
              error instanceof Error
                ? `账目尚未写入本地存储：${error.message}`
                : '账目尚未写入本地存储，请重试。',
          });
        }
        return;
      } finally {
        if (mountedRef.current && !leavingRef.current) {
          setSaving(false);
        }
      }

      if (mountedRef.current && !leavingRef.current) {
        try {
          onSaved?.(result.transaction);
        } catch (error) {
          setNotice({
            tone: 'warning',
            message:
              error instanceof Error
                ? `账目已保存，但页面跳转失败：${error.message}`
                : '账目已保存，但页面跳转失败。',
          });
        }
      }
    },
    [
      addTransaction,
      amountError,
      currencyError,
      dataset.transactions,
      dateError,
      draft,
      activateReviewQueueItem,
      last4Error,
      merchantError,
      onSaved,
      resetAfterSave,
      retryQueue,
      runRetryRecognition,
      reviewQueue,
      scrollCaptureToTop,
      settings.categories,
      timeError,
      timeInput,
    ],
  );

  const inputSummary = [
    imageItems.length > 0 ? `截图 ${imageItems.length} 张` : null,
    textInput.trim() ? '文字' : null,
    VOICE_CAPTURE_ENABLED &&
    (voiceCapture || voiceTranscript.trim())
      ? '语音'
      : null,
  ].filter((value): value is string => Boolean(value));

  const fullscreenImagePreview = (
    <Modal
      visible={fullscreenImageUri !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => setFullscreenImageUri(null)}
      testID="capture-fullscreen-preview"
    >
      <SafeAreaView style={styles.fullscreenModal}>
        <View style={styles.fullscreenToolbar}>
          <Text style={styles.fullscreenTitle}>截图预览</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭截图预览"
            onPress={() => setFullscreenImageUri(null)}
            style={({ pressed }) => [
              styles.fullscreenClose,
              { opacity: pressed ? 0.65 : 1 },
            ]}
            testID="capture-fullscreen-close"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.fullscreenImageBody}>
          {fullscreenImageUri ? (
            <Image
              source={{ uri: fullscreenImageUri }}
              resizeMode="contain"
              style={styles.fullscreenImage}
              accessibilityLabel="全屏消费截图"
            />
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );

  if (draft) {
    const reviewFields = Array.from(new Set(draft.review.fields))
      .map((field) => draftFieldLabels[field])
      .filter(Boolean);
    const funding = draft.fundingInstrument ?? { type: 'unknown' as const };
    const reviewAsset = reviewQueue[0]?.asset ?? activeImage?.asset;
    const reviewIndex = reviewQueue[0]
      ? imageItems.findIndex((item) => item.id === reviewQueue[0]?.id)
      : -1;
    const reviewPosition = reviewQueue.length > 0
      ? `第 ${reviewIndex >= 0 ? reviewIndex + 1 : 1}/${Math.max(
          imageItems.length,
          reviewQueue.length,
        )} 笔`
      : null;

    return (
      <Screen
        theme={theme}
        keyboard
        bottomNavigation={false}
        scrollRef={scrollRef}
        testID="capture-review-screen"
      >
        <PageHeader
          theme={theme}
          title="确认账目"
          subtitle={reviewPosition ?? '保存前核对识别结果'}
          onBack={requestCancel}
          backLabel="放弃本次录入"
          backDisabled={saving}
        />

        {notice ? (
          <View style={styles.noticeSpacing}>
            <InlineNotice
              theme={theme}
              tone={notice.tone}
              message={notice.message}
            />
          </View>
        ) : null}

        {reviewAsset ? (
          <View style={styles.section}>
            <SectionHeader
              theme={theme}
              title="原始截图"
              subtitle="核对识别结果时可直接对照原图"
            />
            <Pressable
              onPress={() => openFullscreenImage(reviewAsset.uri)}
              accessibilityRole="button"
              accessibilityLabel="全屏查看待核对的消费截图"
              style={styles.reviewPreviewTap}
            >
              <Image
                source={{ uri: reviewAsset.uri }}
                resizeMode="contain"
                style={[
                  styles.reviewPreview,
                  { backgroundColor: theme.colors.surfaceMuted },
                ]}
                accessibilityLabel="待核对的消费截图"
                testID="capture-review-screenshot"
              />
            </Pressable>
            <Text style={[styles.mediaMeta, { color: theme.colors.textMuted }]}>
              {[reviewAsset.fileName || '已选择图片', `${reviewAsset.width} × ${reviewAsset.height}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ) : null}

        {draft.source !== 'manual' ? (
          <View style={styles.section}>
            <SectionHeader
              theme={theme}
              title={`识别置信度 ${Math.round(draft.confidence * 100)}%`}
              subtitle={
                reviewFields.length > 0
                  ? `建议复核：${reviewFields.join('、')}`
                  : '关键字段已识别'
              }
            />
            <InlineNotice
              theme={theme}
              tone={draft.review.required ? 'warning' : 'success'}
              message={
                draft.review.required
                  ? draft.review.reasons.slice(0, 3).join('；') ||
                    '部分字段需要人工确认。'
                  : '未发现必须复核的字段。'
              }
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader theme={theme} title="金额与时间" />
          <View style={styles.fieldRow}>
            <View style={styles.fieldWide}>
              <FormField
                theme={theme}
                label="金额"
                value={amountInput}
                onChangeText={updateAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                error={amountError}
                testID="capture-amount"
              />
            </View>
            <View style={styles.fieldNarrow}>
              <FormField
                theme={theme}
                label="币种"
                value={draft.currency ?? ''}
                onChangeText={updateCurrency}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={3}
                placeholder="CNY"
                error={currencyError}
                testID="capture-currency"
              />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <FormField
                theme={theme}
                label="日期"
                value={draft.date ?? ''}
                onChangeText={(value) => updateDraft({ date: value || null })}
                placeholder="YYYY-MM-DD"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                error={dateError}
                testID="capture-date"
              />
            </View>
            <View style={styles.fieldHalf}>
              <FormField
                theme={theme}
                label="时间（可选）"
                value={timeInput}
                onChangeText={setTimeInput}
                placeholder="HH:mm:ss"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                error={timeError}
                testID="capture-time"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader theme={theme} title="消费内容" />
          <FormField
            theme={theme}
            label="商户"
            value={draft.merchant}
            onChangeText={(value) => updateDraft({ merchant: value })}
            placeholder="例如：盒马、Apple"
            error={merchantError}
            testID="capture-merchant"
          />
          <FormField
            theme={theme}
            label="消费内容"
            value={draft.description ?? ''}
            onChangeText={(value) =>
              updateDraft({ description: value || undefined })
            }
            placeholder="例如：午餐、云服务续费"
            testID="capture-description"
          />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            分类
          </Text>
          <ChoiceChips
            theme={theme}
            value={draft.categoryId ?? settings.defaultCategoryId}
            options={categoryOptions}
            onChange={(value) =>
              updateDraft({
                categoryId: value,
                subcategoryId: undefined,
              })
            }
            testID="capture-category"
          />
          {subcategoryOptions.length > 1 ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
                子分类
              </Text>
              <ChoiceChips
                theme={theme}
                value={draft.subcategoryId ?? ''}
                options={subcategoryOptions}
                onChange={(value) =>
                  updateDraft({
                    subcategoryId: value || undefined,
                  })
                }
                testID="capture-subcategory"
              />
            </>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader theme={theme} title="支付信息" />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            支付渠道
          </Text>
          <ChoiceChips
            theme={theme}
            value={draft.paymentChannel}
            options={channelOptions}
            onChange={(value) => updateDraft({ paymentChannel: value })}
            testID="capture-payment-channel"
          />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            资金工具
          </Text>
          <ChoiceChips
            theme={theme}
            value={funding.type}
            options={fundingTypeOptions}
            onChange={(value) => updateFundingInstrument({ type: value })}
            testID="capture-funding-type"
          />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <FormField
                theme={theme}
                label="发卡机构（可选）"
                value={funding.issuer ?? ''}
                onChangeText={(value) =>
                  updateFundingInstrument({ issuer: value })
                }
                placeholder="仅填写银行或金融机构，例如：招商银行"
                hint="机构只填银行/金融机构；卡类型写在卡/账户名称"
                testID="capture-funding-issuer"
              />
            </View>
            <View style={styles.fieldHalf}>
              <FormField
                theme={theme}
                label="卡/账户名称（可选）"
                value={funding.label ?? ''}
                onChangeText={(value) =>
                  updateFundingInstrument({ label: value })
                }
                placeholder="例如：网商银行储蓄卡、Visa"
                testID="capture-funding-label"
              />
            </View>
          </View>
          <FormField
            theme={theme}
            label="卡号尾号（可选）"
            value={funding.last4 ?? ''}
            onChangeText={(value) =>
              updateFundingInstrument({
                last4: value.replace(/\D/g, '').slice(0, 4),
              })
            }
            keyboardType="number-pad"
            maxLength={4}
            placeholder="1234"
            error={last4Error}
            testID="capture-funding-last4"
          />
        </View>

        <View style={styles.section}>
          <SectionHeader theme={theme} title="记账规则" />
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            交易类型
          </Text>
          {!draft.kind ? (
            <InlineNotice
              theme={theme}
              tone="warning"
              message="AI 没有确定交易类型，请手动选择。"
            />
          ) : null}
          <ChoiceChips
            theme={theme}
            value={draft.kind}
            options={kindOptions}
            onChange={(value) =>
              updateDraft({
                kind: value,
                ...(value !== 'expense' ? { isUnexpected: undefined } : {}),
              })
            }
            testID="capture-kind"
          />
          {draft.kind === 'expense' ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>支出标记</Text>
              <ChoiceChips
                theme={theme}
                value={draft.isUnexpected ? 'unexpected' : 'normal'}
                options={unexpectedOptions}
                onChange={(value) =>
                  updateDraft({
                    isUnexpected: value === 'unexpected' ? true : undefined,
                  })
                }
                scrollable={false}
                testID="capture-unexpected"
              />
              <Text style={[styles.help, { color: theme.colors.textMuted }]}>
                标记后仍会计入预算，但会在统计中单独汇总并按分类细分。
              </Text>
            </>
          ) : null}
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            交易状态
          </Text>
          {!draft.status ? (
            <InlineNotice
              theme={theme}
              tone="warning"
              message="AI 没有确定交易状态，请手动选择。"
            />
          ) : null}
          <ChoiceChips
            theme={theme}
            value={draft.status}
            options={statusOptions}
            onChange={(value) => updateDraft({ status: value })}
            testID="capture-status"
          />
          <InlineNotice
            theme={theme}
            tone={countsInSpending ? 'success' : 'info'}
            message={
              countsInSpending
                ? draft.kind === 'refund'
                  ? '这笔退款会抵减月度支出。'
                  : '这笔已确认支出会计入月度预算。'
                : '当前类型或状态不会计入月度支出。'
            }
          />
          {recurringOptions.length > 1 ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
                固定支出关联
              </Text>
              <ChoiceChips
                theme={theme}
                value={
                  draft.recurringExpenseId ?? NO_RECURRING_EXPENSE
                }
                options={recurringOptions}
                onChange={(value) =>
                  updateDraft({
                    recurringExpenseId:
                      value === NO_RECURRING_EXPENSE
                        ? undefined
                        : value,
                  })
                }
                testID="capture-recurring-expense"
              />
              <Text style={[styles.help, { color: theme.colors.textMuted }]}>
                关联后，这次扣款会抵扣对应的预算预留。
              </Text>
            </>
          ) : null}
          <FormField
            theme={theme}
            label="备注（仅手动，可选）"
            value={draft.note ?? ''}
            onChangeText={(value) => updateDraft({ note: value || undefined })}
            multiline
            placeholder="仅供自己补充，不由 AI 生成"
            testID="capture-note"
          />
        </View>

        <DuplicateWarning
          theme={theme}
          candidates={duplicateCandidates}
          locale={settings.locale}
          saving={saving}
          onSaveAnyway={() => void saveDraft(true)}
          onReview={() => {
            setDuplicateCandidates([]);
            setNotice(null);
          }}
        />

        <View style={styles.footerActions}>
          <AppButton
            theme={theme}
            label="舍弃此笔"
            icon="trash-outline"
            onPress={discardCurrentReview}
            disabled={saving || recognizing}
            variant="quiet"
            testID="capture-discard"
          />
          <AppButton
            theme={theme}
            label="加入重新识别"
            icon="refresh-outline"
            onPress={queueCurrentForRetry}
            disabled={saving || recognizing || !reviewQueue[0]}
            variant="secondary"
            testID="capture-queue-retry"
          />
          {duplicateCandidates.length === 0 ? (
            <AppButton
              theme={theme}
              label={
                reviewQueue.length > 1
                  ? '保存并核对下一笔'
                  : retryQueue.length > 0
                    ? '保存并重新识别'
                    : '确认保存'
              }
              icon="checkmark-circle-outline"
              onPress={() => void saveDraft(false)}
              loading={saving}
              testID="capture-save"
            />
          ) : null}
        </View>
        {fullscreenImagePreview}
      </Screen>
    );
  }

  return (
    <Screen
      theme={theme}
      keyboard
      bottomNavigation={false}
      scrollRef={scrollRef}
      testID="capture-screen"
    >
      <PageHeader
        theme={theme}
        title="记一笔"
        subtitle={
          VOICE_CAPTURE_ENABLED
            ? '截图、文字和语音可以组合'
            : '截图和文字可以一起识别'
        }
        onBack={requestCancel}
        backLabel="返回上一页"
        backDisabled={saving}
      />

      {notice ? (
        <View style={styles.noticeSpacing}>
          <InlineNotice
            theme={theme}
            tone={notice.tone}
            message={notice.message}
          />
        </View>
      ) : null}

      {recognizing && recognitionProgress ? (
        <View style={styles.noticeSpacing}>
          <RecognitionProgressPanel
            theme={theme}
            progress={recognitionProgress}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <SectionHeader
            theme={theme}
            title={
              imageItems.length > 0
                ? `消费截图（已选 ${imageItems.length} 张）`
                : '消费截图（可选）'
            }
            subtitle={
              imageItems.length > 0
                ? '横向滑动缩略图选择，左右切换并逐张补充文字'
                : '可一次选择多张，再逐张补充说明'
            }
            action={
              imageItems.length > 0 ? (
                <IconButton
                  theme={theme}
                  icon="trash-outline"
                  label={
                    activeImage
                      ? `删除第 ${activeImageIndex + 1} 张截图`
                      : '删除截图'
                  }
                  onPress={() => removeImage(activeImage?.id)}
                  disabled={!activeImage}
                  testID="capture-remove-image"
                />
              ) : undefined
            }
          />
          {imageItems.length > 0 ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imageStrip}
                testID="capture-image-strip"
              >
                {imageItems.map((item, index) => {
                  const selected = item.id === activeImage?.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => selectImage(index)}
                      accessibilityRole="button"
                      accessibilityLabel={`选择第 ${index + 1} 张截图`}
                      style={[
                        styles.imageTile,
                        {
                          borderColor: selected
                            ? theme.colors.primary
                            : theme.colors.border,
                          backgroundColor: selected
                            ? theme.colors.primarySoft
                            : theme.colors.surfaceMuted,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: item.asset.uri }}
                        resizeMode="cover"
                        style={styles.stripThumbnail}
                      />
                      <View style={styles.imageTileFooter}>
                        <Text
                          style={[styles.imageTileLabel, { color: theme.colors.text }]}
                          numberOfLines={1}
                        >
                          #{index + 1}
                        </Text>
                        <Ionicons
                          name={item.text.trim() ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={item.text.trim() ? theme.colors.success : theme.colors.textMuted}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[styles.mediaMeta, { color: theme.colors.textMuted }]}>
                已补充文字 {imageItems.filter((item) => item.text.trim()).length}/{imageItems.length} 张，左右滑动缩略图选择
              </Text>
              {activeImage ? (
                <View style={styles.activeImageEditor}>
                  <View style={styles.imageEditorNavigation}>
                    <IconButton
                      theme={theme}
                      icon="chevron-back"
                      label="上一张截图"
                      onPress={() => moveActiveImage(-1)}
                      disabled={activeImageIndex <= 0}
                      testID="capture-image-previous"
                    />
                    <Text style={[styles.imageEditorIndex, { color: theme.colors.text }]}>
                      第 {activeImageIndex + 1}/{imageItems.length} 张
                      {activeImage.text.trim() ? ' · 已填写' : ' · 待补充'}
                    </Text>
                    <IconButton
                      theme={theme}
                      icon="chevron-forward"
                      label="下一张截图"
                      onPress={() => moveActiveImage(1)}
                      disabled={activeImageIndex < 0 || activeImageIndex >= imageItems.length - 1}
                      testID="capture-image-next"
                    />
                  </View>
                  <Pressable
                    onPress={() => openFullscreenImage(activeImage.asset.uri)}
                    accessibilityRole="button"
                    accessibilityLabel="全屏查看当前消费截图"
                    style={styles.previewTap}
                  >
                    <Image
                      source={{ uri: activeImage.asset.uri }}
                      resizeMode="contain"
                      style={[
                        styles.preview,
                        { backgroundColor: theme.colors.surfaceMuted },
                      ]}
                      accessibilityLabel="当前正在补充说明的消费截图"
                    />
                  </Pressable>
                  <Text style={[styles.mediaMeta, { color: theme.colors.textMuted }]}>
                    {[activeImage.asset.fileName || '已选择图片', `${activeImage.asset.width} × ${activeImage.asset.height}`, formatBytes(activeImage.asset.fileSize)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <FormField
                    theme={theme}
                    label={`第 ${Math.max(1, imageItems.findIndex((item) => item.id === activeImage.id) + 1)} 张补充说明（可选）`}
                    value={activeImage.text}
                    onChangeText={updateActiveImageText}
                    multiline
                    placeholder="例如：这笔是软件激活码"
                    hint="AI 会把这段文字与当前截图一起整理成消费内容。"
                    testID="capture-image-text"
                  />
                </View>
              ) : null}
              <AppButton
                theme={theme}
                label="继续添加截图"
                icon="images-outline"
                onPress={() => void pickImage()}
                variant="secondary"
                loading={pickingImage}
              />
            </>
          ) : (
            <AppButton
              theme={theme}
              label="从相册选择截图"
              icon="image-outline"
              onPress={() => void pickImage()}
              loading={pickingImage}
              testID="capture-pick-image"
            />
          )}
        </View>

        {imageItems.length === 0 ? <View style={styles.textComposer}>
          <FormField
            theme={theme}
            label="补充说明（可选）"
            value={textInput}
            onChangeText={updateTextInputFromUser}
            multiline
            placeholder="例如：今天午餐 32 元，微信支付"
            hint="没有截图时，也可以只填写文字。"
            testID="capture-text"
          />
        </View> : null}

        {VOICE_CAPTURE_ENABLED ? (
          <View
            style={[
              styles.composer,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <SectionHeader
              theme={theme}
              title={
                recorderState.isRecording
                  ? `正在录音 ${formatDuration(recorderState.durationMillis)}`
                  : '语音记录'
              }
              action={
                voiceCapture && !recorderState.isRecording ? (
                  <IconButton
                    theme={theme}
                    icon="trash-outline"
                    label="移除录音"
                    onPress={removeVoice}
                  />
                ) : undefined
              }
            />
            {microphonePermissionNotice ? (
              <InlineNotice
                theme={theme}
                tone="warning"
                message={microphonePermissionNotice.message}
              />
            ) : null}
            <View style={styles.recordingStatus}>
              <View
                style={[
                  styles.recordingDot,
                  {
                    backgroundColor: recorderState.isRecording
                      ? theme.colors.danger
                      : theme.colors.textMuted,
                  },
                ]}
              />
              <Text style={[styles.recordingText, { color: theme.colors.text }]}>
                {recorderState.isRecording
                  ? '录音中'
                  : voiceCapture
                    ? '录音已就绪'
                    : '尚未录音'}
              </Text>
            </View>
            {recorderState.isRecording ? (
              <AppButton
                theme={theme}
                label="停止并转写"
                icon="stop"
                onPress={() => void stopAndTranscribe()}
                loading={stoppingRecording || transcribing}
                variant="danger"
                testID="capture-stop-recording"
              />
            ) : (
              <View style={styles.buttonRow}>
                <AppButton
                  theme={theme}
                  label={voiceCapture ? '重新录制' : '开始录音'}
                  icon="mic"
                  onPress={() => void startRecording()}
                  disabled={transcribing}
                  testID="capture-start-recording"
                />
                {voiceCapture ? (
                  <AppButton
                    theme={theme}
                    label="重新转写"
                    icon="sparkles-outline"
                    onPress={() => void transcribeVoice(voiceCapture)}
                    loading={transcribing}
                    variant="secondary"
                  />
                ) : null}
              </View>
            )}
            {microphonePermissionNotice?.canOpenSettings ? (
              <AppButton
                theme={theme}
                label="打开系统设置"
                icon="settings-outline"
                onPress={() => void Linking.openSettings()}
                variant="quiet"
                compact
              />
            ) : null}
            <FormField
              theme={theme}
              label="语音转写"
              value={voiceTranscript}
              onChangeText={updateVoiceTranscriptFromUser}
              multiline
              placeholder="转写结果会显示在这里，也可以手动修改"
              testID="capture-transcript"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader
          theme={theme}
          title="本次输入"
          subtitle={
            inputSummary.length > 0
              ? `已添加：${inputSummary.join('、')}`
              : '尚未添加内容'
          }
        />
        {inputSummary.length > 0 ? (
          <View style={styles.sourceSummary}>
            {imageItems.length > 0 ? (
              <View
                style={[
                  styles.sourcePill,
                  { backgroundColor: theme.colors.primarySoft },
                ]}
              >
                <Ionicons
                  name="image-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={[styles.sourcePillText, { color: theme.colors.text }]}>
                  截图 {imageItems.length} 张
                </Text>
              </View>
            ) : null}
            {textInput.trim() || imageItems.some((item) => item.text.trim()) ? (
              <View
                style={[
                  styles.sourcePill,
                  { backgroundColor: theme.colors.primarySoft },
                ]}
              >
                <Ionicons
                  name="text-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={[styles.sourcePillText, { color: theme.colors.text }]}>
                  文字
                </Text>
              </View>
            ) : null}
            {VOICE_CAPTURE_ENABLED &&
            (voiceCapture || voiceTranscript.trim()) ? (
              <View
                style={[
                  styles.sourcePill,
                  { backgroundColor: theme.colors.primarySoft },
                ]}
              >
                <Ionicons
                  name="mic-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={[styles.sourcePillText, { color: theme.colors.text }]}>
                  语音
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {imageItems.length > 0 && !canRecognize ? (
          <InlineNotice
            theme={theme}
            tone="info"
            message="当前设置不会发送截图。请补充文字，或在设置中开启“发送截图”。"
          />
        ) : null}
        <AppButton
          theme={theme}
          label="AI 识别并生成草稿"
          icon="sparkles"
          onPress={() => void recognize()}
          disabled={!canRecognize || recorderState.isRecording}
          loading={recognizing || transcribing}
          testID="capture-recognize"
        />
        <AppButton
          theme={theme}
          label="手动填写"
          icon="create-outline"
          onPress={beginManualEntry}
          variant="secondary"
          disabled={recorderState.isRecording || recognizing}
          testID="capture-manual"
        />
      </View>
      {fullscreenImagePreview}
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeSpacing: {
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xxl,
    gap: spacing.lg,
  },
  composer: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  textComposer: {
    gap: spacing.lg,
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radii.sm,
  },
  previewTap: {
    width: '100%',
    height: 240,
  },
  reviewPreview: {
    width: '100%',
    height: 360,
    borderRadius: radii.sm,
  },
  reviewPreviewTap: {
    width: '100%',
    height: 360,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: '#0A0D0C',
  },
  fullscreenToolbar: {
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fullscreenTitle: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '800',
  },
  fullscreenClose: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  fullscreenImageBody: {
    flex: 1,
    width: '100%',
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  recognitionProgress: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressPercent: {
    fontSize: typography.label,
    fontWeight: '800',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  imageStrip: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  imageTile: {
    width: 76,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  stripThumbnail: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
  },
  imageTileFooter: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  imageTileLabel: {
    fontSize: typography.caption,
    fontWeight: '700',
  },
  imageEditorNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  imageEditorIndex: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.label,
    fontWeight: '700',
  },
  activeImageEditor: {
    gap: spacing.md,
  },
  mediaMeta: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recordingStatus: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  recordingText: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  sourceSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sourcePill: {
    minHeight: 34,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourcePillText: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  help: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  fieldWide: {
    flex: 2,
  },
  fieldNarrow: {
    flex: 1,
    minWidth: 92,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  footerActions: {
    gap: spacing.md,
  },
});
