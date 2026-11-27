import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_PROVIDER_METADATA,
  GEMINI_QUOTA_FALLBACK_MODEL,
  GEMINI_QUOTA_FALLBACK_NOTICE,
  GEMINI_SUPPORTED_MODELS,
  GROQ_CURATED_MODELS,
  OPENROUTER_FALLBACK_MODELS,
  classifyOpenRouterModel,
  classifyProviderError,
  getProviderDisplayName,
  getProviderSelectorOptionLabel,
  getProviderStatusLabel,
  getStaticCatalogForProvider,
  isGeminiQuotaOrRateLimitError,
  isNonFallbackClientError,
  normalizeAIProviderId,
  normalizeProviderStatusInfo,
  resolveProviderHealthDisplay,
  resolveSafeModelForProvider,
  sanitizeProviderSecretText,
} from '../utils/aiProviders';
import {
  DEFAULT_SETTINGS,
  getStoredSettings,
  saveStoredSettings,
} from '../utils/storage';
import { buildLiveAIMonitoringSnapshot } from '../components/LiveAIControlCenter';
import { sanitizeAnalyticsPayload, trackAnalyticsEvent } from '../utils/analytics';
import {
  POWER_MEMORY_CATEGORIES,
  classifyMemorySensitivity,
  containsSecretOrCredential,
  detectExplicitMemoryCommand,
  detectSmartAutoMemoryCandidate,
  findMatchingMemoriesToForget,
  getLastMemoryUpdatedAt,
  retrieveRelevantMemories,
} from '../utils/powerMemory';
import {
  PRODUCTION_VERCEL_API_ORIGIN,
  buildApiUrl,
  isFirebaseHostingHostname,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} from '../utils/apiConfig';
import type { AIMemoryItem } from '../types';

test('P1: Gemini is the default provider and valid provider IDs switch cleanly', () => {
  assert.equal(DEFAULT_SETTINGS.aiProvider, 'gemini');
  assert.equal(normalizeAIProviderId(undefined), 'gemini');
  assert.equal(normalizeAIProviderId(null), 'gemini');
  assert.equal(normalizeAIProviderId('unknown-provider'), 'gemini');
  assert.equal(normalizeAIProviderId('GEMINI'), 'gemini');
  assert.equal(normalizeAIProviderId('groq'), 'groq');
  assert.equal(normalizeAIProviderId('OpenRouter'), 'openrouter');

  assert.equal(getProviderDisplayName('gemini'), 'Google Gemini');
  assert.equal(getProviderDisplayName('groq'), 'Groq');
  assert.equal(getProviderDisplayName('openrouter'), 'OpenRouter');

  assert.equal(getProviderStatusLabel('connected'), 'Connected');
  assert.equal(getProviderStatusLabel('not_configured'), 'Not Configured');
  assert.equal(getProviderStatusLabel('error'), 'Error');
});

test('P2: OpenRouter model classifier distinguishes Free vs Paid models accurately', () => {
  const skippedAuto = classifyOpenRouterModel({ id: 'openrouter/auto', name: 'Auto' });
  assert.equal(skippedAuto, null);

  const freeBySuffix = classifyOpenRouterModel({
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct (Free)',
    context_length: 131072,
    pricing: { prompt: '0', completion: '0', request: '0' },
  });
  assert.ok(freeBySuffix);
  assert.equal(freeBySuffix.isFree, true);
  assert.equal(freeBySuffix.pricingLabel, 'Free ($0/token)');

  const paidByPromptPrice = classifyOpenRouterModel({
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
  });
  assert.ok(paidByPromptPrice);
  assert.equal(paidByPromptPrice.isFree, false);
  assert.match(paidByPromptPrice.pricingLabel, /^Paid \(/);

  // Guard: even if an ID had ":free", positive pricing must mark it Paid
  const trickedModel = classifyOpenRouterModel({
    id: 'vendor/model:free',
    pricing: { prompt: '0.000001', completion: '0' },
  });
  assert.ok(trickedModel);
  assert.equal(trickedModel.isFree, false);
});

test('P3: resolveSafeModelForProvider NEVER auto-selects a Paid model by default', () => {
  const mixedCatalog = [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      provider: 'openrouter' as const,
      isFree: false,
      pricingLabel: 'Paid ($2.50/M in · $10/M out)',
      isDefault: true,
    },
    ...OPENROUTER_FALLBACK_MODELS,
  ];

  // When no model is requested, it MUST pick a Free model even if a Paid one has isDefault: true
  const resolvedDefault = resolveSafeModelForProvider('openrouter', mixedCatalog, '');
  assert.equal(resolvedDefault.isFree, true);
  assert.equal(
    resolvedDefault.modelId === 'openrouter/free' || resolvedDefault.modelId.endsWith(':free'),
    true
  );

  // When paid selection is explicitly disallowed, requesting a paid model falls back to a Free model
  const guardedPaid = resolveSafeModelForProvider('openrouter', mixedCatalog, 'openai/gpt-4o', {
    allowPaidExplicit: false,
  });
  assert.equal(guardedPaid.isFree, true);
  assert.notEqual(guardedPaid.modelId, 'openai/gpt-4o');

  // When the user explicitly selects a paid model, preserve their explicit choice
  const explicitPaid = resolveSafeModelForProvider('openrouter', mixedCatalog, 'openai/gpt-4o', {
    allowPaidExplicit: true,
  });
  assert.equal(explicitPaid.modelId, 'openai/gpt-4o');
  assert.equal(explicitPaid.isFree, false);

  // Unknown non-OpenRouter model IDs resolve to the provider's safe default
  const groqFallback = resolveSafeModelForProvider('groq', GROQ_CURATED_MODELS, 'non-existent-model');
  assert.equal(groqFallback.modelId, AI_PROVIDER_METADATA.groq.defaultModel);
  assert.equal(getStaticCatalogForProvider('gemini').length, GEMINI_SUPPORTED_MODELS.length);
});

