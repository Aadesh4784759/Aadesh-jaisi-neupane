import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'crypto';
import mammoth from 'mammoth';
import {
  AI_PROVIDER_METADATA,
  AIModelOption,
  AIProviderId,
  AIProviderStatusInfo,
  classifyOpenRouterModel,
  classifyProviderError,
  ConnectionHistoryEntry,
  GEMINI_QUOTA_FALLBACK_MODEL,
  GEMINI_SUPPORTED_MODELS,
  getStaticCatalogForProvider,
  GROQ_CURATED_MODELS,
  isGeminiQuotaOrRateLimitError,
  isNonFallbackClientError,
  normalizeAIProviderId,
  OPENROUTER_FALLBACK_MODELS,
  ProviderConnectionState,
  ProviderErrorLogEntry,
  resolveSafeModelForProvider,
  sanitizeProviderSecretText,
} from './src/utils/aiProviders';

dotenv.config();

const safeDirname =
  typeof import.meta !== 'undefined' && import.meta.url
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.cwd();
const OWNER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'aadeshjaisi6@gmail.com').trim().toLowerCase();

interface AuthenticatedFirebaseUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  createdAt?: string;
  isOwnerAdmin: boolean;
}

function getFirebaseWebApiKey(): string {
  const envKey = String(process.env.FIREBASE_API_KEY || '').trim();
  if (envKey) return envKey;
  const candidates = [
    path.resolve(safeDirname, 'firebase-applet-config.json'),
    path.resolve(safeDirname, '..', 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const key = String(parsed.apiKey || '').trim();
        if (key) return key;
      }
    } catch {}
  }
  return String(process.env.VITE_FIREBASE_API_KEY || '').trim();
}

const AUTH_TOKEN_CACHE_TTL_MS = 90 * 1000;
const authTokenCache = new Map<string, { expiresAt: number; user: AuthenticatedFirebaseUser }>();

function hashIdToken(idToken: string): string {
  return crypto.createHash('sha256').update(idToken).digest('hex');
}

async function verifyFirebaseUserFromRequest(req: Request): Promise<{
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
  user?: AuthenticatedFirebaseUser;
}> {
  const authHeader = String(req.headers.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Authentication required. Please sign in to access Aadesh AI.',
    };
  }

  const tokenHash = hashIdToken(idToken);
  const nowMs = Date.now();
  const cachedAuth = authTokenCache.get(tokenHash);
  if (cachedAuth && cachedAuth.expiresAt > nowMs) {
    return {
      ok: true,
      status: 200,
      user: cachedAuth.user,
    };
  }
  if (cachedAuth) {
    authTokenCache.delete(tokenHash);
  }

  const firebaseApiKey = getFirebaseWebApiKey();
  if (!firebaseApiKey) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_UNAVAILABLE',
      error: 'Firebase authentication configuration is unavailable on server.',
    };
  }

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_TOKEN',
        error: 'Invalid or expired authentication session. Please sign in again.',
      };
    }

    const data = await lookupRes.json();
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.localId || !user?.email) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_ACCOUNT',
        error: 'Unable to resolve authenticated account.',
      };
    }

    const email = String(user.email).trim().toLowerCase();
    const emailVerified = Boolean(user.emailVerified);
    if (!emailVerified) {
      return {
        ok: false,
        status: 403,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Please verify your email address before accessing Aadesh AI.',
      };
    }

    const verifiedUser: AuthenticatedFirebaseUser = {
      uid: String(user.localId),
      email,
      displayName: user.displayName,
      emailVerified,
      createdAt: user.createdAt,
      isOwnerAdmin: email === OWNER_ADMIN_EMAIL && emailVerified,
    };

    if (authTokenCache.size >= 500) {
      const firstKey = authTokenCache.keys().next().value;
      if (firstKey) authTokenCache.delete(firstKey);
    }
    authTokenCache.set(tokenHash, {
      expiresAt: Date.now() + AUTH_TOKEN_CACHE_TTL_MS,
      user: verifiedUser,
    });

    return {
      ok: true,
      status: 200,
      user: verifiedUser,
    };
  } catch {
    return {
      ok: false,
      status: 500,
      code: 'AUTH_LOOKUP_FAILED',
      error: 'Failed to verify credentials with authentication server.',
    };
  }
}

async function requireAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const result = await verifyFirebaseUserFromRequest(req);
  if (!result.ok || !result.user) {
    res.status(result.status).json({
      ok: false,
      code: result.code || 'AUTH_REQUIRED',
      error: result.error || 'Authentication required.',
    });
    return;
  }
  (req as Request & { authUser?: AuthenticatedFirebaseUser }).authUser = result.user;
  next();
}

async function verifyOwnerFromRequest(req: Request): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  user?: AuthenticatedFirebaseUser;
}> {
  const result = await verifyFirebaseUserFromRequest(req);
  if (!result.ok || !result.user) {
    return {
      ok: false,
      status: result.status,
      error: result.error || 'Authentication token required for owner dashboard.',
    };
  }

  if (!result.user.isOwnerAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'Access restricted: Only the verified platform owner can access Admin controls.',
    };
  }

  return {
    ok: true,
    status: 200,
    user: result.user,
  };
}

const getCliArg = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const eq = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
};

const cliPortRaw = getCliArg('--port');
const cliPort = cliPortRaw ? Number(cliPortRaw) : undefined;
const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const nginxPort = process.env.NGINX_PORT ? Number(process.env.NGINX_PORT) : undefined;
const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;

// In dev, never collide with NGINX_PORT (e.g. 8080) even if .env omits PORT
const PORT =
  (cliPort && Number.isFinite(cliPort) ? cliPort : undefined) ??
  (process.env.NODE_ENV !== 'production' && envPort && nginxPort && envPort === nginxPort
    ? defaultAppPort
    : envPort) ??
  defaultAppPort;

const HOST = getCliArg('--host') || '0.0.0.0';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Baseline security headers compatible with AI Studio preview iframe
app.use((_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  next();
});

const STATIC_ALLOWED_CORS_ORIGINS = new Set<string>([
  'https://aadesh-ai-global.web.app',
  'https://aadesh-ai-global.firebaseapp.com',
  'https://aadesh-jaisi-neupane.vercel.app',
]);

const ALLOWED_CORS_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/aadesh-ai-global(?:--[a-z0-9-]+)?\.(?:web\.app|firebaseapp\.com)$/i,
  /^https:\/\/aadesh-jaisi-neupane(?:-[a-z0-9-]+)?\.vercel\.app$/i,
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i,
  /^https:\/\/ais-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i,
];

export function isAllowedCorsOrigin(
  origin?: string | null,
  extraOriginsRaw: string | null | undefined = process.env.ALLOWED_ORIGINS
): boolean {
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  if (!cleanOrigin) return false;
  if (STATIC_ALLOWED_CORS_ORIGINS.has(cleanOrigin)) return true;
  if (extraOriginsRaw) {
    const extras = extraOriginsRaw
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    if (extras.includes(cleanOrigin)) return true;
  }
  return ALLOWED_CORS_ORIGIN_PATTERNS.some((pattern) => pattern.test(cleanOrigin));
}

app.use('/api', (req: Request, res: Response, next: NextFunction): void => {
  const rawOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  res.setHeader('Vary', 'Origin');

  if (rawOrigin) {
    if (isAllowedCorsOrigin(rawOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', rawOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Cache-Control'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    } else if (req.method === 'OPTIONS') {
      res.status(403).json({
        ok: false,
        error: 'Origin not allowed by CORS policy.',
      });
      return;
    }
  } else if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

export function createSlidingWindowRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}) {
  const buckets = new Map<string, number[]>();
  const { maxRequests, windowMs, keyPrefix = 'rl' } = options;

  const checkLimit = (identifier: string, nowMs: number = Date.now()) => {
    const key = `${keyPrefix}:${identifier}`;
    const cutoff = nowMs - windowMs;
    const recent = (buckets.get(key) || []).filter((ts) => ts > cutoff);
    if (recent.length >= maxRequests) {
      const oldest = recent[0] ?? nowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
      buckets.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    recent.push(nowMs);
    if (buckets.size >= 5000) {
      const firstKey = buckets.keys().next().value;
      if (firstKey) buckets.delete(firstKey);
    }
    buckets.set(key, recent);
    return { allowed: true, remaining: Math.max(0, maxRequests - recent.length), retryAfterSeconds: 0 };
  };

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    const authUid = (req as Request & { authUser?: AuthenticatedFirebaseUser }).authUser?.uid;
    const rawIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const identifier = authUid ? `uid:${authUid}` : `ip:${rawIp}`;
    const verdict = checkLimit(identifier);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    if (!verdict.allowed) {
      res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds: verdict.retryAfterSeconds,
        error: `Too many requests. Please wait ${verdict.retryAfterSeconds}s before retrying.`,
      });
      return;
    }
    next();
  };

  return { checkLimit, middleware };
}

export function validateChatPayloadBounds(body: any): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON request payload.' };
  }
  if (typeof body.currentMessage === 'string' && body.currentMessage.length > 32000) {
    return { ok: false, error: 'Message exceeds maximum length (32,000 characters).' };
  }
  if (typeof body.attachmentContent === 'string' && body.attachmentContent.length > 120000) {
    return { ok: false, error: 'Attached text exceeds maximum allowed size (120,000 characters).' };
  }
  if (typeof body.imageData === 'string' && body.imageData.length > 14 * 1024 * 1024) {
    return { ok: false, error: 'Image payload exceeds 10MB limit.' };
  }
  if (body.messages !== undefined) {
    if (!Array.isArray(body.messages)) {
      return { ok: false, error: 'Conversation history must be an array.' };
    }
    if (body.messages.length > 120) {
      return { ok: false, error: 'Conversation history slice exceeds maximum limit.' };
    }
  }
  return { ok: true };
}

const aiGenerationRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: 35,
  windowMs: 60 * 1000,
  keyPrefix: 'ai-gen',
});
const providerTestRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: 15,
  windowMs: 60 * 1000,
  keyPrefix: 'ai-test',
});
const publicGeoRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: 60,
  windowMs: 60 * 1000,
  keyPrefix: 'geo',
});

interface ServerTelemetry {
  totalApiRequests: number;
  failedApiRequests: number;
  recentErrors: Array<{ timestamp: string; route: string; message: string }>;
}

const serverTelemetry: ServerTelemetry = {
  totalApiRequests: 0,
  failedApiRequests: 0,
  recentErrors: [],
};

function recordServerError(route: string, message: string): void {
  serverTelemetry.failedApiRequests += 1;
  serverTelemetry.recentErrors.unshift({
    timestamp: new Date().toISOString(),
    route,
    message: sanitizeErrorMessage(message).slice(0, 220),
  });
  if (serverTelemetry.recentErrors.length > 20) {
    serverTelemetry.recentErrors.length = 20;
  }
}

app.use('/api', (req: Request, _res: Response, next: NextFunction): void => {
  if (req.path !== '/health') {
    serverTelemetry.totalApiRequests += 1;
  }
  next();
});
app.use('/api/providers/test', providerTestRateLimiter.middleware);
app.use('/api/geo', publicGeoRateLimiter.middleware);
app.use(['/api/chat', '/api/translate', '/api/media', '/api/study', '/api/automation'], aiGenerationRateLimiter.middleware);

app.get('/api', (_req: Request, res: Response): void => {
  res.json({
    ok: true,
    service: 'Aadesh AI Global Hub API',
    health: '/api/health',
  });
});

// Supported active Flash models ordered by priority (gemini-3.1-flash-lite prioritized for reliability and speed)
const SUPPORTED_FLASH_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-4-hydrogen',
] as const;

const GEMINI_RELIABLE_OVERLOAD_MODEL = 'gemini-3.1-flash-lite';

function isTransientOverloadError(err: unknown): boolean {
  const status = Number((err as any)?.status || (err as any)?.code || 0);
  const msg = sanitizeErrorMessage(err).toLowerCase();
  return (
    status === 503 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

function getGeminiThinkingConfig(
  model: string,
  preferredLevel?: ThinkingLevel | string
): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  // Only apply thinkingConfig to Gemini 3.x and Gemini 4.x models
  if (!model.startsWith('gemini-3') && !model.startsWith('gemini-4')) {
    return {};
  }

  const normalized = String(preferredLevel || '').toUpperCase();

  // Gemini 4 and Gemini 3.7/3.8 models reject ThinkingLevel.MINIMAL (HTTP 400 INVALID_ARGUMENT).
  if (
    model.startsWith('gemini-4') ||
    model.startsWith('gemini-3.7') ||
    model.startsWith('gemini-3.8')
  ) {
    if (normalized.includes('MINIMAL')) {
      return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
    }
    if (normalized.includes('HIGH')) {
      return { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } };
    }
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  }

  // Gemini 3.1 / 3.5 models support MINIMAL, LOW, MEDIUM, HIGH
  if (normalized.includes('LOW')) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  }
  if (normalized.includes('MEDIUM')) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } };
  }
  if (normalized.includes('HIGH')) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } };
  }
  return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
}

const DEPRECATED_MODELS = new Set([
  'gemini-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]);

function sanitizeErrorMessage(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : (err as any)?.message
        ? String((err as any).message)
        : 'Unexpected error communicating with AI provider.';

  return sanitizeProviderSecretText(raw);
}

function sanitizeModelName(rawModel?: string): string {
  const defaultModel = GEMINI_RELIABLE_OVERLOAD_MODEL;
  if (!rawModel) return defaultModel;

  let cleaned = rawModel.trim();
  // Strip wrapping single or double quotes if present in .env
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, '').trim();
  // Strip repeated "models/" prefixes (SDK prepends models/ internally)
  cleaned = cleaned.replace(/^(?:models\/)+/i, '').trim();

  // Handle accidental slash-duplicated strings
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/').pop()?.trim() || '';
  }

  // Reject API keys accidentally placed in GEMINI_MODEL and enforce gemini-* format
  if (
    /^(?:aq\.|aiza|gsk_|sk-or-)/i.test(cleaned) ||
    !/^gemini-[a-z0-9][a-z0-9._-]{1,48}$/i.test(cleaned)
  ) {
    return defaultModel;
  }

  if (DEPRECATED_MODELS.has(cleaned.toLowerCase())) {
    return defaultModel;
  }

  return cleaned;
}

function getCandidateModels(preferredGeminiModel?: string): string[] {
  const configured = sanitizeModelName(
    preferredGeminiModel || process.env.GEMINI_MODEL || GEMINI_RELIABLE_OVERLOAD_MODEL
  );
  return Array.from(new Set([configured, ...SUPPORTED_FLASH_FALLBACKS]));
}

function readCleanServerEnvKey(envName: 'GEMINI_API_KEY' | 'GROQ_API_KEY' | 'OPENROUTER_API_KEY'): string {
  const raw =
    envName === 'GEMINI_API_KEY'
      ? process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API || process.env.GOOGLE_API_KEY || ''
      : process.env[envName] || '';
  return String(raw)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

// Shared cached Gemini Client reading strictly from server-side environment variables
let cachedGeminiClientKey = '';
let cachedGeminiClientInstance: GoogleGenAI | null = null;

const getGeminiClient = () => {
  const apiKey = readCleanServerEnvKey('GEMINI_API_KEY');
  if (!apiKey) return null;

  if (cachedGeminiClientInstance && cachedGeminiClientKey === apiKey) {
    return cachedGeminiClientInstance;
  }

  cachedGeminiClientKey = apiKey;
  cachedGeminiClientInstance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return cachedGeminiClientInstance;
};

const getGroqApiKey = () => readCleanServerEnvKey('GROQ_API_KEY');
const getOpenRouterApiKey = () => readCleanServerEnvKey('OPENROUTER_API_KEY');

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
    ),
  ]);
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr: any = new Error('Aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const abortErr: any = new Error('Aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isAuthFailure(err: unknown): boolean {
  const msg = sanitizeErrorMessage(err).toLowerCase();
  const status = (err as any)?.status || (err as any)?.code;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission denied')
  );
}

const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

async function generateWithModelFallback(
  ai: GoogleGenAI,
  buildParams: (model: string) => Parameters<typeof ai.models.generateContent>[0],
  primaryTimeoutMs: number = 8000,
  fallbackTimeoutMs: number = 18000,
  preferredGeminiModel?: string
): Promise<{ response: Awaited<ReturnType<typeof ai.models.generateContent>>; modelUsed: string }> {
  const candidates = getCandidateModels(preferredGeminiModel);
  const now = Date.now();
  const prioritized = [
    ...candidates.filter((m) => (modelCooldownUntil.get(m) ?? 0) <= now),
    ...candidates.filter((m) => (modelCooldownUntil.get(m) ?? 0) > now),
  ];

  let lastError: unknown = null;

  for (let i = 0; i < prioritized.length; i++) {
    const model = prioritized[i];
    const timeoutMs = i === 0 ? primaryTimeoutMs : fallbackTimeoutMs;
    try {
      const response = await withTimeout(
        ai.models.generateContent(buildParams(model)),
        timeoutMs
      );
      modelCooldownUntil.delete(model);
      return { response, modelUsed: model };
    } catch (err) {
      lastError = err;
      if (isNonFallbackClientError(err) || isAuthFailure(err)) {
        throw err;
      }
      modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
    }
  }

  throw lastError || new Error('All configured Gemini Flash models failed to respond.');
}

function extractJsonText(rawText?: string): Record<string, any> {
  if (!rawText) return {};
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Malformed JSON payload from AI provider.');
  }
}

function buildMemoryBlock(memoryContext?: unknown): string {
  if (!Array.isArray(memoryContext) || memoryContext.length === 0) return '';
  const items = memoryContext
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    .slice(0, 20)
    .map((m, idx) => `${idx + 1}. ${m.trim().slice(0, 300)}`);
  if (items.length === 0) return '';
  return `\n\nPOWER MEMORY — USER-APPROVED PERSISTENT CONTEXT (Separate from current conversation messages; apply naturally without repeating items verbatim unless directly relevant, and never invent or claim a memory that is not listed below):\n${items.join('\n')}`;
}

// Language map reference for system prompt
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ne: 'Nepali',
  hi: 'Hindi',
  bn: 'Bengali',
  ur: 'Urdu',
  ar: 'Arabic',
  zh: 'Mandarin Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  vi: 'Vietnamese',
  tr: 'Turkish',
  sw: 'Swahili',
  tl: 'Tagalog',
};

const PERSONA_TONES: Record<string, string> = {
  calm: 'Adopt a CALM voice persona: gentle reassurance, serene patience, and thoughtful clarity.',
  energetic: 'Adopt an ENERGETIC voice persona: upbeat motivation, enthusiasm, and lively phrasing.',
  professional: 'Adopt a PROFESSIONAL voice persona: executive polish, analytical precision, and clear insights.',
  friendly: 'Adopt a FRIENDLY voice persona: warm, welcoming, empathetic, and encouraging.',
};

