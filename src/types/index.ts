export interface LocationData {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  city?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  translation?: string;
  detectedLanguage?: string;
  timestamp: number;
  imageUrl?: string;
  videoUrl?: string;
  location?: LocationData;
  isVoiceInput?: boolean;
  sentiment?: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral';
  suggestedQuestions?: string[];
  geotagInsights?: string;
  isOffline?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  targetLanguage: string;
  tags?: string[];
}

export interface GeotaggedMedia {
  id: string;
  title: string;
  type: 'photo' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  location: LocationData;
  timestamp: number;
  caption?: string;
  translatedCaptions?: Record<string, string>;
  tags: string[];
  detectedLandmark?: string;
  detectedText?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  speechCode: string;
  region: string;
}

export interface EngagementMetrics {
  totalQueries: number;
  totalVoiceQueries: number;
  totalImageQueries: number;
  totalTranslations: number;
  languageCounts: Record<string, number>;
  regionalActivity: Record<string, number>;
  avgLatencyMs: number;
  latencySamples: number[];
  hourlyActivity: number[]; // 24 hours
  sentimentCounts: {
    positive: number;
    curious: number;
    inquiry: number;
    urgent: number;
    neutral: number;
  };
}

export type VoicePersona = 'calm' | 'energetic' | 'professional' | 'friendly';

export interface VoicePersonaInfo {
  id: VoicePersona;
  name: string;
  tagline: string;
  description: string;
  pitch: number;
  rate: number;
  iconName: string;
  tonePrompt: string;
  sampleAudioText: string;
}

export interface AppSettings {
  uiLanguage: string;
  defaultTargetLanguage: string;
  autoSpeakAIResponses: boolean;
  voiceSpeed: number; // 0.8 - 1.5
  voicePitch: number; // 0.8 - 1.2
  voicePersona: VoicePersona;
  highContrast: boolean;
  fontSize: 'normal' | 'large' | 'xlarge';
  handsFreeMode: boolean;
  offlineModeForce: boolean;
  screenReaderAnnounce: boolean;
}