test('P4: classifyProviderError surfaces clear HTTP codes for 401, 402, 429, 404, 504', () => {
  const err401 = classifyProviderError('groq', 401, 'Invalid API key provided');
  assert.equal(err401.httpStatus, 401);
  assert.equal(err401.code, 'INVALID_API_KEY');
  assert.match(err401.message, /GROQ_API_KEY/);

  const err402 = classifyProviderError('openrouter', 402, 'Insufficient credits');
  assert.equal(err402.httpStatus, 402);
  assert.equal(err402.code, 'INSUFFICIENT_CREDITS');
  assert.match(err402.message, /Free \(:free\)/);

  const err429 = classifyProviderError('gemini', 429, 'RESOURCE_EXHAUSTED quota exceeded');
  assert.equal(err429.httpStatus, 429);
  assert.equal(err429.code, 'RATE_LIMITED');

  const err404 = classifyProviderError('openrouter', 404, 'No endpoints found for model');
  assert.equal(err404.httpStatus, 400);
  assert.equal(err404.code, 'MODEL_UNAVAILABLE');

  const err504 = classifyProviderError('groq', 504, 'Request timed out');
  assert.equal(err504.httpStatus, 504);
  assert.equal(err504.code, 'PROVIDER_TIMEOUT');
});

test('P5: sanitizeProviderSecretText redacts Gemini, Groq, OpenRouter keys and Bearer tokens', () => {
  const dirty =
    'Failed with key AIzaSyD_example_1234567890, gsk_exampleGroqSecret99999, sk-or-v1-abc123456789xyz, Authorization: Bearer eyJhbGciOiJIUzI1NiIs, ?key=supersecret';
  const clean = sanitizeProviderSecretText(dirty);
  assert.equal(clean.includes('AIzaSyD'), false);
  assert.equal(clean.includes('gsk_exampleGroqSecret99999'), false);
  assert.equal(clean.includes('sk-or-v1-abc123456789xyz'), false);
  assert.equal(clean.includes('eyJhbGciOiJIUzI1NiIs'), false);
  assert.equal(clean.includes('supersecret'), false);
  assert.match(clean, /\[REDACTED_API_KEY\]/);
  assert.match(clean, /Bearer \[REDACTED_TOKEN\]/);
});

test('P6: Settings persistence remembers provider/model and strips legacy client API keys', () => {
  const prevStorage = (globalThis as any).localStorage;
  const prevDocument = (globalThis as any).document;
  const store = new Map<string, string>();

  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  (globalThis as any).document = {
    body: {
      classList: {
        add: () => {},
        remove: () => {},
      },
    },
  };

  try {
    // New user defaults to Gemini
    const initial = getStoredSettings();
    assert.equal(initial.aiProvider, 'gemini');

    // Legacy client key injected into localStorage gets purged on read
    store.set(
      'aadesh_ai_settings_v1',
      JSON.stringify({
        aiProvider: 'openrouter',
        aiModel: 'google/gemma-4-31b-it:free',
        openRouterModel: 'google/gemma-4-31b-it:free',
        customGeminiApiKey: 'AIzaShouldBeDeleted',
      })
    );
    const cleaned = getStoredSettings();
    assert.equal(cleaned.aiProvider, 'openrouter');
    assert.equal(cleaned.openRouterModel, 'google/gemma-4-31b-it:free');
    assert.equal('customGeminiApiKey' in cleaned, false);

    // Deprecated OpenRouter free model stored in localStorage automatically migrates to openrouter/free
    store.set(
      'aadesh_ai_settings_v1',
      JSON.stringify({
        aiProvider: 'openrouter',
        aiModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
      })
    );
    const migrated = getStoredSettings();
    assert.equal(migrated.openRouterModel, 'openrouter/free');
    assert.equal(migrated.aiModel, 'openrouter/free');

    // Saving Groq preference remembers provider and never stores any key fields
    saveStoredSettings({
      ...cleaned,
      aiProvider: 'groq',
      aiModel: 'llama-3.3-70b-versatile',
      customGeminiApiKey: 'AIzaShouldNeverPersist',
    } as any);
    const persistedRaw = store.get('aadesh_ai_settings_v1') || '';
    assert.equal(persistedRaw.includes('AIzaShouldNeverPersist'), false);
    assert.equal(persistedRaw.includes('customGeminiApiKey'), false);

    const reloaded = getStoredSettings();
    assert.equal(reloaded.aiProvider, 'groq');
    assert.equal(reloaded.aiModel, 'llama-3.3-70b-versatile');
  } finally {
    (globalThis as any).localStorage = prevStorage;
    (globalThis as any).document = prevDocument;
  }
});

test('P7: Security check — frontend src/ never transmits API keys or reads server env secrets', () => {
  const srcRoot = path.resolve(process.cwd(), 'src');
  const collectFiles = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...collectFiles(full));
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  };

  const files = collectFiles(srcRoot);
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    if (rel === 'src/tests/providers.test.ts') continue;
    const content = fs.readFileSync(file, 'utf8');

    assert.equal(
      /process\.env\.(GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY)/.test(content),
      false,
      `${rel} must not read server-side provider API key env vars`
    );
    assert.equal(
      /import\.meta\.env\.VITE_.*(GEMINI|GROQ|OPENROUTER).*KEY/i.test(content),
      false,
      `${rel} must not expose provider keys via VITE_ client env vars`
    );
    assert.equal(
      content.includes('x-gemini-api-key'),
      false,
      `${rel} must not send x-gemini-api-key headers`
    );
    assert.equal(
      content.includes('customApiKey'),
      false,
      `${rel} must not send customApiKey payloads`
    );
    if (rel !== 'src/utils/storage.ts') {
      assert.equal(
        content.includes('customGeminiApiKey'),
        false,
        `${rel} must not reference legacy customGeminiApiKey`
      );
    }
  }

  // Verify server.ts provides secure provider status and model endpoints without leaking env keys
  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  assert.match(serverContent, /app\.get\('\/api\/providers\/status'/);
  assert.match(serverContent, /app\.get\('\/api\/providers\/models'/);
  assert.match(serverContent, /process\.env\[envName\]/);
  assert.match(serverContent, /readCleanServerEnvKey\('GEMINI_API_KEY'\)/);
  assert.match(serverContent, /readCleanServerEnvKey\('GROQ_API_KEY'\)/);
  assert.match(serverContent, /readCleanServerEnvKey\('OPENROUTER_API_KEY'\)/);
  assert.equal(serverContent.includes('x-gemini-api-key'), false);
  assert.equal(serverContent.includes('/api/gemini/verify-key'), false);
});

