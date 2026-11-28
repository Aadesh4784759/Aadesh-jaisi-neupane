export type AIProviderId = 'gemini' | 'groq' | 'openrouter';

export type ProviderConnectionState = 'connected' | 'configured' | 'not_configured' | 'error';

export interface AIModelOption {
  id: string;
  name: string;
  provider: AIProviderId;
  isFree: boolean;
  pricingLabel: string;
  contextLength?: number;
  description?: string;
  isDefault?: boolean;
  supportsVision?: boolean;
}

export interface ProviderErrorLogEntry {
  id?: string;
  message: string;
  code?: string;
  model: string;
  timestamp: string | number;
  source?: 'test' | 'chat' | 'health';
}

export interface ConnectionHistoryEntry {
  id: string;
  provider: AIProviderId;
  model: string;
  status: 'success' | 'failed';
  latencyMs?: number;
  timestamp: string | number;
  source?: 'test' | 'chat' | 'health';
  action?: 'test' | 'chat' | 'health_check';
  error?: string;
  code?: string;
}

export interface AIProviderStatusInfo {
  id: AIProviderId;
  name: string;
  badge: string;
  description: string;
  envVarName: 'GEMINI_API_KEY' | 'GROQ_API_KEY' | 'OPENROUTER_API_KEY';
  configured: boolean;
  status: ProviderConnectionState;
  generationVerified?: boolean;
  lastTestedAt?: string | null;
  lastVerifiedModel?: string;
  defaultModel: string;
  activeModel: string;
  models: AIModelOption[];
  freeModelsCount: number;
  paidModelsCount: number;
  latencyMs?: number;
  checkedAt?: string | null;
  error?: string;
  errorLog?: ProviderErrorLogEntry[];
  source?: 'live' | 'catalog';
}

export interface AIProviderSummaryMeta {
  id: AIProviderId;
  name: string;
  shortName: string;
  envVarName: 'GEMINI_API_KEY' | 'GROQ_API_KEY' | 'OPENROUTER_API_KEY';
  defaultModel: string;
  description: string;
  freeTierNotice: string;
}

export const AI_PROVIDER_METADATA: Record<AIProviderId, AIProviderSummaryMeta> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    envVarName: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3.1-flash-lite',
    description: 'Default provider with multimodal vision, fast streaming, voice & translation support.',
    freeTierNotice: 'Free tier available in Google AI Studio (rate-limited; no payment method required).',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    shortName: 'Groq',
    envVarName: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    description: 'High-speed LPU inference powered by official Groq API.',
    freeTierNotice: 'Groq offers a free developer tier with per-minute and daily rate limits.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OpenRouter',
    envVarName: 'OPENROUTER_API_KEY',
    defaultModel: 'openrouter/free',
    description: 'Unified gateway to curated free and paid models with transparent pricing.',
    freeTierNotice: 'Free (:free & openrouter/free) models have rate/daily limits. Paid models require account credits and are never auto-selected.',
  },
};

export const GEMINI_SUPPORTED_MODELS: AIModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    isFree: true,
    pricingLabel: 'Free tier available',
    contextLength: 1000000,
    description: 'Default ultra-low-latency streaming and reliable everyday tasks.',
    isDefault: true,
    supportsVision: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'gemini',
    isFree: true,
    pricingLabel: 'Free tier available',
    contextLength: 1000000,
    description: 'Fast lightweight Gemini 3.5 model for multilingual chat and coding.',
    supportsVision: true,
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    provider: 'gemini',
    isFree: true,
    pricingLabel: 'Free tier available',
    contextLength: 1000000,
    description: 'Advanced reasoning, multilingual chat, and multimodal analysis (subject to demand spikes).',
    supportsVision: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'gemini',
    isFree: true,
    pricingLabel: 'Free tier available',
    contextLength: 1000000,
    description: 'General-purpose Flash model for structured reasoning.',
    supportsVision: true,
  },
];

