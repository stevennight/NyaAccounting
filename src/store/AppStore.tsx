import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AiSettings,
  AppSettings,
  DomainDataset,
  RecurringExpense,
  Transaction,
} from '../domain/types';
import {
  deleteDataset,
  loadDataset,
  saveDataset,
} from '../services/storage';
import { clearAiCapabilityCache } from '../services/aiCapabilities';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  reasoningEffort: 'auto',
  requestTimeoutMs: 45_000,
  sendImages: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  currency: 'CNY',
  locale: 'zh-CN',
  monthlyBudgetMinor: 0,
  categoryBudgetsMinor: {},
  reserveRecurringExpenses: false,
  budgetWarningRatio: 0.8,
  budgetDangerRatio: 0.95,
  defaultCategoryId: 'other',
  defaultPaymentChannel: 'unknown',
  firstDayOfWeek: 1,
  theme: 'system',
  deleteRawSourcesAfterConfirmation: true,
  ai: DEFAULT_AI_SETTINGS,
};

export const EMPTY_DATASET: DomainDataset = {
  settings: DEFAULT_SETTINGS,
  transactions: [],
  recurringExpenses: [],
};

type SettingsPatch = Partial<Omit<AppSettings, 'ai'>> & {
  ai?: Partial<AiSettings>;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type AppStoreValue = {
  dataset: DomainDataset;
  hydrated: boolean;
  persistenceError: string | null;
  addTransaction: (transaction: Transaction) => Promise<void>;
  updateTransaction: (transaction: Transaction) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  addRecurringExpense: (expense: RecurringExpense) => Promise<void>;
  updateRecurringExpense: (expense: RecurringExpense) => Promise<void>;
  removeRecurringExpense: (id: string) => Promise<void>;
  replaceDataset: (dataset: DomainDataset) => Promise<void>;
  clearAll: () => Promise<void>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

function createDeferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mergeSettings(settings: AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    categoryBudgetsMinor: {
      ...DEFAULT_SETTINGS.categoryBudgetsMinor,
      ...settings.categoryBudgetsMinor,
    },
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...settings.ai,
    },
  };
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [dataset, setDataset] = useState<DomainDataset>(EMPTY_DATASET);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [hydrationReady] = useState(createDeferred);
  const datasetRef = useRef<DomainDataset>(EMPTY_DATASET);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const hydrationTask = useRef<Promise<void> | null>(null);
  const hydrationError = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!hydrationTask.current) {
      hydrationTask.current = loadDataset()
        .then((stored) => {
          if (!stored) {
            return;
          }

          datasetRef.current = {
            ...stored,
            settings: mergeSettings(stored.settings),
          };
        })
        .catch((error: unknown) => {
          hydrationError.current =
            error instanceof Error ? error.message : '无法读取本地账本。';
        });
    }

    hydrationTask.current.finally(() => {
      hydrationReady.resolve();

      if (active) {
        setDataset(datasetRef.current);
        setPersistenceError(hydrationError.current);
        setHydrated(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const applyInMemory = useCallback((nextDataset: DomainDataset) => {
    datasetRef.current = nextDataset;
    setDataset(nextDataset);
  }, []);

  const enqueueMutation = useCallback(
    (
      createNextDataset: (current: DomainDataset) => DomainDataset,
      persist: (nextDataset: DomainDataset) => Promise<void> = saveDataset,
    ) => {
      const queued = writeQueue.current
        .then(() => hydrationReady.promise)
        .then(async () => {
          const nextDataset = createNextDataset(datasetRef.current);
          await persist(nextDataset);
          applyInMemory(nextDataset);
        });

      writeQueue.current = queued.catch(() => undefined);

      return queued.then(
        () => {
          setPersistenceError(null);
        },
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : '账本保存失败。';
          setPersistenceError(message);
          throw error;
        },
      );
    },
    [applyInMemory, hydrationReady],
  );

  const addTransaction = useCallback(
    (transaction: Transaction) =>
      enqueueMutation((current) => ({
        ...current,
        transactions: [transaction, ...current.transactions],
      })),
    [enqueueMutation],
  );

  const updateTransaction = useCallback(
    (transaction: Transaction) =>
      enqueueMutation((current) => ({
        ...current,
        transactions: current.transactions.map((item) =>
          item.id === transaction.id ? transaction : item,
        ),
      })),
    [enqueueMutation],
  );

  const removeTransaction = useCallback(
    (id: string) =>
      enqueueMutation((current) => ({
        ...current,
        transactions: current.transactions.filter((item) => item.id !== id),
      })),
    [enqueueMutation],
  );

  const updateSettings = useCallback(
    (patch: SettingsPatch) =>
      enqueueMutation((current) => ({
        ...current,
        settings: {
          ...current.settings,
          ...patch,
          ai: patch.ai
            ? { ...current.settings.ai, ...patch.ai }
            : current.settings.ai,
        },
      })),
    [enqueueMutation],
  );

  const addRecurringExpense = useCallback(
    (expense: RecurringExpense) =>
      enqueueMutation((current) => ({
        ...current,
        recurringExpenses: [expense, ...current.recurringExpenses],
      })),
    [enqueueMutation],
  );

  const updateRecurringExpense = useCallback(
    (expense: RecurringExpense) =>
      enqueueMutation((current) => ({
        ...current,
        recurringExpenses: current.recurringExpenses.map((item) =>
          item.id === expense.id ? expense : item,
        ),
      })),
    [enqueueMutation],
  );

  const removeRecurringExpense = useCallback(
    (id: string) =>
      enqueueMutation((current) => ({
        ...current,
        recurringExpenses: current.recurringExpenses.filter(
          (item) => item.id !== id,
        ),
      })),
    [enqueueMutation],
  );

  const replaceDataset = useCallback(
    (nextDataset: DomainDataset) => {
      const mergedDataset = {
        ...nextDataset,
        settings: mergeSettings(nextDataset.settings),
      };

      return enqueueMutation(() => mergedDataset);
    },
    [enqueueMutation],
  );

  const clearAll = useCallback(
    () =>
      enqueueMutation(
        () => ({
          settings: mergeSettings(DEFAULT_SETTINGS),
          transactions: [],
          recurringExpenses: [],
        }),
        async () => {
          await Promise.all([
            deleteDataset(),
            clearAiCapabilityCache(),
          ]);
        },
      ),
    [enqueueMutation],
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      dataset,
      hydrated,
      persistenceError,
      addTransaction,
      updateTransaction,
      removeTransaction,
      updateSettings,
      addRecurringExpense,
      updateRecurringExpense,
      removeRecurringExpense,
      replaceDataset,
      clearAll,
    }),
    [
      dataset,
      hydrated,
      persistenceError,
      addTransaction,
      updateTransaction,
      removeTransaction,
      updateSettings,
      addRecurringExpense,
      updateRecurringExpense,
      removeRecurringExpense,
      replaceDataset,
      clearAll,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) {
    throw new Error('useAppStore must be used inside AppStoreProvider.');
  }
  return value;
}