test('P8: Partial /api/health provider payloads without models normalize safely with non-empty catalogs', async () => {
  const { normalizeProviderStatusInfo } = await import('../utils/aiProviders');

  const partialHealthPayload = {
    id: 'gemini' as const,
    name: 'Google Gemini',
    badge: 'Default',
    envVarName: 'GEMINI_API_KEY' as const,
    configured: true,
    status: 'connected' as const,
    defaultModel: 'gemini-4-hydrogen',
    activeModel: 'gemini-4-hydrogen',
    freeModelsCount: 3,
    paidModelsCount: 0,
    // models intentionally omitted, matching /api/health response shape
  };

  const normalized = normalizeProviderStatusInfo('gemini', partialHealthPayload);
  assert.equal(Array.isArray(normalized.models), true);
  assert.equal(normalized.models.length > 0, true);
  assert.equal(normalized.status, 'connected');

  const partialOpenRouter = normalizeProviderStatusInfo('openrouter', {
    configured: false,
    status: 'not_configured',
  });
  assert.equal(Array.isArray(partialOpenRouter.models), true);
  assert.equal(partialOpenRouter.models.length, OPENROUTER_FALLBACK_MODELS.length);
});

test('P9: Deprecated or uncataloged OpenRouter models fall back cleanly to openrouter/free on live catalog', () => {
  // Deprecated saved ID resolves cleanly to openrouter/free even before live catalog arrives
  const fromDeprecated = resolveSafeModelForProvider(
    'openrouter',
    OPENROUTER_FALLBACK_MODELS,
    'meta-llama/llama-3.3-70b-instruct:free',
    { allowPaidExplicit: true }
  );
  assert.equal(fromDeprecated.modelId, 'openrouter/free');
  assert.equal(fromDeprecated.isFree, true);

  // With requireInCatalog=true (live catalog), any removed/unavailable model falls back to openrouter/free
  const unknownOnLive = resolveSafeModelForProvider(
    'openrouter',
    OPENROUTER_FALLBACK_MODELS,
    'some-vendor/removed-model:free',
    { allowPaidExplicit: true, requireInCatalog: true }
  );
  assert.equal(unknownOnLive.modelId, 'openrouter/free');
  assert.equal(unknownOnLive.isFree, true);

  // Active supported live model passes through cleanly
  const validLive = resolveSafeModelForProvider(
    'openrouter',
    OPENROUTER_FALLBACK_MODELS,
    'google/gemma-4-31b-it:free',
    { allowPaidExplicit: true, requireInCatalog: true }
  );
  assert.equal(validLive.modelId, 'google/gemma-4-31b-it:free');
  assert.equal(validLive.isFree, true);
});

test('P10: Provider dropdown labels and generation verification status labels remain distinct and Gemini-defaulted', () => {
  assert.equal(getProviderSelectorOptionLabel('gemini'), 'Google Gemini (Default)');
  assert.equal(getProviderSelectorOptionLabel('groq'), 'Groq');
  assert.equal(getProviderSelectorOptionLabel('openrouter'), 'OpenRouter');

  assert.equal(getProviderStatusLabel('connected'), 'Connected');
  assert.equal(getProviderStatusLabel('configured'), 'Key Set · Untested');
  assert.equal(getProviderStatusLabel('not_configured'), 'Not Configured');
  assert.equal(getProviderStatusLabel('error'), 'Error');
});

test('P11: Server requires real AI generation verification and exposes /api/providers/test for Gemini, Groq, and OpenRouter', () => {
  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  assert.match(serverContent, /app\.post\('\/api\/providers\/test',\s*requireAuthenticatedUser/);
  assert.match(serverContent, /providerGenerationVerificationCache/);
  assert.match(serverContent, /recordProviderGenerationResult/);
  assert.match(serverContent, /Reply with only the single word: OK/);

  // Groq & OpenRouter must default to 'configured' when key/models check passes before generation verification
  assert.match(serverContent, /let status:\s*ProviderConnectionState\s*=\s*'configured'/);
  assert.match(serverContent, /generationVerified:\s*Boolean\(verification\?\.verified/);
});

test('P12: Live AI in Header is monitoring-only with 7 telemetry fields & 4-state status lights, while provider management lives exclusively in Settings', () => {
  const headerContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/Header.tsx'),
    'utf8'
  );
  const selectorContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AIProviderSelector.tsx'),
    'utf8'
  );
  const controlCenterContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/LiveAIControlCenter.tsx'),
    'utf8'
  );

  // Live AI popover shows ONLY real-time monitoring fields & actions (no 3 provider cards, no Use This AI)
  assert.match(headerContent, /Internet Network/);
  assert.match(headerContent, /Backend API/);
  assert.match(headerContent, /AI Provider API/);
  assert.match(headerContent, /Current Provider/);
  assert.match(headerContent, /Current Model/);
  assert.match(headerContent, /API Connection Latency/);
  assert.match(headerContent, /Last Successful Connection/);
  assert.match(headerContent, /Refresh Status/);
  assert.match(headerContent, /Test Connection/);
  assert.doesNotMatch(headerContent, /Use This AI/i);
  assert.doesNotMatch(headerContent, /meta\.envVarName/);

  // Animated 4-state glowing status indicators (GREEN, YELLOW, RED, GREY)
  assert.match(controlCenterContent, /bg-emerald-400/);
  assert.match(controlCenterContent, /bg-amber-400/);
  assert.match(controlCenterContent, /bg-rose-500/);
  assert.match(controlCenterContent, /bg-slate-400/);

  // Settings owns all provider configuration, API key status, and Use this AI switching
  assert.match(selectorContent, /Use this AI/);
  assert.match(selectorContent, /meta\.envVarName/);
});

