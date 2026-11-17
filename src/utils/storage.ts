import {
  AIMemoryItem,
  AppSettings,
  AutomationConversationTurn,
  AutomationRunLogItem,
  AutomationScheduleItem,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  LoginActivityEntry,
  PersonalTask,
  StudyProgressItem,
  TransferHistoryEntry,
  TranslationHistoryEntry,
  UserProfile,
} from '../types';
import { INITIAL_BADGES, generateStreakHistory } from './gamification';
import { detectUserCountry } from './country';

const STORAGE_KEYS = {
  SESSIONS: 'aadesh_ai_sessions_v1',
  CURRENT_SESSION_ID: 'aadesh_ai_current_session_id',
  MEDIA: 'aadesh_ai_media_v1',
  SETTINGS: 'aadesh_ai_settings_v1',
  METRICS: 'aadesh_ai_metrics_v1',
  USER: 'aadesh_ai_user_v1',
  USER_EXTRAS: 'aadesh_ai_user_extras_v1',
  VOICE_HISTORY: 'aadesh_ai_voice_history_v1',
  TRANSFER_HISTORY: 'aadesh_ai_transfer_history_v1',
  TRANSLATION_HISTORY: 'aadesh_ai_translation_history_v1',
  LOGIN_ACTIVITY: 'aadesh_ai_login_activity_v1',
  FOLDERS: 'aadesh_ai_folders_v1',
  MEMORIES: 'aadesh_ai_memories_v1',
  TASKS: 'aadesh_ai_tasks_v1',
  STUDY_PROGRESS: 'aadesh_ai_study_progress_v1',
  AUTOMATION_HISTORY: 'aadesh_ai_automation_history_v1',
  AUTOMATION_SCHEDULES: 'aadesh_ai_automation_schedules_v1',
  AUTOMATION_LOGS: 'aadesh_ai_automation_logs_v1',
};

export const DEFAULT_SESSION_CATEGORIES = [
  'General',
  'Work',
  'Personal',
  'Language Practice',
  'Study & Code',
];

export const OWNER_ADMIN_EMAIL = 'aadeshjaisi6@gmail.com';

const detectedInitialCountry = detectUserCountry();

// Never display Aadesh Jaisi as every visitor's personal name; keep creator credit in footer/branding.
export const DEFAULT_USER: UserProfile = {
  id: 'guest_explorer',
  name: 'Guest Explorer',
  username: 'guest',
  email: '',
  avatarUrl: '',
  avatarColor: '#8b5cf6',
  country: detectedInitialCountry.country,
  countryCode: detectedInitialCountry.code,
  countryFlag: detectedInitialCountry.flag,
  timezone: detectedInitialCountry.timeZone,
  countryDetectionMethod: 'timezone',
  provider: 'guest',
  linkedProviders: [],
  isLoggedIn: false,
  role: 'user',
  status: 'active',
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  preferredLanguage: 'en',
  streakDays: 0,
  currentStreak: 0,
  longestStreak: 0,
  recoveryCount: 0,
  recoveryMonth: '',
  streakBeforeBreak: 0,
  streakBrokenDate: '',
  xp: 0,
  level: 1,
  levelTitle: 'Curious Novice',
  dailyGoalTarget: 5,
  dailyGoalCurrent: 0,
  lastActiveDate: '',
  streakHistory: generateStreakHistory(0, undefined, detectedInitialCountry.timeZone),
  badges: INITIAL_BADGES,
};

export const DEFAULT_SETTINGS: AppSettings = {
  uiLanguage: 'en',
  defaultTargetLanguage: 'ne', // Prioritize English & Nepali
  autoSpeakAIResponses: false,
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voiceVolume: 1.0,
  voiceSensitivity: 50,
  voicePersona: 'friendly',
  highContrast: false,
  theme: 'dark',
  dynamicAvatarTheme: true,
  fontSize: 'normal',
  handsFreeMode: false,
  offlineModeForce: false,
  screenReaderAnnounce: false,
  streamingResponses: true,
  aiMemoryEnabled: false,
  memoryConsent: 'pending',
  notificationsEnabled: true,
  soundEffects: true,
  streakReminders: true,
  emailUpdatesEnabled: false,
  privateAccount: false,
  aiResponseMode: 'balanced',
  focusMode: 'normal',
  chatAppearance: 'spacious',
  reducedAnimations: false,
  biometricLockEnabled: false,
};

