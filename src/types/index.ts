import { AIProviderId, AIProviderStatusInfo, ConnectionHistoryEntry } from '../utils/aiProviders';

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
  provider?: AIProviderId;
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

export type AIConnectionState = 'connected' | 'configured' | 'connecting' | 'offline' | 'error';

export interface AIConnectionHealth {
  state: AIConnectionState;
  backendConnected: boolean;
  geminiConnected: boolean;
  activeProvider?: AIProviderId;
  activeProviderConfigured?: boolean;
  activeProviderVerified?: boolean;
  providers?: Partial<Record<AIProviderId, AIProviderStatusInfo>>;
  connectionHistory?: ConnectionHistoryEntry[];
  model: string;
  checkedAt: number | null;
  lastConnectedAt: number | null;
  latencyMs?: number;
  error?: string;
}

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
  status?: 'maintained' | 'missed' | 'recovered';
}

export interface UserProfile {
  id: string;
  name: string;
  nickname?: string;
  age?: number;
  onboardingCompleted?: boolean;
  username: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  avatarColor?: string;
  country?: string;
  countryCode?: string;
  countryFlag?: string;
  timezone?: string;
  countryDetectionMethod?: 'gps' | 'ip' | 'timezone' | 'manual';
  isManualCountry?: boolean;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  provider: 'google' | 'email' | 'phone' | 'facebook' | 'guest';
  linkedProviders: ('google' | 'email' | 'phone' | 'facebook')[];
  isLoggedIn: boolean;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  createdAt?: number;
  lastActiveAt?: number;
  preferredLanguage?: string;
  streakDays: number;
  currentStreak?: number;
  longestStreak: number;
  streakGoalDays?: number;
  recoveryCount?: number;
  recoveryMonth?: string; // YYYY-MM in user's IANA timezone
  recoveredDates?: string[]; // YYYY-MM-DD dates restored via streak recovery
  streakBeforeBreak?: number;
  streakBrokenDate?: string; // YYYY-MM-DD of lastActiveDate before break
  xp: number;
  level: number;
  levelTitle: string;
  dailyGoalTarget: number;
  dailyGoalCurrent: number;
  lastActiveDate: string; // YYYY-MM-DD in user's IANA timezone
  streakHistory: DailyStreakDay[];
  badges: AchievementBadge[];
}

export interface TransferHistoryEntry {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  direction: 'sent' | 'received' | 'downloaded' | 'shared';
  method: string;
  sha256?: string;
  timestamp: number;
  status: 'completed' | 'failed';
  previewDataUrl?: string;
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

export interface TranslationHistoryEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  detectedSourceLang?: string;
  targetLang: string;
  pronunciation?: string;
  culturalNote?: string;
  timestamp: number;
  isVoice?: boolean;
}

export interface LoginActivityEntry {
  id: string;
  timestamp: number;
  provider: string;
  email?: string;
  deviceSummary: string;
}

export interface AppSettings {
  uiLanguage: string;
  defaultTargetLanguage: string;
  aiResponseLanguage?: string;
  autoDetectInputLanguage?: boolean;
  translationEnabled?: boolean;
  translationLanguage?: string;
  autoSpeakAIResponses: boolean;
  voiceSpeed: number; // 0.5 - 2.0
  voicePitch: number; // 0.8 - 1.2
  voiceVolume: number; // 0.0 - 1.0
  voiceSensitivity?: number; // 0 - 100 dB threshold
  voicePersona: VoicePersona;
  highContrast: boolean;
  theme?: 'dark' | 'light';
  colorTheme?: 'dark-galaxy' | 'pure-light' | 'purple-galaxy' | 'ocean-blue' | 'emerald-green' | 'sunset-orange' | 'cyber-neon';
  dynamicAvatarTheme?: boolean;
  aiProvider?: AIProviderId;
  aiModel?: string;
  openRouterModel?: string;
  fontSize: 'normal' | 'large' | 'xlarge';
  handsFreeMode: boolean;
  offlineModeForce: boolean;
  screenReaderAnnounce: boolean;
  streamingResponses?: boolean;
  aiMemoryEnabled?: boolean;
  smartMemoryAutoSave?: boolean;
  memoryConsent?: 'pending' | 'agreed' | 'disagreed';
  notificationsEnabled?: boolean;
  soundEffects?: boolean;
  streakReminders?: boolean;
  streakReminderTime?: string; // HH:mm 24-hour preferred push reminder time
  emailUpdatesEnabled?: boolean;
  privateAccount?: boolean;
  aiResponseMode?: 'fast' | 'balanced' | 'detailed';
  focusMode?: 'normal' | 'study' | 'night' | 'relax';
  chatAppearance?: 'spacious' | 'compact';
  reducedAnimations?: boolean;
  biometricLockEnabled?: boolean;
  analyticsConsent?: boolean;
}

