const assert = require('node:assert/strict');
const { after, describe, test } = require('node:test');
const Module = require('node:module');

const originalModuleLoad = Module._load;
const platform = { OS: 'web' };
const asyncStorageValues = new Map();

Module._load = function loadWithExpoStubs(request, parent, isMain) {
  if (request === 'expo/fetch') {
    return {
      fetch: (...args) => globalThis.fetch(...args),
    };
  }
  if (request === '@react-native-async-storage/async-storage') {
    return {
      getItem: async (key) => asyncStorageValues.get(key) ?? null,
      setItem: async (key, value) => {
        asyncStorageValues.set(key, value);
      },
      removeItem: async (key) => {
        asyncStorageValues.delete(key);
      },
    };
  }
  if (request === 'expo-file-system') {
    return {
      File: class ExpoFileStub extends Blob {
        constructor() {
          super([]);
          this.exists = false;
        }
      },
    };
  }
  if (request === 'expo-image-manipulator') {
    return {
      ImageManipulator: {
        manipulate() {
          throw new Error('Image manipulation is not available in Node tests.');
        },
      },
      SaveFormat: { JPEG: 'jpeg' },
    };
  }
  if (request === 'react-native') {
    return { Platform: platform };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

const {
  AiServiceError,
  createAiService,
  validateTransactionDraft,
} = require('../.test-build/services/ai.js');
const {
  createCapabilityAwareAiService,
  getReasoningEffortSupport,
  REASONING_CAPABILITY_TTL_MS,
  setReasoningEffortSupport,
} = require('../.test-build/services/aiCapabilities.js');

after(() => {
  Module._load = originalModuleLoad;
});

const baseConfig = {
  baseUrl: 'https://example.test/v1',
  model: 'multimodal-test',
  transcriptionModel: 'transcription-test',
  timeoutMs: 5_000,
};

const customCategories = [
  {
    id: 'meals',
    label: '餐饮',
    shortLabel: '餐饮',
    color: '#F97316',
    icon: 'restaurant',
    subcategories: [{ id: 'coffee', label: '咖啡' }],
  },
  {
    id: 'work_tools',
    label: '工作工具',
    shortLabel: '工具',
    color: '#2563EB',
    icon: 'laptop',
    subcategories: [{ id: 'hosting', label: '托管服务' }],
  },
];

function extractedTransaction(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'expense',
    status: 'confirmed',
    amountMinor: 3_200,
    currency: 'CNY',
    date: '2026-07-27',
    time: null,
    merchant: '测试商户',
    description: null,
    categoryId: 'food',
    subcategoryId: null,
    paymentChannel: 'wechat_pay',
    fundingInstrument: null,
    evidence: [],
    overallConfidence: 0.92,
    needsReview: false,
    reviewFields: [],
    reviewReasons: [],
    ...overrides,
  };
}

function completionResponse(transaction) {
  return JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify(transaction),
        },
      },
    ],
  });
}

