import { NativeModules, Platform } from 'react-native';

type NativeScreenCaptureModule = {
  isAccessibilityEnabled: () => Promise<boolean>;
  openAccessibilitySettings: () => Promise<boolean>;
  showCaptureNotification: () => Promise<boolean>;
  hideCaptureNotification: () => Promise<boolean>;
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
