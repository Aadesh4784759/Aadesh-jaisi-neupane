import { AppSettings, ChatSession, EngagementMetrics, GeotaggedMedia } from '../types';

const STORAGE_KEYS = {
  SESSIONS: 'aadesh_ai_sessions_v1',
  CURRENT_SESSION_ID: 'aadesh_ai_current_session_id',
  MEDIA: 'aadesh_ai_media_v1',
  SETTINGS: 'aadesh_ai_settings_v1',
  METRICS: 'aadesh_ai_metrics_v1',
};

export const DEFAULT_SETTINGS: AppSettings = {
  uiLanguage: 'en',
  defaultTargetLanguage: 'es',
  autoSpeakAIResponses: false,
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voicePersona: 'friendly',
  highContrast: false,
  fontSize: 'normal',
  handsFreeMode: false,
  offlineModeForce: false,
  screenReaderAnnounce: false,
};

export const INITIAL_METRICS: EngagementMetrics = {
  totalQueries: 48,
  totalVoiceQueries: 19,
  totalImageQueries: 14,
  totalTranslations: 62,
  languageCounts: {
    en: 22,
    es: 15,
    ja: 11,
    ne: 9,
    fr: 8,
    zh: 7,
    hi: 6,
    de: 4,
  },
  regionalActivity: {
    'Tokyo, Japan': 12,
    'Kathmandu, Nepal': 9,
    'Paris, France': 8,
    'New York, USA': 7,
    'Rome, Italy': 5,
    'Cairo, Egypt': 4,
    'São Paulo, Brazil': 3,
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

// Vibrant seed media gallery with geotags across world regions
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

export const getStoredSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!raw) {
      // Default initial welcome session
      const initialSession: ChatSession = {
        id: 'session-default-welcome',
        title: 'Welcome to Aadesh AI',
        createdAt: Date.now() - 3600000 * 2,
        updatedAt: Date.now() - 3600000 * 2,
        targetLanguage: 'es',
        messages: [
          {
            id: 'm-1',
            role: 'model',
            content: 'Hello and welcome! I am Aadesh AI, your next-generation AI Learning Platform built by Aadesh Jaisi (आदेश जैसी). I support hands-free voice personas (Calm, Energetic, Professional, Friendly), real-time multilingual translation across 18+ languages, and visual photo learning with geotagging. What would you like to explore or learn today?',
            translation: '¡Hola y bienvenido! Soy Aadesh AI, tu plataforma de aprendizaje de IA de próxima generación creada por Aadesh Jaisi. Cuento con personas de voz manos libres, traducción en tiempo real y aprendizaje visual.',
            detectedLanguage: 'en',
            timestamp: Date.now() - 3600000 * 2,
            sentiment: 'positive',
            suggestedQuestions: [
              'How can Aadesh AI help me learn languages?',
              'Switch AI voice persona to Calm or Energetic',
              'Explain how photo geotagging works',
              'How to say "Thank you" in Nepali and Japanese?',
            ],
          },
        ],
      };
      saveStoredSessions([initialSession]);
      return [initialSession];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveStoredSessions = (sessions: ChatSession[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save sessions:', err);
  }
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
    // Apply accessibility classes to document body
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