function response(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AI extraction compatibility', () => {
  test('sends an explicit reasoning effort when configured', async () => {
    let requestBody;
    const fetcher = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return response(completionResponse(extractedTransaction()));
    };
    const service = createAiService({
      ...baseConfig,
      reasoningEffort: 'none',
      fetcher,
    });

    await service.extractTransaction({ text: '午餐 32 元' });

    assert.equal(requestBody.reasoning_effort, 'none');
  });

  test('retries the same response format once without unsupported reasoning', async () => {
    const calls = [];
    const supportEvents = [];
    const fetcher = async (_url, init) => {
      calls.push(JSON.parse(init.body));
      if (calls.length === 1) {
        return response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'reasoning_effort' is not supported with this model.",
            },
          }),
          400,
        );
      }
      return response(completionResponse(extractedTransaction()));
    };
    const service = createAiService({
      ...baseConfig,
      reasoningEffort: 'none',
      onReasoningEffortSupport: (support) => supportEvents.push(support),
      fetcher,
    });

    const result = await service.extractTransaction({ text: '午餐 32 元' });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].reasoning_effort, 'none');
    assert.equal('reasoning_effort' in calls[1], false);
    assert.equal(calls[0].response_format.type, 'json_schema');
    assert.equal(calls[1].response_format.type, 'json_schema');
    assert.deepEqual(supportEvents, ['unsupported']);
    assert.equal(result.reasoningEffortFallback, true);
  });

  test('does not hide unrelated provider rejections behind reasoning fallback', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return response(
        JSON.stringify({ error: { message: 'The requested model was not found.' } }),
        400,
      );
    };
    const service = createAiService({
      ...baseConfig,
      reasoningEffort: 'none',
      fetcher,
    });

    await assert.rejects(
      service.extractTransaction({ text: '午餐 32 元' }),
      (error) =>
        error instanceof AiServiceError && error.code === 'provider_rejected',
    );
    assert.equal(callCount, 1);
  });

  test('uses cached unsupported capability on later service instances', async () => {
    asyncStorageValues.clear();
    const firstCalls = [];
    const firstService = await createCapabilityAwareAiService({
      ...baseConfig,
      reasoningEffort: 'none',
      fetcher: async (_url, init) => {
        firstCalls.push(JSON.parse(init.body));
        if (firstCalls.length === 1) {
          return response(
            JSON.stringify({
              error: {
                message: 'Unknown parameter: reasoning_effort',
              },
            }),
            400,
          );
        }
        return response(completionResponse(extractedTransaction()));
      },
    });
    await firstService.extractTransaction({ text: '午餐 32 元' });

    let secondRequest;
    const secondService = await createCapabilityAwareAiService({
      ...baseConfig,
      reasoningEffort: 'none',
      fetcher: async (_url, init) => {
        secondRequest = JSON.parse(init.body);
        return response(completionResponse(extractedTransaction()));
      },
    });
    const secondResult = await secondService.extractTransaction({
      text: '晚餐 48 元',
    });

    assert.equal(firstCalls.length, 2);
    assert.equal('reasoning_effort' in secondRequest, false);
    assert.equal(secondResult.reasoningEffortFallback, true);
  });

  test('expires cached reasoning capability after seven days', async () => {
    asyncStorageValues.clear();
    const checkedAt = 10_000;
    await setReasoningEffortSupport(
      baseConfig.baseUrl,
      baseConfig.model,
      'unsupported',
      checkedAt,
    );

    assert.equal(
      await getReasoningEffortSupport(
        baseConfig.baseUrl,
        baseConfig.model,
        checkedAt + REASONING_CAPABILITY_TTL_MS - 1,
      ),
      'unsupported',
    );
    assert.equal(
      await getReasoningEffortSupport(
        baseConfig.baseUrl,
        baseConfig.model,
        checkedAt + REASONING_CAPABILITY_TTL_MS,
      ),
      'unknown',
    );
  });

  test('omits reasoning effort in automatic compatibility mode', async () => {
    let requestBody;
    const fetcher = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return response(completionResponse(extractedTransaction()));
    };
    const service = createAiService({
      ...baseConfig,
      reasoningEffort: 'auto',
      fetcher,
    });

    await service.extractTransaction({ text: '午餐 32 元' });

    assert.equal('reasoning_effort' in requestBody, false);
  });

  test('uses the runtime taxonomy in the schema and extraction instructions', async () => {
    let requestBody;
    const fetcher = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return response(
        completionResponse(
          extractedTransaction({
            merchant: 'GitHub',
            description: 'Codespaces 月度订阅',
            categoryId: 'work_tools',
            subcategoryId: 'hosting',
          }),
        ),
      );
    };
    const service = createAiService({ ...baseConfig, fetcher });

    const result = await service.extractTransaction({
      text: '这是 Codespaces 月度订阅，不是普通购物',
      categories: customCategories,
    });

    assert.deepEqual(
      requestBody.response_format.json_schema.schema.properties.categoryId
        .enum,
      ['meals', 'work_tools', null],
    );
    assert.deepEqual(
      requestBody.response_format.json_schema.schema.properties.subcategoryId
        .enum,
      ['coffee', 'hosting', null],
    );
    assert.match(requestBody.messages[0].content, /工作工具/);
    assert.match(requestBody.messages[0].content, /托管服务/);
    assert.match(
      requestBody.messages[0].content,
      /merchant is only the payee/i,
    );
    assert.match(
      requestBody.messages[0].content,
      /merge their supported details/i,
    );
    assert.match(requestBody.messages[0].content, /manual-only field/i);
    assert.match(requestBody.messages[1].content, /supplemental clarification/i);
    assert.equal(result.categoryId, 'work_tools');
    assert.equal(result.subcategoryId, 'hosting');
  });

  test('falls back from json_schema to json_object and then prompt-only JSON', async () => {
    const calls = [];
    const fetcher = async (_url, init) => {
      calls.push(JSON.parse(init.body));
      if (calls.length === 1) {
        return response(
          JSON.stringify({
            error: { message: 'response_format json_schema is unsupported' },
          }),
          400,
        );
      }
      if (calls.length === 2) {
        return response(
          JSON.stringify({
            error: { message: 'response_format json_object is unsupported' },
          }),
          400,
        );
      }
      return response(
        completionResponse(
          extractedTransaction({
            categoryId: 'work_tools',
            subcategoryId: 'hosting',
          }),
        ),
      );
    };
    const service = createAiService({ ...baseConfig, fetcher });

    const result = await service.extractTransaction({
      text: '午餐 32 元，微信支付',
      todayLocal: '2026-07-27',
      defaultCurrency: 'CNY',
      categories: customCategories,
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].response_format.type, 'json_schema');
    assert.ok(
      calls[0].response_format.json_schema.schema.required.includes('time'),
    );
    assert.equal(calls[1].response_format.type, 'json_object');
    assert.equal('response_format' in calls[2], false);
    assert.match(calls[2].messages[1].content, /"time": null/);
    assert.match(
      calls[2].messages[1].content,
      /provider is not enforcing the schema/i,
    );
    assert.match(calls[2].messages[1].content, /工作工具/);
    assert.match(calls[2].messages[1].content, /托管服务/);
    assert.match(
      calls[2].messages[1].content,
      /Allowed categoryId values: meals, work_tools\./,
    );
    assert.equal(result.responseFormat, 'prompt_only');
    assert.equal(result.review.required, true);
  });

  test('preserves a separate second-precision transaction time', () => {
    const result = validateTransactionDraft(
      extractedTransaction({
        date: '2026-07-31',
        time: '08:09:10',
        paymentChannel: 'alipay',
      }),
      { text: '支付宝账单截图' },
    );

    assert.equal(result.date, '2026-07-31');
    assert.equal(result.time, '08:09:10');
  });

  test('splits a provider datetime placed in the date field', () => {
    const result = validateTransactionDraft(
      extractedTransaction({
        date: '2026-07-31 08:09:10',
        time: null,
        paymentChannel: 'alipay',
      }),
      { text: '支付宝账单截图' },
    );

    assert.equal(result.date, '2026-07-31');
    assert.equal(result.time, '08:09:10');
  });

  test('rejects an invalid transaction time', () => {
    assert.throws(
      () =>
        validateTransactionDraft(
          extractedTransaction({ time: '24:00:00' }),
          { text: '测试' },
        ),
      (error) =>
        error instanceof AiServiceError &&
        error.code === 'invalid_output' &&
        /transaction time/i.test(error.message),
    );
  });

  test('validates a subcategory against the selected runtime category', () => {
    const result = validateTransactionDraft(
      extractedTransaction({
        categoryId: 'work_tools',
        subcategoryId: 'hosting',
      }),
      { text: '服务器月费', categories: customCategories },
    );

    assert.equal(result.categoryId, 'work_tools');
    assert.equal(result.subcategoryId, 'hosting');
    assert.throws(
      () =>
        validateTransactionDraft(
          extractedTransaction({
            categoryId: 'meals',
            subcategoryId: 'hosting',
          }),
          { text: '服务器月费', categories: customCategories },
        ),
      (error) =>
        error instanceof AiServiceError &&
        error.code === 'invalid_output' &&
        /subcategory outside the selected category/i.test(error.message),
    );
    assert.throws(
      () =>
        validateTransactionDraft(
          extractedTransaction({ categoryId: 'food' }),
          { text: '午餐', categories: customCategories },
        ),
      (error) =>
        error instanceof AiServiceError &&
        error.code === 'invalid_output' &&
        /invalid category/i.test(error.message),
    );
  });

  test('does not copy consumption content into an unknown merchant', () => {
    const result = validateTransactionDraft(
      extractedTransaction({
        merchant: null,
        description: '冰拿铁与三明治',
      }),
      { text: '冰拿铁与三明治' },
    );

    assert.equal(result.merchant, '');
    assert.equal(result.description, '冰拿铁与三明治');
    assert.ok(result.review.fields.includes('merchant'));
  });

  test('marks missing fallback fields for review while preserving known values', () => {
    const result = validateTransactionDraft(
      {
        amountMinor: 1_280,
        merchant: '便利店',
      },
      { text: '便利店 12.8 元' },
      'json_object',
    );

    assert.equal(result.amountMinor, 1_280);
    assert.equal(result.merchant, '便利店');
    assert.equal(result.review.required, true);
    assert.deepEqual(
      new Set(result.review.fields),
      new Set([
        'kind',
        'status',
        'currency',
        'date',
        'categoryId',
        'paymentChannel',
        'fundingInstrument',
      ]),
    );
    assert.match(result.review.reasons.join(' '), /partial structured response/i);
  });

  test('maps cancellation while reading a completion body to an aborted error', async () => {
    const controller = new AbortController();
    let bodyRead;
    const reading = new Promise((resolve) => {
      bodyRead = resolve;
    });
    const fetcher = async (_url, init) => ({
      ok: true,
      status: 200,
      text: () =>
        new Promise((_resolve, reject) => {
          const rejectAsAborted = () =>
            reject(new DOMException('Aborted', 'AbortError'));
          init.signal.addEventListener('abort', rejectAsAborted, {
            once: true,
          });
          bodyRead();
        }),
    });
    const service = createAiService({ ...baseConfig, fetcher });
    const pending = service.extractTransaction({
      text: '测试',
      signal: controller.signal,
    });

    await reading;
    controller.abort();

    await assert.rejects(
      pending,
      (error) =>
        error instanceof AiServiceError &&
        error.code === 'aborted' &&
        error.retryable === false,
    );
  });

  test(
    'cancels even when a custom fetcher ignores AbortSignal',
    { timeout: 1_000 },
    async () => {
      const controller = new AbortController();
      const service = createAiService({
        ...baseConfig,
        fetcher: () => new Promise(() => undefined),
      });
      const pending = service.extractTransaction({
        text: '测试',
        signal: controller.signal,
      });

      await Promise.resolve();
      controller.abort();

      await assert.rejects(
        pending,
        (error) =>
          error instanceof AiServiceError && error.code === 'aborted',
      );
    },
  );
});

