import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createAiService,
  type OpenAICompatibleAiService,
  type OpenAICompatibleConfig,
  type ReasoningEffortSupport,
} from './ai';

const CAPABILITY_CACHE_KEY = '@nya-accounting/ai-capabilities/v1';
export const REASONING_CAPABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ReasoningCapabilityEntry = {
  endpoint: string;
  model: string;
  support: Exclude<ReasoningEffortSupport, 'unknown'>;
  checkedAt: number;
};

type CapabilityCache = {
  version: 1;
  reasoning: ReasoningCapabilityEntry[];
};

function normalizedEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

function normalizedModel(model: string): string {
  return model.trim();
}

function isSupport(
  value: unknown,
): value is ReasoningCapabilityEntry['support'] {
  return value === 'supported' || value === 'unsupported';
}

function parseCache(raw: string | null): CapabilityCache {
  if (!raw) {
    return { version: 1, reasoning: [] };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as Record<string, unknown>).reasoning)
    ) {
      return { version: 1, reasoning: [] };
    }

    const reasoning = (parsed as { reasoning: unknown[] }).reasoning.filter(
      (entry): entry is ReasoningCapabilityEntry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return false;
        }
        const value = entry as Record<string, unknown>;
        return (
          typeof value.endpoint === 'string' &&
          typeof value.model === 'string' &&
          isSupport(value.support) &&
          typeof value.checkedAt === 'number' &&
          Number.isFinite(value.checkedAt)
        );
      },
    );
    return { version: 1, reasoning };
  } catch {
    return { version: 1, reasoning: [] };
  }
}

export async function getReasoningEffortSupport(
  endpoint: string,
  model: string,
  now = Date.now(),
): Promise<ReasoningEffortSupport> {
  const cache = parseCache(await AsyncStorage.getItem(CAPABILITY_CACHE_KEY));
  const normalizedBaseUrl = normalizedEndpoint(endpoint);
  const normalizedModelName = normalizedModel(model);
  const match = cache.reasoning.find(
    (entry) =>
      entry.endpoint === normalizedBaseUrl &&
      entry.model === normalizedModelName,
  );

  if (!match || now - match.checkedAt >= REASONING_CAPABILITY_TTL_MS) {
    return 'unknown';
  }
  return match.support;
}

export async function setReasoningEffortSupport(
  endpoint: string,
  model: string,
  support: ReasoningCapabilityEntry['support'],
  now = Date.now(),
): Promise<void> {
  const cache = parseCache(await AsyncStorage.getItem(CAPABILITY_CACHE_KEY));
  const normalizedBaseUrl = normalizedEndpoint(endpoint);
  const normalizedModelName = normalizedModel(model);
  const freshEntries = cache.reasoning.filter(
    (entry) =>
      now - entry.checkedAt < REASONING_CAPABILITY_TTL_MS &&
      !(
        entry.endpoint === normalizedBaseUrl &&
        entry.model === normalizedModelName
      ),
  );
  freshEntries.push({
    endpoint: normalizedBaseUrl,
    model: normalizedModelName,
    support,
    checkedAt: now,
  });
  await AsyncStorage.setItem(
    CAPABILITY_CACHE_KEY,
    JSON.stringify({ version: 1, reasoning: freshEntries }),
  );
}

export async function clearAiCapabilityCache(): Promise<void> {
  await AsyncStorage.removeItem(CAPABILITY_CACHE_KEY);
}

export async function createCapabilityAwareAiService(
  config: OpenAICompatibleConfig,
  options: { forceReasoningProbe?: boolean } = {},
): Promise<OpenAICompatibleAiService> {
  const hasExplicitReasoning =
    Boolean(config.reasoningEffort) && config.reasoningEffort !== 'auto';
  let support: ReasoningEffortSupport = 'unknown';

  if (hasExplicitReasoning && !options.forceReasoningProbe) {
    try {
      support = await getReasoningEffortSupport(
        config.baseUrl,
        config.model,
      );
    } catch {
      // Recognition should still work if capability metadata cannot be read.
    }
  }

  return createAiService({
    ...config,
    reasoningEffortSupport: support,
    onReasoningEffortSupport: async (nextSupport) => {
      try {
        await setReasoningEffortSupport(
          config.baseUrl,
          config.model,
          nextSupport,
        );
      } catch {
        // Capability caching is an optimization, not a recognition requirement.
      }
    },
  });
}