export const INITIAL_METRICS: EngagementMetrics = {
  totalQueries: 48,
  totalVoiceQueries: 19,
  totalImageQueries: 14,
  totalTranslations: 62,
  languageCounts: {
    en: 22,
    ne: 16,
    hi: 8,
    ur: 5,
    ar: 4,
    es: 10,
    ja: 9,
    fr: 7,
  },
  regionalActivity: {
    'Kathmandu, Nepal': 14,
    'Tokyo, Japan': 11,
    'Paris, France': 8,
    'New York, USA': 7,
    'Dubai, UAE': 5,
    'London, UK': 4,
  },
  avgLatencyMs: 420,
  latencySamples: [380, 410, 460, 390, 440],
  hourlyActivity: [1, 0, 0, 0, 1, 2, 5, 8, 12, 16, 21, 18, 15, 17, 23, 27, 24, 20, 18, 14, 11, 7, 4, 2],
  sentimentCounts: {
    positive: 28,
    curious: 12,
    inquiry: 6,
    urgent: 1,
    neutral: 1,
  },
};

export const INITIAL_MEDIA: GeotaggedMedia[] = [
  {
    id: 'media-1',
    title: 'Boudhanath Stupa Prayer Flags',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&auto=format&fit=crop&q=80',
    location: { name: 'Kathmandu, Nepal', city: 'Kathmandu', country: 'Nepal', lat: 27.7215, lng: 85.3620 },
    timestamp: Date.now() - 3600000 * 5,
    caption: 'Historic UNESCO World Heritage stupa with vibrant Buddhist prayer flags flapping in the Himalayan breeze.',
    translatedCaptions: {
      ne: 'बौद्धनाथ स्तुपमा हावामा फर्फराउँदै गरेका रङ्गीविरङ्गी लुङ्दार (प्रार्थना झण्डा)।',
      ja: 'カトマンズのボダナート寺院。色鮮やかな祈りのタルチョが風に揺れています。',
      es: 'La estupa histórica de Boudhanath con coloridas banderas de oración budistas.',
    },
    tags: ['Heritage', 'Nepal', 'Culture', 'Spiritual'],
    detectedLandmark: 'Boudhanath Stupa',
    detectedText: 'ॐ मणि पद्मे हूँ (Om Mani Padme Hum)',
  },
  {
    id: 'media-2',
    title: 'Senso-ji Temple Asakusa Lantern',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400&auto=format&fit=crop&q=80',
    location: { name: 'Tokyo, Japan', city: 'Tokyo', country: 'Japan', lat: 35.7148, lng: 139.7967 },
    timestamp: Date.now() - 3600000 * 18,
    caption: 'Iconic giant red chochin lantern of Kaminarimon Gate at Tokyo’s oldest temple.',
    translatedCaptions: {
      en: 'Sensō-ji Kaminarimon Gate red paper lantern in Asakusa.',
      es: 'La icónica linterna roja gigante en la puerta Kaminarimon del templo Sensō-ji en Tokio.',
      ne: 'टोकियोको पुरानो सेन्सो-जी मन्दिरको कामीनारीमोन गेटको ठूलो रातो लालटिन।',
    },
    tags: ['Tokyo', 'Architecture', 'Culture', 'Landmark'],
    detectedLandmark: 'Kaminarimon Gate, Sensō-ji',
    detectedText: '雷門 (Thunder Gate)',
  },
  {
    id: 'media-3',
    title: 'Eiffel Tower Night Illumination',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=400&auto=format&fit=crop&q=80',
    location: { name: 'Paris, France', city: 'Paris', country: 'France', lat: 48.8584, lng: 2.2945 },
    timestamp: Date.now() - 3600000 * 28,
    caption: 'Golden glowing lattice tower reflecting romantic Parisian night skies.',
    translatedCaptions: {
      fr: 'Tour Eiffel illuminée d’or dominant la nuit parisienne.',
      es: 'La Torre Eiffel iluminada de oro sobre el cielo nocturno de París.',
      ja: 'パリの夜空に黄金に輝くエッフェル塔。',
    },
    tags: ['Paris', 'Nightscape', 'Iconic', 'Europe'],
    detectedLandmark: 'Tour Eiffel',
  },
  {
    id: 'media-4',
    title: 'Colosseum Roman Sunset',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&auto=format&fit=crop&q=80',
    location: { name: 'Rome, Italy', city: 'Rome', country: 'Italy', lat: 41.8902, lng: 12.4922 },
    timestamp: Date.now() - 3600000 * 42,
    caption: 'Flavian Amphitheatre standing majestic under sunset hues of Rome.',
    translatedCaptions: {
      it: 'Il maestoso Colosseo romano illuminato dai caldi colori del tramonto.',
      es: 'El Coliseo Romano majestuoso al atardecer.',
    },
    tags: ['Rome', 'History', 'Monument', 'Antiquity'],
    detectedLandmark: 'Colosseum (Colosseo)',
  },
];

