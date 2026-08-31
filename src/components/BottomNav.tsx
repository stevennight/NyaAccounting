import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme, radii, spacing, typography } from '../theme';

export type AppTab = 'home' | 'records' | 'stats' | 'settings';
export type AppDestination = AppTab | 'capture';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: Array<{
  key: AppDestination;
  label: string;
  icon: IconName;
  selectedIcon: IconName;
}> = [
  { key: 'home', label: '本月', icon: 'home-outline', selectedIcon: 'home' },
  { key: 'records', label: '账目', icon: 'receipt-outline', selectedIcon: 'receipt' },
  { key: 'capture', label: '记一笔', icon: 'add', selectedIcon: 'add' },
  { key: 'stats', label: '统计', icon: 'stats-chart-outline', selectedIcon: 'stats-chart' },
  { key: 'settings', label: '设置', icon: 'settings-outline', selectedIcon: 'settings' },
];

type BottomNavProps = {
  activeTab: AppTab;
  onChange: (destination: AppDestination) => void;
  theme: AppTheme;
};

export function BottomNav({ activeTab, onChange, theme }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            paddingLeft: spacing.sm + insets.left,
            paddingRight: spacing.sm + insets.right,
          },
        ]}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          const isCapture = tab.key === 'capture';
          return (
            <Pressable
              key={tab.key}
              accessibilityRole={isCapture ? 'button' : 'tab'}
              accessibilityLabel={tab.label}
              accessibilityState={isCapture ? undefined : { selected }}
              onPress={() => onChange(tab.key)}
              testID={`nav-${tab.key}`}
              style={({ pressed }) => [
                styles.item,
                isCapture && styles.captureItem,
                { opacity: pressed ? 0.66 : 1 },
              ]}
            >
              <View
                style={[
                  styles.iconBox,
                  isCapture && styles.captureIcon,
                  {
                    backgroundColor: isCapture
                      ? theme.colors.primary
                      : selected
                        ? theme.colors.primarySoft
                        : 'transparent',
                  },
                ]}
              >
                <Ionicons
                  name={selected ? tab.selectedIcon : tab.icon}
                  size={isCapture ? 27 : 21}
                  color={
                    isCapture
                      ? '#FFFFFF'
                      : selected
                        ? theme.colors.primary
                        : theme.colors.textMuted
                  }
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isCapture
                      ? theme.colors.primary
                      : selected
                        ? theme.colors.primary
                        : theme.colors.textMuted,
                    fontWeight: selected || isCapture ? '800' : '600',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexShrink: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  inner: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: {
    flex: 1,
    maxWidth: 88,
    minWidth: 0,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  captureItem: {
    paddingTop: 1,
  },
  iconBox: {
    width: 38,
    height: 30,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureIcon: {
    width: 46,
    height: 38,
  },
  label: {
    fontSize: typography.caption,
  },
});
