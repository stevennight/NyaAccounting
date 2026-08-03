import {
  PAYMENT_CHANNEL_LABELS,
} from './categories';
import type {
  PaymentChannel,
  PaymentChannelDefinition,
} from './types';

export const DEFAULT_PAYMENT_CHANNEL_DEFINITIONS: readonly PaymentChannelDefinition[] =
  Object.entries(PAYMENT_CHANNEL_LABELS).map(([id, label]) => ({ id, label }));

export function paymentChannelLabel(
  channel: PaymentChannel,
  definitions: readonly PaymentChannelDefinition[] =
    DEFAULT_PAYMENT_CHANNEL_DEFINITIONS,
): string {
  return definitions.find((item) => item.id === channel)?.label ??
    PAYMENT_CHANNEL_LABELS[channel] ??
    channel;
}

export function paymentChannelOptions(
  definitions: readonly PaymentChannelDefinition[],
): Array<{ value: PaymentChannel; label: string }> {
  return definitions.map((item) => ({ value: item.id, label: item.label }));
}