export const getStoredSessions = (userId?: string): ChatSession[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.SESSIONS}_${userId}` : STORAGE_KEYS.SESSIONS;
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initialSession: ChatSession = {
        id: `session-welcome-${Date.now()}`,
        title: 'New Conversation',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        targetLanguage: 'ne',
        category: 'General',
        messages: [],
      };
      saveStoredSessions([initialSession], userId);
      return [initialSession];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveStoredSessions = (sessions: ChatSession[], userId?: string): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.SESSIONS}_${userId}` : STORAGE_KEYS.SESSIONS;
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save sessions:', err);
  }
};

export const getStoredFolders = (userId?: string): string[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.FOLDERS}_${userId}` : STORAGE_KEYS.FOLDERS;
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_SESSION_CATEGORIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SESSION_CATEGORIES;
    const merged = Array.from(
      new Set([
        ...DEFAULT_SESSION_CATEGORIES,
        ...parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
      ])
    );
    return merged;
  } catch {
    return DEFAULT_SESSION_CATEGORIES;
  }
};

export const saveStoredFolders = (folders: string[], userId?: string): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.FOLDERS}_${userId}` : STORAGE_KEYS.FOLDERS;
    const unique = Array.from(
      new Set([
        ...DEFAULT_SESSION_CATEGORIES,
        ...folders.map((f) => f.trim()).filter(Boolean),
      ])
    );
    localStorage.setItem(key, JSON.stringify(unique));
  } catch (err) {
    console.error('Failed to save folders:', err);
  }
};

export const getStoredVoiceHistory = (userId?: string): import('../types').VoiceHistoryEntry[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.VOICE_HISTORY}_${userId}` : STORAGE_KEYS.VOICE_HISTORY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveStoredVoiceHistory = (
  entries: import('../types').VoiceHistoryEntry[],
  userId?: string
): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.VOICE_HISTORY}_${userId}` : STORAGE_KEYS.VOICE_HISTORY;
    localStorage.setItem(key, JSON.stringify(entries));
  } catch (err) {
    console.error('Failed to save voice history:', err);
  }
};