test('P13: Gemini thinking resilience avoids MINIMAL thinking level on gemini-4 and prioritizes resilient models', () => {
  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  // Server defines getGeminiThinkingConfig
  assert.match(serverContent, /function getGeminiThinkingConfig/);
  // Gemini 4 is protected from MINIMAL thinking
  assert.match(serverContent, /model\.startsWith\('gemini-4'\)/);
  assert.match(serverContent, /ThinkingLevel\.LOW/);
  // Resilient gemini-3.5-flash is included in SUPPORTED_FLASH_FALLBACKS
  assert.match(serverContent, /'gemini-3.5-flash'/);
});

test('P14: English is default AI response language and Auto-Translate defaults OFF', () => {
  assert.equal(DEFAULT_SETTINGS.defaultTargetLanguage, 'en');
  assert.equal(DEFAULT_SETTINGS.aiResponseLanguage, 'en');
  assert.equal(DEFAULT_SETTINGS.autoDetectInputLanguage, false);
  assert.equal(DEFAULT_SETTINGS.translationEnabled, false);
  assert.equal(DEFAULT_SETTINGS.translationLanguage, 'ne');
});

test('P15: Provider Error Log caps at 3 entries and UI renders Error Log, Live AI Control Center, and Connection History', () => {
  const normalized = normalizeProviderStatusInfo('groq', {
    configured: true,
    status: 'error',
    errorLog: [
      { id: '1', message: 'Err 1', model: 'm1', timestamp: 1004, source: 'test' },
      { id: '2', message: 'Err 2', model: 'm1', timestamp: 1003, source: 'chat' },
      { id: '3', message: 'Err 3', model: 'm1', timestamp: 1002, source: 'test' },
      { id: '4', message: 'Err 4 should trim', model: 'm1', timestamp: 1001, source: 'test' },
    ],
  });
  assert.equal(normalized.errorLog?.length, 3);
  assert.equal(normalized.errorLog?.[0]?.message, 'Err 1');
  assert.equal(normalized.errorLog?.[2]?.message, 'Err 3');

  const selectorContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AIProviderSelector.tsx'), 'utf8');
  const controlCenterContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LiveAIControlCenter.tsx'), 'utf8');
  const settingsViewContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  const chatViewContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ChatView.tsx'), 'utf8');

  assert.match(selectorContent, /Error Log/);
  assert.match(selectorContent, /Use this AI/);
  assert.match(selectorContent, /Test Connection/);
  assert.match(controlCenterContent, /Live AI Control Center/);
  assert.match(controlCenterContent, /Current Provider/);
  assert.match(controlCenterContent, /Current Model/);
  assert.match(controlCenterContent, /API Connection Latency/);
  assert.match(controlCenterContent, /Last Successful Connection/);
  assert.match(settingsViewContent, /AI Response Preferences/);
  assert.match(settingsViewContent, /AI Message Translation/);
  assert.match(settingsViewContent, /Connection History/);
  assert.match(chatViewContent, /Select translation target language/);
  assert.match(chatViewContent, /Show Original Only/);
});