// Supported official Groq production models (verified against Groq OpenAI-compatible /v1/models)
export const GROQ_CURATED_MODELS: AIModelOption[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    isFree: true,
    pricingLabel: 'Free tier (rate-limited)',
    contextLength: 131072,
    description: 'Meta Llama 3.3 70B on Groq LPU — strong general reasoning & coding.',
    isDefault: true,
    supportsVision: false,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq',
    isFree: true,
    pricingLabel: 'Free tier (rate-limited)',
    contextLength: 131072,
    description: 'Sub-second fast responses for quick Q&A and lightweight tasks.',
    supportsVision: false,
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B',
    provider: 'groq',
    isFree: true,
    pricingLabel: 'Free tier (rate-limited)',
    contextLength: 131072,
    description: 'Multimodal Llama 4 Scout supporting text and image understanding on Groq.',
    supportsVision: true,
  },
  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    provider: 'groq',
    isFree: true,
    pricingLabel: 'Free tier (rate-limited)',
    contextLength: 131072,
    description: 'Alibaba Qwen3 32B for multilingual and structured problem solving.',
    supportsVision: false,
  },
];

export const DEPRECATED_OPENROUTER_MODEL_IDS = new Set<string>([
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'qwen/qwen3-coder:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'deepseek/deepseek-r1-0528:free',
]);

export function sanitizeOpenRouterModelId(modelId?: string | null): string {
  const cleaned = typeof modelId === 'string' ? modelId.trim() : '';
  if (!cleaned || DEPRECATED_OPENROUTER_MODEL_IDS.has(cleaned)) {
    return 'openrouter/free';
  }
  return cleaned;
}

// Fallback OpenRouter free catalog if live /api/v1/models fetch is offline/pending
export const OPENROUTER_FALLBACK_MODELS: AIModelOption[] = [
  {
    id: 'openrouter/free',
    name: 'Free Models Router',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 200000,
    description: 'Official OpenRouter Free Router — automatically picks an available free model.',
    isDefault: true,
    supportsVision: true,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google: Gemma 4 31B (free)',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 262144,
    description: 'Free rate-limited Google Gemma 4 31B multimodal reasoning model.',
    supportsVision: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google: Gemma 4 26B A4B (free)',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 262144,
    description: 'Free rate-limited Google Gemma 4 26B fast MoE multimodal model.',
    supportsVision: true,
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'NVIDIA: Nemotron 3.5 Super VL (free)',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 1000000,
    description: 'Free rate-limited NVIDIA Nemotron 3.5 Super multimodal model.',
    supportsVision: true,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA: Nemotron 3 Ultra (free)',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 1000000,
    description: 'Free rate-limited NVIDIA Nemotron 3 Ultra reasoning model.',
    supportsVision: false,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA: Nemotron 3.5 Lightning (free)',
    provider: 'openrouter',
    isFree: true,
    pricingLabel: 'Free ($0/token)',
    contextLength: 1000000,
    description: 'Free rate-limited low-latency NVIDIA Nemotron 3.5 Lightning model.',
    supportsVision: false,
  },
];

export function normalizeAIProviderId(raw?: unknown): AIProviderId {
  if (typeof raw !== 'string') return 'gemini';
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'groq' || cleaned === 'openrouter' || cleaned === 'gemini') {
    return cleaned;
  }
  return 'gemini';
}

export function getProviderDisplayName(id: AIProviderId): string {
  return AI_PROVIDER_METADATA[id]?.name || 'Google Gemini';
}

export function getProviderSelectorOptionLabel(id: AIProviderId): string {
  if (id === 'gemini') return 'Google Gemini (Default)';
  if (id === 'groq') return 'Groq';
  return 'OpenRouter';
}

export type LiveStatusTone = 'green' | 'yellow' | 'red' | 'grey';

export const SLOW_RESPONSE_LATENCY_MS = 1500;

export function getStatusIndicatorStyle(tone: LiveStatusTone): {
  tone: LiveStatusTone;
  dotClass: string;
  textClass: string;
  badgeClass: string;
  headerBadgeClass: string;
} {
  switch (tone) {
    case 'green':
      return {
        tone,
        dotClass:
          'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse transition-all duration-300',
        textClass: 'text-emerald-300',
        badgeClass:
          'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 transition-colors duration-300',
        headerBadgeClass:
          'bg-emerald-950/55 border-emerald-400/40 text-emerald-200 hover:border-emerald-300/70 transition-all duration-300',
      };
    case 'yellow':
      return {
        tone,
        dotClass:
          'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] animate-pulse transition-all duration-300',
        textClass: 'text-amber-300',
        badgeClass:
          'bg-amber-500/15 border-amber-400/40 text-amber-200 transition-colors duration-300',
        headerBadgeClass:
          'bg-amber-950/55 border-amber-400/40 text-amber-200 hover:border-amber-300/70 transition-all duration-300',
      };
    case 'red':
      return {
        tone,
        dotClass:
          'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse transition-all duration-300',
        textClass: 'text-rose-300',
        badgeClass:
          'bg-rose-500/15 border-rose-400/40 text-rose-200 transition-colors duration-300',
        headerBadgeClass:
          'bg-rose-950/55 border-rose-400/40 text-rose-200 hover:border-rose-300/70 transition-all duration-300',
      };
    case 'grey':
    default:
      return {
        tone: 'grey',
        dotClass:
          'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.65)] animate-pulse transition-all duration-300',
        textClass: 'text-slate-300',
        badgeClass:
          'bg-slate-500/15 border-slate-400/35 text-slate-200 transition-colors duration-300',
        headerBadgeClass:
          'bg-slate-900/65 border-slate-400/35 text-slate-200 hover:border-slate-300/60 transition-all duration-300',
      };
  }
}

