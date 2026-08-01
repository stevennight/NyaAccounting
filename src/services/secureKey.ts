import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_KEY_STORAGE_KEY = 'nya-accounting.ai-api-key';
const KEYCHAIN_SERVICE = 'nya-accounting.ai';

export interface ApiKeyStorageIndicator {
  backend: 'secure-store' | 'async-storage';
  encryptedAtRest: boolean;
  warning: string | null;
}

/**
 * Web storage is deliberately explicit because AsyncStorage on web does not
 * provide protection equivalent to Android Keystore or iOS Keychain.
 */
export const API_KEY_STORAGE: ApiKeyStorageIndicator =
  Platform.OS === 'web'
    ? {
        backend: 'async-storage',
        encryptedAtRest: false,
        warning:
          'Web 版会把 API Key 保存在当前浏览器资料中，无法提供手机系统级加密。请只在个人设备上使用，并在不再需要时移除 Key。',
      }
    : {
        backend: 'secure-store',
        encryptedAtRest: true,
        warning: null,
      };

export const IS_API_KEY_STORAGE_SECURE =
  API_KEY_STORAGE.encryptedAtRest;

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: KEYCHAIN_SERVICE,
};

export class ApiKeyStorageError extends Error {
  readonly code:
    | 'invalid_key'
    | 'storage_unavailable'
    | 'read_failed'
    | 'write_failed'
    | 'delete_failed';

  constructor(
    code: ApiKeyStorageError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ApiKeyStorageError';
    this.code = code;
  }
}

async function assertSecureStoreAvailable(): Promise<void> {
  let available = false;

  try {
    available = await SecureStore.isAvailableAsync();
  } catch {
    throw new ApiKeyStorageError(
      'storage_unavailable',
      '当前设备无法使用系统安全存储来保存 API Key。',
    );
  }

  if (!available) {
    throw new ApiKeyStorageError(
      'storage_unavailable',
      '当前设备无法使用系统安全存储来保存 API Key。',
    );
  }
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    throw new ApiKeyStorageError(
      'invalid_key',
      '请输入有效的 API Key。',
    );
  }

  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(API_KEY_STORAGE_KEY, normalized);
      return;
    }

    await assertSecureStoreAvailable();
    await SecureStore.setItemAsync(
      API_KEY_STORAGE_KEY,
      normalized,
      SECURE_STORE_OPTIONS,
    );
  } catch (error) {
    if (error instanceof ApiKeyStorageError) {
      throw error;
    }

    throw new ApiKeyStorageError(
      'write_failed',
      'API Key 无法写入系统安全存储。',
    );
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(API_KEY_STORAGE_KEY);
    }

    await assertSecureStoreAvailable();
    return await SecureStore.getItemAsync(
      API_KEY_STORAGE_KEY,
      SECURE_STORE_OPTIONS,
    );
  } catch (error) {
    if (error instanceof ApiKeyStorageError) {
      throw error;
    }

    throw new ApiKeyStorageError(
      'read_failed',
      '无法读取已保存的 API Key。',
    );
  }
}

export async function deleteApiKey(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(API_KEY_STORAGE_KEY);
      return;
    }

    await assertSecureStoreAvailable();
    await SecureStore.deleteItemAsync(
      API_KEY_STORAGE_KEY,
      SECURE_STORE_OPTIONS,
    );
  } catch (error) {
    if (error instanceof ApiKeyStorageError) {
      throw error;
    }

    throw new ApiKeyStorageError(
      'delete_failed',
      '无法移除已保存的 API Key。',
    );
  }
}