export const addVoiceHistoryEntry = (
  entry: { transcript: string; language: string; durationSeconds?: number; targetTranslation?: string },
  userId?: string
): import('../types').VoiceHistoryEntry => {
  const current = getStoredVoiceHistory(userId);
  const newEntry: import('../types').VoiceHistoryEntry = {
    id: `vh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    userId,
    transcript: entry.transcript,
    language: entry.language,
    durationSeconds: entry.durationSeconds || 3,
    targetTranslation: entry.targetTranslation,
    timestamp: Date.now(),
  };
  const updated = [newEntry, ...current].slice(0, 100);
  saveStoredVoiceHistory(updated, userId);
  return newEntry;
};

export const getStoredMedia = (): GeotaggedMedia[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDIA);
    if (!raw) {
      saveStoredMedia(INITIAL_MEDIA);
      return INITIAL_MEDIA;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MEDIA;
  }
};

export const saveStoredMedia = (media: GeotaggedMedia[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(media));
  } catch (err) {
    console.error('Failed to save media:', err);
  }
};

export const getStoredSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveStoredSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    if (settings.highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }

    if (settings.reducedAnimations) {
      document.body.classList.add('reduced-animations');
    } else {
      document.body.classList.remove('reduced-animations');
    }

    document.body.classList.remove('focus-mode-study', 'focus-mode-night', 'focus-mode-relax');
    if (settings.focusMode === 'study') {
      document.body.classList.add('focus-mode-study');
    } else if (settings.focusMode === 'night') {
      document.body.classList.add('focus-mode-night');
    } else if (settings.focusMode === 'relax') {
      document.body.classList.add('focus-mode-relax');
    }

    document.body.classList.remove('font-size-large', 'font-size-xlarge');
    if (settings.fontSize === 'large') {
      document.body.classList.add('font-size-large');
    } else if (settings.fontSize === 'xlarge') {
      document.body.classList.add('font-size-xlarge');
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
};

export const getStoredUser = (): UserProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) {
      saveStoredUser(DEFAULT_USER);
      return DEFAULT_USER;
    }
    const parsed = JSON.parse(raw);
    // Migrate away from legacy placeholder where everyone was named Aadesh Jaisi without signing in
    if (!parsed.isLoggedIn && parsed.id === 'aadesh_global_user_1') {
      saveStoredUser(DEFAULT_USER);
      return DEFAULT_USER;
    }
    return { ...DEFAULT_USER, ...parsed };
  } catch {
    return DEFAULT_USER;
  }
};

export const saveStoredUser = (user: UserProfile): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to save user:', err);
  }
};

export const getStoredMetrics = (): EngagementMetrics => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.METRICS);
    if (!raw) {
      saveStoredMetrics(INITIAL_METRICS);
      return INITIAL_METRICS;
    }
    return { ...INITIAL_METRICS, ...JSON.parse(raw) };
  } catch {
    return INITIAL_METRICS;
  }
};

export const saveStoredMetrics = (metrics: EngagementMetrics): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify(metrics));
  } catch (err) {
    console.error('Failed to save metrics:', err);
  }
};

export const recordMetricEvent = (params: {
  isVoice?: boolean;
  isImage?: boolean;
  isTranslation?: boolean;
  language?: string;
  locationName?: string;
  latencyMs?: number;
  sentiment?: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral';
}): void => {
  const current = getStoredMetrics();
  current.totalQueries += 1;
  if (params.isVoice) current.totalVoiceQueries += 1;
  if (params.isImage) current.totalImageQueries += 1;
  if (params.isTranslation) current.totalTranslations += 1;

  if (params.language) {
    current.languageCounts[params.language] = (current.languageCounts[params.language] || 0) + 1;
  }

  if (params.locationName) {
    current.regionalActivity[params.locationName] = (current.regionalActivity[params.locationName] || 0) + 1;
  }

  if (params.latencyMs && params.latencyMs > 0) {
    current.latencySamples = [...(current.latencySamples || []), params.latencyMs].slice(-20);
    const sum = current.latencySamples.reduce((a, b) => a + b, 0);
    current.avgLatencyMs = Math.round(sum / current.latencySamples.length);
  }

  if (params.sentiment && current.sentimentCounts[params.sentiment] !== undefined) {
    current.sentimentCounts[params.sentiment] += 1;
  }

  const currentHour = new Date().getHours();
  if (current.hourlyActivity && current.hourlyActivity[currentHour] !== undefined) {
    current.hourlyActivity[currentHour] += 1;
  }

  saveStoredMetrics(current);
};

export const getStoredMemories = (userId?: string): AIMemoryItem[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.MEMORIES}_${userId}` : STORAGE_KEYS.MEMORIES;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredMemories = (memories: AIMemoryItem[], userId?: string): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.MEMORIES}_${userId}` : STORAGE_KEYS.MEMORIES;
    localStorage.setItem(key, JSON.stringify(memories));
  } catch (err) {
    console.error('Failed to save AI memories:', err);
  }
};

export const getStoredTasks = (userId?: string): PersonalTask[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.TASKS}_${userId}` : STORAGE_KEYS.TASKS;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredTasks = (tasks: PersonalTask[], userId?: string): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.TASKS}_${userId}` : STORAGE_KEYS.TASKS;
    localStorage.setItem(key, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save personal tasks:', err);
  }
};

export const getStoredStudyProgress = (userId?: string): StudyProgressItem[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.STUDY_PROGRESS}_${userId}` : STORAGE_KEYS.STUDY_PROGRESS;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredStudyProgress = (items: StudyProgressItem[], userId?: string): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.STUDY_PROGRESS}_${userId}` : STORAGE_KEYS.STUDY_PROGRESS;
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save study progress:', err);
  }
};

export const getStoredAutomationHistory = (userId?: string): AutomationConversationTurn[] => {
  try {
    if (!userId) return [];
    const key = `${STORAGE_KEYS.AUTOMATION_HISTORY}_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredAutomationHistory = (
  turns: AutomationConversationTurn[],
  userId?: string
): void => {
  try {
    if (!userId) return;
    const key = `${STORAGE_KEYS.AUTOMATION_HISTORY}_${userId}`;
    localStorage.setItem(key, JSON.stringify(turns.slice(-30)));
  } catch (err) {
    console.error('Failed to save automation history:', err);
  }
};