test('P16: Server backend defaults to English responses, exposes /api/providers/errors, and records 3 provider errors and 30 connectionHistory rows', () => {
  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  assert.match(serverContent, /app\.get\('\/api\/providers\/errors'/);
  assert.match(serverContent, /providerErrorLogs/);
  assert.match(serverContent, /connectionHistory/);
  assert.match(serverContent, /\.slice\(0,\s*3\)/);
  assert.match(serverContent, /\.slice\(0,\s*30\)/);
  assert.match(serverContent, /targetLanguage\s*=\s*'en'/);
  assert.match(serverContent, /shouldGenerateTranslation/);
});

test('P17: Google Gemini chat and streaming avoid silent multi-model fallback, reuse client, support abortSignal, handle 503, and expose measured comparison', () => {
  const err503 = classifyProviderError('gemini', 503, 'Service unavailable due to high demand');
  assert.equal(err503.httpStatus, 503);
  assert.equal(err503.code, 'PROVIDER_OVERLOADED');
  assert.match(err503.message, /Google Gemini/);

  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const selectorContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AIProviderSelector.tsx'),
    'utf8'
  );

  // Cached GoogleGenAI client singleton and direct abortSignal cancellation
  assert.match(serverContent, /cachedGeminiClientInstance/);
  assert.match(serverContent, /abortSignal:\s*chatController\.signal/);
  assert.match(serverContent, /abortSignal:\s*streamAbortController\.signal/);
  assert.match(serverContent, /getAllProviderStatuses\(\s*forceRefresh,\s*requestedModelParam/s);

  // Ensure /api/chat and /api/chat/stream do NOT call generateWithModelFallback on Gemini chat paths
  const chatStart = serverContent.indexOf("app.post('/api/chat'");
  const streamStart = serverContent.indexOf("app.post('/api/chat/stream'");
  const suggestedStart = serverContent.indexOf("app.post('/api/chat/suggested-replies'");
  assert.ok(chatStart !== -1 && streamStart !== -1 && suggestedStart !== -1);
  const chatSlice = serverContent.slice(chatStart, streamStart);
  const streamSlice = serverContent.slice(streamStart, suggestedStart);
  assert.equal(chatSlice.includes('generateWithModelFallback'), false);
  assert.equal(streamSlice.includes('generateWithModelFallback'), false);

  // Frontend avoids duplicate /api/chat retries and only generates suggestions when absent
  assert.match(appContent, /if \(isOnline && suggestedQuestions\.length === 0\)/);
  assert.match(selectorContent, /Provider Response Time Comparison/);
});

test('P18: Default Gemini model uses fast reliable gemini-3.1-flash-lite with transient 503 overload recovery and clean client error handling', () => {
  assert.equal(AI_PROVIDER_METADATA.gemini.defaultModel, 'gemini-3.1-flash-lite');
  assert.equal(DEFAULT_SETTINGS.aiModel, 'gemini-3.1-flash-lite');

  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.match(serverContent, /GEMINI_RELIABLE_OVERLOAD_MODEL\s*=\s*'gemini-3\.1-flash-lite'/);
  assert.match(serverContent, /function isTransientOverloadError/);
  assert.equal(appContent.includes("console.error('Chat error:'"), false);
});

test('P20: Local AI response cache stores/retrieves repeat queries and SSE parser uses robust line-by-line buffering', async () => {
  const { getCachedAIResponse, cacheAIResponse } = await import('../utils/aiCache');
  const prevStorage = (globalThis as any).localStorage;
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };

  try {
    const prompt = 'What is quantum computing?';
    assert.equal(getCachedAIResponse('gemini', 'gemini-3.1-flash-lite', prompt, 'en'), null);

    cacheAIResponse('gemini', 'gemini-3.1-flash-lite', prompt, 'en', {
      reply: 'Quantum computing uses qubits.',
      detectedLanguage: 'en',
    });

    const cached = getCachedAIResponse('gemini', 'gemini-3.1-flash-lite', prompt, 'en');
    assert.ok(cached);
    assert.equal(cached.reply, 'Quantum computing uses qubits.');
  } finally {
    (globalThis as any).localStorage = prevStorage;
  }

  const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appContent, /sseBuffer\.split\('\\n'\)/);
  assert.match(appContent, /getCachedAIResponse/);
  assert.match(appContent, /cacheAIResponse/);
});

test('P21: Gemini 429/quota errors trigger fallback to Gemini 3.1 Flash-Lite while 400/401/403 client errors never fallback', () => {
  assert.equal(GEMINI_QUOTA_FALLBACK_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(
    GEMINI_QUOTA_FALLBACK_NOTICE,
    'Your primary AI model has reached its usage limit. Aadesh AI automatically switched to Gemini 3.1 Flash-Lite for uninterrupted assistance.'
  );

  // Eligible 429 / RESOURCE_EXHAUSTED / quota errors
  assert.equal(isGeminiQuotaOrRateLimitError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), true);
  assert.equal(isGeminiQuotaOrRateLimitError(new Error('You exceeded your current quota, please check plan')), true);
  assert.equal(isGeminiQuotaOrRateLimitError(new Error('Too many requests (rate limit exceeded)')), true);

  // Non-fallback 400 / 401 / 403 errors must NEVER trigger fallback
  assert.equal(isNonFallbackClientError({ status: 400, message: 'INVALID_ARGUMENT' }), true);
  assert.equal(isNonFallbackClientError({ status: 401, message: 'Unauthorized' }), true);
  assert.equal(isNonFallbackClientError({ status: 403, message: 'API_KEY_INVALID' }), true);
  assert.equal(isGeminiQuotaOrRateLimitError({ status: 400, message: 'INVALID_ARGUMENT: bad request' }), false);
  assert.equal(isGeminiQuotaOrRateLimitError({ status: 401, message: 'Unauthorized key' }), false);
  assert.equal(isGeminiQuotaOrRateLimitError({ status: 403, message: 'PERMISSION_DENIED' }), false);

  const serverContent = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(serverContent, /GEMINI_QUOTA_FALLBACK_MODEL/);
  assert.match(serverContent, /fallbackSwitched/);
  assert.match(appContent, /applyGeminiFallbackSwitch/);
  assert.match(appContent, /setModelFallbackNotice\(GEMINI_QUOTA_FALLBACK_NOTICE\)/);
});

test('P22: Settings provider health dot resolves Connected (green), Degraded (yellow), and Unavailable (red) with tooltip & timestamp', () => {
  const connected = normalizeProviderStatusInfo('gemini', {
    configured: true,
    status: 'connected',
    generationVerified: true,
    latencyMs: 310,
    lastTestedAt: '2026-11-26T12:00:00.000Z',
  });
  const greenHealth = resolveProviderHealthDisplay(connected);
  assert.equal(greenHealth.tone, 'green');
  assert.equal(greenHealth.label, 'Connected');
  assert.equal(greenHealth.latencyText, '310 ms');
  assert.match(greenHealth.tooltip, /Google Gemini: Connected/);

  const slowConnected = normalizeProviderStatusInfo('groq', {
    configured: true,
    status: 'connected',
    generationVerified: true,
    latencyMs: 3200,
    lastTestedAt: '2026-11-26T12:00:00.000Z',
  });
  const yellowSlow = resolveProviderHealthDisplay(slowConnected);
  assert.equal(yellowSlow.tone, 'yellow');
  assert.equal(yellowSlow.label, 'Degraded');

  const untested = normalizeProviderStatusInfo('openrouter', {
    configured: true,
    status: 'configured',
    generationVerified: false,
  });
  const yellowUntested = resolveProviderHealthDisplay(untested);
  assert.equal(yellowUntested.tone, 'yellow');
  assert.equal(yellowUntested.label, 'Degraded');
  assert.equal(yellowUntested.latencyText, 'Not tested');
  assert.equal(yellowUntested.timestampText, 'Not yet verified');

  const failed = normalizeProviderStatusInfo('gemini', {
    configured: true,
    status: 'error',
    error: 'Invalid API key',
  });
  const redFailed = resolveProviderHealthDisplay(failed);
  assert.equal(redFailed.tone, 'red');
  assert.equal(redFailed.label, 'Unavailable');
  assert.match(redFailed.tooltip, /Unavailable/);

  const selectorContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AIProviderSelector.tsx'), 'utf8');
  const settingsContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  assert.match(selectorContent, /resolveProviderHealthDisplay/);
  assert.match(settingsContent, /resolveProviderHealthDisplay/);
});