describe('AI audio compatibility', () => {
  test('retries transcription without response_format when the provider rejects it', async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies = [];
    try {
      globalThis.fetch = async () =>
        new Response(new Blob(['audio'], { type: 'audio/webm' }));
      const fetcher = async (_url, init) => {
        requestBodies.push(init.body);
        if (requestBodies.length === 1) {
          return response(
            JSON.stringify({
              error: { message: 'response_format is not supported' },
            }),
            400,
          );
        }
        return response(JSON.stringify({ text: '午餐三十二元' }));
      };
      const service = createAiService({ ...baseConfig, fetcher });

      const transcript = await service.transcribeAudio({
        uri: 'blob:test-audio',
        fileName: 'voice-note.webm',
        mimeType: 'audio/webm',
        language: 'zh',
      });

      assert.equal(transcript, '午餐三十二元');
      assert.equal(requestBodies.length, 2);
      assert.equal(requestBodies[0].get('response_format'), 'json');
      assert.equal(requestBodies[1].get('response_format'), null);
      assert.equal(requestBodies[1].get('model'), 'transcription-test');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('maps cancellation while reading a Web audio blob to an aborted error', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let blobRead;
    const reading = new Promise((resolve) => {
      blobRead = resolve;
    });
    try {
      globalThis.fetch = async (_url, init) => ({
        ok: true,
        blob: () =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
            blobRead();
          }),
      });
      const service = createAiService({
        ...baseConfig,
        fetcher: async () => {
          throw new Error('The provider request must not start.');
        },
      });
      const pending = service.transcribeAudio({
        uri: 'blob:test-audio',
        fileName: 'voice-note.webm',
        mimeType: 'audio/webm',
        signal: controller.signal,
      });

      await reading;
      controller.abort();

      await assert.rejects(
        pending,
        (error) =>
          error instanceof AiServiceError && error.code === 'aborted',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('maps a Web audio body read failure to audio_unreadable', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        blob: async () => {
          throw new TypeError('The blob stream failed.');
        },
      });
      const service = createAiService({
        ...baseConfig,
        fetcher: async () => {
          throw new Error('The provider request must not start.');
        },
      });

      await assert.rejects(
        service.transcribeAudio({
          uri: 'blob:test-audio',
          fileName: 'voice-note.webm',
          mimeType: 'audio/webm',
        }),
        (error) =>
          error instanceof AiServiceError &&
          error.code === 'audio_unreadable',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
