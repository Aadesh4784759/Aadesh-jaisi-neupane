import {
  AIMemoryItem,
  AppSettings,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  PersonalTask,
  StudyProgressItem,
  UserProfile,
} from '../types';
import { INITIAL_BADGES, generateStreakHistory } from './gamification';

const STORAGE_KEYS = {
  SESSIONS: 'aadesh_ai_sessions_v1',
  CURRENT_SESSION_ID: 'aadesh_ai_current_session_id',
  MEDIA: 'aadesh_ai_media_v1',
  SETTINGS: 'aadesh_ai_settings_v1',
  METRICS: 'aadesh_ai_metrics_v1',
  USER: 'aadesh_ai_user_v1',
  VOICE_HISTORY: 'aadesh_ai_voice_history_v1',
  FOLDERS: 'aadesh_ai_folders_v1',
  MEMORIES: 'aadesh_ai_memories_v1',
  TASKS: 'aadesh_ai_tasks_v1',
  STUDY_PROGRESS: 'aadesh_ai_study_progress_v1',
};

export const DEFAULT_SESSION_CATEGORIES = [
  'General',
  'Work',
  'Personal',
  'Language Practice',
  'Study & Code',
];

export const OWNER_ADMIN_EMAIL = 'aadeshjaisi6@gmail.com';

// Never display Aadesh Jaisi as every visitor's personal name; keep creator credit in footer/branding.
export const DEFAULT_USER: UserProfile = {
  id: 'guest_explorer',
  name: 'Guest Explorer',
  username: 'guest',
  email: '',
  avatarUrl: '',
  avatarColor: '#8b5cf6',
  provider: 'guest',
  linkedProviders: [],
  isLoggedIn: false,
  role: 'user',
  status: 'active',
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  preferredLanguage: 'en',
  streakDays: 1,
  longestStreak: 1,
  xp: 50,
  level: 1,
  levelTitle: 'Global Explorer',
  dailyGoalTarget: 5,
  dailyGoalCurrent: 0,
  lastActiveDate: new Date().toISOString().slice(0, 10),
  streakHistory: generateStreakHistory(1),
  badges: INITIAL_BADGES,
};

export const DEFAULT_SETTINGS: AppSettings = {
  uiLanguage: 'en',
  defaultTargetLanguage: 'ne', // Prioritize English & Nepali
  autoSpeakAIResponses: false,
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voiceVolume: 1.0,
  voicePersona: 'friendly',
  highContrast: false,
  theme: 'dark',
  dynamicAvatarTheme: true,
  fontSize: 'normal',
  handsFreeMode: false,
  offlineModeForce: false,
  screenReaderAnnounce: false,
  streamingResponses: true,
  aiMemoryEnabled: true,
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
        title: 'Welcome to Aadesh AI Global Hub',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        targetLanguage: 'ne',
        category: 'General',
        messages: [
          {
            id: 'm-1',
            role: 'model',
            content:
              'Hello! I am **Aadesh AI Global Hub** (created by **Aadesh Jaisi**), your worldwide multilingual AI assistant powered by Google Gemini.\n\nI can help with:\n- Step-by-step explanations & study guidance\n- Clean programming help with formatted code blocks\n- Multilingual translation across **English, नेपाली, हिन्दी, اردو, العربية** & 15+ languages\n- Photo, file & hands-free voice understanding\n\nHow can I assist you today?',
            translation:
              'नमस्ते! म **आदेश एआई ग्लोबल हब** हुँ (निर्माता: **आदेश जैसी**)। म तपाईंलाई अध्ययन, प्रोग्रामिङ, तस्बिर विश्लेषण, र नेपाली/अङ्ग्रेजी लगायत विभिन्न भाषामा सहयोग गर्न तयार छु। आज म के सहयोग गर्न सक्छु?',
            translationLanguage: 'ne',
            detectedLanguage: 'en',
            timestamp: Date.now(),
            sentiment: 'positive',
            suggestedQuestions: [
              'नेपालीमा अनुवाद गर्नुहोस् (Translate to Nepali)',
              'Explain how neural networks work step by step',
              'Help me write a clean TypeScript or Python function',
            ],
          },
        ],
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
