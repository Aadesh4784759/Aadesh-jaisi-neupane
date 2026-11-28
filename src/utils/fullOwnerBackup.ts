import {
  AIMemoryItem,
  AppSettings,
  ChatSession,
  EngagementMetrics,
  GeneratedImageItem,
  GeotaggedMedia,
  LoginActivityEntry,
  UserProfile,
  VoiceHistoryEntry,
} from '../types';
import { sanitizeProviderSecretText } from './aiProviders';
import { buildApiUrl } from './apiConfig';
import { BackupPayload, generateSecureAdminBackup } from './backupExport';
import { getCurrentIdToken } from './firebase';
import { loadGeneratedImagesFromDB } from './imageHistoryStorage';
import { getStoredLoginActivity, getStoredVoiceHistory, OWNER_ADMIN_EMAIL } from './storage';

const FORBIDDEN_BACKUP_KEY_PATTERN =
  /(_api_key|api_key|apikey|secret|password|credential|token|auth_token|private_key|serviceaccount|service_account|bearer|client_secret)/i;

function scrubTextSecrets(value: string): string {
  let cleaned = sanitizeProviderSecretText(value);
  cleaned = cleaned.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  return cleaned;
}

export function sanitizeOwnerBackupValue<T>(input: T, seen = new WeakSet<object>()): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return scrubTextSecrets(input) as unknown as T;
  }
  if (typeof input !== 'object') return input;

  const obj = input as object;
  if (seen.has(obj)) return undefined as unknown as T;
  seen.add(obj);

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeOwnerBackupValue(item, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_BACKUP_KEY_PATTERN.test(key)) {
      continue;
    }
    if (val !== undefined) {
      out[key] = sanitizeOwnerBackupValue(val, seen);
    }
  }
  return out as T;
}

export interface FullOwnerBackupInput {
  ownerEmail: string;
  isOwnerAdmin: boolean;
  user: UserProfile;
  settings: AppSettings;
  sessions: ChatSession[];
  memories: AIMemoryItem[];
  mediaItems: GeotaggedMedia[];
  generatedImages: GeneratedImageItem[];
  voiceHistory?: VoiceHistoryEntry[];
  metrics: EngagementMetrics;
  loginActivity?: LoginActivityEntry[];
  usageAnalyticsEvents?: Array<Record<string, unknown>>;
  firestoreSnapshot?: BackupPayload | null;
  exportedAtIso?: string;
}

export interface FullOwnerBackupPayload {
  metadata: {
    projectIdentifier: 'aadesh-ai-global';
    schemaVersion: '1.0';
    backupScope: 'owner_full_data_backup';
    generator: string;
    exportedAt: string;
    ownerEmail: string;
    includesFirestoreSnapshot: boolean;
    summary: {
      totalConversations: number;
      totalMessages: number;
      totalMemories: number;
      approvedMemories: number;
      totalGeotaggedMedia: number;
      totalGeneratedImages: number;
      totalVoiceHistory: number;
      totalQueries: number;
      totalTranslations: number;
      totalAnalyticsEvents: number;
    };
  };
  ownerProfile: Partial<UserProfile> & {
    preferences?: {
      uiLanguage: string;
      defaultTargetLanguage: string;
      aiProvider?: string;
      aiModel?: string;
      autoFailover?: boolean;
      theme?: string;
      aiMemoryEnabled?: boolean;
      analyticsConsent?: boolean;
    };
  };
  conversations: {
    totalConversations: number;
    totalMessages: number;
    sessions: Array<Record<string, unknown>>;
  };
  memories: {
    totalMemories: number;
    approvedCount: number;
    items: AIMemoryItem[];
  };
  mediaHistory: {
    totalGeotaggedMedia: number;
    totalGeneratedImages: number;
    totalVoiceHistory: number;
    geotaggedMedia: GeotaggedMedia[];
    generatedImages: GeneratedImageItem[];
    voiceHistory: VoiceHistoryEntry[];
  };
  userActivityMetrics: {
    engagementMetrics: EngagementMetrics;
    streakMetrics: {
      streakDays: number;
      currentStreak: number;
      longestStreak: number;
      dailyGoalTarget: number;
      dailyGoalCurrent: number;
      lastActiveDate: string;
      recoveryCount: number;
      recoveryMonth?: string;
      recoveredDates: string[];
      streakHistory: UserProfile['streakHistory'];
      badges: UserProfile['badges'];
    };
    loginActivity: LoginActivityEntry[];
    usageAnalyticsEvents: Array<Record<string, unknown>>;
  };
  firestoreSnapshot?: BackupPayload | null;
}

export interface FullOwnerBackupDownloadResult {
  filename: string;
  byteSize: number;
  payload: FullOwnerBackupPayload;
  includesFirestoreSnapshot: boolean;
}

export function assertVerifiedOwnerBackupAccess(ownerEmail: string | undefined | null, isOwnerAdmin: boolean): string {
  const normalized = String(ownerEmail || '').trim().toLowerCase();
  if (!isOwnerAdmin || normalized !== OWNER_ADMIN_EMAIL) {
    throw new Error(`Owner authorization required (${OWNER_ADMIN_EMAIL}) to download a full data backup.`);
  }
  return normalized;
}

