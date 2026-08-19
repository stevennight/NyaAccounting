import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import {
  compareVersions,
  isValidGitHubRepository,
  parseGitHubRelease,
  type GitHubReleaseInfo,
} from './updateManifest';
import { canRequestPackageInstalls } from './appInstallation';

const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

export type AppUpdateCheckResult = {
  currentVersion: string;
  repository: string | null;
  githubRelease: GitHubReleaseInfo | null;
  githubError: string | null;
  otaAvailable: boolean;
  otaError: string | null;
};

function configuredRepository(): string | null {
  const value = Constants.expoConfig?.extra?.githubRepository;
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const repository = value.trim();
  return isValidGitHubRepository(repository) ? repository : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知更新错误。';
}

async function checkGitHubRelease(
  repository: string,
): Promise<GitHubReleaseInfo> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NyaAccounting',
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'GitHub 仓库尚未发布 Release。'
        : `GitHub 更新检查失败（${response.status}）。`,
    );
  }
  return parseGitHubRelease(await response.json());
}

async function checkExpoUpdate(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  const Updates = await import('expo-updates');
  if (!Updates.isEnabled) {
    return false;
  }
  const result = await Updates.checkForUpdateAsync();
  return result.isAvailable;
}

export async function checkForAppUpdates(): Promise<AppUpdateCheckResult> {
  const repository = configuredRepository();
  let githubRelease: GitHubReleaseInfo | null = null;
  let githubError: string | null = null;
  let otaAvailable = false;
  let otaError: string | null = null;

  if (repository) {
    try {
      githubRelease = await checkGitHubRelease(repository);
    } catch (error) {
      githubError = errorMessage(error);
    }
  }

  try {
    otaAvailable = await checkExpoUpdate();
  } catch (error) {
    otaError = errorMessage(error);
  }

  return {
    currentVersion,
    repository,
    githubRelease,
    githubError,
    otaAvailable,
    otaError,
  };
}

export function isGitHubReleaseNewer(
  release: GitHubReleaseInfo | null,
  version = currentVersion,
): boolean {
  return Boolean(release && compareVersions(release.version, version) > 0);
}

export async function downloadAndInstallGitHubApk(
  release: GitHubReleaseInfo,
): Promise<void> {
  if (!release.apkAsset) {
    throw new Error('这个 Release 没有可下载的 Android APK。');
  }
  if (Platform.OS !== 'android') {
    await Linking.openURL(release.htmlUrl);
    return;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const IntentLauncher = await import('expo-intent-launcher');
  const installPermissionGranted = await canRequestPackageInstalls();
  if (!installPermissionGranted) {
    const packageName = Constants.expoConfig?.android?.package;
    if (!packageName) {
      throw new Error('无法定位当前应用，不能打开安装权限设置。');
    }
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
      { data: `package:${packageName}` },
    );
    if (!(await canRequestPackageInstalls())) {
      throw new Error('请在系统设置中允许 Nya 记账安装未知来源应用后再重试。');
    }
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error('当前设备没有可用的临时文件目录。');
  }
  const safeFileName = release.apkAsset.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const fileUri = `${FileSystem.cacheDirectory}${safeFileName}`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
  const downloaded = await FileSystem.downloadAsync(
    release.apkAsset.browserDownloadUrl,
    fileUri,
    {
      headers: {
        Accept: 'application/octet-stream',
      },
    },
  );
  const contentUri = await FileSystem.getContentUriAsync(downloaded.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}

export async function applyExpoUpdate(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  const Updates = await import('expo-updates');
  if (!Updates.isEnabled) {
    throw new Error('当前安装包尚未配置 Expo Updates 服务。');
  }
  const result = await Updates.fetchUpdateAsync();
  if (result.isNew) {
    await Updates.reloadAsync();
    return true;
  }
  return false;
}

export async function openGitHubReleasePage(
  release: GitHubReleaseInfo | null,
): Promise<void> {
  const repository = configuredRepository();
  const url = release?.htmlUrl ??
    (repository ? `https://github.com/${repository}/releases` : 'https://github.com');
  await Linking.openURL(url);
}

export { currentVersion as CURRENT_APP_VERSION };
