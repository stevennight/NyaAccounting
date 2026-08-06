import { Platform, StyleSheet, Text, View } from 'react-native';

import type { GitHubReleaseInfo } from '../services/updateManifest';
import { AppButton } from './AppButton';
import { AppTheme, spacing, typography } from '../theme';

type UpdateBannerProps = {
  theme: AppTheme;
  release: GitHubReleaseInfo | null;
  otaAvailable: boolean;
  downloading: boolean;
  applyingOta: boolean;
  error?: string | null;
  onDownload: () => void;
  onApplyOta: () => void;
  onDismiss: () => void;
};

export function UpdateBanner({
  theme,
  release,
  otaAvailable,
  downloading,
  applyingOta,
  error,
  onDownload,
  onApplyOta,
  onDismiss,
}: UpdateBannerProps) {
  const hasApk = Boolean(release?.apkAsset);
  const canInstallApk = Platform.OS === 'android';
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.colors.text }]}>有新版本可用</Text>
        <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
          {release ? `GitHub Release v${release.version}` : '应用代码更新已下载'}
          {otaAvailable ? '，可立即应用' : ''}
        </Text>
        {error ? (
          <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {release && hasApk ? (
          <AppButton
            label={canInstallApk ? '下载 APK' : '查看 Release'}
            icon={canInstallApk ? 'download-outline' : 'open-outline'}
            onPress={onDownload}
            theme={theme}
            loading={downloading}
            compact
          />
        ) : null}
        {otaAvailable ? (
          <AppButton
            label="应用代码更新"
            icon="refresh-outline"
            onPress={onApplyOta}
            theme={theme}
            variant="secondary"
            loading={applyingOta}
            compact
          />
        ) : null}
        <AppButton
          label="稍后"
          icon="close-outline"
          onPress={onDismiss}
          theme={theme}
          variant="quiet"
          compact
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  copy: {
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  detail: {
    fontSize: typography.caption,
  },
  error: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
