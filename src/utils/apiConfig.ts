export const PRODUCTION_VERCEL_API_ORIGIN = 'https://aadesh-jaisi-neupane.vercel.app';

export const FIREBASE_HOSTING_HOSTNAMES = new Set<string>([
  'aadesh-ai-global.web.app',
  'aadesh-ai-global.firebaseapp.com',
]);

export function normalizeApiBaseUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.origin.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function isFirebaseHostingHostname(hostname?: string | null): boolean {
  const cleanHost = String(hostname || '').trim().toLowerCase();
  if (!cleanHost) return false;
  if (FIREBASE_HOSTING_HOSTNAMES.has(cleanHost)) return true;
  if (/^aadesh-ai-global(?:--[a-z0-9-]+)?\.(?:web\.app|firebaseapp\.com)$/.test(cleanHost)) {
    return true;
  }
  return false;
}

export function resolveApiBaseUrl(options?: {
  envApiBaseUrl?: string | null;
  windowOrigin?: string | null;
  windowHostname?: string | null;
}): string {
  const envRaw =
    options && 'envApiBaseUrl' in options
      ? options.envApiBaseUrl
      : typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_API_BASE_URL
      : undefined;

  const currentOrigin =
    options && 'windowOrigin' in options
      ? String(options.windowOrigin || '').trim()
      : typeof window !== 'undefined' && window.location
      ? window.location.origin
      : '';

  const currentHostname =
    options && 'windowHostname' in options
      ? String(options.windowHostname || '').trim().toLowerCase()
      : typeof window !== 'undefined' && window.location
      ? window.location.hostname.toLowerCase()
      : '';

  const normalizedEnv = normalizeApiBaseUrl(envRaw);
  if (normalizedEnv) {
    if (currentOrigin && normalizedEnv === currentOrigin.replace(/\/+$/, '')) {
      return '';
    }
    return normalizedEnv;
  }

  if (isFirebaseHostingHostname(currentHostname)) {
    return PRODUCTION_VERCEL_API_ORIGIN;
  }

  return '';
}

export function buildApiUrl(
  path: string,
  options?: {
    envApiBaseUrl?: string | null;
    windowOrigin?: string | null;
    windowHostname?: string | null;
  }
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = resolveApiBaseUrl(options);
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
