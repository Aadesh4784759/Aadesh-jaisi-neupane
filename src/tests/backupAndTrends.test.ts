import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertVerifiedOwnerBackupAccess,
  buildFullOwnerBackupPayload,
} from '../utils/fullOwnerBackup';
import {
  buildActivityTrendsCsv,
  buildLast30DaysActivityTrends,
} from '../utils/activityTrends';
import type {
  AIMemoryItem,
  AppSettings,
  ChatSession,
  EngagementMetrics,
  GeneratedImageItem,
  GeotaggedMedia,
  UserProfile,
} from '../types';

const SAMPLE_METRICS: EngagementMetrics = {
  totalQueries: 24,
  totalVoiceQueries: 4,
  totalImageQueries: 3,
  totalTranslations: 9,
  languageCounts: { en: 15, ne: 9 },
  regionalActivity: { Kathmandu: 18 },
  avgLatencyMs: 380,
  latencySamples: [320, 440],
  hourlyActivity: new Array(24).fill(0),
  sentimentCounts: {
    positive: 12,
    curious: 6,
    inquiry: 4,
    urgent: 0,
    neutral: 2,
  },
};

const SAMPLE_SETTINGS: AppSettings = {
  uiLanguage: 'en',
  defaultTargetLanguage: 'ne',
  aiResponseLanguage: 'ne',
  aiProvider: 'gemini',
  aiModel: 'gemini-3.1-flash-lite',
  autoFailover: true,
  voiceSpeed: 1,
  voicePitch: 1,
  voiceVolume: 1,
  voicePersona: 'friendly',
  autoSpeakAIResponses: false,
  handsFreeMode: false,
  analyticsConsent: true,
  theme: 'dark',
  fontSize: 'normal',
  chatAppearance: 'spacious',
  aiMemoryEnabled: true,
  highContrast: false,
  offlineModeForce: false,
  screenReaderAnnounce: false,
};

const OWNER_USER: UserProfile = {
  id: 'owner-uid-001',
  name: 'Aadesh Jaisi',
  nickname: 'Aadesh',
  username: 'aadesh',
  email: 'aadeshjaisi6@gmail.com',
  country: 'Nepal',
  countryCode: 'NP',
  countryFlag: '🇳🇵',
  timezone: 'Asia/Kathmandu',
  provider: 'google',
  linkedProviders: ['google'],
  isLoggedIn: true,
  role: 'admin',
  streakDays: 14,
  currentStreak: 14,
  longestStreak: 21,
  xp: 1250,
  level: 5,
  levelTitle: 'Explorer',
  dailyGoalTarget: 5,
  dailyGoalCurrent: 3,
  lastActiveDate: '2026-11-28',
  streakHistory: [],
  badges: [],
};