export function getProviderStatusLabel(status: ProviderConnectionState): string {
  if (status === 'connected') return 'Connected';
  if (status === 'configured') return 'Key Set · Untested';
  if (status === 'not_configured') return 'Not Configured';
  return 'Error';
}

export function getStaticCatalogForProvider(provider: AIProviderId): AIModelOption[] {
  if (provider === 'groq') return GROQ_CURATED_MODELS;
  if (provider === 'openrouter') return OPENROUTER_FALLBACK_MODELS;
  return GEMINI_SUPPORTED_MODELS;
}

export function normalizeProviderStatusInfo(
  id: AIProviderId,
  raw?: Partial<AIProviderStatusInfo> | null,
  previousModels?: AIModelOption[] | null
): AIProviderStatusInfo {
  const meta = AI_PROVIDER_METADATA[id];
  const staticModels = getStaticCatalogForProvider(id);
  const resolvedModels =
    Array.isArray(raw?.models) && raw.models.length > 0
      ? raw.models
      : Array.isArray(previousModels) && previousModels.length > 0
      ? previousModels
      : staticModels;

  const fallbackStatus: ProviderConnectionState =
    raw?.status || (raw?.configured ? 'configured' : 'not_configured');
  const generationVerified =
    typeof raw?.generationVerified === 'boolean'
      ? raw.generationVerified
      : fallbackStatus === 'connected';

  return {
    id,
    name: raw?.name || meta.name,
    badge:
      raw?.badge ||
      (id === 'gemini' ? 'Default' : id === 'groq' ? 'Fast LPU' : 'Free & Paid Models'),
    description: raw?.description || meta.description,
    envVarName: raw?.envVarName || meta.envVarName,
    configured: typeof raw?.configured === 'boolean' ? raw.configured : fallbackStatus !== 'not_configured',
    status: fallbackStatus,
    generationVerified,
    ...(raw?.lastTestedAt !== undefined ? { lastTestedAt: raw.lastTestedAt } : {}),
    ...(raw?.lastVerifiedModel ? { lastVerifiedModel: raw.lastVerifiedModel } : {}),
    defaultModel: raw?.defaultModel || meta.defaultModel,
    activeModel: raw?.activeModel || raw?.defaultModel || meta.defaultModel,
    models: resolvedModels,
    freeModelsCount:
      typeof raw?.freeModelsCount === 'number'
        ? raw.freeModelsCount
        : resolvedModels.filter((item) => item.isFree).length,
    paidModelsCount:
      typeof raw?.paidModelsCount === 'number'
        ? raw.paidModelsCount
        : resolvedModels.filter((item) => !item.isFree).length,
    ...(typeof raw?.latencyMs === 'number' ? { latencyMs: raw.latencyMs } : {}),
    ...(raw?.checkedAt !== undefined ? { checkedAt: raw.checkedAt } : {}),
    ...(raw?.error ? { error: raw.error } : {}),
    ...(Array.isArray(raw?.errorLog)
      ? {
          errorLog: raw.errorLog
            .filter((entry): entry is ProviderErrorLogEntry => Boolean(entry && typeof entry.message === 'string'))
            .slice(0, 3),
        }
      : {}),
    ...(raw?.source ? { source: raw.source } : {}),
  };
}

