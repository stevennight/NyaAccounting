import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppDestination,
  AppTab,
  BottomNav,
} from './src/components/BottomNav';
import { Transaction } from './src/domain/types';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { CategorySettingsScreen } from './src/screens/CategorySettingsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecordsScreen } from './src/screens/RecordsScreen';
import { RecurringExpensesScreen } from './src/screens/RecurringExpensesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { TransactionEditScreen } from './src/screens/TransactionEditScreen';
import {
  consumePendingScreenCapture,
  consumePendingScreenCaptureError,
} from './src/services';
import { useHardwareBack } from './src/hooks/useHardwareBack';
import {
  AppStoreProvider,
  useAppStore,
} from './src/store/AppStore';
import { getTheme, spacing, typography } from './src/theme';

function AppContent() {
  const [iconsLoaded, iconFontError] = useFonts(Ionicons.font);
  const systemColorScheme = useColorScheme();
  const {
    dataset,
    hydrated,
    updateTransaction,
    removeTransaction,
  } = useAppStore();
  type AppRoute =
    | { type: 'tab'; tab: AppTab }
    | { type: 'capture' }
    | { type: 'category-settings' }
    | { type: 'transaction'; transactionId: string }
    | { type: 'recurring-expenses'; startCreating: boolean };
  const [routes, setRoutes] = useState<AppRoute[]>([
    { type: 'tab', tab: 'home' },
  ]);
  const [pendingScreenshotUri, setPendingScreenshotUri] = useState<string | null>(null);
  const [pendingScreenshotError, setPendingScreenshotError] = useState<string | null>(null);
  const clearPendingScreenshot = useCallback(() => {
    setPendingScreenshotUri(null);
    setPendingScreenshotError(null);
  }, []);
  const currentRoute = routes[routes.length - 1];

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    let active = true;
    const consumePendingCapture = () => Promise.all([
      consumePendingScreenCapture().catch(() => null),
      consumePendingScreenCaptureError().catch(() => null),
    ]).then(([uri, error]) => {
      if (!active || (!uri && !error)) {
        return;
      }
      setPendingScreenshotUri(uri);
      setPendingScreenshotError(error);
      setRoutes((current) =>
        current.some((route) => route.type === 'capture')
          ? current
          : [...current, { type: 'capture' }],
      );
    });
    void consumePendingCapture();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void consumePendingCapture();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [hydrated]);
  const activeTab =
    [...routes]
      .reverse()
      .find((route): route is Extract<AppRoute, { type: 'tab' }> =>
        route.type === 'tab',
      )?.tab ?? 'home';

  const effectiveColorScheme =
    dataset.settings.theme === 'system'
      ? systemColorScheme
      : dataset.settings.theme;
  const theme = useMemo(
    () => getTheme(effectiveColorScheme),
    [effectiveColorScheme],
  );
  const editingTransaction = currentRoute.type === 'transaction'
    ? dataset.transactions.find(
        (transaction) => transaction.id === currentRoute.transactionId,
      )
    : undefined;

  useEffect(() => {
    if (currentRoute.type === 'transaction' && !editingTransaction) {
      setRoutes((current) => current.slice(0, -1));
    }
  }, [currentRoute.type, editingTransaction]);

  const goBack = () => {
    setRoutes((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  };

  useHardwareBack(
    () => {
      if (routes.length <= 1) {
        return false;
      }
      goBack();
      return true;
    },
    currentRoute.type === 'tab',
  );

  const openCapture = () => {
    setRoutes((current) => [...current, { type: 'capture' }]);
  };

  const changeDestination = (destination: AppDestination) => {
    if (destination === 'capture') {
      openCapture();
      return;
    }
    setRoutes((current) => {
      if (
        currentRoute.type === 'tab' &&
        currentRoute.tab === destination
      ) {
        return current;
      }
      const previousTabs = current.filter(
        (route) => route.type !== 'tab' || route.tab !== destination,
      );
      return [...previousTabs, { type: 'tab', tab: destination }];
    });
  };

  const openTransaction = (transaction: Transaction) => {
    setRoutes((current) => [
      ...current,
      { type: 'transaction', transactionId: transaction.id },
    ]);
  };

  const saveTransaction = async (transaction: Transaction) => {
    await updateTransaction(transaction);
    goBack();
  };

  const deleteTransaction = async (id: string) => {
    await removeTransaction(id);
    goBack();
  };

  if (!hydrated || (!iconsLoaded && !iconFontError)) {
    return (
      <View
        style={[styles.loading, { backgroundColor: theme.colors.background }]}
        testID="app-loading"
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
          {hydrated ? '正在加载界面资源' : '正在打开本地账本'}
        </Text>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </View>
    );
  }

  if (iconFontError) {
    return (
      <View
        style={[styles.loading, { backgroundColor: theme.colors.background }]}
        testID="app-font-error"
      >
        <Text style={[styles.loadingTitle, { color: theme.colors.text }]}>
          界面资源加载失败
        </Text>
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
          请重新打开应用后再试。
        </Text>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </View>
    );
  }

  let content;
  if (currentRoute.type === 'recurring-expenses') {
    content = (
      <RecurringExpensesScreen
        theme={theme}
        onBack={goBack}
        startCreating={currentRoute.startCreating}
      />
    );
  } else if (currentRoute.type === 'category-settings') {
    content = <CategorySettingsScreen theme={theme} onBack={goBack} />;
  } else if (currentRoute.type === 'transaction' && editingTransaction) {
    content = (
      <TransactionEditScreen
        theme={theme}
        transaction={editingTransaction}
        transactions={dataset.transactions}
        locale={dataset.settings.locale}
        categories={dataset.settings.categories}
        recurringExpenses={dataset.recurringExpenses}
        onSave={saveTransaction}
        onDelete={deleteTransaction}
        onCancel={goBack}
      />
    );
  } else if (currentRoute.type === 'capture') {
    content = (
      <CaptureScreen
        theme={theme}
        onSaved={goBack}
        onCancel={goBack}
        initialScreenshotUri={pendingScreenshotUri}
        initialScreenshotError={pendingScreenshotError}
        onInitialScreenshotConsumed={clearPendingScreenshot}
      />
    );
  } else {
    switch (currentRoute.type === 'tab' ? currentRoute.tab : 'home') {
      case 'home':
        content = (
          <HomeScreen
            theme={theme}
            onCapture={openCapture}
            onOpenSettings={() => changeDestination('settings')}
            onOpenStats={() => changeDestination('stats')}
            onOpenTransaction={openTransaction}
          />
        );
        break;
      case 'records':
        content = (
          <RecordsScreen
            theme={theme}
            onAdd={openCapture}
            onOpenTransaction={openTransaction}
          />
        );
        break;
      case 'stats':
        content = <StatsScreen theme={theme} />;
        break;
      case 'settings':
        content = (
          <SettingsScreen
            theme={theme}
            onOpenCategories={() =>
              setRoutes((current) => [
                ...current,
                { type: 'category-settings' },
              ])
            }
            onOpenRecurringExpenses={() =>
              setRoutes((current) => [
                ...current,
                {
                  type: 'recurring-expenses',
                  startCreating: dataset.recurringExpenses.length === 0,
                },
              ])
            }
          />
        );
        break;
    }
  }

  return (
    <View style={[styles.app, { backgroundColor: theme.colors.background }]}>
      {content}
      {currentRoute.type === 'tab' ? (
        <BottomNav
          activeTab={activeTab}
          onChange={changeDestination}
          theme={theme}
        />
      ) : null}
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <AppContent />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  loadingTitle: {
    fontSize: typography.sectionTitle,
    fontWeight: '700',
  },
});