test('P23: Live AI Control Center includes Selected Response Language and Actual AI Generation Status alongside 7 telemetry fields', () => {
  const verifiedSnapshot = buildLiveAIMonitoringSnapshot({
    isNetworkOnline: true,
    settings: {
      aiProvider: 'gemini',
      aiModel: 'gemini-3.1-flash-lite',
      aiResponseLanguage: 'ne',
    },
    aiHealth: {
      state: 'connected',
      checkedAt: Date.now(),
      lastConnectedAt: Date.now(),
      latencyMs: 245,
      model: 'gemini-3.1-flash-lite',
      activeProvider: 'gemini',
      backendConnected: true,
      geminiConnected: true,
      activeProviderConfigured: true,
      activeProviderVerified: true,
    },
    providersStatus: {
      gemini: normalizeProviderStatusInfo('gemini', {
        configured: true,
        status: 'connected',
        generationVerified: true,
        latencyMs: 245,
        lastTestedAt: '2026-11-26T12:00:00.000Z',
      }),
    },
  });

  assert.equal(verifiedSnapshot.selectedResponseLanguage, 'Nepali (ne)');
  assert.equal(verifiedSnapshot.actualGenerationStatus, 'Verified');
  assert.equal(verifiedSnapshot.networkIndicator.tone, 'green');
  assert.equal(verifiedSnapshot.backendIndicator.tone, 'green');
  assert.equal(verifiedSnapshot.providerIndicator.tone, 'green');

  const failedSnapshot = buildLiveAIMonitoringSnapshot({
    isNetworkOnline: true,
    settings: { aiProvider: 'gemini', aiResponseLanguage: 'en' },
    aiHealth: {
      state: 'error',
      checkedAt: Date.now(),
      lastConnectedAt: null,
      latencyMs: 500,
      model: 'gemini-3.1-flash-lite',
      activeProvider: 'gemini',
      backendConnected: true,
      geminiConnected: false,
      activeProviderConfigured: true,
      activeProviderVerified: false,
      error: '429 rate limited',
    },
    providersStatus: {
      gemini: normalizeProviderStatusInfo('gemini', {
        configured: true,
        status: 'error',
        generationVerified: false,
        error: '429 rate limited',
      }),
    },
  });
  assert.equal(failedSnapshot.selectedResponseLanguage, 'English (en)');
  assert.equal(failedSnapshot.actualGenerationStatus, 'Failed');

  const headerContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  const controlCenterContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LiveAIControlCenter.tsx'), 'utf8');
  assert.match(headerContent, /Selected Response Language/);
  assert.match(headerContent, /Actual AI Generation Status/);
  assert.match(controlCenterContent, /Selected Response Language/);
  assert.match(controlCenterContent, /Actual AI Generation Status/);
});

test('P24: Analytics helper enforces explicit opt-in consent and strips PII, emails, prompts, and keys', async () => {
  assert.equal(DEFAULT_SETTINGS.analyticsConsent, false);

  const sanitized = sanitizeAnalyticsPayload({
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    email: 'aadeshjaisi6@gmail.com',
    prompt: 'secret chat text',
    password: 'super-secret-password',
    api_key: 'AIzaSyFakeSecret',
    notes: 'Contact sagarjaisi92@gmail.com with key sk-or-v1-1234567890abcdef1234',
    latency_ms: 320,
  });

  assert.equal(sanitized.provider, 'gemini');
  assert.equal(sanitized.model, 'gemini-3.1-flash-lite');
  assert.equal(sanitized.latency_ms, 320);
  assert.equal('email' in sanitized, false);
  assert.equal('prompt' in sanitized, false);
  assert.equal('password' in sanitized, false);
  assert.equal('api_key' in sanitized, false);
  assert.equal(String(sanitized.notes).includes('sagarjaisi92@gmail.com'), false);
  assert.equal(String(sanitized.notes).includes('sk-or-v1-'), false);

  // Must strictly no-op when consent is false
  const optedOut = await trackAnalyticsEvent('chat_message_sent', { provider: 'gemini' }, false);
  assert.equal(optedOut, false);
});

test('P25: Backend sliding-window rate limiter and chat payload bounds reject abuse cleanly', async () => {
  process.env.AADESH_SKIP_SERVER_LISTEN = '1';
  const { createSlidingWindowRateLimiter, validateChatPayloadBounds } = await import('../../server');

  const limiter = createSlidingWindowRateLimiter({
    maxRequests: 2,
    windowMs: 60000,
    keyPrefix: 'unit-test',
  });
  const baseTime = 1_700_000_000_000;
  assert.equal(limiter.checkLimit('uid:u1', baseTime).allowed, true);
  assert.equal(limiter.checkLimit('uid:u1', baseTime + 10).allowed, true);
  const third = limiter.checkLimit('uid:u1', baseTime + 20);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds >= 1);
  // Different user remains unaffected
  assert.equal(limiter.checkLimit('uid:u2', baseTime + 20).allowed, true);
  // Window expiry resets quota
  assert.equal(limiter.checkLimit('uid:u1', baseTime + 60001).allowed, true);

  assert.equal(validateChatPayloadBounds({ currentMessage: 'Hello', messages: [] }).ok, true);
  const tooLong = validateChatPayloadBounds({ currentMessage: 'x'.repeat(32001) });
  assert.equal(tooLong.ok, false);
  const tooManyMsgs = validateChatPayloadBounds({ messages: new Array(121).fill({ role: 'user', content: 'hi' }) });
  assert.equal(tooManyMsgs.ok, false);
  const badHistoryType = validateChatPayloadBounds({ messages: 'not-an-array' });
  assert.equal(badHistoryType.ok, false);
});