function parsePriceNumber(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatPricePerMillion(pricePerToken: number): string {
  if (!Number.isFinite(pricePerToken) || pricePerToken <= 0) return '$0';
  const perMillion = pricePerToken * 1_000_000;
  if (perMillion < 0.01) return '<$0.01/M';
  if (perMillion < 1) return `$${perMillion.toFixed(2)}/M`;
  return `$${perMillion.toFixed(2).replace(/\.00$/, '')}/M`;
}

export function classifyOpenRouterModel(raw: {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string; input_modalities?: string[] };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    request?: string | number;
    image?: string | number;
  };
}): AIModelOption | null {
  const id = String(raw?.id || '').trim();
  if (!id || id === 'openrouter/auto') return null;

  const promptPrice = parsePriceNumber(raw?.pricing?.prompt);
  const completionPrice = parsePriceNumber(raw?.pricing?.completion);
  const requestPrice = parsePriceNumber(raw?.pricing?.request);
  const imagePrice = parsePriceNumber(raw?.pricing?.image);

  const hasPositivePricing =
    promptPrice > 0 || completionPrice > 0 || requestPrice > 0 || imagePrice > 0;
  const hasExplicitZeroPricing =
    raw?.pricing !== undefined &&
    promptPrice === 0 &&
    completionPrice === 0 &&
    requestPrice === 0;
  const isFree = !hasPositivePricing && (id.endsWith(':free') || hasExplicitZeroPricing);

  const pricingLabel = isFree
    ? 'Free ($0/token)'
    : `Paid (${formatPricePerMillion(promptPrice)} in · ${formatPricePerMillion(completionPrice)} out)`;

  const inputModalities = raw?.architecture?.input_modalities || [];
  const modalityStr = String(raw?.architecture?.modality || '').toLowerCase();
  const supportsVision =
    inputModalities.includes('image') || modalityStr.includes('image');

  return {
    id,
    name: String(raw?.name || id).trim(),
    provider: 'openrouter',
    isFree,
    pricingLabel,
    contextLength:
      typeof raw?.context_length === 'number' && Number.isFinite(raw.context_length)
        ? raw.context_length
        : undefined,
    description:
      typeof raw?.description === 'string' && raw.description.trim()
        ? raw.description.trim().slice(0, 180)
        : undefined,
    isDefault: id === 'openrouter/free',
    supportsVision,
  };
}

/**
 * Ensures we NEVER auto-select a Paid model unless the user explicitly selected that paid model ID.
 * If requestedModel is missing, empty, deprecated, or absent from a live catalog, resolves strictly to a Free default model.
 */
export function resolveSafeModelForProvider(
  provider: AIProviderId,
  models: AIModelOption[],
  requestedModel?: string | null,
  options?: { allowPaidExplicit?: boolean; requireInCatalog?: boolean }
): { modelId: string; isFree: boolean; modelInfo?: AIModelOption } {
  const catalog = models.length > 0 ? models : getStaticCatalogForProvider(provider);
  const freeModels = catalog.filter((m) => m.isFree);
  const fallbackFree =
    freeModels.find((m) => m.isDefault) ||
    freeModels.find((m) => m.id === 'openrouter/free') ||
    freeModels[0] ||
    catalog.find((m) => m.isDefault) ||
    catalog[0];

  const cleanedReq = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  if (cleanedReq) {
    const matched = catalog.find((m) => m.id === cleanedReq);
    if (matched) {
      if (matched.isFree || options?.allowPaidExplicit !== false) {
        return { modelId: matched.id, isFree: matched.isFree, modelInfo: matched };
      }
    }
    // If caller passed a known deprecated OpenRouter free model (e.g. old localStorage/Firestore),
    // fall through to the safe default OpenRouter free model instead of dispatching a dead ID.
    const isKnownDeprecated =
      provider === 'openrouter' && DEPRECATED_OPENROUTER_MODEL_IDS.has(cleanedReq);

    // Only allow uncataloged OpenRouter model IDs when catalog is offline fallback (not exhaustive live list)
    // and not a known deprecated ID.
    if (
      provider === 'openrouter' &&
      !isKnownDeprecated &&
      !options?.requireInCatalog &&
      options?.allowPaidExplicit !== false &&
      /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]{1,100}$/.test(cleanedReq)
    ) {
      const inferredFree = cleanedReq === 'openrouter/free' || cleanedReq.endsWith(':free');
      if (inferredFree || options?.allowPaidExplicit) {
        return {
          modelId: cleanedReq,
          isFree: inferredFree,
        };
      }
    }
  }

  const safeId = fallbackFree?.id || AI_PROVIDER_METADATA[provider].defaultModel;
  return {
    modelId: safeId,
    isFree: fallbackFree ? fallbackFree.isFree : true,
    modelInfo: fallbackFree,
  };
}

