import {
  PreferredSuggestionPatterns,
  SuggestionAnalyticsItem,
  SuggestionCategory,
} from '../types';

const SUGGESTION_ANALYTICS_STORAGE_PREFIX = 'aadesh_ai_suggestion_analytics_v1';

const CATEGORY_MATCHERS: Array<{ category: SuggestionCategory; patterns: RegExp[] }> = [
  {
    category: 'translate',
    patterns: [
      /\b(translate|translation|meaning in|(?:explain|write|say|translate)\s+in\s+(?:nepali|hindi|spanish|french|japanese|arabic|chinese|korean|german|portuguese|english|urdu)|nepali|hindi|spanish|french|japanese|arabic|chinese)\b/i,
      /अनुवाद|नेपाली|हिन्दी/i,
    ],
  },
  {
    category: 'examples',
    patterns: [
      /\b(example|examples|sample|real[- ]world|demonstrate|use case|show me|code snippet)\b/i,
      /उदाहरण/i,
    ],
  },
  {
    category: 'summary',
    patterns: [
      /\b(summarize|summary|tl;?dr|key points|takeaways|recap|brief|bullet)\b/i,
      /सारांश/i,
    ],
  },
  {
    category: 'action_steps',
    patterns: [
      /\b(step|steps|checklist|plan|how to|implement|start|guide|roadmap|next)\b/i,
      /कसरी|कदम/i,
    ],
  },
  {
    category: 'compare',
    patterns: [
      /\b(compare|comparison|difference|versus|vs\.?|pros|cons|alternative|better)\b/i,
    ],
  },
  {
    category: 'explore_local',
    patterns: [
      /\b(explore|nearby|location|place|visit|culture|history of|kathmandu|nepal)\b/i,
    ],
  },
  {
    category: 'visual',
    patterns: [
      /\b(image|diagram|visual|draw|chart|analyze details in the image)\b/i,
    ],
  },
  {
    category: 'deep_dive',
    patterns: [
      /\b(explain|detail|details|deep|deeper|why|how does|elaborate|expand|more about|clarify)\b/i,
      /विस्तार|व्याख्या/i,
    ],
  },
];

export const SUGGESTION_CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  deep_dive: 'Deep-dive explanations',
  examples: 'Practical examples',
  summary: 'Concise summaries & key points',
  translate: 'Multilingual translations & local nuance',
  action_steps: 'Step-by-step action plans',
  compare: 'Comparisons & trade-offs',
  explore_local: 'Location & cultural exploration',
  visual: 'Visual & image follow-ups',
  general: 'Topic follow-ups',
};