test('P26: Power Memory detects explicit/smart memories, blocks secrets, flags sensitive items, and retrieves only relevant context', () => {
  assert.equal(POWER_MEMORY_CATEGORIES.length, 9);
  assert.equal(DEFAULT_SETTINGS.smartMemoryAutoSave, true);

  // Explicit Remember / Forget commands
  const rememberCmd = detectExplicitMemoryCommand('Remember this: I prefer Nepali comedy jokes');
  assert.equal(rememberCmd?.action, 'remember');
  assert.equal(rememberCmd?.content, 'I prefer Nepali comedy jokes');

  const saveCmd = detectExplicitMemoryCommand('Save this memory', 'Always keep code examples concise');
  assert.equal(saveCmd?.action, 'remember');
  assert.equal(saveCmd?.usesPreviousTurnFallback, true);
  assert.equal(saveCmd?.content, 'Always keep code examples concise');

  const forgetCmd = detectExplicitMemoryCommand('Forget that I live in Pokhara');
  assert.equal(forgetCmd?.action, 'forget');

  // Security: secrets/credentials must always be blocked
  assert.equal(containsSecretOrCredential('My API key is AIzaSyD89fJ3k1L0pQ9sT2vW5yZ8aB3c'), true);
  assert.equal(containsSecretOrCredential('password is mySecretPass123!'), true);
  assert.equal(containsSecretOrCredential('I prefer dark purple UI themes and TypeScript'), false);

  const blockedSmart = detectSmartAutoMemoryCandidate('Remember my password is secretPassword99!', []);
  assert.equal(blockedSmart?.blockedSecret, true);

  // Sensitivity detection must prompt user before storing personal/sensitive facts
  assert.equal(classifyMemorySensitivity('My email address is sagar@example.com').isSensitive, true);
  assert.equal(classifyMemorySensitivity('My birthday is 1998-05-12').isSensitive, true);
  assert.equal(classifyMemorySensitivity('I am building Aadesh AI Hub with TypeScript').isSensitive, false);

  // Smart auto-detection categorizes comedy, project, goal, and ignores pure questions
  assert.equal(detectSmartAutoMemoryCandidate('What is the weather in Kathmandu today?', []), null);
  const projectCandidate = detectSmartAutoMemoryCandidate("I'm building an AI translation platform with TypeScript.", []);
  assert.equal(projectCandidate?.category, 'project');
  assert.equal(projectCandidate?.isSensitive, false);

  const comedyCandidate = detectSmartAutoMemoryCandidate('Make me laugh with dry programming puns anytime.', []);
  assert.equal(comedyCandidate?.category, 'comedy');

  // Forget matching targets relevant memory cleanly without wiping unrelated ones
  const sampleMemories: AIMemoryItem[] = [
    {
      id: 'm1',
      userId: 'u1',
      category: 'project',
      content: 'Building Aadesh AI translation studio in React and TypeScript',
      approved: true,
      keywords: ['building', 'aadesh', 'translation', 'studio', 'react', 'typescript'],
      createdAt: 1000,
      updatedAt: 2000,
    },
    {
      id: 'm2',
      userId: 'u1',
      category: 'comedy',
      content: 'Enjoys witty programming puns and stand-up comedy',
      approved: true,
      keywords: ['enjoys', 'witty', 'programming', 'puns', 'stand', 'comedy'],
      createdAt: 1000,
      updatedAt: 3000,
    },
    {
      id: 'm3',
      userId: 'u1',
      category: 'goal',
      content: 'Preparing for JLPT Japanese fluency exam next autumn',
      approved: true,
      keywords: ['preparing', 'jlpt', 'japanese', 'fluency', 'exam', 'autumn'],
      createdAt: 1000,
      updatedAt: 2500,
    },
    {
      id: 'm4',
      userId: 'u1',
      category: 'fact',
      content: 'Paused memory that must not leak',
      approved: false,
      keywords: ['paused', 'memory', 'translation'],
      createdAt: 1000,
      updatedAt: 4000,
    },
  ];

  const matchedForget = findMatchingMemoriesToForget('Japanese exam', sampleMemories);
  assert.equal(matchedForget.length, 1);
  assert.equal(matchedForget[0].id, 'm3');

  // Relevance filtering excludes unrelated memories and paused items
  const retrieval = retrieveRelevantMemories({
    queryText: 'Tell me a funny programming joke while I take a break',
    memories: sampleMemories,
    maxItems: 5,
  });
  assert.ok(retrieval.selectedMemories.some((m) => m.id === 'm2'));
  assert.equal(retrieval.selectedMemories.some((m) => m.id === 'm3'), false);
  assert.equal(retrieval.selectedMemories.some((m) => m.id === 'm4'), false);
  assert.equal(getLastMemoryUpdatedAt(sampleMemories), 4000);
});

test('P27: Settings shows inline dot + latency (ms) and Firebase Hosting (aadesh-ai-global) preserves Vercel config', () => {
  const firebaserc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.firebaserc'), 'utf8'));
  const firebaseJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf8'));
  const vercelJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));

  assert.equal(firebaserc?.projects?.default, 'aadesh-ai-global');
  assert.equal(firebaseJson?.hosting?.public, 'dist');
  assert.ok(
    Array.isArray(firebaseJson?.hosting?.rewrites) &&
      firebaseJson.hosting.rewrites.some((r: any) => r.source === '**' && r.destination === '/index.html')
  );
  // Vercel configuration preserved untouched
  assert.ok(Array.isArray(vercelJson?.rewrites) && vercelJson.rewrites.length >= 1);

  const selectorContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AIProviderSelector.tsx'), 'utf8');
  const settingsContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  const powerMemoryUi = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PowerMemorySection.tsx'), 'utf8');
  assert.match(selectorContent, /compactLatencyText/);
  assert.match(settingsContent, /compactLatencyText/);
  assert.match(settingsContent, /<PowerMemorySection/);
  assert.match(powerMemoryUi, /Power Memory/);
});

