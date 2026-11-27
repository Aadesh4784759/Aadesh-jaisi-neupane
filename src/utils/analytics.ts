import { Analytics, getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { app } from './firebase';
import { sanitizeProviderSecretText } from './aiProviders';
import firebaseConfig from '../../firebase-applet-config.json';

export type AllowedAnalyticsEventName =
  | 'login'
  | 'sign_up'
  | 'chat_message_sent'
  | 'model_switched'
  | 'ai_error';

const BLOCKED_PARAM_KEYS = new Set([
  'email',
  'user_email',
  'password',
  'token',
  'id_token',
  'apikey',
  'api_key',
  'key',
  'secret',
  'prompt',
  'message',
  'content',
  'text',
  'reply',
  'name',
  'display_name',
  'phone',
  'uid',
  'user_id',
  'ip',
  'lat',
  'lng',
  'latitude',
  'longitude',
]);

let analyticsPromise: Promise<Analytics | null> | null = null;

function isMeasurementConfigured(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      app &&
      typeof firebaseConfig?.measurementId === 'string' &&
      firebaseConfig.measurementId.trim().startsWith('G-')
  );
}

async function resolveAnalyticsInstance(): Promise<Analytics | null> {
  if (!isMeasurementConfigured()) return null;
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported && app ? getAnalytics(app) : null))
      .catch(() => null);
  }
  return analyticsPromise;
}

/**
 * Strips any PII, credentials, emails, tokens, or chat body text from analytics parameters.
 */
export function sanitizeAnalyticsPayload(
  rawParams?: Record<string, unknown>
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!rawParams || typeof rawParams !== 'object') return clean;

  for (const [rawKey, rawVal] of Object.entries(rawParams)) {
    const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key || BLOCKED_PARAM_KEYS.has(key)) continue;
    if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
      clean[key] = rawVal;
    } else if (typeof rawVal === 'boolean') {
      clean[key] = rawVal;
    } else if (typeof rawVal === 'string') {
      const sanitized = sanitizeProviderSecretText(rawVal)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .trim()
        .slice(0, 64);
      if (sanitized) {
        clean[key] = sanitized;
      }
    }
  }
  return clean;
}

/**
 * Consent-gated Firebase Analytics event emitter.
 * Strictly no-ops unless explicit analyticsConsent is true.
 */
export async function trackAnalyticsEvent(
  eventName: AllowedAnalyticsEventName,
  params: Record<string, unknown>,
  analyticsConsent: boolean
): Promise<boolean> {
  if (!analyticsConsent) return false;
  const sanitized = sanitizeAnalyticsPayload(params);
  const instance = await resolveAnalyticsInstance();
  if (!instance) return false;

  try {
    logEvent(instance, eventName as string, sanitized);
    return true;
  } catch {
    return false;
  }
}
