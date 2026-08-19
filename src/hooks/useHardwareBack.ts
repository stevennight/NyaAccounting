import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

type RegisteredHandler = {
  enabled: boolean;
  priority: number;
  handlerRef: { current: () => boolean };
};

const registeredHandlers = new Map<number, RegisteredHandler>();
let nextHandlerId = 0;
let backSubscription: { remove: () => void } | null = null;

function ensureBackSubscription(): void {
  if (Platform.OS !== 'android' || backSubscription || registeredHandlers.size === 0) {
    return;
  }

  // Screen-level handlers use higher priority; the app route handler is the fallback.
  backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
    const handlers = Array.from(registeredHandlers.values()).sort(
      (left, right) => right.priority - left.priority,
    );
    for (const registered of handlers) {
      if (registered.enabled && registered.handlerRef.current()) {
        return true;
      }
    }
    return false;
  });
}

function releaseBackSubscriptionIfUnused(): void {
  if (registeredHandlers.size > 0) {
    return;
  }
  backSubscription?.remove();
  backSubscription = null;
}

export function useHardwareBack(
  handler: () => boolean,
  enabled = true,
  priority = 0,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') {
      return;
    }

    const id = nextHandlerId++;
    registeredHandlers.set(id, { enabled: true, priority, handlerRef });
    ensureBackSubscription();
    return () => {
      registeredHandlers.delete(id);
      releaseBackSubscriptionIfUnused();
    };
  }, [enabled]);
}
