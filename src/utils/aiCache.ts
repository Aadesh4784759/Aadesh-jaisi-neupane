export interface AICacheEntry {
  reply: string;
  translation?: string;
  detectedLanguage?: string;
  sentiment?: string;
  suggestedQuestions?: string[];
  geotagInsights?: string;
  modelUsed?: string;
  timestamp: number;
}

const CACHE_STORAGE_KEY = 'aadesh_ai_response_cache_v1';
const MAX_CACHE_ITEMS = 150;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedAIResponse(
  provider: string,
  model: string,
  prompt: string,
  targetLang: string
): AICacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const cacheMap: Record<string, AICacheEntry> = JSON.parse(raw);
    const key = `${provider}:${model}:${targetLang}:${prompt.trim().toLowerCase()}`;
    const entry = cacheMap[key];
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      delete cacheMap[key];
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheMap));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function cacheAIResponse(
  provider: string,
  model: string,
  prompt: string,
  targetLang: string,
  data: Omit<AICacheEntry, 'timestamp'>
): void {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    const cacheMap: Record<string, AICacheEntry> = raw ? JSON.parse(raw) : {};
    const key = `${provider}:${model}:${targetLang}:${prompt.trim().toLowerCase()}`;

    cacheMap[key] = {
      ...data,
      timestamp: Date.now(),
    };

    // Enforce max cache size limit by evicting oldest entries
    const entries = Object.entries(cacheMap);
    if (entries.length > MAX_CACHE_ITEMS) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const trimmed: Record<string, AICacheEntry> = {};
      for (let i = 0; i < MAX_CACHE_ITEMS; i++) {
        trimmed[entries[i][0]] = entries[i][1];
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }

    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheMap));
  } catch (err) {
    console.error('Failed to cache AI response:', err);
  }
}