test('P28: Firebase Hosting routes /api requests to Vercel backend with strict origin-allowlisted CORS', async () => {
  // 1. Firebase Hosting domains resolve to Vercel production backend automatically
  assert.equal(isFirebaseHostingHostname('aadesh-ai-global.web.app'), true);
  assert.equal(isFirebaseHostingHostname('aadesh-ai-global.firebaseapp.com'), true);
  assert.equal(isFirebaseHostingHostname('aadesh-ai-global--pr-42.web.app'), true);
  assert.equal(isFirebaseHostingHostname('aadesh-jaisi-neupane.vercel.app'), false);

  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: '',
      windowOrigin: 'https://aadesh-ai-global.web.app',
      windowHostname: 'aadesh-ai-global.web.app',
    }),
    PRODUCTION_VERCEL_API_ORIGIN
  );
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: '',
      windowOrigin: 'https://aadesh-ai-global.firebaseapp.com',
      windowHostname: 'aadesh-ai-global.firebaseapp.com',
    }),
    PRODUCTION_VERCEL_API_ORIGIN
  );
  assert.equal(
    buildApiUrl('/api/health', {
      envApiBaseUrl: '',
      windowOrigin: 'https://aadesh-ai-global.web.app',
      windowHostname: 'aadesh-ai-global.web.app',
    }),
    `${PRODUCTION_VERCEL_API_ORIGIN}/api/health`
  );

  // 2. Vercel, localhost, and Cloud Run keep same-origin /api paths even when VITE_API_BASE_URL matches Vercel
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: PRODUCTION_VERCEL_API_ORIGIN,
      windowOrigin: 'https://aadesh-jaisi-neupane.vercel.app',
      windowHostname: 'aadesh-jaisi-neupane.vercel.app',
    }),
    ''
  );
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: '',
      windowOrigin: 'https://aadesh-jaisi-neupane-git-main.vercel.app',
      windowHostname: 'aadesh-jaisi-neupane-git-main.vercel.app',
    }),
    ''
  );
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: '',
      windowOrigin: 'http://localhost:3000',
      windowHostname: 'localhost',
    }),
    ''
  );
  assert.equal(normalizeApiBaseUrl('javascript:alert(1)'), '');

  // 3. Ensure every fetch call under src/ uses buildApiUrl rather than bare relative /api paths
  const srcRoot = path.resolve(process.cwd(), 'src');
  const bareFetchViolations: string[] = [];
  const walkSrc = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests') continue;
        walkSrc(fullPath);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/fetch\s*\(\s*['"`]\/api(?:\/|['"`])/.test(content)) {
          bareFetchViolations.push(path.relative(process.cwd(), fullPath));
        }
      }
    }
  };
  walkSrc(srcRoot);
  assert.deepEqual(bareFetchViolations, []);

  // 4. Verify strict CORS allowlist + real Express HTTP preflight/GET behavior
  process.env.AADESH_SKIP_SERVER_LISTEN = '1';
  const { app, isAllowedCorsOrigin } = await import('../../server');
  assert.equal(isAllowedCorsOrigin('https://aadesh-ai-global.web.app'), true);
  assert.equal(isAllowedCorsOrigin('https://aadesh-ai-global.firebaseapp.com'), true);
  assert.equal(isAllowedCorsOrigin('https://aadesh-jaisi-neupane.vercel.app'), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedCorsOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedCorsOrigin('*'), false);

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const preflightRes = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://aadesh-ai-global.web.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    assert.equal(preflightRes.status, 204);
    assert.equal(
      preflightRes.headers.get('access-control-allow-origin'),
      'https://aadesh-ai-global.web.app'
    );
    assert.match(preflightRes.headers.get('access-control-allow-headers') || '', /Authorization/);

    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://aadesh-ai-global.firebaseapp.com' },
    });
    assert.equal(healthRes.status, 200);
    assert.equal(
      healthRes.headers.get('access-control-allow-origin'),
      'https://aadesh-ai-global.firebaseapp.com'
    );
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.backendConnected, true);

    const blockedPreflight = await fetch(`${baseUrl}/api/chat`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(blockedPreflight.status, 403);
    assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }

  // 5. Self-referential Firebase VITE_API_BASE_URL must still resolve to Vercel backend
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: 'https://aadesh-ai-global.web.app',
      windowOrigin: 'https://aadesh-ai-global.web.app',
      windowHostname: 'aadesh-ai-global.web.app',
    }),
    PRODUCTION_VERCEL_API_ORIGIN
  );

  // 6. Service Worker uses network-first HTML navigation and firebase.json sets no-cache on /
  const swContent = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  assert.doesNotMatch(swContent, /const CACHE_NAME = 'aadesh-ai-v3'/);
  assert.match(swContent, /isNavigationOrHtml/);
  assert.match(swContent, /cache:\s*'no-cache'/);

  const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf8'));
  const hasRootNoCache =
    Array.isArray(firebaseConfig?.hosting?.headers) &&
    firebaseConfig.hosting.headers.some(
      (h: any) =>
        h.source === '/' &&
        Array.isArray(h.headers) &&
        h.headers.some((hdr: any) => hdr.key === 'Cache-Control' && /no-cache/.test(hdr.value))
    );
  assert.equal(hasRootNoCache, true);
});