interface CachedGeminiHealth {
  checkedAtMs: number;
  geminiConnected: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

const GEMINI_HEALTH_CACHE_TTL_MS = 25000;
let defaultKeyHealthCache: CachedGeminiHealth | null = null;
let lastSuccessfulGeminiConnectedAt: string | null = null;

async function probeLiveGeminiConnection(
  ai: GoogleGenAI,
  candidates: string[]
): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }> {
  const startMs = Date.now();
  const targetModel = candidates[0] || sanitizeModelName(process.env.GEMINI_MODEL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    await ai.models.get({
      model: targetModel,
      config: { abortSignal: controller.signal },
    });
    return {
      ok: true,
      model: targetModel,
      latencyMs: Date.now() - startMs,
    };
  } catch (err: any) {
    if (isAuthFailure(err)) {
      return {
        ok: false,
        model: targetModel,
        latencyMs: Date.now() - startMs,
        error: 'Google Gemini rejected the server GEMINI_API_KEY configuration.',
      };
    }
    const sanitized =
      err?.name === 'AbortError'
        ? `Google Gemini health probe timed out on ${targetModel}.`
        : sanitizeErrorMessage(err);
    return {
      ok: false,
      model: targetModel,
      latencyMs: Date.now() - startMs,
      error: sanitized || 'Unable to verify Google Gemini API availability.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Multi-Provider Server Integrations (Groq & OpenRouter) ----------
const PROVIDER_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
const PROVIDER_HEALTH_CACHE_TTL_MS = 30 * 1000;

let groqModelsCache: {
  checkedAtMs: number;
  ok: boolean;
  models: AIModelOption[];
  latencyMs: number;
  error?: string;
} | null = null;

let openRouterCatalogCache: {
  checkedAtMs: number;
  models: AIModelOption[];
  freeModelsCount: number;
  paidModelsCount: number;
  source: 'live' | 'catalog';
} | null = null;

let openRouterKeyHealthCache: {
  checkedAtMs: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
} | null = null;

const PROVIDER_GENERATION_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PROVIDER_ERROR_LOGS = 3;
const MAX_CONNECTION_HISTORY = 30;

interface ProviderGenerationVerification {
  verified: boolean;
  testedAtMs: number;
  model: string;
  latencyMs: number;
  error?: string;
}

const providerGenerationVerificationCache: Partial<
  Record<AIProviderId, ProviderGenerationVerification>
> = {};

const providerErrorLogs: Record<AIProviderId, ProviderErrorLogEntry[]> = {
  gemini: [],
  groq: [],
  openrouter: [],
};

const lastSuccessfulProviderConnectedAt: Partial<Record<AIProviderId, string>> = {};

const connectionHistory: ConnectionHistoryEntry[] = [];

function appendProviderErrorLog(
  provider: AIProviderId,
  entry: Omit<ProviderErrorLogEntry, 'message'> & { message: string }
): void {
  const cleanMsg = sanitizeErrorMessage(entry.message).slice(0, 300);
  if (!cleanMsg) return;
  const list = providerErrorLogs[provider];
  list.unshift({
    id: entry.id || `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: entry.timestamp,
    model: entry.model,
    ...(entry.code ? { code: entry.code } : {}),
    message: cleanMsg,
    ...(entry.source ? { source: entry.source } : {}),
  });
  if (list.length > MAX_PROVIDER_ERROR_LOGS) {
    list.length = MAX_PROVIDER_ERROR_LOGS;
  }
}

function appendConnectionHistory(entry: Omit<ConnectionHistoryEntry, 'id'>): void {
  connectionHistory.unshift({
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    provider: entry.provider,
    model: entry.model,
    status: entry.status,
    latencyMs: Math.max(0, Math.round(entry.latencyMs || 0)),
    timestamp: entry.timestamp,
    ...(entry.source ? { source: entry.source } : {}),
    ...(entry.action ? { action: entry.action } : {}),
    ...(entry.error ? { error: sanitizeErrorMessage(entry.error).slice(0, 260) } : {}),
  });
  if (connectionHistory.length > MAX_CONNECTION_HISTORY) {
    connectionHistory.length = MAX_CONNECTION_HISTORY;
  }
}

function recordProviderGenerationResult(
  provider: AIProviderId,
  result: {
    verified: boolean;
    model: string;
    latencyMs: number;
    error?: string;
    code?: string;
    source?: 'test' | 'chat' | 'health';
  }
): void {
  const nowIso = new Date().toISOString();
  const cleanErr = result.error ? sanitizeErrorMessage(result.error) : undefined;
  if (result.verified) {
    lastSuccessfulProviderConnectedAt[provider] = nowIso;
    if (provider === 'gemini') {
      lastSuccessfulGeminiConnectedAt = nowIso;
    }
  }
  providerGenerationVerificationCache[provider] = {
    verified: result.verified,
    testedAtMs: Date.now(),
    model: result.model,
    latencyMs: result.latencyMs,
    ...(cleanErr ? { error: cleanErr } : {}),
  };

  const action: ConnectionHistoryEntry['action'] =
    result.source === 'test' ? 'test' : result.source === 'health' ? 'health_check' : 'chat';

  if (!result.verified && cleanErr) {
    appendProviderErrorLog(provider, {
      timestamp: nowIso,
      model: result.model,
      code: result.code,
      message: cleanErr,
      source: result.source || 'test',
    });
  }

  appendConnectionHistory({
    provider,
    model: result.model,
    status: result.verified ? 'success' : 'failed',
    latencyMs: result.latencyMs,
    timestamp: nowIso,
    source: result.source || 'test',
    action,
    ...(cleanErr ? { error: cleanErr } : {}),
  });
}

function getFreshProviderVerification(
  provider: AIProviderId
): ProviderGenerationVerification | null {
  const entry = providerGenerationVerificationCache[provider];
  if (!entry) return null;
  if (Date.now() - entry.testedAtMs > PROVIDER_GENERATION_CACHE_TTL_MS) {
    delete providerGenerationVerificationCache[provider];
    return null;
  }
  return entry;
}

const GROQ_CHAT_EXCLUDED_RE = /(whisper|tts|playai|orpheus|guard|safeguard|prompt-guard)/i;

async function fetchGroqModelsCached(
  apiKey: string,
  forceRefresh: boolean = false
): Promise<{ ok: boolean; models: AIModelOption[]; latencyMs: number; error?: string; source: 'live' | 'catalog' }> {
  const now = Date.now();
  if (!forceRefresh && groqModelsCache && now - groqModelsCache.checkedAtMs < PROVIDER_HEALTH_CACHE_TTL_MS) {
    return {
      ok: groqModelsCache.ok,
      models: groqModelsCache.models,
      latencyMs: groqModelsCache.latencyMs,
      error: groqModelsCache.error,
      source: groqModelsCache.ok ? 'live' : 'catalog',
    };
  }

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startMs;

    if (!res.ok) {
      let rawErr = `Groq API HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        rawErr = errJson?.error?.message || rawErr;
      } catch {}
      const classified = classifyProviderError('groq', res.status, sanitizeErrorMessage(rawErr));
      groqModelsCache = {
        checkedAtMs: Date.now(),
        ok: false,
        models: GROQ_CURATED_MODELS,
        latencyMs,
        error: classified.message,
      };
      return { ok: false, models: GROQ_CURATED_MODELS, latencyMs, error: classified.message, source: 'catalog' };
    }

    const payload = await res.json();
    const rawList: Array<{ id?: string; owned_by?: string; context_window?: number; active?: boolean }> =
      Array.isArray(payload?.data) ? payload.data : [];

    const curatedById = new Map(GROQ_CURATED_MODELS.map((m) => [m.id, m]));
    const liveChatModels: AIModelOption[] = rawList
      .filter((item) => {
        const id = String(item?.id || '').trim();
        return id.length > 0 && item?.active !== false && !GROQ_CHAT_EXCLUDED_RE.test(id);
      })
      .map((item) => {
        const id = String(item.id).trim();
        const curated = curatedById.get(id);
        return {
          id,
          name: curated?.name || id,
          provider: 'groq' as const,
          isFree: true,
          pricingLabel: 'Free tier (rate-limited)',
          contextLength:
            typeof item.context_window === 'number' && Number.isFinite(item.context_window)
              ? item.context_window
              : curated?.contextLength,
          description: curated?.description || `${item.owned_by || 'Groq'} production model on Groq LPU.`,
          isDefault: id === AI_PROVIDER_METADATA.groq.defaultModel,
          supportsVision: curated?.supportsVision ?? /llama-4-(?:scout|maverick)/i.test(id),
        };
      });

    // Sort defaults / curated production models first
    liveChatModels.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const aCurated = curatedById.has(a.id) ? 0 : 1;
      const bCurated = curatedById.has(b.id) ? 0 : 1;
      if (aCurated !== bCurated) return aCurated - bCurated;
      return a.name.localeCompare(b.name);
    });

    const models = liveChatModels.length > 0 ? liveChatModels : GROQ_CURATED_MODELS;
    groqModelsCache = {
      checkedAtMs: Date.now(),
      ok: true,
      models,
      latencyMs,
    };
    return { ok: true, models, latencyMs, source: 'live' };
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;
    const msg = sanitizeErrorMessage(
      err?.name === 'AbortError' ? 'Groq health verification timed out.' : err
    );
    groqModelsCache = {
      checkedAtMs: Date.now(),
      ok: false,
      models: GROQ_CURATED_MODELS,
      latencyMs,
      error: msg,
    };
    return { ok: false, models: GROQ_CURATED_MODELS, latencyMs, error: msg, source: 'catalog' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenRouterCatalogCached(
  forceRefresh: boolean = false
): Promise<{
  models: AIModelOption[];
  freeModelsCount: number;
  paidModelsCount: number;
  source: 'live' | 'catalog';
}> {
  const now = Date.now();
  if (!forceRefresh && openRouterCatalogCache && now - openRouterCatalogCache.checkedAtMs < PROVIDER_MODELS_CACHE_TTL_MS) {
    return {
      models: openRouterCatalogCache.models,
      freeModelsCount: openRouterCatalogCache.freeModelsCount,
      paidModelsCount: openRouterCatalogCache.paidModelsCount,
      source: openRouterCatalogCache.source,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const apiKey = getOpenRouterApiKey();
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`OpenRouter models catalog returned HTTP ${res.status}`);
    }

    const payload = await res.json();
    const rawModels: any[] = Array.isArray(payload?.data) ? payload.data : [];
    const parsedAll: AIModelOption[] = [];
    for (const item of rawModels) {
      const classified = classifyOpenRouterModel(item);
      if (classified) parsedAll.push(classified);
    }

    const freeModels = parsedAll.filter((m) => m.isFree);
    const paidModels = parsedAll.filter((m) => !m.isFree);

    freeModels.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    paidModels.sort((a, b) => a.name.localeCompare(b.name));

    // Store ALL live OpenRouter free + paid models so validation covers every active OpenRouter ID
    const combined = [...freeModels, ...paidModels];
    if (combined.length === 0) {
      throw new Error('OpenRouter catalog returned zero models.');
    }

    openRouterCatalogCache = {
      checkedAtMs: Date.now(),
      models: combined,
      freeModelsCount: freeModels.length,
      paidModelsCount: paidModels.length,
      source: 'live',
    };
    return {
      models: combined,
      freeModelsCount: freeModels.length,
      paidModelsCount: paidModels.length,
      source: 'live',
    };
  } catch {
    openRouterCatalogCache = {
      checkedAtMs: Date.now(),
      models: OPENROUTER_FALLBACK_MODELS,
      freeModelsCount: OPENROUTER_FALLBACK_MODELS.filter((m) => m.isFree).length,
      paidModelsCount: 0,
      source: 'catalog',
    };
    return {
      models: OPENROUTER_FALLBACK_MODELS,
      freeModelsCount: OPENROUTER_FALLBACK_MODELS.filter((m) => m.isFree).length,
      paidModelsCount: 0,
      source: 'catalog',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyOpenRouterKeyCached(
  apiKey: string,
  forceRefresh: boolean = false
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const now = Date.now();
  if (!forceRefresh && openRouterKeyHealthCache && now - openRouterKeyHealthCache.checkedAtMs < PROVIDER_HEALTH_CACHE_TTL_MS) {
    return {
      ok: openRouterKeyHealthCache.ok,
      latencyMs: openRouterKeyHealthCache.latencyMs,
      error: openRouterKeyHealthCache.error,
    };
  }

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startMs;

    if (!res.ok) {
      let rawErr = `OpenRouter key verification HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        rawErr = errJson?.error?.message || rawErr;
      } catch {}
      const classified = classifyProviderError('openrouter', res.status, sanitizeErrorMessage(rawErr));
      openRouterKeyHealthCache = {
        checkedAtMs: Date.now(),
        ok: false,
        latencyMs,
        error: classified.message,
      };
      return { ok: false, latencyMs, error: classified.message };
    }

    openRouterKeyHealthCache = {
      checkedAtMs: Date.now(),
      ok: true,
      latencyMs,
    };
    return { ok: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;
    const msg = sanitizeErrorMessage(
      err?.name === 'AbortError' ? 'OpenRouter verification timed out.' : err
    );
    openRouterKeyHealthCache = {
      checkedAtMs: Date.now(),
      ok: false,
      latencyMs,
      error: msg,
    };
    return { ok: false, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function getGeminiProviderStatus(
  forceRefresh: boolean = false,
  requestedGeminiModel?: string
): Promise<{
  statusInfo: AIProviderStatusInfo;
  geminiProbeOk: boolean;
  checkedAtIso: string;
}> {
  const ai = getGeminiClient();
  const candidates = getCandidateModels();
  const targetModel =
    requestedGeminiModel && requestedGeminiModel.trim()
      ? sanitizeModelName(requestedGeminiModel)
      : candidates[0];
  const meta = AI_PROVIDER_METADATA.gemini;

  if (!ai) {
    const checkedAtIso = new Date().toISOString();
    return {
      geminiProbeOk: false,
      checkedAtIso,
      statusInfo: {
        id: 'gemini',
        name: meta.name,
        badge: 'Default',
        description: meta.description,
        envVarName: meta.envVarName,
        configured: false,
        status: 'not_configured',
        defaultModel: meta.defaultModel,
        activeModel: targetModel,
        models: GEMINI_SUPPORTED_MODELS,
        freeModelsCount: GEMINI_SUPPORTED_MODELS.length,
        paidModelsCount: 0,
        latencyMs: 0,
        checkedAt: checkedAtIso,
        error: 'GEMINI_API_KEY is not configured on the server.',
        errorLog: [...providerErrorLogs.gemini],
        source: 'catalog',
      },
    };
  }

  const now = Date.now();
  const verification = getFreshProviderVerification('gemini');

  if (
    !forceRefresh &&
    defaultKeyHealthCache &&
    defaultKeyHealthCache.model === targetModel &&
    now - defaultKeyHealthCache.checkedAtMs < GEMINI_HEALTH_CACHE_TTL_MS
  ) {
    const checkedAtIso = new Date(defaultKeyHealthCache.checkedAtMs).toISOString();
    let status: ProviderConnectionState = 'configured';
    let errorMsg = defaultKeyHealthCache.error;
    if (!defaultKeyHealthCache.geminiConnected) {
      status = 'error';
    } else if (verification?.verified) {
      status = 'connected';
      errorMsg = undefined;
    } else if (verification && !verification.verified && verification.error) {
      status = 'error';
      errorMsg = verification.error;
    } else {
      status = 'configured';
    }

    const isVerified = Boolean(verification?.verified && defaultKeyHealthCache.geminiConnected);
    return {
      geminiProbeOk: defaultKeyHealthCache.geminiConnected,
      checkedAtIso,
      statusInfo: {
        id: 'gemini',
        name: meta.name,
        badge: 'Default',
        description: meta.description,
        envVarName: meta.envVarName,
        configured: true,
        status,
        generationVerified: isVerified,
        lastTestedAt: verification ? new Date(verification.testedAtMs).toISOString() : null,
        ...(verification?.verified ? { lastVerifiedModel: verification.model } : {}),
        defaultModel: meta.defaultModel,
        activeModel: verification?.verified ? verification.model : defaultKeyHealthCache.model,
        models: GEMINI_SUPPORTED_MODELS,
        freeModelsCount: GEMINI_SUPPORTED_MODELS.length,
        paidModelsCount: 0,
        latencyMs: verification?.latencyMs ?? defaultKeyHealthCache.latencyMs,
        checkedAt: checkedAtIso,
        ...(errorMsg ? { error: errorMsg } : {}),
        errorLog: [...providerErrorLogs.gemini],
        source: 'live',
      },
    };
  }

  const probe = await probeLiveGeminiConnection(ai, [targetModel]);
  const checkedAtIso = new Date().toISOString();
  if (probe.ok) {
    lastSuccessfulGeminiConnectedAt = checkedAtIso;
  }
  defaultKeyHealthCache = {
    checkedAtMs: Date.now(),
    geminiConnected: probe.ok,
    model: probe.model,
    latencyMs: probe.latencyMs,
    error: probe.error,
  };

  let status: ProviderConnectionState = 'configured';
  let errorMsg = probe.error;
  if (!probe.ok) {
    status = 'error';
  } else if (verification?.verified) {
    status = 'connected';
    errorMsg = undefined;
  } else if (verification && !verification.verified && verification.error) {
    status = 'error';
    errorMsg = verification.error;
  } else {
    status = 'configured';
  }

  const isVerified = Boolean(verification?.verified && probe.ok);
  return {
    geminiProbeOk: probe.ok,
    checkedAtIso,
    statusInfo: {
      id: 'gemini',
      name: meta.name,
      badge: 'Default',
      description: meta.description,
      envVarName: meta.envVarName,
      configured: true,
      status,
      generationVerified: isVerified,
      lastTestedAt: verification ? new Date(verification.testedAtMs).toISOString() : null,
      ...(verification?.verified ? { lastVerifiedModel: verification.model } : {}),
      defaultModel: meta.defaultModel,
      activeModel: verification?.verified ? verification.model : probe.model,
      models: GEMINI_SUPPORTED_MODELS,
      freeModelsCount: GEMINI_SUPPORTED_MODELS.length,
      paidModelsCount: 0,
      latencyMs: verification?.latencyMs ?? probe.latencyMs,
      checkedAt: checkedAtIso,
      ...(errorMsg ? { error: errorMsg } : {}),
      errorLog: [...providerErrorLogs.gemini],
      source: 'live',
    },
  };
}

async function getGroqProviderStatus(forceRefresh: boolean = false): Promise<AIProviderStatusInfo> {
  const apiKey = getGroqApiKey();
  const meta = AI_PROVIDER_METADATA.groq;
  const checkedAtIso = new Date().toISOString();

  if (!apiKey) {
    return {
      id: 'groq',
      name: meta.name,
      badge: 'Ultra-Fast LPU',
      description: meta.description,
      envVarName: meta.envVarName,
      configured: false,
      status: 'not_configured',
      generationVerified: false,
      defaultModel: meta.defaultModel,
      activeModel: meta.defaultModel,
      models: GROQ_CURATED_MODELS,
      freeModelsCount: GROQ_CURATED_MODELS.length,
      paidModelsCount: 0,
      latencyMs: 0,
      checkedAt: checkedAtIso,
      error: 'GROQ_API_KEY is not configured in server environment variables.',
      errorLog: [...providerErrorLogs.groq],
      source: 'catalog',
    };
  }

  const probe = await fetchGroqModelsCached(apiKey, forceRefresh);
  const resolved = resolveSafeModelForProvider('groq', probe.models, meta.defaultModel);
  const verification = getFreshProviderVerification('groq');

  let status: ProviderConnectionState = 'configured';
  let errorMsg = probe.error;
  if (!probe.ok) {
    status = 'error';
  } else if (verification?.verified) {
    status = 'connected';
    errorMsg = undefined;
  } else if (verification && !verification.verified && verification.error) {
    status = 'error';
    errorMsg = verification.error;
  } else {
    status = 'configured';
  }

  return {
    id: 'groq',
    name: meta.name,
    badge: 'Ultra-Fast LPU',
    description: meta.description,
    envVarName: meta.envVarName,
    configured: true,
    status,
    generationVerified: Boolean(verification?.verified && probe.ok),
    lastTestedAt: verification ? new Date(verification.testedAtMs).toISOString() : null,
    ...(verification?.verified ? { lastVerifiedModel: verification.model } : {}),
    defaultModel: meta.defaultModel,
    activeModel: verification?.verified ? verification.model : resolved.modelId,
    models: probe.models,
    freeModelsCount: probe.models.filter((m) => m.isFree).length,
    paidModelsCount: probe.models.filter((m) => !m.isFree).length,
    latencyMs: verification?.latencyMs ?? probe.latencyMs,
    checkedAt: checkedAtIso,
    ...(errorMsg ? { error: errorMsg } : {}),
    errorLog: [...providerErrorLogs.groq],
    source: probe.source,
  };
}

async function getOpenRouterProviderStatus(forceRefresh: boolean = false): Promise<AIProviderStatusInfo> {
  const apiKey = getOpenRouterApiKey();
  const meta = AI_PROVIDER_METADATA.openrouter;
  const checkedAtIso = new Date().toISOString();

  const [catalog, keyCheck] = await Promise.all([
    fetchOpenRouterCatalogCached(forceRefresh),
    apiKey ? verifyOpenRouterKeyCached(apiKey, forceRefresh) : Promise.resolve(null),
  ]);

  const resolvedDefault = resolveSafeModelForProvider('openrouter', catalog.models, meta.defaultModel, {
    allowPaidExplicit: false,
  });

  if (!apiKey) {
    return {
      id: 'openrouter',
      name: meta.name,
      badge: 'Free & Paid Models',
      description: meta.description,
      envVarName: meta.envVarName,
      configured: false,
      status: 'not_configured',
      generationVerified: false,
      defaultModel: resolvedDefault.modelId,
      activeModel: resolvedDefault.modelId,
      models: catalog.models,
      freeModelsCount: catalog.freeModelsCount,
      paidModelsCount: catalog.paidModelsCount,
      latencyMs: 0,
      checkedAt: checkedAtIso,
      error: 'OPENROUTER_API_KEY is not configured in server environment variables.',
      errorLog: [...providerErrorLogs.openrouter],
      source: catalog.source,
    };
  }

  const verification = getFreshProviderVerification('openrouter');
  let status: ProviderConnectionState = 'configured';
  let errorMsg = keyCheck?.error;
  if (!keyCheck?.ok) {
    status = 'error';
  } else if (verification?.verified) {
    status = 'connected';
    errorMsg = undefined;
  } else if (verification && !verification.verified && verification.error) {
    status = 'error';
    errorMsg = verification.error;
  } else {
    status = 'configured';
  }

  return {
    id: 'openrouter',
    name: meta.name,
    badge: 'Free & Paid Models',
    description: meta.description,
    envVarName: meta.envVarName,
    configured: true,
    status,
    generationVerified: Boolean(verification?.verified && keyCheck?.ok),
    lastTestedAt: verification ? new Date(verification.testedAtMs).toISOString() : null,
    ...(verification?.verified ? { lastVerifiedModel: verification.model } : {}),
    defaultModel: resolvedDefault.modelId,
    activeModel: verification?.verified ? verification.model : resolvedDefault.modelId,
    models: catalog.models,
    freeModelsCount: catalog.freeModelsCount,
    paidModelsCount: catalog.paidModelsCount,
    latencyMs: verification?.latencyMs ?? keyCheck?.latencyMs ?? 0,
    checkedAt: checkedAtIso,
    ...(errorMsg ? { error: errorMsg } : {}),
    errorLog: [...providerErrorLogs.openrouter],
    source: catalog.source,
  };
}

async function getAllProviderStatuses(
  forceRefresh: boolean = false,
  requestedGeminiModel?: string
): Promise<{
  providers: Record<AIProviderId, AIProviderStatusInfo>;
  geminiProbeOk: boolean;
  checkedAtIso: string;
}> {
  const [geminiRes, groqStatus, openRouterStatus] = await Promise.all([
    getGeminiProviderStatus(forceRefresh, requestedGeminiModel),
    getGroqProviderStatus(forceRefresh),
    getOpenRouterProviderStatus(forceRefresh),
  ]);

  return {
    providers: {
      gemini: geminiRes.statusInfo,
      groq: groqStatus,
      openrouter: openRouterStatus,
    },
    geminiProbeOk: geminiRes.geminiProbeOk,
    checkedAtIso: geminiRes.checkedAtIso,
  };
}

interface OpenAIMessagePart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

function buildOpenAICompatibleMessages(params: {
  provider: 'groq' | 'openrouter';
  modelId: string;
  supportsVision: boolean;
  systemInstruction: string;
  messages?: any[];
  currentTextPrompt: string;
  imageData?: string;
  imageMimeType?: string;
}): Array<{ role: 'system' | 'user' | 'assistant'; content: string | OpenAIMessagePart[] }> {
  if (params.imageData && !params.supportsVision) {
    const err: any = new Error(
      `The selected ${AI_PROVIDER_METADATA[params.provider].name} model (${params.modelId}) does not support image inputs. Choose a vision-capable model or switch to Google Gemini.`
    );
    err.status = 400;
    throw err;
  }

  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string | OpenAIMessagePart[] }> = [
    { role: 'system', content: params.systemInstruction },
  ];

  if (Array.isArray(params.messages)) {
    for (const msg of params.messages.slice(-6)) {
      if (!msg?.content || msg.isError) continue;
      out.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content),
      });
    }
  }

  let finalContent: string | OpenAIMessagePart[] = params.currentTextPrompt;
  if (params.imageData && typeof params.imageData === 'string') {
    const imageUrl = params.imageData.startsWith('data:')
      ? params.imageData
      : `data:${params.imageMimeType || 'image/jpeg'};base64,${params.imageData}`;
    finalContent = [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: params.currentTextPrompt },
    ];
  }

  const last = out[out.length - 1];
  if (
    last &&
    last.role === 'user' &&
    typeof last.content === 'string' &&
    last.content === params.currentTextPrompt &&
    typeof finalContent === 'string'
  ) {
    out[out.length - 1] = { role: 'user', content: finalContent };
  } else {
    out.push({ role: 'user', content: finalContent });
  }

  return out;
}

function getOpenAICompatibleEndpointConfig(
  provider: 'groq' | 'openrouter',
  apiKey: string
): { url: string; headers: Record<string, string> } {
  if (provider === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    };
  }
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'https://aadesh-ai.vercel.app',
      'X-Title': 'Aadesh AI',
    },
  };
}

async function callOpenAICompatibleCompletion(params: {
  provider: 'groq' | 'openrouter';
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | OpenAIMessagePart[] }>;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  allowFreeRouterFallback?: boolean;
}): Promise<{ text: string; modelUsed: string }> {
  const { url, headers } = getOpenAICompatibleEndpointConfig(params.provider, params.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs || 22000);

  try {
    const bodyPayload: Record<string, any> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.5,
      stream: false,
    };
    if (params.jsonMode) {
      bodyPayload.response_format = { type: 'json_object' };
    }

    let res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    // Some OpenRouter models reject response_format json_object with HTTP 400; retry cleanly without json_object flag
    if (!res.ok && res.status === 400 && params.jsonMode) {
      delete bodyPayload.response_format;
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    }

    // If a specific OpenRouter :free model has no upstream endpoints (HTTP 404), retry once with OpenRouter's free router
    if (
      !res.ok &&
      res.status === 404 &&
      params.provider === 'openrouter' &&
      params.allowFreeRouterFallback &&
      params.model !== 'openrouter/free'
    ) {
      bodyPayload.model = 'openrouter/free';
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      let errText = `${AI_PROVIDER_METADATA[params.provider].name} HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errText = errJson?.error?.message || errJson?.message || errText;
      } catch {}
      const classified = classifyProviderError(params.provider, res.status, sanitizeErrorMessage(errText));
      const err: any = new Error(classified.message);
      err.status = classified.httpStatus;
      err.providerCode = classified.code;
      throw err;
    }

    const data = await res.json();
    const contentRaw = data?.choices?.[0]?.message?.content;
    const text =
      typeof contentRaw === 'string'
        ? contentRaw
        : Array.isArray(contentRaw)
        ? contentRaw.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('')
        : '';

    if (!text.trim()) {
      throw new Error(`${AI_PROVIDER_METADATA[params.provider].name} returned an empty response.`);
    }

    return {
      text,
      modelUsed: String(data?.model || params.model),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const timeoutErr: any = new Error(
        `${AI_PROVIDER_METADATA[params.provider].name} request timed out. Please retry.`
      );
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function streamOpenAICompatibleCompletion(params: {
  provider: 'groq' | 'openrouter';
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | OpenAIMessagePart[] }>;
  temperature?: number;
  allowFreeRouterFallback?: boolean;
  onChunk: (chunk: string) => void;
  isAborted: () => boolean;
}): Promise<{ modelUsed: string; totalChars: number }> {
  const { url, headers } = getOpenAICompatibleEndpointConfig(params.provider, params.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    let activeModel = params.model;
    let res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: activeModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.5,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (
      (!res.ok || !res.body) &&
      res.status === 404 &&
      params.provider === 'openrouter' &&
      params.allowFreeRouterFallback &&
      activeModel !== 'openrouter/free'
    ) {
      activeModel = 'openrouter/free';
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: activeModel,
          messages: params.messages,
          temperature: params.temperature ?? 0.5,
          stream: true,
        }),
        signal: controller.signal,
      });
    }

    if (!res.ok || !res.body) {
      let errText = `${AI_PROVIDER_METADATA[params.provider].name} HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errText = errJson?.error?.message || errJson?.message || errText;
      } catch {}
      const classified = classifyProviderError(params.provider, res.status, sanitizeErrorMessage(errText));
      const err: any = new Error(classified.message);
      err.status = classified.httpStatus;
      err.providerCode = classified.code;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalChars = 0;
    let modelUsed = activeModel;

    while (!params.isAborted()) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          return { modelUsed, totalChars };
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed?.error?.message) {
            const classified = classifyProviderError(
              params.provider,
              Number(parsed.error.code) || 502,
              sanitizeErrorMessage(parsed.error.message)
            );
            const streamErr: any = new Error(classified.message);
            streamErr.status = classified.httpStatus;
            throw streamErr;
          }
          if (typeof parsed?.model === 'string' && parsed.model.trim()) {
            modelUsed = parsed.model.trim();
          }
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            totalChars += delta.length;
            params.onChunk(delta);
          }
        } catch (parseErr: any) {
          if (parseErr?.status) throw parseErr;
        }
      }
    }

    return { modelUsed, totalChars };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const timeoutErr: any = new Error(
        `${AI_PROVIDER_METADATA[params.provider].name} stream timed out. Please retry.`
      );
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// HEALTH & REAL-TIME MULTI-PROVIDER CONNECTION STATUS CHECK
app.get('/api/health', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';
  const requestedProvider = normalizeAIProviderId(req.query.provider);
  const requestedModelParam =
    requestedProvider === 'gemini' && typeof req.query.model === 'string' && req.query.model.trim()
      ? req.query.model.trim()
      : undefined;
  const { providers, geminiProbeOk, checkedAtIso } = await getAllProviderStatuses(
    forceRefresh,
    requestedModelParam
  );

  const activeInfo = providers[requestedProvider];
  const providerSummary: Record<
    AIProviderId,
    Pick<
      AIProviderStatusInfo,
      | 'id'
      | 'name'
      | 'badge'
      | 'envVarName'
      | 'configured'
      | 'status'
      | 'generationVerified'
      | 'lastTestedAt'
      | 'lastVerifiedModel'
      | 'defaultModel'
      | 'activeModel'
      | 'freeModelsCount'
      | 'paidModelsCount'
      | 'latencyMs'
      | 'checkedAt'
      | 'error'
      | 'errorLog'
    >
  > = {
    gemini: {
      id: providers.gemini.id,
      name: providers.gemini.name,
      badge: providers.gemini.badge,
      envVarName: providers.gemini.envVarName,
      configured: providers.gemini.configured,
      status: providers.gemini.status,
      generationVerified: Boolean(providers.gemini.generationVerified),
      lastTestedAt: providers.gemini.lastTestedAt ?? null,
      ...(providers.gemini.lastVerifiedModel ? { lastVerifiedModel: providers.gemini.lastVerifiedModel } : {}),
      defaultModel: providers.gemini.defaultModel,
      activeModel: providers.gemini.activeModel,
      freeModelsCount: providers.gemini.freeModelsCount,
      paidModelsCount: providers.gemini.paidModelsCount,
      latencyMs: providers.gemini.latencyMs,
      checkedAt: providers.gemini.checkedAt,
      ...(providers.gemini.error ? { error: providers.gemini.error } : {}),
      errorLog: providers.gemini.errorLog || [],
    },
    groq: {
      id: providers.groq.id,
      name: providers.groq.name,
      badge: providers.groq.badge,
      envVarName: providers.groq.envVarName,
      configured: providers.groq.configured,
      status: providers.groq.status,
      generationVerified: Boolean(providers.groq.generationVerified),
      lastTestedAt: providers.groq.lastTestedAt ?? null,
      ...(providers.groq.lastVerifiedModel ? { lastVerifiedModel: providers.groq.lastVerifiedModel } : {}),
      defaultModel: providers.groq.defaultModel,
      activeModel: providers.groq.activeModel,
      freeModelsCount: providers.groq.freeModelsCount,
      paidModelsCount: providers.groq.paidModelsCount,
      latencyMs: providers.groq.latencyMs,
      checkedAt: providers.groq.checkedAt,
      ...(providers.groq.error ? { error: providers.groq.error } : {}),
      errorLog: providers.groq.errorLog || [],
    },
    openrouter: {
      id: providers.openrouter.id,
      name: providers.openrouter.name,
      badge: providers.openrouter.badge,
      envVarName: providers.openrouter.envVarName,
      configured: providers.openrouter.configured,
      status: providers.openrouter.status,
      generationVerified: Boolean(providers.openrouter.generationVerified),
      lastTestedAt: providers.openrouter.lastTestedAt ?? null,
      ...(providers.openrouter.lastVerifiedModel ? { lastVerifiedModel: providers.openrouter.lastVerifiedModel } : {}),
      defaultModel: providers.openrouter.defaultModel,
      activeModel: providers.openrouter.activeModel,
      freeModelsCount: providers.openrouter.freeModelsCount,
      paidModelsCount: providers.openrouter.paidModelsCount,
      latencyMs: providers.openrouter.latencyMs,
      checkedAt: providers.openrouter.checkedAt,
      ...(providers.openrouter.error ? { error: providers.openrouter.error } : {}),
      errorLog: providers.openrouter.errorLog || [],
    },
  };

  res.json({
    status: 'ok',
    authRequired: true,
    backendConnected: true,
    activeProvider: requestedProvider,
    activeProviderConfigured: activeInfo.configured,
    activeProviderVerified: Boolean(activeInfo.generationVerified),
    geminiConnected: geminiProbeOk,
    aiService: activeInfo.status,
    isLiveAI: activeInfo.status === 'connected' && Boolean(activeInfo.generationVerified),
    model: activeInfo.activeModel,
    fallbackModels: requestedProvider === 'gemini' ? getCandidateModels().filter((m) => m !== activeInfo.activeModel) : [],
    providers: providerSummary,
    connectionHistory: connectionHistory.slice(0, 30),
    checkedAt: activeInfo.checkedAt || checkedAtIso,
    lastConnectedAt:
      lastSuccessfulProviderConnectedAt[requestedProvider] ||
      (activeInfo.generationVerified ? activeInfo.lastTestedAt ?? null : null) ||
      (requestedProvider === 'gemini' ? lastSuccessfulGeminiConnectedAt : null),
    latencyMs: activeInfo.latencyMs ?? 0,
    ...(activeInfo.error ? { error: activeInfo.error } : {}),
    version: '2.6.0',
    platform: 'Aadesh AI',
  });
});

// FULL MULTI-PROVIDER STATUS & SUPPORTED MODEL CATALOGS (ZERO API KEYS EXPOSED)
app.get('/api/providers/status', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';
  const { providers, checkedAtIso } = await getAllProviderStatuses(forceRefresh);
  res.json({
    ok: true,
    defaultProvider: 'gemini' as AIProviderId,
    providers,
    connectionHistory: connectionHistory.slice(0, 30),
    checkedAt: checkedAtIso,
  });
});

// LAST 3 SPECIFIC ERROR MESSAGES PER AI PROVIDER (ZERO API KEYS EXPOSED)
app.get('/api/providers/errors', requireAuthenticatedUser, (_req: Request, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    ok: true,
    errors: {
      gemini: providerErrorLogs.gemini.slice(0, 3),
      groq: providerErrorLogs.groq.slice(0, 3),
      openrouter: providerErrorLogs.openrouter.slice(0, 3),
    },
    checkedAt: new Date().toISOString(),
  });
});

app.get('/api/providers/models', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const provider = normalizeAIProviderId(req.query.provider);
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';

  if (provider === 'groq') {
    const statusInfo = await getGroqProviderStatus(forceRefresh);
    res.json({
      ok: true,
      provider,
      configured: statusInfo.configured,
      status: statusInfo.status,
      defaultModel: statusInfo.defaultModel,
      models: statusInfo.models,
      freeModelsCount: statusInfo.freeModelsCount,
      paidModelsCount: statusInfo.paidModelsCount,
    });
    return;
  }

  if (provider === 'openrouter') {
    const statusInfo = await getOpenRouterProviderStatus(forceRefresh);
    res.json({
      ok: true,
      provider,
      configured: statusInfo.configured,
      status: statusInfo.status,
      defaultModel: statusInfo.defaultModel,
      models: statusInfo.models,
      freeModelsCount: statusInfo.freeModelsCount,
      paidModelsCount: statusInfo.paidModelsCount,
    });
    return;
  }

  const geminiRes = await getGeminiProviderStatus(forceRefresh);
  res.json({
    ok: true,
    provider: 'gemini',
    configured: geminiRes.statusInfo.configured,
    status: geminiRes.statusInfo.status,
    generationVerified: Boolean(geminiRes.statusInfo.generationVerified),
    defaultModel: geminiRes.statusInfo.defaultModel,
    models: geminiRes.statusInfo.models,
    freeModelsCount: geminiRes.statusInfo.freeModelsCount,
    paidModelsCount: 0,
  });
});

// REAL AI GENERATION CONNECTION TEST ENDPOINT (tests actual AI generation, not just key presence)
app.post('/api/providers/test', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const provider = normalizeAIProviderId(req.body?.provider);
  const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  const meta = AI_PROVIDER_METADATA[provider];
  const startMs = Date.now();

  try {
    if (provider === 'gemini') {
      const ai = getGeminiClient();
      if (!ai) {
        const statusInfo = (await getGeminiProviderStatus(true)).statusInfo;
        res.status(400).json({
          ok: false,
          provider,
          configured: false,
          status: 'not_configured',
          generationVerified: false,
          error: `${meta.name} is not configured on the server. Set ${meta.envVarName} in environment variables.`,
          statusInfo,
        });
        return;
      }

      const resolved = resolveSafeModelForProvider('gemini', GEMINI_SUPPORTED_MODELS, requestedModel, {
        allowPaidExplicit: false,
      });
      const targetModel = resolved.modelId;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let testResult: any = null;
      try {
        const thinkingCfg = getGeminiThinkingConfig(targetModel, ThinkingLevel.MINIMAL);
        testResult = await ai.models.generateContent({
          model: targetModel,
          contents: 'Reply with only the single word: OK',
          config: {
            ...thinkingCfg,
            abortSignal: controller.signal,
          },
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          const timeoutErr: any = new Error(`Google Gemini (${targetModel}) request timed out after 10s.`);
          timeoutErr.status = 504;
          throw timeoutErr;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      const usedModel = targetModel;
      const replyPreview = String(testResult?.text || '').trim().slice(0, 80);
      if (!replyPreview) {
        throw new Error(`Google Gemini (${targetModel}) returned an empty test response.`);
      }

      const latencyMs = Date.now() - startMs;
      recordProviderGenerationResult('gemini', {
        verified: true,
        model: usedModel,
        latencyMs,
        source: 'test',
      });
      defaultKeyHealthCache = {
        checkedAtMs: Date.now(),
        geminiConnected: true,
        model: usedModel,
        latencyMs,
      };
      lastSuccessfulGeminiConnectedAt = new Date().toISOString();
      const statusInfo = (await getGeminiProviderStatus(false)).statusInfo;
      res.json({
        ok: true,
        provider,
        configured: true,
        status: 'connected',
        generationVerified: true,
        modelUsed: usedModel,
        latencyMs,
        replyPreview,
        message: `Verified real ${meta.name} generation on ${usedModel} (${latencyMs} ms).`,
        statusInfo,
        connectionHistory: connectionHistory.slice(0, 30),
      });
      return;
    }

    const apiKey = provider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
    if (!apiKey) {
      const errMsg = `${meta.name} is not configured on the server. Set ${meta.envVarName} in environment variables.`;
      recordProviderGenerationResult(provider, {
        verified: false,
        model: requestedModel || meta.defaultModel,
        latencyMs: Date.now() - startMs,
        error: errMsg,
        code: 'MISSING_API_KEY',
        source: 'test',
      });
      const statusInfo =
        provider === 'groq'
          ? await getGroqProviderStatus(true)
          : await getOpenRouterProviderStatus(true);
      res.status(400).json({
        ok: false,
        provider,
        configured: false,
        status: 'not_configured',
        generationVerified: false,
        error: errMsg,
        statusInfo,
        connectionHistory: connectionHistory.slice(0, 30),
      });
      return;
    }

    let catalogModels: AIModelOption[];
    let catalogSource: 'live' | 'catalog';

    if (provider === 'groq') {
      const groqProbe = await fetchGroqModelsCached(apiKey, true);
      if (!groqProbe.ok) {
        const latencyMs = Date.now() - startMs;
        const errMsg = groqProbe.error || `${meta.name} model endpoint failed.`;
        recordProviderGenerationResult(provider, {
          verified: false,
          model: requestedModel || meta.defaultModel,
          latencyMs,
          error: errMsg,
          code: 'PROVIDER_ERROR',
          source: 'test',
        });
        const statusInfo = await getGroqProviderStatus(false);
        res.status(400).json({
          ok: false,
          provider,
          configured: true,
          status: 'error',
          generationVerified: false,
          latencyMs,
          error: errMsg,
          statusInfo,
          connectionHistory: connectionHistory.slice(0, 30),
        });
        return;
      }
      catalogModels = groqProbe.models;
      catalogSource = groqProbe.source;
    } else {
      const orCatalog = await fetchOpenRouterCatalogCached(true);
      catalogModels = orCatalog.models;
      catalogSource = orCatalog.source;
    }

    const resolvedModel = resolveSafeModelForProvider(
      provider,
      catalogModels,
      requestedModel,
      {
        allowPaidExplicit: Boolean(requestedModel),
        requireInCatalog: catalogSource === 'live',
      }
    );

    const { text, modelUsed } = await callOpenAICompatibleCompletion({
      provider,
      apiKey,
      model: resolvedModel.modelId,
      messages: [
        { role: 'system', content: 'Respond concisely.' },
        { role: 'user', content: 'Reply with only the single word: OK' },
      ],
      temperature: 0,
      jsonMode: false,
      timeoutMs: 14000,
      allowFreeRouterFallback: provider === 'openrouter' && resolvedModel.isFree,
    });

    const latencyMs = Date.now() - startMs;
    recordProviderGenerationResult(provider, {
      verified: true,
      model: modelUsed,
      latencyMs,
      source: 'test',
    });
    const statusInfo =
      provider === 'groq'
        ? await getGroqProviderStatus(false)
        : await getOpenRouterProviderStatus(false);

    res.json({
      ok: true,
      provider,
      configured: true,
      status: 'connected',
      generationVerified: true,
      modelUsed,
      latencyMs,
      replyPreview: text.trim().slice(0, 80),
      message: `Verified real ${meta.name} generation on ${modelUsed} (${latencyMs} ms).`,
      statusInfo,
      connectionHistory: connectionHistory.slice(0, 30),
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;
    const safeError = sanitizeErrorMessage(err);
    const classified = classifyProviderError(provider, Number(err?.status) || 502, safeError);
    recordProviderGenerationResult(provider, {
      verified: false,
      model: requestedModel || meta.defaultModel,
      latencyMs,
      error: classified.message,
      code: classified.code,
      source: 'test',
    });
    const statusInfo =
      provider === 'gemini'
        ? (await getGeminiProviderStatus(false)).statusInfo
        : provider === 'groq'
        ? await getGroqProviderStatus(false)
        : await getOpenRouterProviderStatus(false);

    res.status(classified.httpStatus).json({
      ok: false,
      provider,
      configured: true,
      status: 'error',
      generationVerified: false,
      code: classified.code,
      latencyMs,
      error: classified.message,
      statusInfo,
      connectionHistory: connectionHistory.slice(0, 30),
    });
  }
});

// AUTHENTICATED SESSION VERIFICATION ENDPOINT
app.get('/api/auth/session', requireAuthenticatedUser, (req: Request, res: Response): void => {
  const authUser = (req as Request & { authUser?: AuthenticatedFirebaseUser }).authUser;
  res.json({
    authenticated: true,
    user: authUser,
  });
});

// 1. CHAT & MULTIMODAL ENDPOINT (Google Gemini, Groq, OpenRouter)
app.post('/api/chat', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestedProvider = normalizeAIProviderId(req.body?.aiProvider);
  const requestedModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : '';

  const payloadCheck = validateChatPayloadBounds(req.body);
  if (!payloadCheck.ok) {
    res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: payloadCheck.error, isLiveAI: false, retryable: false });
    return;
  }

  try {
    const {
      messages = [],
      currentMessage = '',
      imageData,
      imageMimeType = 'image/jpeg',
      attachmentName,
      attachmentContent,
      targetLanguage = 'en',
      aiResponseLanguage,
      autoDetectInputLanguage = false,
      translationEnabled = false,
      translationLanguage = 'ne',
      userLanguage = 'en',
      voicePersona = 'friendly',
      responseMode = 'balanced',
      location,
      memoryContext,
    } = req.body;

    const effectiveResponseLang =
      typeof aiResponseLanguage === 'string' && aiResponseLanguage.trim()
        ? aiResponseLanguage.trim()
        : String(targetLanguage || 'en').trim() || 'en';
    const targetLangName = LANGUAGE_NAMES[effectiveResponseLang] || effectiveResponseLang;
    const translationLangCode =
      typeof translationLanguage === 'string' && translationLanguage.trim()
        ? translationLanguage.trim()
        : 'ne';
    const translationLangName = LANGUAGE_NAMES[translationLangCode] || translationLangCode;
    const shouldGenerateTranslation = Boolean(translationEnabled);
    const shouldAutoDetectInput = Boolean(autoDetectInputLanguage);

    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const personaInstruction = PERSONA_TONES[voicePersona] || PERSONA_TONES.friendly;
    const memoryBlock = buildMemoryBlock(memoryContext);
    const isVoiceRequest = Boolean(req.body.isVoice);
    const modeDirective =
      isVoiceRequest
        ? 'RESPONSE MODE (VOICE ASSISTANT FAST): Provide a concise, clear, natural spoken response (1 to 3 short sentences max) that can be read aloud fast within 1-2 seconds. Do not use code blocks, large tables, or long lists.'
        : responseMode === 'fast'
        ? 'RESPONSE MODE (FAST): Be crisp, direct, and concise. Give the exact answer immediately with minimal filler.'
        : responseMode === 'detailed'
        ? 'RESPONSE MODE (DETAILED): Provide thorough, structured, step-by-step explanations with clear examples, edge cases, and key takeaways.'
        : 'RESPONSE MODE (BALANCED): Be well-structured, natural, and appropriately thorough without unnecessary verbosity.';

    const strictLanguageInstruction = shouldAutoDetectInput
      ? `LANGUAGE RULE (AUTO-DETECT INPUT): Automatically detect the language of the user's message and reply naturally in that same language unless they explicitly ask for a different language. If uncertain, default to ${targetLangName} (${effectiveResponseLang}). Preserve clean Markdown formatting and programming code blocks without translating code keywords.`
      : `STRICT LANGUAGE COMPLIANCE RULE: You MUST write your entire conversational response strictly in ${targetLangName} (${effectiveResponseLang}). If selected language is English ('en'), write in English. If Nepali ('ne'), write in natural, fluent Nepali. Never unexpectedly reply in another language unless the user explicitly asks you to translate or write in another language. Preserve clean Markdown formatting and do not translate code syntax or technical identifiers.`;

    const systemInstruction = `You are Aadesh AI ("One AI. Endless Possibilities.", created by Aadesh Jaisi), a professional global all-in-one AI assistant.
Provide accurate, natural, helpful answers including step-by-step explanations, programming assistance with clean markdown code blocks, study guidance, multilingual help, and image analysis.
${strictLanguageInstruction}
${modeDirective}

SUGGESTION RULE: For "suggestedQuestions", provide 3 short, context-aware follow-up action buttons tailored to this conversation (e.g., "Explain in more detail", "Give an example", "Summarize", or a specific follow-up).

User UI language: ${userLangName} (${userLanguage}).
Primary AI response language: ${targetLangName} (${effectiveResponseLang}).
${shouldGenerateTranslation ? `Secondary translation target language: ${translationLangName} (${translationLangCode}).` : ''}
${location?.name ? `Current Geotag location: ${location.name} (${location.lat ?? 'N/A'}, ${location.lng ?? 'N/A'}).` : ''}
Tone requirement: ${personaInstruction}${memoryBlock}`;

    let promptText =
      (typeof currentMessage === 'string' && currentMessage.trim()) ||
      (imageData
        ? 'Please inspect and analyze this image, translate visible text, and describe the scene.'
        : attachmentName
          ? `Please analyze the attached file (${attachmentName}).`
          : 'Hello');

    if (attachmentName && typeof attachmentContent === 'string' && attachmentContent.trim()) {
      const safeAttachment = attachmentContent.slice(0, 24000);
      promptText += `\n\n[Attached File: ${String(attachmentName).slice(0, 120)}]\n\`\`\`\n${safeAttachment}\n\`\`\``;
    }

    if (location?.name) {
      promptText += `\n[Geotag Location Context: ${location.name}]`;
    }

    // ---- Groq & OpenRouter official API dispatch (never falls back across providers) ----
    if (requestedProvider === 'groq' || requestedProvider === 'openrouter') {
      const apiKey = requestedProvider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
      const meta = AI_PROVIDER_METADATA[requestedProvider];
      if (!apiKey) {
        res.status(400).json({
          error: `${meta.name} is not configured on the server. Set ${meta.envVarName} in environment variables.`,
          provider: requestedProvider,
          providerNotConfigured: true,
          isLiveAI: false,
          retryable: false,
        });
        return;
      }

      const catalogResult =
        requestedProvider === 'groq'
          ? await fetchGroqModelsCached(apiKey)
          : await fetchOpenRouterCatalogCached();
      const resolvedModel = resolveSafeModelForProvider(requestedProvider, catalogResult.models, requestedModel, {
        allowPaidExplicit: true,
        requireInCatalog: catalogResult.source === 'live',
      });
      const supportsVision = Boolean(
        resolvedModel.modelInfo?.supportsVision ||
          /vision|vl|scout|maverick|gemma-3|gemma-4|mistral-small-3|gemini|gpt-4o|claude-3|claude-4|openrouter\/free/i.test(resolvedModel.modelId)
      );

      const jsonSystemInstruction = `${systemInstruction}

Return valid JSON matching this schema:
{
  "reply": "Accurate, helpful response in clean markdown.",
  "translation": ${shouldGenerateTranslation ? `"Natural translation of reply into ${translationLangName}."` : '""'},
  "detectedLanguage": "ISO 639-1 code of user input (e.g. en, ne, hi, es)",
  "sentiment": "positive | curious | inquiry | urgent | neutral",
  "suggestedQuestions": ["short follow-up 1", "short follow-up 2", "short follow-up 3"]
}`;

      const oaiMessages = buildOpenAICompatibleMessages({
        provider: requestedProvider,
        modelId: resolvedModel.modelId,
        supportsVision,
        systemInstruction: jsonSystemInstruction,
        messages,
        currentTextPrompt: promptText,
        imageData,
        imageMimeType,
      });

      const { text: rawText, modelUsed } = await callOpenAICompatibleCompletion({
        provider: requestedProvider,
        apiKey,
        model: resolvedModel.modelId,
        messages: oaiMessages,
        jsonMode: true,
        timeoutMs: 25000,
        allowFreeRouterFallback: requestedProvider === 'openrouter' && resolvedModel.isFree,
      });

      const latencyMs = Date.now() - startTime;
      recordProviderGenerationResult(requestedProvider, {
        verified: true,
        model: modelUsed,
        latencyMs,
        source: 'chat',
      });
      try {
        const parsed = extractJsonText(rawText);
        res.json({
          reply: parsed.reply || rawText,
          translation: shouldGenerateTranslation ? (parsed.translation || '') : '',
          detectedLanguage: parsed.detectedLanguage || effectiveResponseLang,
          sentiment: parsed.sentiment || 'positive',
          suggestedQuestions:
            Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0
              ? parsed.suggestedQuestions
              : ['Explain in more detail', 'Give a practical example', 'Summarize the key points'],
          geotagInsights: parsed.geotagInsights || undefined,
          latencyMs,
          isLiveAI: true,
          provider: requestedProvider,
          modelUsed,
        });
      } catch {
        res.json({
          reply: rawText || 'Response received.',
          translation: '',
          detectedLanguage: effectiveResponseLang,
          sentiment: 'neutral',
          suggestedQuestions: ['Explain in more detail', 'Give a practical example', 'Summarize the key points'],
          latencyMs,
          isLiveAI: true,
          provider: requestedProvider,
          modelUsed,
        });
      }
      return;
    }

    // ---- Default: Google Gemini dispatch ----
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Google Gemini is not configured on the server. Set GEMINI_API_KEY in environment variables.',
        provider: 'gemini',
        providerNotConfigured: true,
        isLiveAI: false,
        retryable: false,
      });
      return;
    }

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, any>> }> = [];
    if (Array.isArray(messages)) {
      for (const msg of messages.slice(-6)) {
        if (!msg?.content || msg.isError) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content) }],
        });
      }
    }

    const currentParts: Array<Record<string, any>> = [];
    if (imageData && typeof imageData === 'string') {
      const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
      const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType: detectedMime,
          data: cleanBase64,
        },
      });
    }
    currentParts.push({ text: promptText });

    const lastContent = contents[contents.length - 1];
    if (
      lastContent &&
      lastContent.role === 'user' &&
      lastContent.parts?.[0]?.text === currentMessage
    ) {
      contents[contents.length - 1] = { role: 'user', parts: currentParts };
    } else {
      contents.push({ role: 'user', parts: currentParts });
    }

    const chatThinkingLevel =
      isVoiceRequest || responseMode === 'fast'
        ? ThinkingLevel.MINIMAL
        : responseMode === 'detailed'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.MINIMAL;

    const configuredModel = sanitizeModelName(
      requestedModel || process.env.GEMINI_MODEL || GEMINI_RELIABLE_OVERLOAD_MODEL
    );
    const chatController = new AbortController();
    const chatTimer = setTimeout(() => chatController.abort(), 20000);
    req.on('close', () => chatController.abort());

    const schemaProperties: Record<string, any> = {
      reply: {
        type: Type.STRING,
        description: 'Accurate, helpful response in clean markdown.',
      },
      detectedLanguage: {
        type: Type.STRING,
        description: 'ISO 639-1 code of the user input (e.g. en, ne, hi, es).',
      },
      sentiment: {
        type: Type.STRING,
        description: 'One of: positive, curious, inquiry, urgent, neutral.',
      },
      suggestedQuestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '2 or 3 short relevant follow-up questions.',
      },
      geotagInsights: {
        type: Type.STRING,
        description: 'Optional brief note if location or photo context is relevant.',
      },
    };
    const requiredFields = ['reply', 'detectedLanguage', 'sentiment', 'suggestedQuestions'];
    if (shouldGenerateTranslation) {
      schemaProperties.translation = {
        type: Type.STRING,
        description: `Natural translation of reply into ${translationLangName}.`,
      };
      requiredFields.push('translation');
    }

    const executeChatWithModel = (targetModel: string) =>
      ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          ...getGeminiThinkingConfig(targetModel, chatThinkingLevel),
          abortSignal: chatController.signal,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: schemaProperties,
            required: requiredFields,
          },
        },
      });

    let modelUsed = configuredModel;
    let fallbackUsed = false;
    let fallbackFromModel: string | undefined = undefined;
    let fallbackReason: 'quota' | 'overload' | undefined = undefined;
    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      try {
        response = await executeChatWithModel(configuredModel);
      } catch (primaryErr: any) {
        if (isNonFallbackClientError(primaryErr)) {
          throw primaryErr;
        }
        const isQuotaErr = isGeminiQuotaOrRateLimitError(primaryErr);
        const isOverloadErr = isTransientOverloadError(primaryErr);

        if (
          configuredModel !== GEMINI_QUOTA_FALLBACK_MODEL &&
          (isQuotaErr || isOverloadErr) &&
          !chatController.signal.aborted
        ) {
          await sleepAbortable(250, chatController.signal);
          modelUsed = GEMINI_QUOTA_FALLBACK_MODEL;
          fallbackUsed = true;
          fallbackFromModel = configuredModel;
          fallbackReason = isQuotaErr ? 'quota' : 'overload';
          response = await executeChatWithModel(GEMINI_QUOTA_FALLBACK_MODEL);
        } else if (
          configuredModel === GEMINI_QUOTA_FALLBACK_MODEL &&
          (isQuotaErr || isOverloadErr) &&
          !chatController.signal.aborted
        ) {
          await sleepAbortable(350, chatController.signal);
          response = await executeChatWithModel(GEMINI_QUOTA_FALLBACK_MODEL);
        } else {
          throw primaryErr;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const timeoutErr: any = new Error(`Google Gemini (${modelUsed}) request timed out.`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(chatTimer);
    }

    const latencyMs = Date.now() - startTime;
    const rawText = response.text || '';
    recordProviderGenerationResult('gemini', {
      verified: true,
      model: modelUsed,
      latencyMs,
      source: 'chat',
    });

    try {
      const parsed = extractJsonText(rawText);
      res.json({
        reply: parsed.reply || rawText,
        translation: shouldGenerateTranslation ? (parsed.translation || '') : '',
        detectedLanguage: parsed.detectedLanguage || effectiveResponseLang,
        sentiment: parsed.sentiment || 'positive',
        suggestedQuestions:
          Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0
            ? parsed.suggestedQuestions
            : ['Explain in more detail', 'Give a practical example', 'Summarize the key points'],
        geotagInsights: parsed.geotagInsights || undefined,
        latencyMs,
        isLiveAI: true,
        provider: 'gemini',
        modelUsed,
        ...(fallbackUsed ? { fallbackUsed: true, fallbackFromModel, fallbackReason } : {}),
      });
    } catch {
      res.json({
        reply: rawText || 'Response received.',
        translation: '',
        detectedLanguage: effectiveResponseLang,
        sentiment: 'neutral',
        suggestedQuestions: ['Explain in more detail', 'Give a practical example', 'Summarize the key points'],
        latencyMs,
        isLiveAI: true,
        provider: 'gemini',
        modelUsed,
        ...(fallbackUsed ? { fallbackUsed: true, fallbackFromModel, fallbackReason } : {}),
      });
    }
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    recordServerError('/api/chat', safeError);
    console.error(`Error in /api/chat (${requestedProvider}):`, safeError);
    const classified = classifyProviderError(
      requestedProvider,
      Number(err?.status) || 502,
      safeError
    );
    recordProviderGenerationResult(requestedProvider, {
      verified: false,
      model: requestedModel || AI_PROVIDER_METADATA[requestedProvider].defaultModel,
      latencyMs: Date.now() - startTime,
      error: classified.message,
      code: classified.code,
      source: 'chat',
    });
    res.status(classified.httpStatus).json({
      error: classified.message,
      code: classified.code,
      provider: requestedProvider,
      latencyMs: Date.now() - startTime,
      isLiveAI: false,
      retryable: classified.httpStatus >= 500 || classified.httpStatus === 429,
    });
  }
});

