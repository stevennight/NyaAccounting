import { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CaptureEntryMode } from '../screens/CaptureScreen';
import { AppTheme, radii, spacing, typography } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type CaptureSheetProps = {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onSelect: (mode: CaptureEntryMode) => void;
};

/** Extended FAB (M3) that opens the capture sheet. */
export function CaptureFab({
  theme,
  onPress,
  bottomOffset,
}: {
  theme: AppTheme;
  onPress: () => void;
  bottomOffset: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="记一笔"
      onPress={onPress}
      testID="capture-fab"
      style={({ pressed }) => [
        styles.fab,
        {
          bottom: bottomOffset,
          backgroundColor: pressed
            ? theme.colors.primarySoft
            : theme.colors.primaryContainer,
          shadowColor: theme.dark ? '#000000' : '#1A2B45',
        },
      ]}
    >
      <Ionicons name="camera-outline" size={22} color={theme.colors.onPrimaryContainer} />
      <Text style={[styles.fabLabel, { color: theme.colors.onPrimaryContainer }]}>记一笔</Text>
    </Pressable>
  );
}

/**
 * Screenshot-first entry: recognizing screenshots is the main path, manual
 * entry and a one-line description are the secondary ones.
 */
export function CaptureSheet({ theme, visible, onClose, onSelect }: CaptureSheetProps) {
  const insets = useSafeAreaInsets();
  const choose = (mode: CaptureEntryMode) => {
    onClose();
    onSelect(mode);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
            },
          ]}
          testID="capture-sheet"
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.outline }]} />
          <Text style={[styles.title, { color: theme.colors.text }]}>记一笔</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="选择截图识别"
            onPress={() => choose('pick')}
            testID="capture-sheet-pick"
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: pressed
                  ? theme.colors.primaryPressed
                  : theme.colors.primary,
              },
            ]}
          >
            <View
              style={[styles.primaryIcon, { backgroundColor: `${theme.colors.onPrimary}26` }]}
            >
              <Ionicons name="images-outline" size={24} color={theme.colors.onPrimary} />
            </View>
            <View style={styles.primaryCopy}>
              <Text style={[styles.primaryTitle, { color: theme.colors.onPrimary }]}>
                选择截图识别
              </Text>
              <Text style={[styles.primaryHint, { color: theme.colors.onPrimary }]}>
                可一次选多张，AI 生成草稿后逐笔确认
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.onPrimary} />
          </Pressable>

          <View style={styles.secondaryRow}>
            <SecondaryAction
              theme={theme}
              icon="create-outline"
              label="手动记一笔"
              onPress={() => choose('manual')}
              testID="capture-sheet-manual"
            />
            <SecondaryAction
              theme={theme}
              icon="chatbubble-ellipses-outline"
              label="一句话描述"
              onPress={() => choose('text')}
              testID="capture-sheet-text"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SecondaryAction({
  theme,
  icon,
  label,
  onPress,
  testID,
}: {
  theme: AppTheme;
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.secondary,
        {
          backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.primarySoft,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.onPrimarySoft} />
      <Text style={[styles.secondaryLabel, { color: theme.colors.onPrimarySoft }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    height: 56,
    paddingHorizontal: spacing.lg + 4,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    elevation: 3,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabLabel: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: radii.pill,
    alignSelf: 'center',
    opacity: 0.4,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.sectionTitle + 3,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  primary: {
    minHeight: 80,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCopy: {
    flex: 1,
    gap: 2,
  },
  primaryTitle: {
    fontSize: typography.body + 1,
    fontWeight: '600',
  },
  primaryHint: {
    fontSize: typography.caption,
    opacity: 0.85,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryLabel: {
    fontSize: typography.body,
    fontWeight: '600',
  },
});