export function buildFullOwnerBackupPayload(input: FullOwnerBackupInput): FullOwnerBackupPayload {
  const verifiedOwnerEmail = assertVerifiedOwnerBackupAccess(input.ownerEmail, input.isOwnerAdmin);
  const exportedAt = input.exportedAtIso || new Date().toISOString();
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const memories = Array.isArray(input.memories) ? input.memories : [];
  const mediaItems = Array.isArray(input.mediaItems) ? input.mediaItems : [];
  const generatedImages = Array.isArray(input.generatedImages) ? input.generatedImages : [];
  const voiceHistory = Array.isArray(input.voiceHistory) ? input.voiceHistory : [];
  const loginActivity = Array.isArray(input.loginActivity) ? input.loginActivity : [];
  const usageAnalyticsEvents = Array.isArray(input.usageAnalyticsEvents) ? input.usageAnalyticsEvents : [];

  const totalMessages = sessions.reduce(
    (sum, s) => sum + (Array.isArray(s.messages) ? s.messages.length : 0),
    0
  );
  const approvedCount = memories.filter((m) => m.approved !== false).length;

  const sanitizedSessions = sessions.map((session) =>
    sanitizeOwnerBackupValue({
      id: session.id,
      title: session.title,
      category: session.category,
      tags: session.tags || [],
      targetLanguage: session.targetLanguage,
      createdAt: session.createdAt,
      createdAtIso: Number.isFinite(session.createdAt) ? new Date(session.createdAt).toISOString() : undefined,
      updatedAt: session.updatedAt,
      updatedAtIso: Number.isFinite(session.updatedAt) ? new Date(session.updatedAt).toISOString() : undefined,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
      messages: (session.messages || []).map((msg) => ({
        id: msg.id,
        role: msg.role,
        senderName: msg.senderName,
        timestamp: msg.timestamp,
        timestampIso: Number.isFinite(msg.timestamp) ? new Date(msg.timestamp).toISOString() : undefined,
        content: msg.content,
        translation: msg.translation,
        translationLanguage: msg.translationLanguage,
        detectedLanguage: msg.detectedLanguage,
        sentiment: msg.sentiment,
        provider: msg.provider,
        modelUsed: msg.modelUsed,
        latencyMs: msg.latencyMs,
        failoverOccurred: msg.failoverOccurred,
        fallbackFromProvider: msg.fallbackFromProvider,
        isVoiceInput: msg.isVoiceInput,
        feedback: msg.feedback,
        reactions: msg.reactions,
        attachmentName: msg.attachmentName,
        location: msg.location,
        geotagInsights: msg.geotagInsights,
        sources: msg.sources,
      })),
    })
  );

  const sanitizedMemories = sanitizeOwnerBackupValue(memories);
  const sanitizedMediaItems = sanitizeOwnerBackupValue(mediaItems);
  const sanitizedGeneratedImages = sanitizeOwnerBackupValue(generatedImages);
  const sanitizedVoiceHistory = sanitizeOwnerBackupValue(voiceHistory);
  const sanitizedMetrics = sanitizeOwnerBackupValue(input.metrics);
  const sanitizedLoginActivity = sanitizeOwnerBackupValue(loginActivity);
  const sanitizedUsageAnalytics = sanitizeOwnerBackupValue(usageAnalyticsEvents);
  const sanitizedSnapshot = input.firestoreSnapshot ? sanitizeOwnerBackupValue(input.firestoreSnapshot) : undefined;

  const payload: FullOwnerBackupPayload = {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupScope: 'owner_full_data_backup',
      generator: 'Aadesh AI Settings Full Data Backup',
      exportedAt,
      ownerEmail: verifiedOwnerEmail,
      includesFirestoreSnapshot: Boolean(sanitizedSnapshot),
      summary: {
        totalConversations: sessions.length,
        totalMessages,
        totalMemories: memories.length,
        approvedMemories: approvedCount,
        totalGeotaggedMedia: mediaItems.length,
        totalGeneratedImages: generatedImages.length,
        totalVoiceHistory: voiceHistory.length,
        totalQueries: Number(input.metrics?.totalQueries || 0),
        totalTranslations: Number(input.metrics?.totalTranslations || 0),
        totalAnalyticsEvents: usageAnalyticsEvents.length,
      },
    },
    ownerProfile: sanitizeOwnerBackupValue({
      id: input.user.id,
      name: input.user.name,
      nickname: input.user.nickname,
      username: input.user.username,
      email: verifiedOwnerEmail,
      country: input.user.country,
      countryCode: input.user.countryCode,
      countryFlag: input.user.countryFlag,
      timezone: input.user.timezone,
      provider: input.user.provider,
      role: input.user.role,
      createdAt: input.user.createdAt,
      lastActiveAt: input.user.lastActiveAt,
      preferredLanguage: input.user.preferredLanguage,
      xp: input.user.xp,
      level: input.user.level,
      levelTitle: input.user.levelTitle,
      preferences: {
        uiLanguage: input.settings.uiLanguage,
        defaultTargetLanguage: input.settings.defaultTargetLanguage,
        aiProvider: input.settings.aiProvider,
        aiModel: input.settings.aiModel,
        autoFailover: input.settings.autoFailover,
        theme: input.settings.theme,
        aiMemoryEnabled: input.settings.aiMemoryEnabled,
        analyticsConsent: input.settings.analyticsConsent,
      },
    }),
    conversations: {
      totalConversations: sessions.length,
      totalMessages,
      sessions: sanitizedSessions,
    },
    memories: {
      totalMemories: memories.length,
      approvedCount,
      items: sanitizedMemories,
    },
    mediaHistory: {
      totalGeotaggedMedia: mediaItems.length,
      totalGeneratedImages: generatedImages.length,
      totalVoiceHistory: voiceHistory.length,
      geotaggedMedia: sanitizedMediaItems,
      generatedImages: sanitizedGeneratedImages,
      voiceHistory: sanitizedVoiceHistory,
    },
    userActivityMetrics: sanitizeOwnerBackupValue({
      engagementMetrics: sanitizedMetrics,
      streakMetrics: {
        streakDays: input.user.streakDays || 0,
        currentStreak: input.user.currentStreak ?? input.user.streakDays ?? 0,
        longestStreak: input.user.longestStreak || 0,
        dailyGoalTarget: input.user.dailyGoalTarget || 0,
        dailyGoalCurrent: input.user.dailyGoalCurrent || 0,
        lastActiveDate: input.user.lastActiveDate || '',
        recoveryCount: input.user.recoveryCount || 0,
        recoveryMonth: input.user.recoveryMonth,
        recoveredDates: input.user.recoveredDates || [],
        streakHistory: input.user.streakHistory || [],
        badges: input.user.badges || [],
      },
      loginActivity: sanitizedLoginActivity,
      usageAnalyticsEvents: sanitizedUsageAnalytics,
    }),
    ...(sanitizedSnapshot ? { firestoreSnapshot: sanitizedSnapshot } : {}),
  };

  return sanitizeOwnerBackupValue(payload);
}