// 1B. STREAMING CHAT ENDPOINT (SSE for Google Gemini, Groq, and OpenRouter)
app.post('/api/chat/stream', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestedProvider = normalizeAIProviderId(req.body?.aiProvider);
  const requestedModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : '';

  const payloadCheck = validateChatPayloadBounds(req.body);
  if (!payloadCheck.ok) {
    res.status(400).json({ ok: false, code: 'INVALID_INPUT', error: payloadCheck.error, provider: requestedProvider });
    return;
  }

  try {
    const {
      messages = [],
      currentMessage = '',
      imageData,
      imageMimeType = 'image/jpeg',
      attachmentName,
      attachmentContent,
      targetLanguage = 'en',
      aiResponseLanguage,
      autoDetectInputLanguage = false,
      userLanguage = 'en',
      voicePersona = 'friendly',
      responseMode = 'balanced',
      location,
      memoryContext,
    } = req.body;

    const effectiveResponseLang =
      typeof aiResponseLanguage === 'string' && aiResponseLanguage.trim()
        ? aiResponseLanguage.trim()
        : String(targetLanguage || 'en').trim() || 'en';
    const targetLangName = LANGUAGE_NAMES[effectiveResponseLang] || effectiveResponseLang;
    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const shouldAutoDetectInput = Boolean(autoDetectInputLanguage);
    const personaInstruction = PERSONA_TONES[voicePersona] || PERSONA_TONES.friendly;
    const memoryBlock = buildMemoryBlock(memoryContext);
    const isVoiceRequest = Boolean(req.body.isVoice);
    const modeDirective =
      isVoiceRequest
        ? 'Mode: VOICE ASSISTANT FAST. Provide a short, direct spoken answer (1-3 sentences max) ready for instant speech synthesis. Avoid code blocks and markdown tables.'
        : responseMode === 'fast'
        ? 'Mode: FAST & concise. Answer directly with crisp clarity.'
        : responseMode === 'detailed'
        ? 'Mode: DETAILED & deep. Provide comprehensive step-by-step reasoning and examples.'
        : 'Mode: BALANCED. Natural, clear, well-structured answers.';

    const strictLanguageInstruction = shouldAutoDetectInput
      ? `LANGUAGE RULE (AUTO-DETECT INPUT): Automatically detect the language of the user's message and reply naturally in that same language unless they explicitly ask for a different language. If uncertain, default to ${targetLangName} (${effectiveResponseLang}). Preserve clean Markdown formatting and programming code blocks without translating code syntax.`
      : `STRICT LANGUAGE COMPLIANCE RULE: You MUST output your conversational response strictly in ${targetLangName} (${effectiveResponseLang}). If selected language is English ('en'), write in English. If Nepali ('ne'), write in natural, fluent Nepali. Never unexpectedly reply in another language unless explicitly requested by the user. Preserve clean Markdown formatting and do not translate programming code syntax or technical identifiers unnecessarily.`;

    const systemInstruction = `You are Aadesh AI ("One AI. Endless Possibilities.", built by Aadesh Jaisi).
Answer naturally and clearly in clean Markdown.
${strictLanguageInstruction}
${modeDirective}
User UI language: ${userLangName} (${userLanguage}).
Primary AI response language: ${targetLangName} (${effectiveResponseLang}).
${location?.name ? `Location context: ${location.name}.` : ''}
Tone: ${personaInstruction}${memoryBlock}`;

    let promptText =
      (typeof currentMessage === 'string' && currentMessage.trim()) ||
      (imageData ? 'Inspect and explain this image clearly.' : attachmentName ? `Analyze ${attachmentName}.` : 'Hello');

    if (attachmentName && typeof attachmentContent === 'string' && attachmentContent.trim()) {
      promptText += `\n\n[Attached File: ${String(attachmentName).slice(0, 120)}]\n\`\`\`\n${attachmentContent.slice(0, 24000)}\n\`\`\``;
    }
    if (location?.name) promptText += `\n[Geotag: ${location.name}]`;

    // Pre-flight server configuration check BEFORE switching headers to SSE
    if (requestedProvider === 'groq' || requestedProvider === 'openrouter') {
      const apiKey = requestedProvider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
      const meta = AI_PROVIDER_METADATA[requestedProvider];
      if (!apiKey) {
        res.status(400).json({
          error: `${meta.name} is not configured on the server. Set ${meta.envVarName} in environment variables.`,
          provider: requestedProvider,
          providerNotConfigured: true,
          isLiveAI: false,
        });
        return;
      }

      const catalogResult =
        requestedProvider === 'groq'
          ? await fetchGroqModelsCached(apiKey)
          : await fetchOpenRouterCatalogCached();
      const resolvedModel = resolveSafeModelForProvider(requestedProvider, catalogResult.models, requestedModel, {
        allowPaidExplicit: true,
        requireInCatalog: catalogResult.source === 'live',
      });
      const supportsVision = Boolean(
        resolvedModel.modelInfo?.supportsVision ||
          /vision|vl|scout|maverick|gemma-3|gemma-4|mistral-small-3|gemini|gpt-4o|claude-3|claude-4|openrouter\/free/i.test(resolvedModel.modelId)
      );

      const oaiMessages = buildOpenAICompatibleMessages({
        provider: requestedProvider,
        modelId: resolvedModel.modelId,
        supportsVision,
        systemInstruction,
        messages,
        currentTextPrompt: promptText,
        imageData,
        imageMimeType,
      });

      let clientAborted = false;
      req.on('close', () => {
        clientAborted = true;
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const { modelUsed, totalChars } = await streamOpenAICompatibleCompletion({
        provider: requestedProvider,
        apiKey,
        model: resolvedModel.modelId,
        messages: oaiMessages,
        allowFreeRouterFallback: requestedProvider === 'openrouter' && resolvedModel.isFree,
        onChunk: (chunk) => {
          if (!clientAborted) {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          }
        },
        isAborted: () => clientAborted,
      });

      if (clientAborted) {
        res.end();
        return;
      }

      if (totalChars === 0) {
        throw new Error(`${meta.name} returned an empty stream response.`);
      }

      recordProviderGenerationResult(requestedProvider, {
        verified: true,
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        source: 'chat',
      });
      res.write(`data: ${JSON.stringify({ done: true, modelUsed, provider: requestedProvider })}\n\n`);
      res.end();
      return;
    }

    // ---- Default: Google Gemini Streaming ----
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Google Gemini is not configured on the server. Set GEMINI_API_KEY in environment variables.',
        provider: 'gemini',
        providerNotConfigured: true,
        isLiveAI: false,
      });
      return;
    }

    let clientAborted = false;
    req.on('close', () => {
      clientAborted = true;
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, any>> }> = [];
    if (Array.isArray(messages)) {
      for (const msg of messages.slice(-6)) {
        if (!msg?.content || msg.isError) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content) }],
        });
      }
    }

    const currentParts: Array<Record<string, any>> = [];
    if (imageData && typeof imageData === 'string') {
      const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
      const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      currentParts.push({ inlineData: { mimeType: detectedMime, data: cleanBase64 } });
    }
    currentParts.push({ text: promptText });

    const lastContent = contents[contents.length - 1];
    if (lastContent && lastContent.role === 'user' && lastContent.parts?.[0]?.text === currentMessage) {
      contents[contents.length - 1] = { role: 'user', parts: currentParts };
    } else {
      contents.push({ role: 'user', parts: currentParts });
    }

    const streamThinkingLevel =
      isVoiceRequest || responseMode === 'fast'
        ? ThinkingLevel.MINIMAL
        : responseMode === 'detailed'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.MINIMAL;
    const configuredModel = sanitizeModelName(
      requestedModel || process.env.GEMINI_MODEL || GEMINI_RELIABLE_OVERLOAD_MODEL
    );
    const streamAbortController = new AbortController();
    const streamTimer = setTimeout(() => streamAbortController.abort(), 25000);
    req.on('close', () => {
      clientAborted = true;
      streamAbortController.abort();
    });

    let streamed = false;
    let totalStreamedChars = 0;
    let usedModel = configuredModel;
    let fallbackUsed = false;
    let fallbackFromModel: string | undefined = undefined;
    let fallbackReason: 'quota' | 'overload' | undefined = undefined;

    const runStreamWithModel = async (targetModel: string) => {
      const stream = await ai.models.generateContentStream({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          ...getGeminiThinkingConfig(targetModel, streamThinkingLevel),
          abortSignal: streamAbortController.signal,
        },
      });
      for await (const chunk of stream) {
        if (clientAborted) break;
        const text = chunk.text || '';
        if (text) {
          totalStreamedChars += text.length;
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      }
    };

    try {
      try {
        await runStreamWithModel(configuredModel);
      } catch (primaryErr: any) {
        if (isNonFallbackClientError(primaryErr)) {
          throw primaryErr;
        }
        const isQuotaErr = isGeminiQuotaOrRateLimitError(primaryErr);
        const isOverloadErr = isTransientOverloadError(primaryErr);

        if (
          !clientAborted &&
          totalStreamedChars === 0 &&
          configuredModel !== GEMINI_QUOTA_FALLBACK_MODEL &&
          (isQuotaErr || isOverloadErr) &&
          !streamAbortController.signal.aborted
        ) {
          await sleepAbortable(250, streamAbortController.signal);
          usedModel = GEMINI_QUOTA_FALLBACK_MODEL;
          fallbackUsed = true;
          fallbackFromModel = configuredModel;
          fallbackReason = isQuotaErr ? 'quota' : 'overload';
          res.write(
            `data: ${JSON.stringify({
              fallbackSwitched: true,
              fallbackFromModel,
              fallbackReason,
              modelUsed: usedModel,
            })}\n\n`
          );
          await runStreamWithModel(GEMINI_QUOTA_FALLBACK_MODEL);
        } else if (
          !clientAborted &&
          totalStreamedChars === 0 &&
          configuredModel === GEMINI_QUOTA_FALLBACK_MODEL &&
          (isQuotaErr || isOverloadErr) &&
          !streamAbortController.signal.aborted
        ) {
          await sleepAbortable(350, streamAbortController.signal);
          await runStreamWithModel(GEMINI_QUOTA_FALLBACK_MODEL);
        } else {
          throw primaryErr;
        }
      }
      if (totalStreamedChars > 0) {
        streamed = true;
      }
    } catch (err: any) {
      if (clientAborted) {
        res.end();
        return;
      }
      if (err?.name === 'AbortError') {
        const timeoutErr: any = new Error(`Google Gemini (${usedModel}) stream timed out.`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(streamTimer);
    }

    if (clientAborted) {
      res.end();
      return;
    }

    if (!streamed) {
      throw new Error(`Google Gemini (${usedModel}) returned an empty stream response.`);
    }

    recordProviderGenerationResult('gemini', {
      verified: true,
      model: usedModel,
      latencyMs: Date.now() - startTime,
      source: 'chat',
    });

    res.write(
      `data: ${JSON.stringify({
        done: true,
        modelUsed: usedModel,
        provider: 'gemini',
        ...(fallbackUsed ? { fallbackUsed: true, fallbackFromModel, fallbackReason } : {}),
      })}\n\n`
    );
    res.end();
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    recordServerError('/api/chat/stream', safeError);
    const classified = classifyProviderError(
      requestedProvider,
      Number(err?.status) || 502,
      safeError
    );
    recordProviderGenerationResult(requestedProvider, {
      verified: false,
      model: requestedModel || AI_PROVIDER_METADATA[requestedProvider].defaultModel,
      latencyMs: Date.now() - startTime,
      error: classified.message,
      code: classified.code,
      source: 'chat',
    });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: classified.message, provider: requestedProvider, done: true })}\n\n`);
      res.end();
    } else {
      res.status(classified.httpStatus).json({ error: classified.message, code: classified.code, provider: requestedProvider });
    }
  }
});

// 1C. CONTEXT-AWARE SUGGESTED REPLIES ENDPOINT
app.post('/api/chat/suggested-replies', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestedProvider = normalizeAIProviderId(req.body?.aiProvider);
  const requestedModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : '';
  const {
    userMessage = '',
    aiReply = '',
    recentMessages = [],
    targetLanguage = 'en',
    userLanguage = 'en',
    location,
    hasImage = false,
    preferredSuggestionPatterns,
  } = req.body || {};

  const trimmedReply = String(aiReply || '').trim();
  const trimmedUserMsg = String(userMessage || '').trim();

  const sanitizedTopCategories: Array<{ category: string; totalClicks: number }> = Array.isArray(
    preferredSuggestionPatterns?.topCategories
  )
    ? preferredSuggestionPatterns.topCategories
        .filter((c: any) => c && typeof c.category === 'string' && Number(c.totalClicks) > 0)
        .slice(0, 4)
        .map((c: any) => ({
          category: String(c.category).slice(0, 32),
          totalClicks: Math.max(1, Math.floor(Number(c.totalClicks) || 1)),
        }))
    : [];

  const sanitizedTopClicked: Array<{ text: string; category: string; clickCount: number }> = Array.isArray(
    preferredSuggestionPatterns?.topClickedSuggestions
  )
    ? preferredSuggestionPatterns.topClickedSuggestions
        .filter((s: any) => s && typeof s.text === 'string' && s.text.trim().length > 0)
        .slice(0, 4)
        .map((s: any) => ({
          text: String(s.text).trim().slice(0, 80),
          category: String(s.category || 'general').slice(0, 32),
          clickCount: Math.max(1, Math.floor(Number(s.clickCount) || 1)),
        }))
    : [];

  const CATEGORY_FALLBACK_MAP: Record<string, string> = {
    deep_dive: 'Explain in more detail',
    examples: 'Give a practical example',
    summary: 'Summarize the key points',
    action_steps: 'Show step-by-step action plan',
    compare: 'Compare options and trade-offs',
    translate:
      targetLanguage && targetLanguage !== 'en'
        ? `Explain in ${LANGUAGE_NAMES[targetLanguage] || targetLanguage}`
        : 'Explain in Nepali',
    explore_local: location?.name
      ? `Explore more about ${String(location.name).slice(0, 32)}`
      : 'Explore real-world context',
    visual: hasImage ? 'Analyze details in the image' : 'Describe visually with a diagram',
  };

  const buildFallbackSuggestions = (): string[] => {
    const suggestions: string[] = [];
    for (const cat of sanitizedTopCategories) {
      const candidate = CATEGORY_FALLBACK_MAP[cat.category];
      if (candidate && !suggestions.includes(candidate)) {
        suggestions.push(candidate);
      }
    }
    const defaults = [
      'Explain in more detail',
      'Give a practical example',
      'Summarize the key points',
    ];
    for (const d of defaults) {
      if (!suggestions.includes(d)) suggestions.push(d);
    }
    if (location?.name) {
      const locPrompt = `Explore more about ${String(location.name).slice(0, 32)}`;
      if (!suggestions.includes(locPrompt)) suggestions.push(locPrompt);
    } else if (hasImage && !suggestions.includes('Analyze details in the image')) {
      suggestions.push('Analyze details in the image');
    } else if (targetLanguage && targetLanguage !== 'en') {
      const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
      const langPrompt = `Explain in ${targetLangName}`;
      if (!suggestions.includes(langPrompt)) suggestions.push(langPrompt);
    }
    return suggestions.slice(0, 4);
  };

  if (!trimmedReply && !trimmedUserMsg) {
    res.json({
      suggestedReplies: buildFallbackSuggestions(),
      latencyMs: Date.now() - startTime,
      isFallback: true,
    });
    return;
  }

  try {
    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const historySnippet = Array.isArray(recentMessages)
      ? recentMessages
          .slice(-4)
          .filter((m: any) => m?.content && !m?.isError)
          .map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${String(m.content).slice(0, 220)}`)
          .join('\n')
      : '';

    const engagementGuidance =
      sanitizedTopCategories.length > 0 || sanitizedTopClicked.length > 0
        ? `- Personalization signal from user's past Suggested Reply clicks: prefer follow-up intents like [${sanitizedTopCategories
            .map((c) => `${c.category} (${c.totalClicks}x)`)
            .join(', ')}]${
            sanitizedTopClicked.length > 0
              ? ` and match the concise tone of frequently clicked prompts (${sanitizedTopClicked
                  .map((s) => `"${s.text}"`)
                  .join(', ')})`
              : ''
          } when relevant to the current turn.\n`
        : '';

    const prompt = `Generate 3 to 4 short, clickable follow-up reply buttons that the user can tap right beneath the AI assistant's latest message.
Rules:
- Each suggestion MUST be a concise natural button label/prompt (2 to 7 words max, no numbering or quotes).
- Tailor them specifically to the topic of the user's message and the assistant's reply (such as expanding a specific concept, giving a concrete example, summarizing, comparing alternatives, or exploring the location/image context if active).
- Write suggestions primarily in ${userLangName} (matching the user's language; if appropriate, one may offer ${targetLangName} translation/explanation).
${engagementGuidance}${location?.name ? `- Active Geotag Location Context: ${String(location.name).slice(0, 80)}\n` : ''}${hasImage ? '- An image was shared in this turn.\n' : ''}${historySnippet ? `Recent context:\n${historySnippet}\n` : ''}
Latest User Message:
"""
${trimmedUserMsg.slice(0, 800)}
"""

Latest AI Reply:
"""
${trimmedReply.slice(0, 1600)}
"""`;

    if (requestedProvider === 'groq' || requestedProvider === 'openrouter') {
      const apiKey = requestedProvider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
      if (!apiKey) {
        res.json({
          suggestedReplies: buildFallbackSuggestions(),
          latencyMs: Date.now() - startTime,
          isLiveAI: false,
          isFallback: true,
        });
        return;
      }

      const catalogResult =
        requestedProvider === 'groq'
          ? await fetchGroqModelsCached(apiKey)
          : await fetchOpenRouterCatalogCached();
      const resolved = resolveSafeModelForProvider(requestedProvider, catalogResult.models, requestedModel, {
        allowPaidExplicit: true,
        requireInCatalog: catalogResult.source === 'live',
      });

      const oaiRes = await callOpenAICompatibleCompletion({
        provider: requestedProvider,
        apiKey,
        model: resolved.modelId,
        messages: [
          {
            role: 'system',
            content: 'Return ONLY JSON: {"suggestedReplies": ["string 1", "string 2", "string 3"]}',
          },
          { role: 'user', content: prompt },
        ],
        jsonMode: true,
        timeoutMs: 9000,
        allowFreeRouterFallback: requestedProvider === 'openrouter' && resolved.isFree,
      });

      let parsedReplies: string[] = [];
      try {
        const parsed = extractJsonText(oaiRes.text);
        if (Array.isArray(parsed?.suggestedReplies)) {
          parsedReplies = parsed.suggestedReplies
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 1)
            .map((item: string) => item.trim().slice(0, 72))
            .slice(0, 4);
        }
      } catch {}

      res.json({
        suggestedReplies: parsedReplies.length > 0 ? parsedReplies : buildFallbackSuggestions(),
        modelUsed: oaiRes.modelUsed,
        provider: requestedProvider,
        isLiveAI: parsedReplies.length > 0,
        isFallback: parsedReplies.length === 0,
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        suggestedReplies: buildFallbackSuggestions(),
        latencyMs: Date.now() - startTime,
        isLiveAI: false,
        isFallback: true,
      });
      return;
    }

    const configuredSuggestModel = sanitizeModelName(
      typeof req.body?.aiModel === 'string' && req.body.aiModel.trim()
        ? req.body.aiModel
        : process.env.GEMINI_MODEL || GEMINI_RELIABLE_OVERLOAD_MODEL
    );
    const suggestController = new AbortController();
    const suggestTimer = setTimeout(() => suggestController.abort(), 5000);
    let parsedReplies: string[] = [];
    let modelUsed = '';

    try {
      const config: Record<string, any> = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedReplies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 4 concise, context-aware suggested follow-up reply buttons (each 2 to 7 words).',
            },
          },
          required: ['suggestedReplies'],
        },
        abortSignal: suggestController.signal,
        ...getGeminiThinkingConfig(configuredSuggestModel, ThinkingLevel.MINIMAL),
      };

      const response = await ai.models.generateContent({
        model: configuredSuggestModel,
        contents: prompt,
        config,
      });
      const parsed = extractJsonText(response.text);
      if (Array.isArray(parsed?.suggestedReplies)) {
        const cleaned = parsed.suggestedReplies
          .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 1)
          .map((item: string) => item.trim().slice(0, 72))
          .slice(0, 4);
        if (cleaned.length > 0) {
          parsedReplies = cleaned;
          modelUsed = configuredSuggestModel;
        }
      }
    } catch {
      // Fall back quietly to deterministic contextual suggestions
    } finally {
      clearTimeout(suggestTimer);
    }

    res.json({
      suggestedReplies: parsedReplies.length > 0 ? parsedReplies : buildFallbackSuggestions(),
      modelUsed: modelUsed || undefined,
      provider: 'gemini',
      isLiveAI: parsedReplies.length > 0,
      isFallback: parsedReplies.length === 0,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.json({
      suggestedReplies: buildFallbackSuggestions(),
      error: sanitizeErrorMessage(err),
      isFallback: true,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 2. DEDICATED REAL-TIME TRANSLATION & GRAMMAR ENDPOINT
app.post('/api/translate', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestedProvider = normalizeAIProviderId(req.body?.aiProvider);
  const requestedModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : '';
  const {
    text,
    sourceLang = 'auto',
    targetLang,
    targetLanguage,
    mode = 'translate',
  } = req.body;
  const resolvedTargetLang = String(targetLang || targetLanguage || 'ne').trim();
  const targetLangName = LANGUAGE_NAMES[resolvedTargetLang] || resolvedTargetLang;

  if (!text || !String(text).trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  try {
    const modeInstructions =
      mode === 'grammar'
        ? `Check grammar, spelling, and natural phrasing of the source text, provide the corrected version in "correctedText", explain key corrections concisely in "grammarNotes", and also translate the corrected text into ${targetLangName} in "translatedText".`
        : mode === 'paragraph'
          ? `Perform high-accuracy paragraph/document translation into ${targetLangName}, preserving tone, formatting, and nuance. Also note any source grammar improvements in "correctedText" if needed.`
          : `Translate the text accurately and naturally into ${targetLangName}.`;

    const prompt = `${modeInstructions}
Source language: ${sourceLang === 'auto' ? 'Detect automatically' : LANGUAGE_NAMES[sourceLang] || sourceLang}.

Text:
"""
${String(text).slice(0, 18000)}
"""`;

    if (requestedProvider === 'groq' || requestedProvider === 'openrouter') {
      const apiKey = requestedProvider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
      const meta = AI_PROVIDER_METADATA[requestedProvider];
      if (!apiKey) {
        res.status(400).json({
          error: `${meta.name} is not configured on the server. Set ${meta.envVarName} in environment variables.`,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const catalogResult =
        requestedProvider === 'groq'
          ? await fetchGroqModelsCached(apiKey)
          : await fetchOpenRouterCatalogCached();
      const resolved = resolveSafeModelForProvider(requestedProvider, catalogResult.models, requestedModel, {
        allowPaidExplicit: true,
        requireInCatalog: catalogResult.source === 'live',
      });

      const { text: rawOut, modelUsed } = await callOpenAICompatibleCompletion({
        provider: requestedProvider,
        apiKey,
        model: resolved.modelId,
        messages: [
          {
            role: 'system',
            content:
              'Return valid JSON matching {"translatedText":"string","detectedSourceLang":"string","pronunciation":"string","culturalNote":"string","correctedText":"string","grammarNotes":["string"]}.',
          },
          { role: 'user', content: prompt },
        ],
        jsonMode: true,
        timeoutMs: 18000,
        allowFreeRouterFallback: requestedProvider === 'openrouter' && resolved.isFree,
      });

      try {
        const parsed = extractJsonText(rawOut);
        res.json({
          translatedText: parsed.translatedText || rawOut || text,
          detectedSourceLang: parsed.detectedSourceLang || 'en',
          pronunciation: parsed.pronunciation || '',
          culturalNote: parsed.culturalNote || '',
          correctedText: parsed.correctedText || '',
          grammarNotes: Array.isArray(parsed.grammarNotes) ? parsed.grammarNotes : [],
          provider: requestedProvider,
          modelUsed,
          latencyMs: Date.now() - startTime,
        });
      } catch {
        res.json({
          translatedText: rawOut || text,
          detectedSourceLang: 'en',
          pronunciation: '',
          culturalNote: '',
          correctedText: '',
          grammarNotes: [],
          provider: requestedProvider,
          modelUsed,
          latencyMs: Date.now() - startTime,
        });
      }
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Google Gemini API key is not configured on the server.',
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          ...getGeminiThinkingConfig(model, ThinkingLevel.LOW),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedText: { type: Type.STRING },
              detectedSourceLang: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              culturalNote: { type: Type.STRING },
              correctedText: { type: Type.STRING },
              grammarNotes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['translatedText', 'detectedSourceLang'],
          },
        },
      }),
      10000,
      14000,
      requestedModel || undefined
    );

    const parsed = extractJsonText(response.text);
    res.json({
      translatedText: parsed.translatedText || response.text || text,
      detectedSourceLang: parsed.detectedSourceLang || 'en',
      pronunciation: parsed.pronunciation || '',
      culturalNote: parsed.culturalNote || '',
      correctedText: parsed.correctedText || '',
      grammarNotes: Array.isArray(parsed.grammarNotes) ? parsed.grammarNotes : [],
      provider: 'gemini',
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/translate:', safeError);
    const classified = classifyProviderError(
      requestedProvider,
      Number(err?.status) || 502,
      safeError
    );
    res.status(classified.httpStatus).json({
      error: classified.message,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 2B. CONCISE MESSAGE SUMMARIZER ENDPOINT (For Quick Context menu)
app.post('/api/summarize', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestedProvider = normalizeAIProviderId(req.body?.aiProvider);
  const requestedModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : '';
  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const targetLang = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';

  if (!rawText) {
    res.status(400).json({ error: 'Message text is required to generate a summary.' });
    return;
  }

  const clippedText = rawText.slice(0, 16000);

  try {
    const langHint = targetLang && LANGUAGE_NAMES[targetLang]
      ? `Write the summary in the primary language of the message (or provide clear clarity for a ${LANGUAGE_NAMES[targetLang]} reader if appropriate, while preserving exact key facts).`
      : 'Write the summary in the same language as the original message.';

    const prompt = `Summarize the following AI assistant message into a clear, concise summary and 2-4 crisp bullet takeaways. ${langHint} Keep all facts, numbers, and names accurate.

Message to summarize:
"""
${clippedText}
"""`;

    if (requestedProvider === 'groq' || requestedProvider === 'openrouter') {
      const apiKey = requestedProvider === 'groq' ? getGroqApiKey() : getOpenRouterApiKey();
      const meta = AI_PROVIDER_METADATA[requestedProvider];
      if (!apiKey) {
        res.status(400).json({
          error: `${meta.name} is not configured on the server.`,
          latencyMs: Date.now() - startTime,
        });
        return;
      }

      const catalogResult =
        requestedProvider === 'groq'
          ? await fetchGroqModelsCached(apiKey)
          : await fetchOpenRouterCatalogCached();
      const resolved = resolveSafeModelForProvider(requestedProvider, catalogResult.models, requestedModel, {
        allowPaidExplicit: true,
        requireInCatalog: catalogResult.source === 'live',
      });

      const { text: rawOut, modelUsed } = await callOpenAICompatibleCompletion({
        provider: requestedProvider,
        apiKey,
        model: resolved.modelId,
        messages: [
          {
            role: 'system',
            content: 'Return valid JSON matching {"summary":"1-3 sentence concise summary","keyPoints":["point 1","point 2"]}.',
          },
          { role: 'user', content: prompt },
        ],
        jsonMode: true,
        timeoutMs: 18000,
        allowFreeRouterFallback: requestedProvider === 'openrouter' && resolved.isFree,
      });

      let summary = rawOut;
      let keyPoints: string[] = [];
      try {
        const parsed = extractJsonText(rawOut);
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          summary = parsed.summary.trim();
        }
        if (Array.isArray(parsed.keyPoints)) {
          keyPoints = parsed.keyPoints.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 5);
        }
      } catch {}

      res.json({
        summary,
        keyPoints,
        provider: requestedProvider,
        modelUsed,
        latencyMs: Date.now() - startTime,
        originalChars: rawText.length,
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Google Gemini API key is not configured on the server.',
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'A crisp 1 to 3 sentence concise summary of the message.',
              },
              keyPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 ultra-concise key takeaways or action points.',
              },
            },
            required: ['summary', 'keyPoints'],
          },
        },
      }),
      10000,
      14000,
      requestedModel || undefined
    );

    const parsed = extractJsonText(response.text);
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : response.text || clippedText.slice(0, 240);
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 5)
      : [];

    res.json({
      summary,
      keyPoints,
      provider: 'gemini',
      modelUsed,
      latencyMs: Date.now() - startTime,
      originalChars: rawText.length,
    });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/summarize:', safeError);
    const classified = classifyProviderError(
      requestedProvider,
      Number(err?.status) || 502,
      safeError
    );
    res.status(classified.httpStatus).json({
      error: classified.message,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 3. MEDIA GEOTAG ANALYZER ENDPOINT
app.post('/api/analyze-geotag', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageData, imageMimeType = 'image/jpeg', locationName, lat, lng } = req.body;
    if (!imageData || typeof imageData !== 'string') {
      res.status(400).json({ error: 'Image data is required' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured on the server.',
      });
      return;
    }

    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
    const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

    const prompt = `Analyze this geotagged photograph.
Location metadata: ${locationName || 'Unknown location'} (${lat ?? ''}, ${lng ?? ''}).`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: detectedMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detectedLandmark: { type: Type.STRING },
              detectedText: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              culturalSummary: { type: Type.STRING },
              suggestedTranslations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    lang: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                  required: ['lang', 'text'],
                },
              },
            },
            required: ['title', 'detectedLandmark', 'tags', 'culturalSummary'],
          },
        },
      }),
      14000,
      18000
    );

    const parsed = extractJsonText(response.text);
    res.json({ ...parsed, modelUsed });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/analyze-geotag:', safeError);
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: safeError,
    });
  }
});

