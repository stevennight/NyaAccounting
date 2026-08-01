import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppTab, BottomNav } from './src/components/BottomNav';
import { Transaction } from './src/domain/types';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecordsScreen } from './src/screens/RecordsScreen';
import { RecurringExpensesScreen } from './src/screens/RecurringExpensesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { TransactionEditScreen } from './src/screens/TransactionEditScreen';
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
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingRecurringExpenses, setManagingRecurringExpenses] =
    useState(false);

  const effectiveColorScheme =
    dataset.settings.theme === 'system'
      ? systemColorScheme
      : dataset.settings.theme;
  const theme = useMemo(
    () => getTheme(effectiveColorScheme),
    [effectiveColorScheme],
  );
  const editingTransaction = editingId
    ? dataset.transactions.find((transaction) => transaction.id === editingId)
    : undefined;

  useEffect(() => {
    if (editingId && !editingTransaction) {
      setEditingId(null);
    }
  }, [editingId, editingTransaction]);

  const openCapture = () => {
    setEditingId(null);
    setManagingRecurringExpenses(false);
    setActiveTab('capture');
  };

  const changeTab = (tab: AppTab) => {
    setEditingId(null);
    setManagingRecurringExpenses(false);
    setActiveTab(tab);
  };

  const openTransaction = (transaction: Transaction) => {
    setManagingRecurringExpenses(false);
    setActiveTab('records');
    setEditingId(transaction.id);
  };

  const saveTransaction = async (transaction: Transaction) => {
    await updateTransaction(transaction);
    setEditingId(null);
    setActiveTab('records');
  };

  const deleteTransaction = async (id: string) => {
    await removeTransaction(id);
    setEditingId(null);
    setActiveTab('records');
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
  if (managingRecurringExpenses) {
    content = (
      <RecurringExpensesScreen
        theme={theme}
        onBack={() => setManagingRecurringExpenses(false)}
      />
    );
  } else if (editingTransaction) {
    content = (
      <TransactionEditScreen
        theme={theme}
        transaction={editingTransaction}
        recurringExpenses={dataset.recurringExpenses}
        onSave={saveTransaction}
        onDelete={deleteTransaction}
        onCancel={() => setEditingId(null)}
      />
    );
  } else {
    switch (activeTab) {
      case 'home':
        content = (
          <HomeScreen
            theme={theme}
            onCapture={openCapture}
            onOpenSettings={() => changeTab('settings')}
            onOpenStats={() => changeTab('stats')}
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
      case 'capture':
        content = (
          <CaptureScreen
            theme={theme}
            onSaved={() => changeTab('home')}
            onCancel={() => changeTab('home')}
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
            onOpenRecurringExpenses={() =>
              setManagingRecurringExpenses(true)
            }
          />
        );
        break;
    }
  }

  return (
    <View style={[styles.app, { backgroundColor: theme.colors.background }]}>
      {content}
      {!editingTransaction &&
      !managingRecurringExpenses &&
      activeTab !== 'capture' ? (
        <BottomNav
          activeTab={activeTab}
          onChange={changeTab}
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
