import { PropsWithChildren, RefObject } from 'react';
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
  testID,
  scrollRef,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 720 ? spacing.xl : spacing.lg;
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingHorizontal: horizontalPadding,
          paddingBottom:
            (bottomNavigation ? spacing.lg : spacing.xl) + insets.bottom,
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
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingHorizontal: horizontalPadding,
          paddingBottom:
            (bottomNavigation ? spacing.lg : spacing.xl) + insets.bottom,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!keyboard) {
    return <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>{content}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
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
});