// 4. OWNER-ONLY ADMIN VERIFICATION & OVERVIEW ENDPOINTS (Backend Token Verified)
app.post('/api/admin/verify', async (req: Request, res: Response): Promise<void> => {
  const result = await verifyOwnerFromRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ authorized: false, error: result.error });
    return;
  }
  res.json({
    authorized: true,
    owner: result.user,
  });
});

app.get('/api/admin/overview', async (req: Request, res: Response): Promise<void> => {
  const result = await verifyOwnerFromRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ authorized: false, error: result.error });
    return;
  }

  const ai = getGeminiClient();
  const candidates = getCandidateModels();
  res.json({
    authorized: true,
    owner: result.user,
    serverStatus: {
      aiConfigured: Boolean(ai),
      primaryModel: candidates[0],
      fallbackModels: candidates.slice(1),
      supportedLanguagesCount: Object.keys(LANGUAGE_NAMES).length,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV || 'development',
      totalApiRequests: serverTelemetry.totalApiRequests,
      failedApiRequests: serverTelemetry.failedApiRequests,
      recentErrors: serverTelemetry.recentErrors,
    },
  });
});

app.get('/api/admin/backup', async (req: Request, res: Response): Promise<void> => {
  const result = await verifyOwnerFromRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ authorized: false, error: result.error });
    return;
  }
  res.json({
    ok: true,
    authorized: true,
    owner: result.user,
    message: 'Admin backup authorization verified successfully.',
    projectIdentifier: 'aadesh-ai-global',
    schemaVersion: '1.0',
    timestamp: new Date().toISOString(),
  });
});