test('BT1: Owner Full Data Backup enforces sole owner authorization and aggregates all user domains safely', () => {
  assert.throws(() => {
    assertVerifiedOwnerBackupAccess('sagarjaisi92@gmail.com', false);
  }, /Owner authorization required/);

  assert.throws(() => {
    assertVerifiedOwnerBackupAccess('sagarjaisi92@gmail.com', true);
  }, /Owner authorization required/);

  assert.throws(() => {
    assertVerifiedOwnerBackupAccess('aadeshjaisi6@gmail.com', false);
  }, /Owner authorization required/);

  const nowMs = Date.UTC(2026, 10, 28, 8, 0, 0);
  const sessions: ChatSession[] = [
    {
      id: 'conv-1',
      title: 'Nepal Travel Guide',
      createdAt: nowMs - 86400_000,
      updatedAt: nowMs,
      targetLanguage: 'ne',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Translate hello to Nepali with key AIzaSyFakeKeyLeak1234567890',
          timestamp: nowMs - 3600_000,
        },
        {
          id: 'm2',
          role: 'model',
          content: 'नमस्ते!',
          translation: 'Namaste!',
          translationLanguage: 'ne',
          provider: 'gemini',
          modelUsed: 'gemini-3.1-flash-lite',
          latencyMs: 340,
          timestamp: nowMs - 3590_000,
        },
      ],
    },
  ];

  const memories: AIMemoryItem[] = [
    {
      id: 'mem-1',
      category: 'preference',
      content: 'Prefers concise bilingual responses; secret gsk_fakeGroqSecretToken98765',
      createdAt: nowMs - 10_000,
      updatedAt: nowMs,
      source: 'manual',
      approved: true,
    },
  ];

  const mediaItems: GeotaggedMedia[] = [
    {
      id: 'media-1',
      title: 'Pokhara Lakeside',
      type: 'photo',
      mediaUrl: 'https://example.com/pokhara.jpg',
      location: { name: 'Pokhara', lat: 28.2096, lng: 83.9856, country: 'Nepal', city: 'Pokhara' },
      timestamp: nowMs - 50_000,
      tags: ['travel', 'nepal'],
    },
  ];

  const generatedImages: GeneratedImageItem[] = [
    {
      id: 'gen-img-1',
      userId: OWNER_USER.id,
      prompt: 'Himalayan sunrise over Annapurna',
      style: 'Realistic',
      aspectRatio: '16:9',
      modelName: 'gemini-2.5-flash-image',
      mimeType: 'image/png',
      imageDataUrl: 'data:image/png;base64,AAA',
      storageLocation: 'indexeddb',
      createdAt: nowMs - 20_000,
    },
  ];

  const payload = buildFullOwnerBackupPayload({
    ownerEmail: 'aadeshjaisi6@gmail.com',
    isOwnerAdmin: true,
    user: { ...OWNER_USER, api_key: 'should_be_stripped' } as unknown as UserProfile,
    settings: { ...SAMPLE_SETTINGS, gemini_api_key: 'AIzaShouldBeRemoved' } as unknown as AppSettings,
    sessions,
    memories,
    mediaItems,
    generatedImages,
    voiceHistory: [
      {
        id: 'vh-1',
        userId: OWNER_USER.id,
        transcript: 'Namaste Aadesh AI',
        timestamp: nowMs - 15_000,
        language: 'ne',
      },
    ],
    metrics: SAMPLE_METRICS,
    usageAnalyticsEvents: [{ id: 'evt-1', eventType: 'chat', timestamp: new Date(nowMs).toISOString() }],
    exportedAtIso: '2026-11-28T08:00:00.000Z',
  });

  assert.equal(payload.metadata.projectIdentifier, 'aadesh-ai-global');
  assert.equal(payload.metadata.schemaVersion, '1.0');
  assert.equal(payload.metadata.backupScope, 'owner_full_data_backup');
  assert.equal(payload.metadata.ownerEmail, 'aadeshjaisi6@gmail.com');
  assert.equal(payload.metadata.summary.totalConversations, 1);
  assert.equal(payload.metadata.summary.totalMessages, 2);
  assert.equal(payload.metadata.summary.totalMemories, 1);
  assert.equal(payload.metadata.summary.totalGeotaggedMedia, 1);
  assert.equal(payload.metadata.summary.totalGeneratedImages, 1);
  assert.equal(payload.metadata.summary.totalVoiceHistory, 1);
  assert.equal(payload.conversations.sessions.length, 1);
  assert.equal(payload.memories.items.length, 1);
  assert.equal(payload.mediaHistory.geotaggedMedia.length, 1);
  assert.equal(payload.mediaHistory.generatedImages.length, 1);
  assert.equal(payload.userActivityMetrics.engagementMetrics.totalQueries, 24);
  assert.equal(payload.userActivityMetrics.streakMetrics.currentStreak, 14);

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('AIzaSyFakeKeyLeak1234567890'), false);
  assert.equal(serialized.includes('gsk_fakeGroqSecretToken98765'), false);
  assert.equal(serialized.includes('should_be_stripped'), false);
  assert.equal(serialized.includes('AIzaShouldBeRemoved'), false);
});