export function normalizeSuggestionKey(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Deterministic, Firestore-safe document ID (`^[a-zA-Z0-9_-]+$`, <= 128 chars)
 * generated via dual FNV-1a 32-bit hashing so even non-ASCII Nepali/CJK suggestions map cleanly.
 */
export function buildSuggestionStatId(text: string): string {
  const normalized = normalizeSuggestionKey(text) || 'suggestion';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + i) & 0xffff;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const hashSuffix = `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  return slug ? `sugg-${slug}-${hashSuffix}` : `sugg-${hashSuffix}`;
}

export function classifySuggestionCategory(text: string): SuggestionCategory {
  const clean = String(text || '').trim();
  if (!clean) return 'general';
  for (const matcher of CATEGORY_MATCHERS) {
    if (matcher.patterns.some((re) => re.test(clean))) {
      return matcher.category;
    }
  }
  return 'general';
}

function getStorageKey(userId?: string): string {
  const safeUid = String(userId || 'guest').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return `${SUGGESTION_ANALYTICS_STORAGE_PREFIX}_${safeUid || 'guest'}`;
}

export function getStoredSuggestionAnalytics(userId?: string): SuggestionAnalyticsItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SuggestionAnalyticsItem => Boolean(item && typeof item.id === 'string'))
      .sort((a, b) => b.clickCount - a.clickCount || b.lastClickedAt - a.lastClickedAt);
  } catch {
    return [];
  }
}

export function saveStoredSuggestionAnalytics(items: SuggestionAnalyticsItem[], userId?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const capped = [...items]
      .sort((a, b) => b.clickCount - a.clickCount || b.lastClickedAt - a.lastClickedAt)
      .slice(0, 60);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(capped));
  } catch {
    // Ignore quota errors
  }
}

export function mergeSuggestionAnalytics(
  localItems: SuggestionAnalyticsItem[],
  remoteItems: SuggestionAnalyticsItem[]
): SuggestionAnalyticsItem[] {
  const map = new Map<string, SuggestionAnalyticsItem>();
  for (const item of [...localItems, ...remoteItems]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, { ...item });
    } else {
      map.set(item.id, {
        ...prev,
        sampleText: item.lastClickedAt >= prev.lastClickedAt ? item.sampleText : prev.sampleText,
        category: item.category !== 'general' ? item.category : prev.category,
        language: item.language || prev.language,
        clickCount: Math.max(prev.clickCount, item.clickCount),
        lastClickedAt: Math.max(prev.lastClickedAt, item.lastClickedAt),
        createdAt: Math.min(prev.createdAt || Date.now(), item.createdAt || Date.now()),
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.clickCount - a.clickCount || b.lastClickedAt - a.lastClickedAt)
    .slice(0, 60);
}

export function recordLocalSuggestionClick(
  userId: string | undefined,
  suggestionText: string,
  language?: string,
  nowMs: number = Date.now()
): SuggestionAnalyticsItem[] {
  const trimmed = String(suggestionText || '').trim().slice(0, 160);
  const normalizedKey = normalizeSuggestionKey(trimmed);
  if (!trimmed || !normalizedKey) return getStoredSuggestionAnalytics(userId);

  const statId = buildSuggestionStatId(trimmed);
  const category = classifySuggestionCategory(trimmed);
  const current = getStoredSuggestionAnalytics(userId);
  const existingIdx = current.findIndex((entry) => entry.id === statId);

  let nextList: SuggestionAnalyticsItem[];
  if (existingIdx >= 0) {
    const prev = current[existingIdx];
    const updated: SuggestionAnalyticsItem = {
      ...prev,
      sampleText: trimmed,
      category: category !== 'general' ? category : prev.category,
      language: language || prev.language,
      clickCount: Math.min(1000000, Math.max(0, Math.floor(prev.clickCount)) + 1),
      lastClickedAt: nowMs,
    };
    nextList = [...current.slice(0, existingIdx), updated, ...current.slice(existingIdx + 1)];
  } else {
    const created: SuggestionAnalyticsItem = {
      id: statId,
      normalizedKey,
      sampleText: trimmed,
      category,
      language: language ? String(language).slice(0, 20) : undefined,
      clickCount: 1,
      lastClickedAt: nowMs,
      createdAt: nowMs,
    };
    nextList = [created, ...current];
  }

  const sorted = nextList
    .sort((a, b) => b.clickCount - a.clickCount || b.lastClickedAt - a.lastClickedAt)
    .slice(0, 60);
  saveStoredSuggestionAnalytics(sorted, userId);
  return sorted;
}

export function summarizeTopSuggestionPatterns(
  items: SuggestionAnalyticsItem[],
  limitTopPhrases: number = 5
): PreferredSuggestionPatterns {
  const categoryTotals = new Map<SuggestionCategory, number>();
  let totalClicks = 0;

  for (const item of items) {
    const clicks = Math.max(0, Math.floor(Number(item.clickCount) || 0));
    if (clicks === 0) continue;
    totalClicks += clicks;
    const cat = item.category || 'general';
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + clicks);
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, clicks]) => ({ category, totalClicks: clicks }))
    .sort((a, b) => b.totalClicks - a.totalClicks)
    .slice(0, 4);

  const topClickedSuggestions = [...items]
    .filter((item) => item.clickCount > 0 && item.sampleText.trim().length > 0)
    .sort((a, b) => b.clickCount - a.clickCount || b.lastClickedAt - a.lastClickedAt)
    .slice(0, Math.max(1, limitTopPhrases))
    .map((item) => ({
      text: item.sampleText.slice(0, 80),
      category: item.category,
      clickCount: item.clickCount,
    }));

  return {
    topClickedSuggestions,
    topCategories,
    totalClicks,
  };
}