// 5. IMAGE GENERATION & STUDIO ENDPOINTS
const IMAGE_MODEL_CAPABILITIES = {
  'gemini-3.1-flash-lite-image': {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Flash Lite Image (Fast)',
    description: 'High-speed raster image generation powered by Gemini 3.1 Flash Lite Image',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: [] as string[],
    supportsResolution: false,
  },
  'gemini-nano-banana-2.1': {
    id: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1 (HD)',
    description: 'Studio-quality 1K / 2K / 4K image generation powered by Gemini Nano Banana 2.1',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: ['1K', '2K', '4K'],
    supportsResolution: true,
  },
} as const;

type SupportedImageModelId = keyof typeof IMAGE_MODEL_CAPABILITIES;

const IMAGE_STYLE_DIRECTIVES: Record<string, string> = {
  Realistic: 'Photorealistic photography, natural lighting, sharp optical lens detail, true-to-life textures',
  '3D': '3D Octane studio render, volumetric lighting, smooth physically based materials, high depth',
  Cartoon: 'Vibrant stylized 2D cartoon illustration, expressive linework, rich cel shading',
  Anime: 'High-detail Japanese anime key visual artwork, crisp cel lighting, atmospheric background',
  'Digital Art': 'Modern concept digital art, dramatic lighting, intricate atmospheric composition',
  Painting: 'Fine art oil and gouache painting on textured canvas, expressive brushwork',
};