test('BT2: 30-day Activity Trends accurately calculates daily messages, avg response latency, and translation usage', () => {
  // Reference "now": 2026-11-28 10:00 UTC -> 2026-11-28 in Asia/Kathmandu
  const nowMs = Date.UTC(2026, 10, 28, 10, 0, 0);
  const twoDaysAgoMs = Date.UTC(2026, 10, 26, 10, 0, 0);

  const sessions: ChatSession[] = [
    {
      id: 'sess-trend',
      title: 'Daily Work',
      createdAt: twoDaysAgoMs,
      updatedAt: nowMs,
      targetLanguage: 'ne',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'Explain quantum tunneling',
          timestamp: twoDaysAgoMs,
        },
        {
          id: 'a1',
          role: 'model',
          content: 'Quantum tunneling is...',
          latencyMs: 300,
          timestamp: twoDaysAgoMs + 1000,
        },
        {
          id: 'a2',
          role: 'model',
          content: 'Short summary',
          translation: 'छोटो सारांश',
          translationLanguage: 'ne',
          latencyMs: 500,
          timestamp: twoDaysAgoMs + 2000,
        },
        {
          id: 'u2',
          role: 'user',
          content: 'Check latency today',
          timestamp: nowMs - 5000,
        },
        {
          id: 'a3',
          role: 'model',
          content: 'Checked.',
          latencyMs: 250,
          timestamp: nowMs - 4000,
        },
      ],
    },
  ];

  // Include both a matching translation event on twoDaysAgo (should NOT double-count beyond 1 vs 2) and an extra standalone translation today
  const analyticsEvents = [
    {
      id: 'ev-t1',
      eventType: 'translation',
      timestamp: new Date(twoDaysAgoMs + 3000).toISOString(),
      latencyMs: 999,
    },
    {
      id: 'ev-t2',
      eventType: 'translation',
      timestamp: new Date(nowMs - 2000).toISOString(),
      latencyMs: 180,
    },
    {
      id: 'ev-t3',
      eventType: 'translation',
      timestamp: new Date(nowMs - 1000).toISOString(),
      latencyMs: 220,
    },
  ];

  const dataset = buildLast30DaysActivityTrends({
    sessions,
    analyticsEvents,
    metrics: SAMPLE_METRICS,
    timeZone: 'Asia/Kathmandu',
    daysCount: 30,
    nowMs,
  });

  assert.equal(dataset.days.length, 30);
  assert.equal(dataset.days[29].dateKey, '2026-11-28');
  assert.equal(dataset.days[27].dateKey, '2026-11-26');

  const dayNov26 = dataset.days[27];
  assert.equal(dayNov26.messages, 3);
  assert.equal(dayNov26.userMessages, 1);
  assert.equal(dayNov26.aiMessages, 2);
  assert.equal(dayNov26.avgResponseMs, 400); // (300 + 500) / 2
  assert.equal(dayNov26.translations, 1); // Max(1 session translation, 1 analytics translation)

  const dayNov28 = dataset.days[29];
  assert.equal(dayNov28.messages, 2);
  assert.equal(dayNov28.avgResponseMs, 250);
  assert.equal(dayNov28.translations, 2); // 2 Transfer/standalone translations

  const emptyDay = dataset.days[0];
  assert.equal(emptyDay.messages, 0);
  assert.equal(emptyDay.avgResponseMs, 0);
  assert.equal(emptyDay.translations, 0);

  assert.equal(dataset.summary.totalMessages, 5);
  assert.equal(dataset.summary.totalTranslations, 3);
  assert.equal(dataset.summary.overallAvgResponseMs, 350); // (300 + 500 + 250) / 3
  assert.equal(dataset.summary.activeDays, 2);
  assert.equal(dataset.summary.peakDayMessages, 3);
  assert.equal(dataset.hasAnyActivity, true);

  const csv = buildActivityTrendsCsv(dataset.days);
  assert.match(csv, /Date,Label,Total Messages,User Messages,AI Replies,Average Response Time \(ms\),Timed Responses,Translation Usage/);
  assert.match(csv, /2026-11-26/);
});

test('BT3: SettingsView and AnalyticsDashboard UI integrate Full Data Backup and Recharts Activity Trends cleanly', () => {
  const settingsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  const fullBackupSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/fullOwnerBackup.ts'), 'utf8');
  const analyticsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AnalyticsDashboard.tsx'), 'utf8');
  const trendsTabSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ActivityTrendsTab.tsx'), 'utf8');

  assert.match(settingsSrc, /Download Full Data Backup/);
  assert.match(settingsSrc, /canDownloadOwnerBackup/);
  assert.match(fullBackupSrc, /buildApiUrl\('\/api\/admin\/backup'\)/);

  assert.match(analyticsSrc, /Activity Trends/);
  assert.match(analyticsSrc, /ActivityTrendsTab/);
  assert.match(trendsTabSrc, /from 'recharts'/);
  assert.match(trendsTabSrc, /ResponsiveContainer/);
  assert.match(trendsTabSrc, /Daily Message Counts/);
  assert.match(trendsTabSrc, /Average AI Response Time/);
  assert.equal(trendsTabSrc.includes('Math.random'), false);
});