export function classifyProviderError(
  provider: AIProviderId,
  statusCode: number,
  rawMessage: string
): { httpStatus: number; code: string; message: string } {
  const providerName = getProviderDisplayName(provider);
  const lower = String(rawMessage || '').toLowerCase();

  if (
    statusCode === 401 ||
    lower.includes('invalid api key') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('unauthorized') ||
    lower.includes('incorrect api key') ||
    lower.includes('no auth credentials') ||
    lower.includes('user not found')
  ) {
    return {
      httpStatus: 401,
      code: 'INVALID_API_KEY',
      message: `${providerName} rejected the configured server API key. Please verify ${AI_PROVIDER_METADATA[provider].envVarName} on the server.`,
    };
  }

  if (
    statusCode === 402 ||
    lower.includes('insufficient credits') ||
    lower.includes('insufficient_quota') ||
    lower.includes('payment required') ||
    lower.includes('more credits') ||
    lower.includes('requires a paid')
  ) {
    return {
      httpStatus: 402,
      code: 'INSUFFICIENT_CREDITS',
      message: `${providerName} returned insufficient credits for the selected model. Please pick a Free (:free) model or add credits to your ${providerName} account.`,
    };
  }

  if (
    statusCode === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota exceeded')
  ) {
    return {
      httpStatus: 429,
      code: 'RATE_LIMITED',
      message: `${providerName} rate limit reached for this model. Please wait a moment before retrying or choose another model.`,
    };
  }

  if (
    statusCode === 404 ||
    lower.includes('model_not_found') ||
    lower.includes('does not exist') ||
    lower.includes('no endpoints found') ||
    lower.includes('is not a valid model')
  ) {
    return {
      httpStatus: 400,
      code: 'MODEL_UNAVAILABLE',
      message: `The selected ${providerName} model is currently unavailable or deprecated. Please pick another supported model.`,
    };
  }

  if (
    statusCode === 503 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('temporarily overloaded')
  ) {
    return {
      httpStatus: 503,
      code: 'PROVIDER_OVERLOADED',
      message: `${providerName} is temporarily experiencing high demand on its servers (HTTP 503). Please retry shortly or choose another model in Settings.`,
    };
  }

  if (lower.includes('timed out') || statusCode === 504) {
    return {
      httpStatus: 504,
      code: 'PROVIDER_TIMEOUT',
      message: `${providerName} took too long to respond. Please retry in a moment.`,
    };
  }

  if (statusCode === 403 || lower.includes('permission denied')) {
    return {
      httpStatus: 403,
      code: 'PROVIDER_FORBIDDEN',
      message: `${providerName} denied access for this request or model. Please verify account permissions or select a free model.`,
    };
  }

  return {
    httpStatus: statusCode >= 400 && statusCode < 600 ? statusCode : 502,
    code: 'PROVIDER_ERROR',
    message: rawMessage || `${providerName} could not complete the request. Please try again.`,
  };
}