function classifyImageGenError(err: unknown): { status: number; message: string } {
  const safeMsg = sanitizeErrorMessage(err);
  const lower = safeMsg.toLowerCase();
  const rawStatus = Number((err as any)?.status || (err as any)?.code);

  if (lower.includes('timed out')) {
    return {
      status: 504,
      message: safeMsg || 'Image generation timed out. Please try a shorter prompt or retry.',
    };
  }
  if (
    rawStatus === 401 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key')
  ) {
    return {
      status: 401,
      message: 'Invalid Gemini API key. Please verify your API key configuration in Settings.',
    };
  }
  if (
    rawStatus === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('permission denied') ||
    lower.includes('billing')
  ) {
    return {
      status: 403,
      message:
        'Image generation access denied or billing required for this Gemini API key. Add a billing-enabled Gemini API key in Settings to generate images.',
    };
  }
  if (
    rawStatus === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 429,
      message:
        'Gemini image generation quota or rate limit reached. Please wait a moment or check billing/quota for your API key.',
    };
  }
  if (rawStatus === 404 || lower.includes('not found') || lower.includes('is not supported')) {
    return {
      status: 404,
      message: `Selected image model is unavailable for this API key: ${safeMsg}`,
    };
  }
  return {
    status: 502,
    message: safeMsg || 'Failed to generate image from Gemini AI.',
  };
}

const ASPECT_VIEWBOX: Record<string, { w: number; h: number }> = {
  '1:1': { w: 800, h: 800 },
  '16:9': { w: 960, h: 540 },
  '9:16': { w: 540, h: 960 },
  '4:3': { w: 800, h: 600 },
};

function sanitizeSvgMarkup(rawSvg: string, width: number, height: number): string | null {
  const match = rawSvg.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  return svg;
}

const rasterQuotaCooldownUntil = new Map<string, number>();

async function generateVectorFallbackSvg(params: {
  ai: GoogleGenAI;
  prompt: string;
  style: string;
  aspectRatio: string;
  startTime: number;
  notice: string;
}) {
  const box = ASPECT_VIEWBOX[params.aspectRatio] || ASPECT_VIEWBOX['1:1'];
  const svgPrompt = `Create an artistic SVG vector illustration (viewBox="0 0 ${box.w} ${box.h}") for: "${params.prompt}".
Visual style: ${params.style}.
Rules:
1. Output ONLY raw valid <svg viewBox="0 0 ${box.w} ${box.h}" xmlns="http://www.w3.org/2000/svg">...</svg> markup (no markdown fences or explanation).
2. Include rich <defs> gradients, atmospheric background, layered geometric/organic foreground shapes, lighting highlights, and balanced colors.
3. Keep the SVG concise (under 40 elements) and never include <script>, <foreignObject>, or external URLs.`;

  const vectorModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3.5-flash'];
  let response: Awaited<ReturnType<typeof params.ai.models.generateContent>> | null = null;
  let modelUsed = vectorModels[0];
  let lastErr: unknown = null;

  for (const model of vectorModels) {
    try {
      const res = await withTimeout(
        params.ai.models.generateContent({
          model,
          contents: svgPrompt,
          config: {
            ...getGeminiThinkingConfig(model, ThinkingLevel.LOW),
          },
        }),
        20000
      );
      response = res;
      modelUsed = model;
      break;
    } catch (err) {
      lastErr = err;
      if (isAuthFailure(err)) throw err;
    }
  }

  if (!response) {
    throw lastErr || new Error('Vector illustration fallback failed across models.');
  }

  const cleanSvg = sanitizeSvgMarkup(String(response.text || ''), box.w, box.h);
  if (!cleanSvg) {
    throw new Error('Vector illustration fallback did not return valid SVG markup.');
  }

  const svgBase64 = Buffer.from(cleanSvg, 'utf-8').toString('base64');
  return {
    ok: true as const,
    status: 200,
    imageDataUrl: `data:image/svg+xml;base64,${svgBase64}`,
    mimeType: 'image/svg+xml',
    revisedPrompt: `${params.prompt} (${params.style} vector illustration)`,
    modelUsed: `${modelUsed} (Vector Studio)`,
    aspectRatio: params.aspectRatio,
    resolution: undefined,
    style: params.style,
    isVectorFallback: true,
    fallbackNotice: params.notice,
    latencyMs: Date.now() - params.startTime,
  };
}

