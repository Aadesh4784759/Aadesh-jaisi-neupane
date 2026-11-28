import { ChatSession, EngagementMetrics } from '../types';
import { getLocalDateKeyInTimezone, resolveEffectiveStreakTimezone } from './gamification';

export interface UserAnalyticsEventRecord {
  id?: string;
  eventType?: string;
  language?: string;
  latencyMs?: number;
  dateKey?: string;
  timestamp?: string;
}

export interface DailyActivityTrendPoint {
  dateKey: string;
  label: string;
  messages: number;
  userMessages: number;
  aiMessages: number;
  avgResponseMs: number;
  timedResponses: number;
  translations: number;
}

export interface ActivityTrendsSummary {
  totalMessages: number;
  totalUserMessages: number;
  totalAiMessages: number;
  overallAvgResponseMs: number;
  totalTimedResponses: number;
  totalTranslations: number;
  activeDays: number;
  peakDayLabel: string;
  peakDayMessages: number;
  translationRatePercent: number;
}

export interface ActivityTrendsDataset {
  days: DailyActivityTrendPoint[];
  summary: ActivityTrendsSummary;
  timeZone: string;
  hasAnyActivity: boolean;
}

function formatShortDayLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const utcMidday = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(utcMidday));
}

function getTrailingDateKeys(daysCount: number, timeZone: string, nowMs: number): string[] {
  const safeDays = Math.max(1, Math.min(90, Math.round(daysCount)));
  const todayKey = getLocalDateKeyInTimezone(nowMs, timeZone);
  const [y, m, d] = todayKey.split('-').map(Number);
  const keys: string[] = [];
  for (let offset = safeDays - 1; offset >= 0; offset--) {
    const dt = new Date(Date.UTC(y, m - 1, d - offset, 12, 0, 0));
    keys.push(dt.toISOString().slice(0, 10));
  }
  return keys;
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function buildLast30DaysActivityTrends(params: {
  sessions: ChatSession[];
  analyticsEvents?: UserAnalyticsEventRecord[];
  metrics?: EngagementMetrics;
  timeZone?: string;
  daysCount?: number;
  nowMs?: number;
}): ActivityTrendsDataset {
  const effectiveTz = resolveEffectiveStreakTimezone(params.timeZone);
  const nowMs = typeof params.nowMs === 'number' && Number.isFinite(params.nowMs) ? params.nowMs : Date.now();
  const daysCount = params.daysCount ?? 30;
  const dateKeys = getTrailingDateKeys(daysCount, effectiveTz, nowMs);

  interface BucketAccumulator {
    dateKey: string;
    label: string;
    sessionMessages: number;
    userMessages: number;
    aiMessages: number;
    sessionLatencySum: number;
    sessionTimedCount: number;
    sessionTranslations: number;
    analyticsNonTranslationCount: number;
    analyticsTranslations: number;
    analyticsLatencySum: number;
    analyticsTimedCount: number;
  }

  const bucketMap = new Map<string, BucketAccumulator>();
  for (const dateKey of dateKeys) {
    bucketMap.set(dateKey, {
      dateKey,
      label: formatShortDayLabel(dateKey),
      sessionMessages: 0,
      userMessages: 0,
      aiMessages: 0,
      sessionLatencySum: 0,
      sessionTimedCount: 0,
      sessionTranslations: 0,
      analyticsNonTranslationCount: 0,
      analyticsTranslations: 0,
      analyticsLatencySum: 0,
      analyticsTimedCount: 0,
    });
  }

  // 1. Aggregate exact real session message timestamps, response latencies, and translations
  for (const session of params.sessions || []) {
    for (const msg of session.messages || []) {
      const ts = Number(msg.timestamp);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      const dateKey = getLocalDateKeyInTimezone(ts, effectiveTz);
      const bucket = bucketMap.get(dateKey);
      if (!bucket) continue;

      bucket.sessionMessages += 1;
      if (msg.role === 'user') {
        bucket.userMessages += 1;
      } else if (msg.role === 'model') {
        bucket.aiMessages += 1;
      }

      if (typeof msg.latencyMs === 'number' && Number.isFinite(msg.latencyMs) && msg.latencyMs > 0) {
        bucket.sessionLatencySum += msg.latencyMs;
        bucket.sessionTimedCount += 1;
      }

      const hasTranslation =
        (typeof msg.translation === 'string' && msg.translation.trim().length > 0) ||
        (msg.role === 'model' &&
          typeof msg.translationLanguage === 'string' &&
          msg.translationLanguage.trim().length > 0);
      if (hasTranslation) {
        bucket.sessionTranslations += 1;
      }
    }
  }

  // 2. Incorporate Firestore usage_analytics events (captures Transfer/Voice/Image Studio translations & cross-device activity)
  for (const ev of params.analyticsEvents || []) {
    if (!ev || ev.eventType === 'streak_recovery') continue;
    let dateKey = '';
    if (typeof ev.timestamp === 'string' && ev.timestamp.trim()) {
      const parsedMs = new Date(ev.timestamp).getTime();
      if (!Number.isNaN(parsedMs)) {
        dateKey = getLocalDateKeyInTimezone(parsedMs, effectiveTz);
      }
    }
    if (!dateKey && typeof ev.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.dateKey)) {
      dateKey = ev.dateKey;
    }
    const bucket = bucketMap.get(dateKey);
    if (!bucket) continue;

    if (ev.eventType === 'translation') {
      bucket.analyticsTranslations += 1;
    } else {
      bucket.analyticsNonTranslationCount += 1;
    }

    if (typeof ev.latencyMs === 'number' && Number.isFinite(ev.latencyMs) && ev.latencyMs > 0) {
      bucket.analyticsLatencySum += ev.latencyMs;
      bucket.analyticsTimedCount += 1;
    }
  }

  let totalMessages = 0;
  let totalUserMessages = 0;
  let totalAiMessages = 0;
  let totalLatencySum = 0;
  let totalTimedResponses = 0;
  let totalTranslations = 0;
  let activeDays = 0;
  let peakDayLabel = dateKeys[dateKeys.length - 1] ? formatShortDayLabel(dateKeys[dateKeys.length - 1]) : '—';
  let peakDayMessages = 0;

  const days: DailyActivityTrendPoint[] = [];

  for (const key of dateKeys) {
    const b = bucketMap.get(key)!;
    const messages = b.sessionMessages > 0 ? b.sessionMessages : b.analyticsNonTranslationCount;
    const translations = Math.max(b.sessionTranslations, b.analyticsTranslations);

    const useSessionLatency = b.sessionTimedCount > 0;
    const latencySum = useSessionLatency ? b.sessionLatencySum : b.analyticsLatencySum;
    const timedResponses = useSessionLatency ? b.sessionTimedCount : b.analyticsTimedCount;
    const avgResponseMs = timedResponses > 0 ? Math.round(latencySum / timedResponses) : 0;

    days.push({
      dateKey: b.dateKey,
      label: b.label,
      messages,
      userMessages: b.userMessages,
      aiMessages: b.aiMessages,
      avgResponseMs,
      timedResponses,
      translations,
    });

    totalMessages += messages;
    totalUserMessages += b.userMessages;
    totalAiMessages += b.aiMessages;
    totalLatencySum += latencySum;
    totalTimedResponses += timedResponses;
    totalTranslations += translations;

    if (messages > 0 || translations > 0 || timedResponses > 0) {
      activeDays += 1;
    }
    if (messages > peakDayMessages) {
      peakDayMessages = messages;
      peakDayLabel = b.label;
    }
  }

  const overallAvgResponseMs =
    totalTimedResponses > 0 ? Math.round(totalLatencySum / totalTimedResponses) : 0;
  const translationRatePercent =
    totalMessages > 0 ? Math.min(100, Math.round((totalTranslations / totalMessages) * 100)) : 0;

  return {
    days,
    summary: {
      totalMessages,
      totalUserMessages,
      totalAiMessages,
      overallAvgResponseMs,
      totalTimedResponses,
      totalTranslations,
      activeDays,
      peakDayLabel,
      peakDayMessages,
      translationRatePercent,
    },
    timeZone: effectiveTz,
    hasAnyActivity: totalMessages > 0 || totalTranslations > 0 || totalTimedResponses > 0,
  };
}

export function buildActivityTrendsCsv(days: DailyActivityTrendPoint[]): string {
  const headers = [
    'Date',
    'Label',
    'Total Messages',
    'User Messages',
    'AI Replies',
    'Average Response Time (ms)',
    'Timed Responses',
    'Translation Usage',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of days) {
    lines.push(
      [
        row.dateKey,
        row.label,
        row.messages,
        row.userMessages,
        row.aiMessages,
        row.avgResponseMs,
        row.timedResponses,
        row.translations,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}
