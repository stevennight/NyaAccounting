import { NativeModules, Platform } from 'react-native';

type NativeScreenCaptureModule = {
  isAccessibilityEnabled: () => Promise<boolean>;
  openAccessibilitySettings: () => Promise<boolean>;
  showCaptureNotification: () => Promise<boolean>;
  hideCaptureNotification: () => Promise<boolean>;
  isOverlayPermissionGranted: () => Promise<boolean>;
  openOverlaySettings: () => Promise<boolean>;
  isOverlayRunning: () => Promise<boolean>;
  startOverlay: () => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  pendingScreenshotCount: () => Promise<number>;
  consumePendingScreenshots: () => Promise<string[]>;
  consumePendingScreenshot: () => Promise<string | null>;
  consumePendingError: () => Promise<string | null>;
};

const nativeModule = NativeModules.NyaScreenCapture as
  | NativeScreenCaptureModule
  | undefined;

export const nativeScreenCaptureAvailable =
  Platform.OS === 'android' && Boolean(nativeModule);

export async function isCurrentScreenCaptureEnabled(): Promise<boolean> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return false;
  }
  return nativeModule.isAccessibilityEnabled();
}

export async function openCurrentScreenCaptureSettings(): Promise<void> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    throw new Error('当前页面截图仅支持 Android 安装包。');
  }
  await nativeModule.openAccessibilitySettings();
}

export async function showCurrentScreenCaptureNotification(): Promise<boolean> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    throw new Error('当前页面截图仅支持 Android 安装包。');
  }
  return nativeModule.showCaptureNotification();
}

export async function hideCurrentScreenCaptureNotification(): Promise<void> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return;
  }
  await nativeModule.hideCaptureNotification();
}

export async function isScreenCaptureOverlayPermissionGranted(): Promise<boolean> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return false;
  }
  return nativeModule.isOverlayPermissionGranted();
}

export async function openScreenCaptureOverlaySettings(): Promise<void> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    throw new Error('悬浮球仅支持 Android 安装包。');
  }
  await nativeModule.openOverlaySettings();
}

export async function isScreenCaptureOverlayRunning(): Promise<boolean> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return false;
  }
  return nativeModule.isOverlayRunning();
}

export async function startScreenCaptureOverlay(): Promise<boolean> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    throw new Error('悬浮球仅支持 Android 安装包。');
  }
  return nativeModule.startOverlay();
}

export async function stopScreenCaptureOverlay(): Promise<void> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return;
  }
  await nativeModule.stopOverlay();
}

export async function getPendingScreenCaptureCount(): Promise<number> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return 0;
  }
  return nativeModule.pendingScreenshotCount();
}

export async function consumePendingScreenCaptures(): Promise<string[]> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return [];
  }
  return nativeModule.consumePendingScreenshots();
}

export async function consumePendingScreenCapture(): Promise<string | null> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return null;
  }
  return nativeModule.consumePendingScreenshot();
}

export async function consumePendingScreenCaptureError(): Promise<string | null> {
  if (!nativeScreenCaptureAvailable || !nativeModule) {
    return null;
  }
  return nativeModule.consumePendingError();
}