async function generateRasterImageWithGemini(params: {
  ai: GoogleGenAI;
  prompt: string;
  style?: string;
  aspectRatio?: string;
  resolution?: string;
  model?: string;
}) {
  const startTime = Date.now();
  const cleanPrompt = String(params.prompt || '').trim().slice(0, 1500);
  if (!cleanPrompt) {
    return {
      ok: false as const,
      status: 400,
      error: 'Please enter a descriptive prompt for the image you want to generate.',
      latencyMs: Date.now() - startTime,
    };
  }

  const requestedModel = String(params.model || 'gemini-3.1-flash-lite-image').trim();
  if (!(requestedModel in IMAGE_MODEL_CAPABILITIES)) {
    return {
      ok: false as const,
      status: 400,
      error: `Unsupported image model "${requestedModel}". Supported models: ${Object.keys(IMAGE_MODEL_CAPABILITIES).join(', ')}.`,
      latencyMs: Date.now() - startTime,
    };
  }

  const primaryModelId = requestedModel as SupportedImageModelId;
  const candidateModels: SupportedImageModelId[] =
    primaryModelId === 'gemini-nano-banana-2.1'
      ? ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image']
      : [primaryModelId];

  const requestedAspect = String(params.aspectRatio || '1:1').trim();
  const cleanStyle = String(params.style || 'Realistic').trim();
  const styleDirective =
    IMAGE_STYLE_DIRECTIVES[cleanStyle] ||
    (cleanStyle && cleanStyle.toLowerCase() !== 'none' ? `${cleanStyle} style` : '');

  const finalPrompt = styleDirective
    ? `${cleanPrompt}\n\nStyle direction: ${styleDirective}.`
    : cleanPrompt;

  let lastClassified: { status: number; message: string } | null = null;
  let safeAspect = '1:1';

  for (const modelId of candidateModels) {
    const cap = IMAGE_MODEL_CAPABILITIES[modelId];
    safeAspect = (cap.aspectRatios as readonly string[]).includes(requestedAspect)
      ? requestedAspect
      : '1:1';

    if ((rasterQuotaCooldownUntil.get(modelId) ?? 0) > Date.now()) {
      lastClassified = {
        status: 429,
        message: 'Gemini image generation quota or rate limit reached for raster model.',
      };
      continue;
    }

    const requestedResolution = String(params.resolution || '').trim().toUpperCase();
    const safeResolution =
      cap.supportsResolution && (cap.resolutions as readonly string[]).includes(requestedResolution)
        ? requestedResolution
        : cap.supportsResolution
        ? '1K'
        : undefined;

    const imageConfig: { aspectRatio: string; imageSize?: string } = {
      aspectRatio: safeAspect,
    };
    if (safeResolution) {
      imageConfig.imageSize = safeResolution;
    }

    try {
      const response = await withTimeout(
        params.ai.models.generateContent({
          model: modelId,
          contents: finalPrompt,
          config: {
            imageConfig,
          },
        }),
        25000
      );

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let base64Image: string | null = null;
      let mimeType = 'image/png';
      const textParts: string[] = [];

      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Image = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        } else if (typeof part.text === 'string' && part.text.trim()) {
          textParts.push(part.text.trim());
        }
      }

      if (!base64Image) {
        const note = textParts.join(' ').slice(0, 300);
        lastClassified = {
          status: 422,
          message: note
            ? `No image was returned by ${modelId}: ${note}`
            : `No image data was returned by ${modelId}. Please try rephrasing your prompt.`,
        };
        continue;
      }

      rasterQuotaCooldownUntil.delete(modelId);
      return {
        ok: true as const,
        status: 200,
        imageDataUrl: `data:${mimeType};base64,${base64Image}`,
        mimeType,
        revisedPrompt: textParts.join(' ').trim() || undefined,
        modelUsed: modelId,
        aspectRatio: safeAspect,
        resolution: safeResolution,
        style: cleanStyle,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      lastClassified = classifyImageGenError(err);
      if (lastClassified.status === 429 || lastClassified.status === 403) {
        rasterQuotaCooldownUntil.set(modelId, Date.now() + MODEL_COOLDOWN_MS);
      }
      console.warn(`Raster image model ${modelId} unavailable (${lastClassified.status}): ${lastClassified.message}`);
      if (lastClassified.status === 401) {
        break;
      }
    }
  }

  // Automatic Free-Tier Vector Studio SVG fallback when raster models hit Free Tier quota (429) or billing gate (403)
  if (lastClassified && (lastClassified.status === 429 || lastClassified.status === 403 || lastClassified.status === 404)) {
    try {
      return await generateVectorFallbackSvg({
        ai: params.ai,
        prompt: cleanPrompt,
        style: cleanStyle,
        aspectRatio: safeAspect,
        startTime,
        notice:
          'Raster image models require paid-tier quota (current key has Free Tier limit 0). Generated a crisp Vector Studio SVG illustration instead using Gemini 4.',
      });
    } catch (svgErr: any) {
      const svgClassified = classifyImageGenError(svgErr);
      return {
        ok: false as const,
        status: svgClassified.status,
        error: svgClassified.message,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  return {
    ok: false as const,
    status: lastClassified?.status || 502,
    error: lastClassified?.message || 'Failed to generate image from Gemini AI.',
    latencyMs: Date.now() - startTime,
  };
}

app.get('/api/images/models', requireAuthenticatedUser, (_req: Request, res: Response): void => {
  res.json({
    defaultModel: 'gemini-3.1-flash-lite-image',
    models: Object.values(IMAGE_MODEL_CAPABILITIES),
  });
});

app.post('/api/images/generate', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({
      ok: false,
      error: 'Gemini API key is not configured on the server.',
    });
    return;
  }

  const result = await generateRasterImageWithGemini({
    ai,
    prompt: req.body?.prompt,
    style: req.body?.style,
    aspectRatio: req.body?.aspectRatio,
    resolution: req.body?.resolution,
    model: req.body?.model,
  });

  if (!result.ok) {
    res.status(result.status).json({
      ok: false,
      error: result.error,
      latencyMs: result.latencyMs,
    });
    return;
  }

  res.json(result);
});

app.post('/api/studio/image', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      task = 'describe',
      prompt = '',
      imageData,
      imageMimeType = 'image/jpeg',
      targetLanguage = 'en',
      style,
      aspectRatio,
      resolution,
      model,
    } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    if (task === 'generate-image') {
      const result = await generateRasterImageWithGemini({
        ai,
        prompt,
        style,
        aspectRatio,
        resolution,
        model,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, latencyMs: result.latencyMs });
        return;
      }
      res.json(result);
      return;
    }

    if (task === 'generate-svg') {
      if (!String(prompt).trim()) {
        res.status(400).json({ error: 'Please describe the artwork or diagram you want to generate.' });
        return;
      }

      const svgPrompt = `Create a rich, crisp, standalone SVG illustration (viewBox="0 0 800 500") representing: "${String(prompt).slice(0, 600)}".
Use clean gradients, layered geometric and organic paths, balanced colors, and zero external images or scripts.`;

      const { response, modelUsed } = await generateWithModelFallback(
        ai,
        (model) => ({
          model,
          contents: svgPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                svgMarkup: { type: Type.STRING, description: 'Complete valid <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">...</svg> code' },
                palette: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'description', 'svgMarkup'],
            },
          },
        }),
        14000,
        20000
      );

      const parsed = extractJsonText(response.text);
      res.json({
        ...parsed,
        modelUsed,
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    if (!imageData || typeof imageData !== 'string') {
      res.status(400).json({ error: 'Image upload is required for visual analysis.' });
      return;
    }

    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
    const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';

    const taskPrompts: Record<string, string> = {
      describe: `Provide a thorough, structured visual description of this image in ${langName}. Include scene composition, subjects, mood, colors, and context.`,
      ocr: `Extract ALL visible text from this image accurately, preserving line breaks and structure. Also provide a ${langName} translation if the text is in another language.`,
      screenshot: `Analyze this UI or code screenshot carefully: explain what the screen shows, identify errors or UX/code issues if any, and suggest concrete improvements.`,
      'edit-plan': `Provide creative and technical image editing suggestions (lighting, framing, color grading, crop, contrast, CSS filter values) tailored to this photo and the user's goal: "${prompt || 'Make it look studio-grade'}".`,
    };

    const instruction = `${taskPrompts[task] || taskPrompts.describe}\nAdditional user prompt: ${prompt || 'None'}`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: detectedMime, data: cleanBase64 } },
            { text: instruction },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING, description: 'Markdown formatted detailed analysis' },
              extractedText: { type: Type.STRING, description: 'All OCR text found in the image, or empty string if none' },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              editSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['analysis', 'extractedText', 'highlights'],
          },
        },
      }),
      14000,
      20000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 6. CODING LAB ENDPOINT (HTML, CSS, JS, Python, SQL)
app.post('/api/coding', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      language = 'javascript',
      mode = 'explain',
      code = '',
      prompt = '',
      memoryContext,
    } = req.body;

    if (!String(code).trim() && !String(prompt).trim()) {
      res.status(400).json({ error: 'Please enter a prompt or code snippet.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const systemInstruction = `You are Aadesh AI Coding Lab, a senior software architect and patient coding mentor supporting HTML, CSS, JavaScript, Python, and SQL.${memoryBlock}`;

    const userInstruction = `Language: ${language}
Mode: ${mode} (explain | debug | review | build | lesson)
User goal / question: ${prompt || 'Analyze and improve the code.'}

Source Code:
\`\`\`${language}
${String(code).slice(0, 24000)}
\`\`\`

If language is html, css, or javascript and mode is "build" or "lesson", also populate runnable "htmlCode", "cssCode", and "jsCode" for live preview where helpful.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: userInstruction,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              explanation: { type: Type.STRING, description: 'Clear Markdown explanation, bug fixes, or beginner-friendly lesson' },
              code: { type: Type.STRING, description: 'Clean improved or generated primary code' },
              htmlCode: { type: Type.STRING },
              cssCode: { type: Type.STRING },
              jsCode: { type: Type.STRING },
              tips: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'explanation', 'code', 'tips'],
          },
        },
      }),
      14000,
      20000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 7. STUDY HUB ENDPOINT (Notes, MCQ Quizzes, Practice Tests, Math, English/Nepali)
app.post('/api/study', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      mode = 'notes',
      topic = '',
      language = 'bilingual',
      questionCount = 5,
      extraContext = '',
      memoryContext,
    } = req.body;

    if (!String(topic).trim()) {
      res.status(400).json({ error: 'Please provide a topic or math problem to study.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const count = Math.max(3, Math.min(10, Number(questionCount) || 5));
    const langInstruction =
      language === 'ne'
        ? 'Respond primarily in natural Nepali (नेपाली) with key English technical terms in parentheses.'
        : language === 'en'
          ? 'Respond in clear English.'
          : 'Provide clear English study material AND helpful Nepali (नेपाली) explanations/summary so learners master concepts in both languages.';

    const memoryBlock = buildMemoryBlock(memoryContext);
    const prompt = `Mode: ${mode}
Topic / Problem: ${String(topic).slice(0, 2000)}
Additional instructions: ${String(extraContext).slice(0, 2000)}
${langInstruction}${memoryBlock}

If mode is "mcq", "practice_test", or "exam_prep", generate ${count} well-crafted multiple choice questions with 4 options each, the 0-based correctIndex, an explanation, and a brief Nepali hint. Even for "notes", "math", or "english_nepali", include 3 quick check questions so the student can test understanding.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              notesMarkdown: { type: Type.STRING, description: 'Detailed study notes, math step-by-step solution, or exam prep guide in Markdown' },
              nepaliSummary: { type: Type.STRING, description: 'Concise Nepali explanation of the core concept' },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    nepaliHint: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctIndex', 'explanation'],
                },
              },
            },
            required: ['title', 'notesMarkdown', 'nepaliSummary', 'questions'],
          },
        },
      }),
      15000,
      22000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 8. PDF & DOCUMENT AI ENDPOINT (PDF, DOCX, CSV, TXT, MD, JSON)
app.post('/api/document', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      fileName = 'document.txt',
      mimeType = 'text/plain',
      fileBase64 = '',
      textContent = '',
      task = 'summary',
      question = '',
      targetLanguage = 'en',
    } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const lowerName = String(fileName).toLowerCase();
    const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx');

    const parts: Array<Record<string, any>> = [];
    let extractedPreview = '';

    if (isPdf && fileBase64) {
      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: cleanBase64,
        },
      });
      extractedPreview = `PDF document attached (${fileName})`;
    } else if (isDocx && fileBase64) {
      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = (result.value || '').trim();
      if (!extractedText) {
        res.status(400).json({ error: 'Could not extract readable text from this DOCX file.' });
        return;
      }
      extractedPreview = extractedText.slice(0, 4000);
      parts.push({
        text: `[DOCX File: ${fileName}]\n${extractedText.slice(0, 32000)}`,
      });
    } else {
      const rawText = String(textContent || '').trim();
      if (!rawText) {
        res.status(400).json({ error: 'Please upload a readable PDF, DOCX, CSV, TXT, JSON, or Markdown file.' });
        return;
      }
      extractedPreview = rawText.slice(0, 4000);
      parts.push({
        text: `[Document: ${fileName}]\n${rawText.slice(0, 32000)}`,
      });
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const taskPrompt =
      task === 'qa'
        ? `Answer this specific question about the attached document accurately in ${langName}: "${question || 'What is the main topic?'}"`
        : task === 'extract'
          ? `Extract all important entities, dates, numbers, metrics, action items, and key data points from this document in ${langName}.`
          : `Summarize this document clearly in ${langName}, including an executive overview and bullet takeaways.`;

    parts.push({ text: taskPrompt });

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING, description: 'Markdown formatted answer or summary' },
              keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              wordCountEstimate: { type: Type.INTEGER },
            },
            required: ['answer', 'keyFacts'],
          },
        },
      }),
      16000,
      24000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      answer: parsed.answer || response.text || '',
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      wordCountEstimate: parsed.wordCountEstimate || 0,
      extractedPreview,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 9. WEB SEARCH & RESEARCH ENDPOINT (Google Search + URL Context Grounding)
app.post('/api/research', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      query: researchQuery = '',
      mode = 'search',
      urls = [],
      targetLanguage = 'en',
    } = req.body;

    if (!String(researchQuery).trim() && (!Array.isArray(urls) || urls.length === 0)) {
      res.status(400).json({ error: 'Please enter a research topic, claim to fact-check, or webpage URL.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const cleanUrls = Array.isArray(urls)
      ? urls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 4)
      : [];

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const modeDirectives: Record<string, string> = {
      search: `Perform live web research using Google Search. Provide a well-structured, up-to-date answer in ${langName} with citations and clear takeaways.`,
      webpage: `Analyze and summarize the provided webpage URL(s) clearly in ${langName}, highlighting key facts and insights.`,
      factcheck: `Fact-check the claim using current web sources. State clearly whether it is Supported, Partially True, Disputed, or False, and explain the evidence in ${langName}.`,
      compare: `Compare multiple perspectives and authoritative sources on this topic in ${langName}. Present a structured Markdown comparison table or bullet breakdown.`,
    };

    const fullPrompt = `${modeDirectives[mode] || modeDirectives.search}

Query / Claim: ${String(researchQuery).slice(0, 2000)}
${cleanUrls.length > 0 ? `Reference URLs:\n${cleanUrls.join('\n')}` : ''}`;

    const tools: Array<Record<string, any>> =
      cleanUrls.length > 0 ? [{ urlContext: {} }, { googleSearch: {} }] : [{ googleSearch: {} }];

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          tools,
        },
      }),
      16000,
      24000
    );

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceMap = new Map<string, { title: string; uri: string }>();
    for (const chunk of chunks) {
      const web = (chunk as any)?.web;
      if (web?.uri && !sourceMap.has(web.uri)) {
        sourceMap.set(web.uri, {
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    res.json({
      answer: response.text || 'Research complete.',
      sources: Array.from(sourceMap.values()),
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 10. VIDEO ASSISTANT ENDPOINT (Video understanding, summaries, SRT subtitles, transcript & scripts)
app.post('/api/video', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      task = 'summarize',
      prompt = '',
      transcriptText = '',
      videoData = '',
      videoMimeType = 'video/mp4',
      targetLanguage = 'en',
    } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    if (!videoData && !String(transcriptText).trim() && !String(prompt).trim()) {
      res.status(400).json({ error: 'Upload a short video clip or enter a transcript, topic, or script prompt.' });
      return;
    }

    const parts: Array<Record<string, any>> = [];
    if (videoData && typeof videoData === 'string') {
      const mimeMatch = videoData.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : videoMimeType;
      const cleanBase64 = videoData.replace(/^data:video\/[a-zA-Z0-9.+-]+;base64,/, '');
      parts.push({ inlineData: { mimeType: detectedMime, data: cleanBase64 } });
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    parts.push({
      text: `You are Aadesh AI Video Assistant.
Task: ${task} (understand | summarize | subtitles | transcribe | script).
Target language: ${langName}.
User instructions/topic: ${String(prompt).slice(0, 2000)}
${transcriptText ? `\nProvided Transcript/Notes:\n${String(transcriptText).slice(0, 18000)}` : ''}

Return a helpful summary, cleaned speech transcript (if applicable), valid SRT subtitle cues with timestamps (00:00:00,000 --> 00:00:04,000), a production-ready video script (if requested or helpful), and key visual/audio highlights.`,
    });

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              transcript: { type: Type.STRING },
              subtitlesSrt: { type: Type.STRING },
              script: { type: Type.STRING },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'highlights'],
          },
        },
      }),
      18000,
      26000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 11. PERSONAL AI ASSISTANT ENDPOINT (Daily Planner, Task Breakdown, Email & Writing Drafter)
app.post('/api/assistant', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      mode = 'daily_plan',
      prompt = '',
      existingTasks = [],
      memoryContext,
      targetLanguage = 'en',
    } = req.body;

    if (!String(prompt).trim() && (!Array.isArray(existingTasks) || existingTasks.length === 0)) {
      res.status(400).json({ error: 'Please describe your schedule, goal, or email draft request.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const tasksSummary = Array.isArray(existingTasks)
      ? existingTasks
          .slice(0, 15)
          .map((t: any) => `- [${t.completed ? 'x' : ' '}] ${t.title} (${t.priority || 'medium'}${t.dueTime ? `, ${t.dueTime}` : ''})`)
          .join('\n')
      : '';

    const fullPrompt = `You are Aadesh AI Personal Productivity Assistant. Respond in ${langName}.${memoryBlock}
Mode: ${mode} (daily_plan | task_breakdown | email_draft | writing)
User request: ${String(prompt).slice(0, 3000)}
${tasksSummary ? `\nCurrent User Tasks:\n${tasksSummary}` : ''}

Provide structured Markdown output in "content", plus an optional "emailSubject" (for email_draft), and 2-5 actionable "suggestedTasks" that the user can optionally add to their planner.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              emailSubject: { type: Type.STRING },
              suggestedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    category: { type: Type.STRING },
                    dueTime: { type: Type.STRING },
                  },
                  required: ['title', 'priority', 'category'],
                },
              },
            },
            required: ['title', 'content', 'suggestedTasks'],
          },
        },
      }),
      12000,
      18000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 11B. VOICE AUDIO TRANSCRIPTION ENDPOINT (Gemini Speech-to-Text for recorded audio)
app.post('/api/voice/transcribe', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      audioData = '',
      mimeType = 'audio/webm',
      languageHint = 'auto',
    } = req.body;

    if (!audioData || typeof audioData !== 'string') {
      res.status(400).json({ error: 'Recorded audio data is required for transcription.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const mimeMatch = audioData.match(/^data:(audio\/[a-zA-Z0-9.+-]+(?:;\s*codecs=[^;]+)?);base64,/);
    const detectedMime = (mimeMatch ? mimeMatch[1].split(';')[0] : mimeType).trim() || 'audio/webm';
    const cleanBase64 = audioData.replace(/^data:audio\/[^;]+(?:;[^,]+)*;base64,/, '');

    const audioPart = {
      inlineData: {
        mimeType: detectedMime,
        data: cleanBase64,
      },
    };
    const langHintName = LANGUAGE_NAMES[languageHint] || languageHint;
    const promptPart = {
      text: `Transcribe the spoken audio accurately verbatim.${languageHint && languageHint !== 'auto' ? ` Expected language: ${langHintName} (${languageHint}).` : ''} Return ONLY the exact spoken transcript with proper punctuation, no extra commentary.`,
    };

    const modelsToTry = ['gemini-3.5-transcribe', ...getCandidateModels()];
    let transcriptText = '';
    let usedModel = modelsToTry[0];
    let lastErr: unknown = null;

    for (const model of modelsToTry) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: { parts: [audioPart, promptPart] },
          }),
          18000
        );
        transcriptText = (response.text || '').trim();
        usedModel = model;
        if (transcriptText) break;
      } catch (err) {
        lastErr = err;
        if (isAuthFailure(err)) throw err;
      }
    }

    if (!transcriptText && lastErr) {
      throw lastErr;
    }

    res.json({
      transcript: transcriptText,
      modelUsed: usedModel,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 11C. GEMINI NEURAL TEXT-TO-SPEECH & AI VOICE GENERATOR ENDPOINT
const ALLOWED_GEMINI_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

app.post('/api/voice/tts', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      text = '',
      voiceName = 'Kore',
      style = '',
      model = 'gemini-3.8-flash-lite-tts',
      languageName = '',
    } = req.body;

    const cleanText = String(text || '').trim();
    if (!cleanText) {
      res.status(400).json({ error: 'Please enter text to generate AI voice audio.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured for AI Voice Generation.',
        fallbackAvailable: true,
      });
      return;
    }

    const selectedVoice = ALLOWED_GEMINI_VOICES.has(voiceName) ? voiceName : 'Kore';
    const ttsModel =
      model === 'gemini-3.8-flash-tts' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
    const cleanStyle = String(style || '').trim().slice(0, 180);
    const effectiveStyle = [
      cleanStyle,
      languageName ? `Natural pronunciation in ${String(languageName).slice(0, 40)}` : '',
    ]
      .filter(Boolean)
      .join('. ');

    const partPayload: Record<string, any> = {
      text: cleanText.slice(0, 3500),
    };
    if (effectiveStyle) {
      partPayload.speechMetadata = { style: effectiveStyle };
    }

    const response = await withTimeout(
      ai.models.generateContent({
        model: ttsModel,
        contents: [
          {
            role: 'user',
            parts: [partPayload],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      }),
      22000
    );

    const inlineAudio = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p?.inlineData?.data
    )?.inlineData;

    if (!inlineAudio?.data) {
      res.status(502).json({
        error: 'Gemini TTS did not return audio data for this request. Browser Text-to-Speech fallback is available.',
        fallbackAvailable: true,
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    res.json({
      audioBase64: inlineAudio.data,
      mimeType: inlineAudio.mimeType || 'audio/wav',
      voiceName: selectedVoice,
      modelUsed: ttsModel,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      fallbackAvailable: true,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 12. AI AGENT HUB ENDPOINT (Multi-step Planning + Priority + Estimated Time + Explicit Approval Actions)
app.post('/api/agent', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      agentType = 'research',
      goal = '',
      memoryContext,
      context = '',
    } = req.body;

    if (!String(goal).trim()) {
      res.status(400).json({ error: 'Please specify a goal for the agent.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const agentRoles: Record<string, string> = {
      research: 'Research Agent — synthesizes structured investigation plans, questions, and source checklists.',
      study: 'Study Agent — builds multi-step mastery schedules, concept breakdowns, and active recall drills.',
      coding: 'Coding Agent — architects modular software plans, code templates, testing strategies, and refactoring steps.',
      writing: 'Writing Agent — plans outlines, drafts polished copy, and refines tone and clarity.',
      translation: 'Translation Agent — handles bilingual English/Nepali & global localization workflows with cultural nuance.',
      productivity: 'Productivity Agent — decomposes big goals into timed sprints, task queues, and follow-up drafts.',
    };

    const fullPrompt = `You are the ${agentRoles[agentType] || agentRoles.research}${memoryBlock}
Goal: ${String(goal).slice(0, 2500)}
${context ? `Additional Context: ${String(context).slice(0, 2000)}` : ''}

Create a clear 3 to 5 step execution plan with:
- priority ("high" | "medium" | "low") reflecting execution urgency/impact
- estimatedMinutes (realistic integer minutes between 1 and 45) and estimatedTime (e.g. "2 min", "5 min", "10 min")
- substantive Markdown output for each step
AND propose 1 to 3 optional actions in "proposedActions" (types allowed: "save_memory", "create_task", "draft_email", "download_file") that MUST wait for explicit user approval before taking effect.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              agentName: { type: Type.STRING },
              summary: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    priority: { type: Type.STRING, description: 'high, medium, or low' },
                    estimatedMinutes: { type: Type.INTEGER, description: 'Estimated duration in minutes' },
                    estimatedTime: { type: Type.STRING, description: 'Short readable duration such as ~2 min' },
                    output: { type: Type.STRING },
                  },
                  required: ['stepNumber', 'title', 'detail', 'priority', 'estimatedMinutes', 'estimatedTime', 'output'],
                },
              },
              proposedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    content: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['id', 'type', 'title', 'description', 'content'],
                },
              },
            },
            required: ['agentName', 'summary', 'steps', 'proposedActions'],
          },
        },
      }),
      15000,
      22000
    );

    const parsed = extractJsonText(response.text);
    const normalizedActions = Array.isArray(parsed.proposedActions)
      ? parsed.proposedActions.map((a: any, idx: number) => ({
          id: a.id || `act-${Date.now()}-${idx}`,
          type: ['save_memory', 'create_task', 'draft_email', 'download_file', 'open_url'].includes(a.type)
            ? a.type
            : 'create_task',
          title: a.title || 'Proposed Action',
          description: a.description || '',
          payload: {
            content: String(a.content || a.title || ''),
            subject: String(a.subject || ''),
            category: String(a.category || 'preference'),
          },
        }))
      : [];

    res.json({
      agentName: parsed.agentName || 'Aadesh AI Agent',
      summary: parsed.summary || '',
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s: any, idx: number) => {
            const rawPriority = String(s.priority || '').toLowerCase().trim();
            const priority = ['high', 'medium', 'low'].includes(rawPriority)
              ? rawPriority
              : idx === 0
              ? 'high'
              : idx === 1
              ? 'medium'
              : 'low';
            const estMins = Math.max(1, Math.min(120, Number(s.estimatedMinutes) || (idx === 0 ? 2 : 3)));
            const estLabel =
              typeof s.estimatedTime === 'string' && s.estimatedTime.trim()
                ? s.estimatedTime.trim()
                : `${estMins} min`;
            return {
              id: `step-${Date.now()}-${idx + 1}`,
              stepNumber: s.stepNumber || idx + 1,
              title: s.title || `Step ${idx + 1}`,
              detail: s.detail || '',
              priority,
              estimatedMinutes: estMins,
              estimatedTime: estLabel,
              output: s.output || '',
              status: 'completed',
            };
          })
        : [],
      proposedActions: normalizedActions,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 13. INTELLIGENT AI AUTOMATION HUB ENDPOINT