export function sanitizeProviderSecretText(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : (raw as any)?.message ? String((raw as any).message) : '';
  return text
    .replace(/AIza[0-9A-Za-z_-]{6,}/g, '[REDACTED_API_KEY]')
    .replace(/AQ\.[0-9A-Za-z._-]{6,}/g, '[REDACTED_API_KEY]')
    .replace(/gsk_[0-9A-Za-z_-]{6,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-or-(?:v1-)?[0-9A-Za-z_-]{6,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-[0-9A-Za-z_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]');
}

export const GEMINI_QUOTA_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_QUOTA_FALLBACK_NOTICE =
  'Your primary AI model has reached its usage limit. Aadesh AI automatically switched to Gemini 3.1 Flash-Lite for uninterrupted assistance.';

/**
 * Returns true for 400/401/403 client/auth errors that MUST NEVER trigger silent model fallback.
 */
export function isNonFallbackClientError(err: unknown): boolean {
  const status = Number((err as any)?.status || (err as any)?.code || 0);
  const msg = sanitizeProviderSecretText(err).toLowerCase();
  if (status === 400 || status === 401 || status === 403) {
    return true;
  }
  return (
    msg.includes('invalid_argument') ||
    msg.includes('malformed') ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission denied') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthorized') ||
    msg.includes('no auth credentials')
  );
}

/**
 * Detects HTTP 429, RESOURCE_EXHAUSTED, quota exhaustion, or rate-limit errors eligible for automatic Gemini fallback.
 */
export function isGeminiQuotaOrRateLimitError(err: unknown): boolean {
  if (isNonFallbackClientError(err)) return false;
  const status = Number((err as any)?.status || (err as any)?.code || 0);
  const msg = sanitizeProviderSecretText(err).toLowerCase();
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('exhausted') ||
    msg.includes('exceeded your current quota')
  );
}

export type ProviderHealthTone = 'green' | 'yellow' | 'red';

export interface ProviderHealthDisplay {
  tone: ProviderHealthTone;
  label: 'Connected' | 'Degraded' | 'Unavailable';
  dotClass: string;
  textClass: string;
  latencyText: string;
  timestampText: string;
  tooltip: string;
}

export const PROVIDER_DEGRADED_LATENCY_MS = 2500;

export function formatProviderStatusTimestamp(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return 'Not yet verified';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return 'Not yet verified';
  try {
    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Not yet verified';
  }
}

export function resolveProviderHealthDisplay(
  info: AIProviderStatusInfo,
  options?: { isTesting?: boolean; isRefreshing?: boolean }
): ProviderHealthDisplay {
  const isTesting = Boolean(options?.isTesting);
  const isRefreshing = Boolean(options?.isRefreshing);
  const hasLatency = typeof info.latencyMs === 'number' && info.latencyMs > 0;
  const latencyText = hasLatency ? `${info.latencyMs} ms` : 'Not tested';
  const rawTimestamp = info.lastTestedAt || info.checkedAt || null;
  const timestampText = formatProviderStatusTimestamp(rawTimestamp);

  let tone: ProviderHealthTone = 'yellow';
  let label: 'Connected' | 'Degraded' | 'Unavailable' = 'Degraded';

  if (isTesting || (isRefreshing && info.status !== 'error')) {
    tone = 'yellow';
    label = 'Degraded';
  } else if (!info.configured || info.status === 'not_configured' || info.status === 'error') {
    tone = 'red';
    label = 'Unavailable';
  } else if (info.status === 'connected') {
    if (hasLatency && (info.latencyMs as number) >= PROVIDER_DEGRADED_LATENCY_MS) {
      tone = 'yellow';
      label = 'Degraded';
    } else {
      tone = 'green';
      label = 'Connected';
    }
  } else {
    // 'configured' (key ready, live generation not yet verified)
    tone = 'yellow';
    label = 'Degraded';
  }

  const dotClass =
    tone === 'green'
      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] animate-pulse'
      : tone === 'yellow'
      ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)] animate-pulse'
      : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.85)] animate-pulse';

  const textClass =
    tone === 'green'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'yellow'
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-rose-600 dark:text-rose-400';

  const statusReason = isTesting
    ? 'Testing live generation...'
    : label === 'Connected'
    ? 'Healthy & verified'
    : label === 'Degraded'
    ? info.status === 'configured'
      ? 'Configured (awaiting live verification)'
      : 'High latency detected'
    : info.error || 'Provider key missing or failed verification';

  const tooltip = `${info.name}: ${label} (${statusReason}) · Latency: ${latencyText} · Updated: ${timestampText}`;

  return {
    tone,
    label,
    dotClass,
    textClass,
    latencyText,
    timestampText,
    tooltip,
  };
}

/**
 * Priority order for automatic AI provider failover:
 * 1. Google Gemini (primary/default)
 * 2. Groq (first fallback)
 * 3. OpenRouter (second fallback)
 */
export const AI_PROVIDER_FAILOVER_PRIORITY: AIProviderId[] = ['gemini', 'groq', 'openrouter'];

export function getFailoverProviderChain(
  preferredProvider: AIProviderId,
  autoFailoverEnabled: boolean = true
): AIProviderId[] {
  const norm = normalizeAIProviderId(preferredProvider);
  if (!autoFailoverEnabled) {
    return [norm];
  }
  const idx = AI_PROVIDER_FAILOVER_PRIORITY.indexOf(norm);
  if (idx === -1) {
    return AI_PROVIDER_FAILOVER_PRIORITY;
  }
  return AI_PROVIDER_FAILOVER_PRIORITY.slice(idx);
}