export type MemoryCategory =
  | 'identity'
  | 'preference'
  | 'goal'
  | 'project'
  | 'interest'
  | 'comedy'
  | 'instruction'
  | 'fact'
  | 'conversation';

export interface AIMemoryItem {
  id: string;
  userId?: string;
  category: MemoryCategory;
  content: string;
  approved: boolean;
  source?: 'manual' | 'smart_auto' | 'command' | 'chat';
  isSensitive?: boolean;
  keywords?: string[];
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
  denied?: boolean;
  executed?: boolean;
}

export type AgentTaskPriority = 'high' | 'medium' | 'low';

export interface AgentStepPlan {
  id?: string;
  stepNumber: number;
  title: string;
  detail: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'denied';
  priority?: AgentTaskPriority;
  estimatedMinutes?: number;
  estimatedTime?: string;
  output?: string;
  toolName?: string;
  isSensitive?: boolean;
  parentStepNumber?: number;
}

export type AutomationTaskOptionId =
  | 'emails'
  | 'lead_generation'
  | 'content_creation'
  | 'customer_support'
  | 'business_reports';

export type AutomationTone = 'professional' | 'friendly' | 'creative' | 'concise';

export interface AutomationRecommendedAction {
  title: string;
  rationale: string;
  requiredService: string;
  integrationStatus: 'requires_oauth' | 'ready_in_workspace';
}

export interface AutomationSuggestionResponse {
  headline: string;
  assistantMessage: string;
  smartReplies: string[];
  recommendedNextAction: AutomationRecommendedAction;
  actionPlan: string[];
  modelUsed?: string;
  latencyMs?: number;
}

export interface AutomationConversationTurn {
  id: string;
  category: AutomationTaskOptionId;
  tone: AutomationTone;
  userPrompt: string;
  response: AutomationSuggestionResponse;
  createdAt: number;
}

export type AutomationScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type AutomationRunStatus = 'running' | 'success' | 'failed';
export type AutomationRunTrigger = 'manual' | 'scheduled' | 'strategy_action';

export interface AutomationScheduleItem {
  id: string;
  userId: string;
  title: string;
  category: AutomationTaskOptionId;
  frequency: AutomationScheduleFrequency;
  timeOfDay: string; // HH:mm
  dayOfWeek?: string; // Monday, Tuesday, etc. for weekly
  prompt: string;
  tone: AutomationTone;
  targetLanguage: string;
  enabled: boolean;
  nextRunAt: number;
  lastRunAt?: number;
  lastStatus: 'idle' | 'running' | 'success' | 'failed';
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRunLogItem {
  id: string;
  userId: string;
  scheduleId?: string;
  taskTitle: string;
  category: AutomationTaskOptionId;
  tone: AutomationTone;
  triggerType: AutomationRunTrigger;
  status: AutomationRunStatus;
  statusMessage: string;
  outputSummary: string;
  errorMessage?: string;
  modelUsed?: string;
  latencyMs?: number;
  startedAt: number;
  completedAt?: number;
}

export interface AutomationExecuteResponse {
  ok: boolean;
  status: 'success' | 'failed';
  executionHeadline?: string;
  deliverableContent?: string;
  highlights?: string[];
  nextScheduledNote?: string;
  modelUsed?: string;
  latencyMs: number;
  executedAt: string;
  error?: string;
}

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
export type ImageQualitySize = '1K' | '2K' | '4K';
export type ImageStylePreset =
  | 'Realistic'
  | '3D'
  | 'Cartoon'
  | 'Anime'
  | 'Digital Art'
  | 'Painting';

export interface GeneratedImageItem {
  id: string;
  userId?: string;
  prompt: string;
  revisedPrompt?: string;
  style: ImageStylePreset | string;
  aspectRatio: ImageAspectRatio | string;
  resolution?: ImageQualitySize | string;
  modelName: string;
  mimeType: string;
  imageDataUrl: string;
  storageLocation: string;
  createdAt: number;
  latencyMs?: number;
}

export type SuggestionCategory =
  | 'deep_dive'
  | 'examples'
  | 'summary'
  | 'translate'
  | 'action_steps'
  | 'compare'
  | 'explore_local'
  | 'visual'
  | 'general';

export interface SuggestionAnalyticsItem {
  id: string;
  normalizedKey: string;
  sampleText: string;
  category: SuggestionCategory;
  language?: string;
  clickCount: number;
  lastClickedAt: number;
  createdAt: number;
}

export interface PreferredSuggestionPatterns {
  topClickedSuggestions: Array<{
    text: string;
    category: SuggestionCategory;
    clickCount: number;
  }>;
  topCategories: Array<{
    category: SuggestionCategory;
    totalClicks: number;
  }>;
  totalClicks: number;
}