export async function downloadFullOwnerBackupFile(params: {
  ownerEmail: string;
  isOwnerAdmin: boolean;
  isOnline: boolean;
  user: UserProfile;
  settings: AppSettings;
  sessions: ChatSession[];
  memories: AIMemoryItem[];
  mediaItems: GeotaggedMedia[];
  metrics: EngagementMetrics;
  onProgress?: (statusText: string) => void;
}): Promise<FullOwnerBackupDownloadResult> {
  const verifiedEmail = assertVerifiedOwnerBackupAccess(params.ownerEmail, params.isOwnerAdmin);

  params.onProgress?.('Collecting local media studio, voice history, and memory archive...');
  const [generatedImages, voiceHistory, loginActivity] = await Promise.all([
    loadGeneratedImagesFromDB(params.user.id).catch(() => []),
    Promise.resolve(getStoredVoiceHistory(params.user.id)),
    Promise.resolve(getStoredLoginActivity(params.user.id)),
  ]);

  let firestoreSnapshot: BackupPayload | null = null;
  if (params.isOnline) {
    try {
      const idToken = await getCurrentIdToken();
      if (idToken) {
        params.onProgress?.('Verifying owner authorization with backend...');
        const authRes = await fetch(buildApiUrl('/api/admin/backup'), {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (authRes.status === 403 || authRes.status === 401) {
          const authJson = await authRes.json().catch(() => ({}));
          throw new Error(authJson.error || 'Owner backend authorization failed.');
        }
        if (authRes.ok) {
          params.onProgress?.('Including verified Firestore collections snapshot...');
          firestoreSnapshot = await generateSecureAdminBackup(verifiedEmail, (txt) =>
            params.onProgress?.(txt)
          ).catch(() => null);
        }
      }
    } catch (err: any) {
      if (err instanceof Error && /authorization|owner|403|401/i.test(err.message)) {
        throw err;
      }
      // Network/offline degradation keeps local full backup working
      firestoreSnapshot = null;
    }
  }

  const usageAnalyticsEvents =
    firestoreSnapshot?.collections?.usage_analytics && Array.isArray(firestoreSnapshot.collections.usage_analytics)
      ? firestoreSnapshot.collections.usage_analytics
      : [];

  const payload = buildFullOwnerBackupPayload({
    ownerEmail: verifiedEmail,
    isOwnerAdmin: params.isOwnerAdmin,
    user: params.user,
    settings: params.settings,
    sessions: params.sessions,
    memories: params.memories,
    mediaItems: params.mediaItems,
    generatedImages,
    voiceHistory,
    metrics: params.metrics,
    loginActivity,
    usageAnalyticsEvents,
    firestoreSnapshot,
  });

  const dateStamp = payload.metadata.exportedAt.slice(0, 10);
  const filename = `aadesh-ai-full-data-backup-${dateStamp}.json`;
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const byteSize = blob.size;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    filename,
    byteSize,
    payload,
    includesFirestoreSnapshot: payload.metadata.includesFirestoreSnapshot,
  };
}
