export interface LocationData {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  city?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'participant';
  senderId?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  content: string;
  translation?: string;
  translationLanguage?: string;
  detectedLanguage?: string;
  timestamp: number;
  imageUrl?: string;
  videoUrl?: string;
  attachmentName?: string;
  attachmentText?: string;
  location?: LocationData;
  isVoiceInput?: boolean;
  sentiment?: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral';
  suggestedQuestions?: string[];
  geotagInsights?: string;
  feedback?: 'up' | 'down';
  reactions?: Record<string, number>;
  userReactions?: string[];
  isPinned?: boolean;
  pinnedAt?: number;
  isOffline?: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  editedAt?: number;
  sources?: GroundingSource[];
  modelUsed?: string;
  latencyMs?: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  targetLanguage: string;
  category?: string;
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
  rtl?: boolean;
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

export type AIConnectionState = 'connected' | 'connecting' | 'disconnected';

export interface AchievementBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
  category: 'streak' | 'xp' | 'multilingual' | 'voice' | 'vision';
}

export interface DailyStreakDay {
  date: string; // YYYY-MM-DD
  dayLabel: string; // Mon, Tue, etc.
  completed: boolean;
  activityCount: number;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  avatarColor?: string;
  provider: 'google' | 'email' | 'phone' | 'facebook' | 'guest';
  linkedProviders: ('google' | 'email' | 'phone' | 'facebook')[];
  isLoggedIn: boolean;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  createdAt?: number;
  lastActiveAt?: number;
  preferredLanguage?: string;
  streakDays: number;
  longestStreak: number;
  xp: number;
  level: number;
  levelTitle: string;
  dailyGoalTarget: number;
  dailyGoalCurrent: number;
  lastActiveDate: string; // YYYY-MM-DD
  streakHistory: DailyStreakDay[];
  badges: AchievementBadge[];
}

export interface AdminUserRecord {
  userId: string;
  displayName: string;
  username?: string;
  email?: string;
  photoURL?: string;
  preferredLanguage?: string;
  provider?: string;
  status: 'active' | 'suspended';
  role: 'user' | 'admin';
  messageCount?: number;
  conversationCount?: number;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AdminConversationSummary {
  id: string;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  title: string;
  language?: string;
  messageCount?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface VoiceHistoryEntry {
  id: string;
  userId?: string;
  transcript: string;
  timestamp: number;
  language: string;
  durationSeconds?: number;
  audioBlobUrl?: string;
  targetTranslation?: string;
}

export interface AppSettings {
  uiLanguage: string;
  defaultTargetLanguage: string;
  autoSpeakAIResponses: boolean;
  voiceSpeed: number; // 0.8 - 1.5
  voicePitch: number; // 0.8 - 1.2
  voiceVolume: number; // 0.0 - 1.0
  voicePersona: VoicePersona;
  highContrast: boolean;
  theme?: 'dark' | 'light';
  dynamicAvatarTheme?: boolean;
  customGeminiApiKey?: string;
  geminiModel?: string;
  fontSize: 'normal' | 'large' | 'xlarge';
  handsFreeMode: boolean;
  offlineModeForce: boolean;
  screenReaderAnnounce: boolean;
  streamingResponses?: boolean;
  aiMemoryEnabled?: boolean;
}

export type MemoryCategory = 'preference' | 'instruction' | 'fact' | 'goal';

export interface AIMemoryItem {
  id: string;
  userId?: string;
  category: MemoryCategory;
  content: string;
  approved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PersonalTask {
  id: string;
  userId?: string;
  title: string;
  notes?: string;
  dueDate?: string;
  dueTime?: string;
  priority: 'low' | 'medium' | 'high';
  category: 'daily' | 'work' | 'study' | 'personal' | 'reminder';
  completed: boolean;
  reminderMinutes?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudyProgressItem {
  id: string;
  userId?: string;
  topic: string;
  mode: 'notes' | 'mcq' | 'practice_test' | 'math' | 'english_nepali' | 'exam_prep';
  score: number;
  totalQuestions: number;
  language: 'en' | 'ne' | 'bilingual';
  completedAt: number;
}

export interface StudyMCQQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  nepaliHint?: string;
}

export type AgentPersonaId =
  | 'research'
  | 'study'
  | 'coding'
  | 'writing'
  | 'translation'
  | 'productivity';

export interface AgentProposedAction {
  id: string;
  type: 'save_memory' | 'create_task' | 'open_url' | 'download_file' | 'draft_email';
  title: string;
  description: string;
  payload: Record<string, string>;
  approved?: boolean;
  executed?: boolean;
}

export interface AgentStepPlan {
  stepNumber: number;
  title: string;
  detail: string;
  status: 'pending' | 'running' | 'completed';
  output?: string;
}
