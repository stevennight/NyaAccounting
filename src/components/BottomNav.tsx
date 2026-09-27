import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme, radii, spacing, typography } from '../theme';

export type AppTab = 'records' | 'stats' | 'settings';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: Array<{
  key: AppTab;
  label: string;
  icon: IconName;
  selectedIcon: IconName;
}> = [
  { key: 'records', label: '明细', icon: 'receipt-outline', selectedIcon: 'receipt' },
  { key: 'stats', label: '统计', icon: 'pie-chart-outline', selectedIcon: 'pie-chart' },
  { key: 'settings', label: '设置', icon: 'settings-outline', selectedIcon: 'settings' },
];

type BottomNavProps = {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  theme: AppTheme;
};

/** Material 3 navigation bar: tonal container with a pill active indicator. */
export function BottomNav({ activeTab, onChange, theme }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, spacing.md),
          backgroundColor: theme.colors.surfaceContainer,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          { paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.key)}
              testID={`nav-${tab.key}`}
              style={styles.item}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.indicator,
                      {
                        backgroundColor: selected
                          ? theme.colors.primarySoft
                          : pressed
                            ? theme.colors.surfaceMuted
                            : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons
                      name={selected ? tab.selectedIcon : tab.icon}
                      size={22}
                      color={
                        selected ? theme.colors.onPrimarySoft : theme.colors.textMuted
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: selected ? theme.colors.text : theme.colors.textMuted,
                        fontWeight: selected ? '600' : '500',
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </>
              )}
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
    paddingTop: spacing.md,
  },
  inner: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  indicator: {
    width: 64,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.caption,
  },
});