export const getStoredAutomationSchedules = (userId?: string): AutomationScheduleItem[] => {
  try {
    if (!userId) return [];
    const key = `${STORAGE_KEYS.AUTOMATION_SCHEDULES}_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredAutomationSchedules = (
  schedules: AutomationScheduleItem[],
  userId?: string
): void => {
  try {
    if (!userId) return;
    const key = `${STORAGE_KEYS.AUTOMATION_SCHEDULES}_${userId}`;
    localStorage.setItem(key, JSON.stringify(schedules.slice(0, 40)));
  } catch (err) {
    console.error('Failed to save automation schedules:', err);
  }
};

export const getStoredAutomationLogs = (userId?: string): AutomationRunLogItem[] => {
  try {
    if (!userId) return [];
    const key = `${STORAGE_KEYS.AUTOMATION_LOGS}_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredAutomationLogs = (
  logs: AutomationRunLogItem[],
  userId?: string
): void => {
  try {
    if (!userId) return;
    const key = `${STORAGE_KEYS.AUTOMATION_LOGS}_${userId}`;
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 60)));
  } catch (err) {
    console.error('Failed to save automation logs:', err);
  }
};

export interface UserLocalExtras {
  nickname?: string;
  age?: number;
  onboardingCompleted?: boolean;
  memoryConsent?: 'pending' | 'agreed' | 'disagreed';
  lastSeenAt?: number;
  country?: string;
  countryCode?: string;
  countryFlag?: string;
  timezone?: string;
  countryDetectionMethod?: 'gps' | 'ip' | 'timezone' | 'manual';
  isManualCountry?: boolean;
  customAvatarDataUrl?: string;
  avatarColor?: string;
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string;
  recoveryCount?: number;
  recoveryMonth?: string;
  streakBeforeBreak?: number;
  streakBrokenDate?: string;
}

export const getUserLocalExtras = (userId?: string): UserLocalExtras => {
  try {
    if (!userId) return {};
    const raw = localStorage.getItem(`${STORAGE_KEYS.USER_EXTRAS}_${userId}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const saveUserLocalExtras = (userId: string, patch: UserLocalExtras): void => {
  try {
    if (!userId) return;
    const prev = getUserLocalExtras(userId);
    localStorage.setItem(`${STORAGE_KEYS.USER_EXTRAS}_${userId}`, JSON.stringify({ ...prev, ...patch }));
  } catch (err) {
    console.error('Failed to save local profile extras:', err);
  }
};

export const getStoredTransferHistory = (userId?: string): TransferHistoryEntry[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.TRANSFER_HISTORY}_${userId}` : STORAGE_KEYS.TRANSFER_HISTORY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredTransferHistory = (
  entries: TransferHistoryEntry[],
  userId?: string
): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.TRANSFER_HISTORY}_${userId}` : STORAGE_KEYS.TRANSFER_HISTORY;
    localStorage.setItem(key, JSON.stringify(entries.slice(0, 60)));
  } catch (err) {
    console.error('Failed to save transfer history:', err);
  }
};

export const getStoredTranslationHistory = (userId?: string): TranslationHistoryEntry[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.TRANSLATION_HISTORY}_${userId}` : STORAGE_KEYS.TRANSLATION_HISTORY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStoredTranslationHistory = (
  entries: TranslationHistoryEntry[],
  userId?: string
): void => {
  try {
    const key = userId ? `${STORAGE_KEYS.TRANSLATION_HISTORY}_${userId}` : STORAGE_KEYS.TRANSLATION_HISTORY;
    localStorage.setItem(key, JSON.stringify(entries.slice(0, 80)));
  } catch (err) {
    console.error('Failed to save translation history:', err);
  }
};

export const getStoredLoginActivity = (userId?: string): LoginActivityEntry[] => {
  try {
    const key = userId ? `${STORAGE_KEYS.LOGIN_ACTIVITY}_${userId}` : STORAGE_KEYS.LOGIN_ACTIVITY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const recordLoginActivity = (
  entry: { provider: string; email?: string; deviceSummary?: string },
  userId?: string
): LoginActivityEntry[] => {
  const current = getStoredLoginActivity(userId);
  const now = Date.now();
  // Deduplicate rapid consecutive reloads within 10 minutes
  if (current.length > 0 && now - current[0].timestamp < 10 * 60 * 1000 && current[0].provider === entry.provider) {
    return current;
  }
  const browserUa =
    typeof navigator !== 'undefined'
      ? navigator.userAgent.includes('Mobile')
        ? 'Mobile Browser'
        : 'Desktop Browser'
      : 'Web Session';
  const nextEntry: LoginActivityEntry = {
    id: `login-${now}`,
    timestamp: now,
    provider: entry.provider || 'firebase',
    email: entry.email,
    deviceSummary: entry.deviceSummary || browserUa,
  };
  const updated = [nextEntry, ...current].slice(0, 15);
  try {
    const key = userId ? `${STORAGE_KEYS.LOGIN_ACTIVITY}_${userId}` : STORAGE_KEYS.LOGIN_ACTIVITY;
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
  return updated;
};


