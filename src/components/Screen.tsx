import { PropsWithChildren, ReactNode, RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme, spacing } from '../theme';

type ScreenProps = PropsWithChildren<{
  theme: AppTheme;
  scroll?: boolean;
  keyboard?: boolean;
  bottomNavigation?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  testID?: string;
  scrollRef?: RefObject<ScrollView | null>;
}>;

export function Screen({
  theme,
  children,
  scroll = true,
  keyboard = false,
  bottomNavigation = true,
  contentStyle,
  header,
  testID,
  scrollRef,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 720 ? spacing.xl : spacing.lg;
  const contentTopPadding = header
    ? spacing.lg
    : Math.max(insets.top, spacing.lg);
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: contentTopPadding,
          paddingLeft: horizontalPadding + insets.left,
          paddingRight: horizontalPadding + insets.right,
          paddingBottom: bottomNavigation
            ? spacing.xl
            : spacing.xl + insets.bottom,
        },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      testID={testID}
      style={[
        styles.content,
        styles.fill,
        {
          paddingTop: contentTopPadding,
          paddingLeft: horizontalPadding + insets.left,
          paddingRight: horizontalPadding + insets.right,
          paddingBottom: bottomNavigation
            ? spacing.xl
            : spacing.xl + insets.bottom,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const body = keyboard ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.fill}>{content}</View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {header ? (
        <View
          testID={testID ? `${testID}-header` : undefined}
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.background,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.headerInner,
              {
                paddingTop: Math.max(insets.top, spacing.sm),
                paddingLeft: horizontalPadding + insets.left,
                paddingRight: horizontalPadding + insets.right,
              },
            ]}
          >
            {header}
          </View>
        </View>
      ) : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  header: {
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    paddingBottom: spacing.sm,
  },
});
