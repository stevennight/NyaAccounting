import { NativeModules, Platform } from 'react-native';

type NativeAppUpdateModule = {
  canRequestPackageInstalls: () => Promise<boolean>;
};

const nativeModule = NativeModules.NyaAppUpdate as
  | NativeAppUpdateModule
  | undefined;

export const nativeAppUpdateAvailable =
  Platform.OS === 'android' && Boolean(nativeModule);

export async function canRequestPackageInstalls(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  if (!nativeModule) {
    throw new Error('当前安装包不支持检查 Android 安装权限，请先更新应用。');
  }
  return nativeModule.canRequestPackageInstalls();
}