/**
 * Detects whether an error qualifies for automatic provider failover:
 * Returns true ONLY for:
 * - HTTP 429, quota exhaustion, rate limiting, RESOURCE_EXHAUSTED
 * - HTTP 503, 504, temporary server overload, high demand, or request timeout
 * Returns false for:
 * - User errors, malformed prompts, validation errors (HTTP 400)
 * - Authentication/authorization errors (HTTP 401, 403, invalid API key, permission denied)
 * - Safety blocks or content moderation refusals
 */
export function isProviderFailoverEligibleError(err: unknown): boolean {
  if (isNonFallbackClientError(err)) {
    return false;
  }

  const status = Number(
    (err as any)?.status || (err as any)?.statusCode || (err as any)?.code || 0
  );
  const msg = sanitizeProviderSecretText(err).toLowerCase();

  // Explicit safety or client refusal blocks must never trigger failover
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('harm') ||
    msg.includes('invalid_argument') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  ) {
    return false;
  }

  // Rate limits & quota exhaustion
  if (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('exhausted')
  ) {
    return true;
  }

  // Temporary server overload, high demand, service unavailable, or timeouts
  if (
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('overload') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return true;
  }

  return false;
}

export interface FailoverEventRecord {
  id: string;
  timestamp: string;
  failedProvider: AIProviderId;
  failedModel?: string;
  reasonCode: string;
  errorMessage: string;
  fallbackProvider: AIProviderId | null;
  fallbackModel?: string;
  success: boolean;
  endpoint: '/api/chat' | '/api/chat/stream' | string;
  latencyMs?: number;
}

export function extractFailoverReasonCode(err: unknown): string {
  const status = Number(
    (err as any)?.status || (err as any)?.statusCode || (err as any)?.code || 0
  );
  const providerCode = String((err as any)?.providerCode || '').trim();
  const msg = sanitizeProviderSecretText(err).toLowerCase();

  if (status === 429 || msg.includes('429')) return '429';
  if (msg.includes('resource_exhausted')) return 'RESOURCE_EXHAUSTED';
  if (msg.includes('quota')) return 'QUOTA_EXCEEDED';
  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests')) {
    return 'RATE_LIMITED';
  }
  if (status === 503 || msg.includes('503')) return '503';
  if (status === 504 || msg.includes('504') || msg.includes('timed out') || msg.includes('timeout')) {
    return '504';
  }
  if (providerCode) return providerCode;
  if (status >= 400 && status < 600) return String(status);
  return 'UNAVAILABLE';
}

export function resolveOrderedFailoverCandidates(params: {
  preferredProvider: AIProviderId;
  autoFailoverEnabled: boolean;
  isConfigured: (provider: AIProviderId) => boolean;
  cooldowns?: Map<AIProviderId, number>;
  nowMs?: number;
}): {
  orderedCandidates: AIProviderId[];
  skippedDueToCooldown: AIProviderId[];
} {
  const now = params.nowMs ?? Date.now();
  const baseChain = getFailoverProviderChain(
    params.preferredProvider,
    params.autoFailoverEnabled
  ).filter((p) => params.isConfigured(p));

  if (!params.autoFailoverEnabled || !params.cooldowns || baseChain.length <= 1) {
    return {
      orderedCandidates: baseChain,
      skippedDueToCooldown: [],
    };
  }

  const ready: AIProviderId[] = [];
  const cooling: AIProviderId[] = [];
  for (const p of baseChain) {
    const until = params.cooldowns.get(p) ?? 0;
    if (until > now) {
      cooling.push(p);
    } else {
      if (until > 0) params.cooldowns.delete(p);
      ready.push(p);
    }
  }

  return {
    orderedCandidates: [...ready, ...cooling],
    skippedDueToCooldown: ready.length > 0 ? cooling : [],
  };
}