app.post('/api/automation/suggest', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      category = 'emails',
      tone = 'professional',
      userContext = '',
      conversationHistory = [],
      targetLanguage = 'en',
      memoryContext,
    } = req.body || {};

    const validCategories: Record<string, { label: string; focus: string; service: string }> = {
      emails: {
        label: 'Emails',
        focus: 'Inbox triage, priority follow-ups, high-converting email templates, and thread summarization',
        service: 'Gmail / Workspace Email OAuth',
      },
      lead_generation: {
        label: 'Lead Generation',
        focus: 'Ideal customer targeting, multi-touch outreach sequences, qualification criteria, and CRM scoring',
        service: 'CRM / LinkedIn Outreach Connector',
      },
      content_creation: {
        label: 'Content Creation',
        focus: 'High-impact hooks, omnichannel content calendars, repurposing workflows, and localized copy',
        service: 'Publishing & Social Scheduler API',
      },
      customer_support: {
        label: 'Customer Support',
        focus: 'Rapid ticket triage, empathetic troubleshooting playbooks, SLA escalation rules, and FAQ macros',
        service: 'Helpdesk / Zendesk / Intercom Integration',
      },
      business_reports: {
        label: 'Business Reports',
        focus: 'Automated weekly KPI synthesis, anomaly detection, executive scorecards, and stakeholder briefs',
        service: 'Google Sheets / Analytics Data Connector',
      },
    };

    const validTones: Record<string, string> = {
      professional: 'Tone: Professional — crisp, executive, structured, data-driven, and persuasive.',
      friendly: 'Tone: Friendly — warm, approachable, conversational, and relationship-first.',
      creative: 'Tone: Creative — vivid, original, storytelling-driven, and memorable.',
      concise: 'Tone: Concise — ultra-direct, high-signal, punchy, and zero filler.',
    };

    const catInfo = validCategories[String(category)] || validCategories.emails;
    const toneInstruction = validTones[String(tone)] || validTones.professional;
    const targetLangName = LANGUAGE_NAMES[String(targetLanguage)] || String(targetLanguage) || 'English';

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const historyText = Array.isArray(conversationHistory)
      ? conversationHistory
          .slice(-6)
          .map((turn: any) => {
            const promptLine = String(turn?.userPrompt || '').trim();
            const replyLine = String(turn?.assistantMessage || '').trim();
            return [
              promptLine ? `User (${turn?.tone || tone}): ${promptLine.slice(0, 350)}` : '',
              replyLine ? `Aadesh Automation AI: ${replyLine.slice(0, 500)}` : '',
            ]
              .filter(Boolean)
              .join('\n');
          })
          .filter(Boolean)
          .join('\n---\n')
      : '';

    const memoryBlock = buildMemoryBlock(memoryContext);
    const prompt = `You are Aadesh AI Intelligent Automation Hub strategist answering the 2026 automation priority workflow.
Selected Automation Pillar: ${catInfo.label} (${catInfo.focus})
Required Language: ${targetLangName}
${toneInstruction}${memoryBlock}

HONESTY & ACTION RULE:
- Do NOT pretend external emails were sent, live CRM records were updated, or third-party apps were triggered unless authorized/connected.
- Deliver concrete, immediately usable drafts, templates, decision rules, or step-by-step workflows tailored to the user's intent.
- Recommend ONE specific Best Next Action with clear rationale and whether external connection (${catInfo.service}) is required or can be drafted in workspace right now.
- Provide EXACTLY 3 concise, high-value smart reply follow-up buttons ("smartReplies", 3-8 words each) tailored to advancing this workflow.

${historyText ? `Previous Automation Conversation Context:\n${historyText}\n\n` : ''}User Goal / Customization Request:
${String(userContext || `Design my high-ROI 2026 automation workflow for ${catInfo.label} with an immediate first template I can use today.`).slice(0, 2500)}`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING, description: 'Action-focused strategy title' },
              assistantMessage: { type: Type.STRING, description: 'Rich, human-like Markdown recommendation and ready-to-use copy/workflow' },
              smartReplies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 3 context-aware follow-up smart reply suggestions (3 to 8 words each)',
              },
              recommendedNextAction: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                  requiredService: { type: Type.STRING },
                  integrationStatus: { type: Type.STRING, description: 'requires_oauth or ready_in_workspace' },
                },
                required: ['title', 'rationale', 'requiredService', 'integrationStatus'],
              },
              actionPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 concrete implementation steps',
              },
            },
            required: ['headline', 'assistantMessage', 'smartReplies', 'recommendedNextAction', 'actionPlan'],
          },
        },
      }),
      13000,
      20000
    );

    const parsed = extractJsonText(response.text);
    const smartReplies = Array.isArray(parsed.smartReplies)
      ? parsed.smartReplies
          .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
          .slice(0, 3)
      : [];
    while (smartReplies.length < 3) {
      const defaults = [
        'Customize this template for my team',
        'Make it shorter and higher converting',
        'Break into automated daily triggers',
      ];
      smartReplies.push(defaults[smartReplies.length]);
    }

    const nextAct = parsed.recommendedNextAction || {};
    res.json({
      headline: parsed.headline || `${catInfo.label} Automation Playbook`,
      assistantMessage: parsed.assistantMessage || response.text || '',
      smartReplies,
      recommendedNextAction: {
        title: String(nextAct.title || `Launch ${catInfo.label} Draft Workflow`),
        rationale: String(nextAct.rationale || `Highest leverage first step for ${catInfo.label}.`),
        requiredService: String(nextAct.requiredService || catInfo.service),
        integrationStatus:
          nextAct.integrationStatus === 'ready_in_workspace' ? 'ready_in_workspace' : 'requires_oauth',
      },
      actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan.slice(0, 5) : [],
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 14. SCHEDULED & ON-DEMAND AUTOMATION EXECUTION ENDPOINT
app.post('/api/automation/execute', requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const executedAt = new Date().toISOString();
  try {
    const {
      scheduleId = 'manual',
      taskTitle = 'Automated Workflow Run',
      category = 'emails',
      tone = 'professional',
      prompt = '',
      frequency = 'manual',
      triggerType = 'manual',
      targetLanguage = 'en',
      memoryContext,
    } = req.body || {};

    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) {
      res.status(400).json({
        ok: false,
        status: 'failed',
        error: 'Automation prompt or instructions are required to execute this task.',
        latencyMs: Date.now() - startTime,
        executedAt,
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        ok: false,
        status: 'failed',
        error: 'Gemini API key is not configured on the server or in Settings.',
        latencyMs: Date.now() - startTime,
        executedAt,
      });
      return;
    }

    const categoryLabels: Record<string, string> = {
      emails: 'Emails & Inbox Triage',
      lead_generation: 'Lead Generation & Outreach',
      content_creation: 'Content Creation & Repurposing',
      customer_support: 'Customer Support & SLA Macros',
      business_reports: 'Business KPI Reports & Insights',
    };

    const targetLangName = LANGUAGE_NAMES[String(targetLanguage)] || String(targetLanguage) || 'English';
    const memoryBlock = buildMemoryBlock(memoryContext);
    const fullPrompt = `You are Aadesh AI Automated Task Execution Engine running a ${String(frequency)} automation task (${String(triggerType)} trigger).
Task Title: ${String(taskTitle).slice(0, 200)}
Automation Pillar: ${categoryLabels[String(category)] || String(category)}
Required Tone: ${String(tone)}
Target Language: ${targetLangName}
Schedule Ref: ${String(scheduleId)}${memoryBlock}

Task Instructions:
${cleanPrompt.slice(0, 2500)}

Produce the completed automated deliverable for this run in structured Markdown, plus 3 concise key outcomes ("highlights") and a one-sentence recommendation for the next scheduled run ("nextScheduledNote"). Do NOT fabricate external API send receipts if no external OAuth integration was supplied—produce the ready-to-send / ready-to-publish deliverable cleanly.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executionHeadline: { type: Type.STRING },
              deliverableContent: { type: Type.STRING },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              nextScheduledNote: { type: Type.STRING },
            },
            required: ['executionHeadline', 'deliverableContent', 'highlights', 'nextScheduledNote'],
          },
        },
      }),
      14000,
      20000
    );

    const parsed = extractJsonText(response.text);
    const deliverable = String(parsed.deliverableContent || response.text || '').trim();
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h: unknown): h is string => typeof h === 'string' && h.trim().length > 0).slice(0, 4)
      : [];

    res.json({
      ok: true,
      status: 'success',
      executionHeadline: String(parsed.executionHeadline || taskTitle),
      deliverableContent: deliverable,
      highlights,
      nextScheduledNote: String(parsed.nextScheduledNote || 'Scheduled task completed cleanly.'),
      modelUsed,
      latencyMs: Date.now() - startTime,
      executedAt,
    });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    res.status(isAuthFailure(err) ? 401 : 502).json({
      ok: false,
      status: 'failed',
      error: safeError,
      latencyMs: Date.now() - startTime,
      executedAt,
    });
  }
});

// 15. REVERSE-GEOCODE GPS COORDINATES TO COUNTRY CODE (NO RAW COORDINATES STORED)
app.get('/api/geo/reverse-country', async (req: Request, res: Response): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ ok: false, error: 'Valid latitude and longitude are required.' });
    return;
  }

  try {
    // Primary: BigDataCloud reverse-geocode client API (fast, free, CORS-independent)
    const bdcController = new AbortController();
    const bdcTimer = setTimeout(() => bdcController.abort(), 4500);
    try {
      const bdcRes = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
          lat.toFixed(4)
        )}&longitude=${encodeURIComponent(lng.toFixed(4))}&localityLanguage=en`,
        { signal: bdcController.signal }
      );
      if (bdcRes.ok) {
        const bdcData = await bdcRes.json();
        const code = String(bdcData?.countryCode || '').trim().toUpperCase();
        const country = String(bdcData?.countryName || '').trim();
        if (/^[A-Z]{2}$/.test(code) || country) {
          res.json({ ok: true, code, country, source: 'gps-reverse-geocode' });
          return;
        }
      }
    } finally {
      clearTimeout(bdcTimer);
    }

    // Secondary: OpenStreetMap Nominatim reverse geocode
    const nomController = new AbortController();
    const nomTimer = setTimeout(() => nomController.abort(), 5000);
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
          lat.toFixed(4)
        )}&lon=${encodeURIComponent(lng.toFixed(4))}&zoom=3&addressdetails=1`,
        {
          headers: { 'User-Agent': 'AadeshAI/2.5 (CountryDetection)' },
          signal: nomController.signal,
        }
      );
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const code = String(nomData?.address?.country_code || '').trim().toUpperCase();
        const country = String(nomData?.address?.country || '').trim();
        if (/^[A-Z]{2}$/.test(code) || country) {
          res.json({ ok: true, code, country, source: 'gps-nominatim' });
          return;
        }
      }
    } finally {
      clearTimeout(nomTimer);
    }

    res.status(404).json({ ok: false, error: 'Unable to determine country from GPS coordinates.' });
  } catch (err) {
    res.status(502).json({ ok: false, error: sanitizeErrorMessage(err) });
  }
});

// 16. APPROXIMATE IP / EDGE REGION COUNTRY DETECTION (PRIVACY-SAFE, NO PERSISTENCE)
app.get('/api/geo/ip-country', async (req: Request, res: Response): Promise<void> => {
  const headerCode = String(
    req.headers['x-vercel-ip-country'] ||
      req.headers['cf-ipcountry'] ||
      req.headers['x-country-code'] ||
      ''
  )
    .trim()
    .toUpperCase();

  if (/^[A-Z]{2}$/.test(headerCode) && headerCode !== 'XX' && headerCode !== 'T1') {
    res.json({ ok: true, code: headerCode, approximate: true, source: 'edge-header' });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const ipRes = await fetch('https://ipapi.co/json/', {
        headers: { 'User-Agent': 'AadeshAI/2.5' },
        signal: controller.signal,
      });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        const code = String(ipData?.country_code || '').trim().toUpperCase();
        const country = String(ipData?.country_name || '').trim();
        const timezone = String(ipData?.timezone || '').trim();
        if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
          res.json({ ok: true, code, country, ...(timezone ? { timezone } : {}), approximate: true, source: 'ip-lookup' });
          return;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Non-fatal primary fallback
  }

  try {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 3500);
    try {
      const ipWhoRes = await fetch('https://ipwho.is/', {
        headers: { 'User-Agent': 'AadeshAI/2.5' },
        signal: controller2.signal,
      });
      if (ipWhoRes.ok) {
        const whoData = await ipWhoRes.json();
        const code = String(whoData?.country_code || '').trim().toUpperCase();
        const country = String(whoData?.country || '').trim();
        const timezone = String(whoData?.timezone?.id || '').trim();
        if (whoData?.success !== false && /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
          res.json({ ok: true, code, country, ...(timezone ? { timezone } : {}), approximate: true, source: 'ip-lookup-secondary' });
          return;
        }
      }
    } finally {
      clearTimeout(timer2);
    }
  } catch {
    // Non-fatal secondary fallback
  }

  res.json({ ok: false, approximate: true });
});

// Structured JSON 404 for unknown /api/* endpoints (prevents HTML SPA fallback on missing API routes)
app.all('/api/*', (req: Request, res: Response): void => {
  res.status(404).json({
    ok: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Vite middleware in dev or static files in local production
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.VERCEL_ENV) {
    const vitePackage = 'vite';
    const { createServer } = await import(/* @vite-ignore */ vitePackage);
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(safeDirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(safeDirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    const candidates = getCandidateModels();
    console.log(`Aadesh AI server active on http://${HOST}:${PORT} (primary model: ${candidates[0]})`);
  });
}

// Only start HTTP listener locally; on Vercel or test imports, /api/index.ts or tests use exported helpers directly
if (!process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.AADESH_SKIP_SERVER_LISTEN) {
  void startServer();
}

export { app };
export default app;
