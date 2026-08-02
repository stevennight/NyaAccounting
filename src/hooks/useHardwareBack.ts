import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

export function useHardwareBack(
  handler: () => boolean,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => handlerRef.current(),
    );
    return () => subscription.remove();
  }, [enabled]);
}