export async function executeWithProviderFailover<T>(params: {
  preferredProvider: AIProviderId;
  autoFailoverEnabled: boolean;
  isConfigured: (provider: AIProviderId) => boolean;
  cooldowns?: Map<AIProviderId, number>;
  cooldownMs?: number;
  nowMs?: number;
  hasEmittedChunks?: () => boolean;
  attemptProvider: (provider: AIProviderId) => Promise<T>;
  onFailoverSwitch?: (event: {
    failedProvider: AIProviderId;
    reasonCode: string;
    errorMessage: string;
    fallbackProvider: AIProviderId | null;
    success: boolean;
  }) => void;
}): Promise<{
  result: T;
  providerUsed: AIProviderId;
  failoverOccurred: boolean;
  originalProvider: AIProviderId;
  reasonCode?: string;
}> {
  const now = params.nowMs ?? Date.now();
  const cooldownMs = params.cooldownMs ?? 60_000;
  const normPreferred = normalizeAIProviderId(params.preferredProvider);
  const { orderedCandidates, skippedDueToCooldown } = resolveOrderedFailoverCandidates({
    preferredProvider: normPreferred,
    autoFailoverEnabled: params.autoFailoverEnabled,
    isConfigured: params.isConfigured,
    cooldowns: params.cooldowns,
    nowMs: now,
  });

  if (orderedCandidates.length === 0) {
    const err: any = new Error(
      `${AI_PROVIDER_METADATA[normPreferred].name} is not configured on the server.`
    );
    err.status = 400;
    err.providerNotConfigured = true;
    throw err;
  }

  let lastFailedProvider: AIProviderId | null = null;
  let lastReasonCode: string | undefined = undefined;
  let lastErrorMsg = '';
  let lastErr: any = null;

  for (let i = 0; i < orderedCandidates.length; i++) {
    const provider = orderedCandidates[i];
    try {
      const result = await params.attemptProvider(provider);
      params.cooldowns?.delete(provider);
      const failoverOccurred = provider !== normPreferred;
      if (failoverOccurred && lastFailedProvider) {
        params.onFailoverSwitch?.({
          failedProvider: lastFailedProvider,
          reasonCode: lastReasonCode || '429',
          errorMessage: lastErrorMsg,
          fallbackProvider: provider,
          success: true,
        });
      } else if (failoverOccurred && skippedDueToCooldown.includes(normPreferred)) {
        params.onFailoverSwitch?.({
          failedProvider: normPreferred,
          reasonCode: 'COOLDOWN_ACTIVE',
          errorMessage: 'Preferred provider temporarily in rate-limit cooldown.',
          fallbackProvider: provider,
          success: true,
        });
      }
      return {
        result,
        providerUsed: provider,
        failoverOccurred,
        originalProvider: normPreferred,
        reasonCode: lastReasonCode,
      };
    } catch (err: any) {
      lastErr = err;
      const emitted = params.hasEmittedChunks ? params.hasEmittedChunks() : false;
      const eligible = !emitted && isProviderFailoverEligibleError(err);

      if (!eligible || !params.autoFailoverEnabled) {
        throw err;
      }

      lastFailedProvider = provider;
      lastReasonCode = extractFailoverReasonCode(err);
      lastErrorMsg = sanitizeProviderSecretText(err);
      params.cooldowns?.set(provider, now + cooldownMs);

      if (i === orderedCandidates.length - 1) {
        params.onFailoverSwitch?.({
          failedProvider: provider,
          reasonCode: lastReasonCode,
          errorMessage: lastErrorMsg,
          fallbackProvider: null,
          success: false,
        });
        const allErr: any = new Error(
          'All configured AI providers are temporarily unavailable due to rate limits or high demand. Please try again shortly.'
        );
        allErr.status = 429;
        allErr.code = 'ALL_PROVIDERS_UNAVAILABLE';
        allErr.cause = lastErr;
        throw allErr;
      }
    }
  }

  throw lastErr;
}

export function formatFailoverLocalTimestamp(isoTimestamp: string, timezone?: string): string {
  try {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return isoTimestamp;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return new Date(isoTimestamp).toLocaleString();
  }
}

function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildFailoverCsv(events: FailoverEventRecord[], timezone?: string): string {
  const headers = [
    'Event ID',
    'UTC Timestamp',
    'Local Time',
    'Failed Provider',
    'Failed Model',
    'Reason Code',
    'Fallback Provider',
    'Fallback Model',
    'Status',
    'Endpoint',
    'Latency (ms)',
    'Details',
  ];
  const rows = events.map((ev) => [
    ev.id,
    ev.timestamp,
    formatFailoverLocalTimestamp(ev.timestamp, timezone),
    AI_PROVIDER_METADATA[ev.failedProvider]?.name || ev.failedProvider,
    ev.failedModel || '',
    ev.reasonCode,
    ev.fallbackProvider ? (AI_PROVIDER_METADATA[ev.fallbackProvider]?.name || ev.fallbackProvider) : 'None',
    ev.fallbackModel || '',
    ev.success ? 'Switched' : 'All Unavailable',
    ev.endpoint,
    ev.latencyMs ?? '',
    sanitizeProviderSecretText(ev.errorMessage || ''),
  ]);
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\n');
}
