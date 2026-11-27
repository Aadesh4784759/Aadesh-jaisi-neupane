import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles, X } from 'lucide-react';
import {
  AIConnectionHealth,
  AIMemoryItem,
  AppSettings,
  ChatMessage,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  LocationData,
  MemoryCategory,
  SuggestionAnalyticsItem,
  UserProfile,
} from './types';
import {
  AI_PROVIDER_METADATA,
  AIProviderId,
  AIProviderStatusInfo,
  GEMINI_QUOTA_FALLBACK_MODEL,
  GEMINI_QUOTA_FALLBACK_NOTICE,
  getStaticCatalogForProvider,
  normalizeAIProviderId,
  normalizeProviderStatusInfo,
  sanitizeOpenRouterModelId,
} from './utils/aiProviders';
import { getCachedAIResponse, cacheAIResponse } from './utils/aiCache';
import { trackAnalyticsEvent } from './utils/analytics';
import {
  DEFAULT_SETTINGS,
  DEFAULT_USER,
  OWNER_ADMIN_EMAIL,
  getStoredMedia,
  getStoredMetrics,
  getStoredSessions,
  getStoredFolders,
  getStoredMemories,
  saveStoredMemories,
  getStoredSettings,
  getStoredUser,
  getStoredUserStreakBackup,
  saveStoredUserStreakBackup,
  getUserLocalExtras,
  saveUserLocalExtras,
  getLastStreakReminderDate,
  saveLastStreakReminderDate,
  saveStoredMedia,
  saveStoredSessions,
  saveStoredFolders,
  saveStoredSettings,
  saveStoredUser,
  saveStoredVoiceHistory,
  addVoiceHistoryEntry,
  recordLoginActivity,
  recordMetricEvent,
} from './utils/storage';
import { SUPPORTED_LANGUAGES } from './data/languages';
import { detectUserCountry, detectCountryApproxViaIP, resolveCountryForProfile } from './utils/country';
import { buildApiUrl } from './utils/apiConfig';
import { Header } from './components/Header';
import { NavigationDock, BottomNavTab } from './components/NavigationDock';
import { FuturisticBackground } from './components/FuturisticBackground';
import { SplashScreen } from './components/SplashScreen';

const ChatView = lazy(() => import('./components/ChatView').then((m) => ({ default: m.ChatView })));
const AnalyticsDashboard = lazy(() =>
  import('./components/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard }))
);
const TransferView = lazy(() =>
  import('./components/TransferView').then((m) => ({ default: m.TransferView }))
);
const VoicePage = lazy(() =>
  import('./components/VoicePage').then((m) => ({ default: m.VoicePage }))
);
const MoreView = lazy(() =>
  import('./components/MoreView').then((m) => ({ default: m.MoreView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);
const MandatoryAuthGate = lazy(() =>
  import('./components/MandatoryAuthGate').then((m) => ({ default: m.MandatoryAuthGate }))
);
const OnboardingModal = lazy(() =>
  import('./components/OnboardingModal').then((m) => ({ default: m.OnboardingModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const GamificationModal = lazy(() =>
  import('./components/GamificationModal').then((m) => ({ default: m.GamificationModal }))
);
const InstallAppModal = lazy(() =>
  import('./components/InstallAppModal').then((m) => ({ default: m.InstallAppModal }))
);

function triggerConfetti(options: { particleCount?: number; spread?: number; origin?: { x?: number; y?: number } }) {
  void import('canvas-confetti')
    .then((m) => {
      m.default(options);
    })
    .catch(() => {});
}

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 min-h-[240px] flex items-center justify-center p-6">
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl glass-card border border-purple-400/25 text-xs font-semibold text-purple-200">
      <div className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
      <span>Loading workspace...</span>
    </div>
  </div>
);
import {
  NEPAL_TIMEZONE,
  recordGamificationActivity,
  evaluateCurrentStreakOnLoad,
  evaluateStreakStateOnRead,
  applyDailyActivityToStreakState,
  isStreakRecoveryEligible,
  recoverBrokenStreakState,
  generateStreakHistory,
  getRecoveredGapDateKeys,
  resolveEffectiveStreakTimezone,
  mergeStreakStateSafely,
  calculateConsecutiveStreakFromDates,
  computeUserExperienceLevel,
  processStreakFreeze,
} from './utils/gamification';
import {
  DEFAULT_STREAK_REMINDER_TIME,
  evaluateNepalEveningReminder,
  triggerLocalStreakNotification,
} from './utils/streakReminder';
import { voiceAssistant, resolveSpeechCodeForText } from './utils/speech';
import { applyAvatarDynamicTheme, COLOR_THEME_PRESETS } from './utils/avatarTheme';
import {
  subscribeToAuth,
  syncUserProfileToFirestore,
  loadUserProfileFromFirestoreWithStatus,
  loadConversationsFromFirestore,
  loadMemoriesFromFirestore,
  saveMemoryToFirestore,
  deleteMemoryFromFirestore,
  clearAllMemoriesFromFirestore,
  saveConversationAndMessagesToFirestore,
  saveSingleMessageToFirestore,
  deleteConversationFromFirestore,
  recordUsageAnalyticsToFirestore,
  fetchUserUsageDatesFromFirestore,
  recordDailyStreakActivityInFirestoreSafe,
  recoverDailyStreakInFirestore,
  syncStreakFreezeToFirestoreSafe,
  syncUserStreakLeaderboardEntry,
  recordSuggestedReplyClickInFirestore,
  loadTopSuggestedReplyPatternsFromFirestore,
  subscribeToPlatformAnnouncement,
  getAuthHeaders,
  logOut,
} from './utils/firebase';
import {
  getStoredSuggestionAnalytics,
  mergeSuggestionAnalytics,
  recordLocalSuggestionClick,
  saveStoredSuggestionAnalytics,
  summarizeTopSuggestionPatterns,
} from './utils/suggestionAnalytics';
import {
  classifyMemorySensitivity,
  containsSecretOrCredential,
  detectExplicitMemoryCommand,
  detectSmartAutoMemoryCandidate,
  extractMemoryKeywords,
  findMatchingMemoriesToForget,
  inferMemoryCategory,
  retrieveRelevantMemories,
} from './utils/powerMemory';

type AppTab = BottomNavTab | 'admin';

function playSoftNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {}
}

function sanitizeUserForFirestore(profile: UserProfile): UserProfile {
  const safeAvatar =
    profile.avatarUrl && !profile.avatarUrl.startsWith('data:') && profile.avatarUrl.length <= 950
      ? profile.avatarUrl
      : '';
  return {
    ...profile,
    avatarUrl: safeAvatar,
  };
}

const FRESH_LAUNCH_SESSION_KEY = 'aadesh_window_session_active';

function detectFreshAppLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const active = window.sessionStorage.getItem(FRESH_LAUNCH_SESSION_KEY) === '1';
    if (!active) {
      window.sessionStorage.setItem(FRESH_LAUNCH_SESSION_KEY, '1');
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function resolveReopenNewChat(
  sessionList: ChatSession[],
  targetLanguage: string,
  userId?: string
): { sessions: ChatSession[]; sessionId: string } {
  const existingEmpty = sessionList.find((s) => !s.messages || s.messages.length === 0);
  if (existingEmpty) {
    return {
      sessions: sessionList,
      sessionId: existingEmpty.id,
    };
  }
  const now = Date.now();
  const freshSession: ChatSession = {
    id: `session-${now}`,
    title: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    targetLanguage: targetLanguage || 'ne',
    category: 'General',
    messages: [],
  };
  const updated = [freshSession, ...sessionList];
  saveStoredSessions(updated, userId);
  return {
    sessions: updated,
    sessionId: freshSession.id,
  };
}

export default function App() {
  const isFreshLaunchRef = useRef<boolean>(detectFreshAppLaunch());
  const hasUserPickedSessionRef = useRef<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [user, setUser] = useState<UserProfile>(getStoredUser());
  const userRef = useRef<UserProfile>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [isStreakLoading, setIsStreakLoading] = useState<boolean>(false);
  const isStreakLoadingRef = useRef<boolean>(false);
  const [streakSyncError, setStreakSyncError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register' | 'profile'>('signin');
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [aiHealth, setAiHealth] = useState<AIConnectionHealth>({
    state: 'connecting',
    backendConnected: false,
    geminiConnected: false,
    activeProvider: settings.aiProvider || 'gemini',
    model: settings.aiModel || 'gemini-4-hydrogen',
    checkedAt: null,
    lastConnectedAt: null,
  });
  const [providersStatus, setProvidersStatus] = useState<
    Partial<Record<AIProviderId, AIProviderStatusInfo>> | null
  >(null);
  const [isLoadingProvidersStatus, setIsLoadingProvidersStatus] = useState<boolean>(false);
  const [testingProviderId, setTestingProviderId] = useState<AIProviderId | null>(null);
  const [hasInitialHealthSettled, setHasInitialHealthSettled] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [splashDismissed, setSplashDismissed] = useState<boolean>(false);
  const healthRequestInFlightRef = useRef<boolean>(false);
  const initialLaunchState = useRef<{ sessions: ChatSession[]; sessionId: string } | null>(null);
  if (!initialLaunchState.current) {
    const initialUser = getStoredUser();
    const stored = getStoredSessions(initialUser.id);
    if (isFreshLaunchRef.current) {
      initialLaunchState.current = resolveReopenNewChat(
        stored,
        settings.defaultTargetLanguage,
        initialUser.id
      );
    } else {
      initialLaunchState.current = {
        sessions: stored,
        sessionId: stored[0]?.id || 'session-default-welcome',
      };
    }
  }
  const [sessions, setSessions] = useState<ChatSession[]>(initialLaunchState.current.sessions);
  const [sessionFolders, setSessionFolders] = useState<string[]>(() =>
    getStoredFolders(getStoredUser().id)
  );
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    initialLaunchState.current.sessionId
  );
  const [mediaItems, setMediaItems] = useState<GeotaggedMedia[]>(getStoredMedia());
  const [metrics, setMetrics] = useState<EngagementMetrics>(getStoredMetrics());
  const [activeTab, setActiveTab] = useState<AppTab>('chat');
  const [settingsSection, setSettingsSection] = useState<'profile' | 'settings'>('settings');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chatDraft, setChatDraft] = useState<{
    id: number;
    text?: string;
    image?: { base64: string; mimeType: string };
    file?: { name: string; content: string };
  } | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [platformNotice, setPlatformNotice] = useState<{
    announcement?: string;
    maintenanceMode?: boolean;
  } | null>(null);
  const isSendingRef = useRef<boolean>(false);
  const isRecoveringStreakRef = useRef<boolean>(false);
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef<boolean>(false);
  const activeFbUidRef = useRef<string | null>(null);
  const suggestionAnalyticsRef = useRef<SuggestionAnalyticsItem[]>(
    getStoredSuggestionAnalytics(getStoredUser().id)
  );
  const hydratingSessionRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);
  const [fbAuthUser, setFbAuthUser] = useState<FirebaseUser | null>(null);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [welcomeBackName, setWelcomeBackName] = useState<string | null>(null);
  const [modelFallbackNotice, setModelFallbackNotice] = useState<string | null>(null);
  const [memories, setMemories] = useState<AIMemoryItem[]>(() => getStoredMemories(getStoredUser().id));
  const memoriesRef = useRef<AIMemoryItem[]>(memories);
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);
  const [pendingMemoryProposal, setPendingMemoryProposal] = useState<{
    id: string;
    content: string;
    category: MemoryCategory;
    reason?: string;
    isSensitive: boolean;
    source: AIMemoryItem['source'];
  } | null>(null);
  const [memoryActionNotice, setMemoryActionNotice] = useState<string | null>(null);
  const lastNotifiedFallbackKeyRef = useRef<string | null>(null);
  const lastAnalyticsAuthUidRef = useRef<string | null>(null);
  const settingsRef = useRef<AppSettings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const isAuthenticatedVerified = Boolean(fbAuthUser && fbAuthUser.emailVerified);
  const isOnline = isBrowserOnline && !settings.offlineModeForce;
  const isAppReady = isAuthInitialized && hasInitialHealthSettled;
  const isOwner = Boolean(
    user.isLoggedIn &&
      (user.email?.toLowerCase().trim() === OWNER_ADMIN_EMAIL ||
        fbAuthUser?.email?.toLowerCase().trim() === OWNER_ADMIN_EMAIL ||
        user.email?.toLowerCase().trim() === 'aadeshjaisi6@gmail.com' ||
        fbAuthUser?.email?.toLowerCase().trim() === 'aadeshjaisi6@gmail.com')
  );
  const isOwnerAdmin = Boolean(
    isOwner && (user.role === 'admin' || isAuthenticatedVerified)
  );

  const hydrateVerifiedUserSession = (fbUser: FirebaseUser): Promise<void> => {
    if (hydratingSessionRef.current?.uid === fbUser.uid) {
      return hydratingSessionRef.current.promise;
    }
    const run = runHydrateVerifiedUserSession(fbUser).finally(() => {
      if (hydratingSessionRef.current?.uid === fbUser.uid) {
        hydratingSessionRef.current = null;
      }
    });
    hydratingSessionRef.current = { uid: fbUser.uid, promise: run };
    return run;
  };

  const runHydrateVerifiedUserSession = async (fbUser: FirebaseUser) => {
    activeFbUidRef.current = fbUser.uid;
    const emailLower = (fbUser.email || '').toLowerCase();
    const isVerifiedOwner = emailLower === OWNER_ADMIN_EMAIL && fbUser.emailVerified;
    const cleanName =
      fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Member');
    const cleanHandle = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'member';
    const createdAtMs = fbUser.metadata.creationTime
      ? new Date(fbUser.metadata.creationTime).getTime()
      : Date.now();
    const providerName = fbUser.providerData[0]?.providerId?.includes('google') ? 'google' : 'email';

    recordLoginActivity({ provider: providerName, email: fbUser.email || undefined }, fbUser.uid);

    // Mark streak as loading BEFORE reading from Firestore so no UI flash or premature write resets saved values to 0
    isStreakLoadingRef.current = true;
    setIsStreakLoading(true);
    setStreakSyncError(null);

    let fsProfile: Partial<UserProfile> & { preferredTheme?: string; memoryConsent?: 'pending' | 'agreed' | 'disagreed' } | null = null;
    let resolvedCountryInfo: ReturnType<typeof resolveCountryForProfile> | null = null;
    const extras = getUserLocalExtras(fbUser.uid);
    const nowMs = Date.now();

    try {
      const fsLoadResult = await loadUserProfileFromFirestoreWithStatus(fbUser.uid);
      if (activeFbUidRef.current !== fbUser.uid) return;
      fsProfile = fsLoadResult.status === 'found' ? fsLoadResult.profile : null;

      const previousLastSeen = extras.lastSeenAt || fsProfile?.lastActiveAt;
      saveUserLocalExtras(fbUser.uid, { lastSeenAt: nowMs });

      const fsHasCountry = Boolean(fsProfile?.country && fsProfile.country !== 'Global');
      resolvedCountryInfo = resolveCountryForProfile({
        savedCountry: fsHasCountry ? fsProfile?.country : extras.country || fsProfile?.country,
        savedCountryCode: fsHasCountry
          ? (fsProfile as any)?.countryCode
          : extras.countryCode || (fsProfile as any)?.countryCode,
        savedFlag: fsHasCountry ? fsProfile?.countryFlag : extras.countryFlag || fsProfile?.countryFlag,
        savedTimezone: (fsProfile as any)?.timezone || extras.timezone,
        savedMethod: fsHasCountry
          ? (fsProfile as any)?.countryDetectionMethod
          : extras.countryDetectionMethod || (fsProfile as any)?.countryDetectionMethod,
        isManual: fsHasCountry
          ? Boolean((fsProfile as any)?.isManualCountry)
          : Boolean(extras.isManualCountry || (fsProfile as any)?.isManualCountry),
      });

      const resolvedName = fsProfile?.name || cleanName;
      const resolvedNickname = extras.nickname || fsProfile?.nickname || undefined;
      const resolvedAge = extras.age || fsProfile?.age || undefined;
      const hasCompletedOnboarding = Boolean(
        extras.onboardingCompleted ||
          fsProfile?.onboardingCompleted ||
          (fsProfile &&
            ((fsProfile.streakDays || 0) > 0 ||
              Boolean(fsProfile.nickname) ||
              (fsProfile.createdAt && nowMs - fsProfile.createdAt > 5 * 60 * 1000)))
      );

      if (!hasCompletedOnboarding) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }

      // Welcome-back animation for returning users once per browser session (does not replay on refresh)
      const isReturningUser = Boolean(hasCompletedOnboarding || previousLastSeen);
      let alreadyWelcomedThisSession = false;
      try {
        alreadyWelcomedThisSession = sessionStorage.getItem('aadesh_welcomed_uid') === fbUser.uid;
      } catch {}
      if (isReturningUser && !alreadyWelcomedThisSession) {
        try {
          sessionStorage.setItem('aadesh_welcomed_uid', fbUser.uid);
        } catch {}
        const greetingTarget = resolvedNickname || resolvedName.split(/\s+/)[0] || 'Friend';
        setWelcomeBackName(greetingTarget);
        window.setTimeout(() => {
          setWelcomeBackName((cur) => (cur === greetingTarget ? null : cur));
        }, 5000);
      }

      // Resolve consecutive day timezone using the user's saved / local calendar date (with Nepal Time fallback)
      const streakTz = resolveEffectiveStreakTimezone(
        fsProfile?.timezone || extras.timezone || resolvedCountryInfo.timeZone
      );
      const rawStreakBackup = getStoredUserStreakBackup(fbUser.uid);
      const extrasBackup =
        typeof extras.currentStreak === 'number' && extras.currentStreak > 0
          ? {
              currentStreak: extras.currentStreak,
              longestStreak: Math.max(extras.currentStreak, extras.longestStreak ?? 0),
              lastActiveDate: extras.lastActiveDate || '',
              timezone: extras.timezone || streakTz,
              recoveredDates: extras.recoveredDates,
              xp: extras.xp,
            }
          : null;
      const streakBackup =
        rawStreakBackup && (!extrasBackup || (rawStreakBackup.lastActiveDate || '') >= (extrasBackup.lastActiveDate || ''))
          ? rawStreakBackup
          : extrasBackup || rawStreakBackup;
      const currentPrevUser = userRef.current;
      const baseUser = currentPrevUser.id === fbUser.uid ? currentPrevUser : { ...DEFAULT_USER };

      // Check whether users/{uid} in Firestore already has a positive or non-empty streak record.
      // If missing OR stuck at 0, also reconstruct from Firestore usage_analytics + conversations bound
      // to this Firebase UID so refreshing or re-logging in NEVER resets to 0.
      const fsHasPositiveStreak = Boolean(
        fsProfile &&
          ((typeof fsProfile.currentStreak === 'number' && fsProfile.currentStreak > 0) ||
            (typeof fsProfile.streakDays === 'number' && fsProfile.streakDays > 0))
      );

      let firestoreLogsFallback: {
        currentStreak: number;
        longestStreak: number;
        lastActiveDate: string;
        timezone: string;
      } | null = null;
      let firestoreRecoveredDatesFromLogs: string[] = [];

      if (
        !fsHasPositiveStreak &&
        fsLoadResult.status !== 'error' &&
        fsLoadResult.status !== 'permission_denied'
      ) {
        const usageResult = await fetchUserUsageDatesFromFirestore(fbUser.uid, streakTz).catch(
          () => null
        );
        if (activeFbUidRef.current !== fbUser.uid) return;
        if (usageResult) {
          firestoreRecoveredDatesFromLogs = usageResult.recoveredDates || [];
          const usageDateCounts = usageResult.dateCounts || {};
          const sortedDates = Object.keys(usageDateCounts).sort();
          if (sortedDates.length > 0) {
            const latestActiveDateKey = sortedDates[sortedDates.length - 1] || '';
            const logSummary = calculateConsecutiveStreakFromDates(
              usageDateCounts,
              0,
              0,
              14,
              { timeZone: streakTz, nowMs }
            );
            firestoreLogsFallback = {
              currentStreak: logSummary.consecutiveDays,
              longestStreak: Math.max(logSummary.longestStreak, logSummary.consecutiveDays),
              lastActiveDate: latestActiveDateKey,
              timezone: streakTz,
            };
          }
        }
      }

      const safeHydration = mergeStreakStateSafely({
        firestoreResult:
          fsLoadResult.status === 'found'
            ? { status: 'found', state: fsLoadResult.profile }
            : fsLoadResult.status === 'not_found'
            ? { status: 'not_found' }
            : fsLoadResult.status === 'permission_denied'
            ? { status: 'permission_denied', error: fsLoadResult.error }
            : { status: 'error', error: fsLoadResult.error },
        localBackup: streakBackup,
        currentState: baseUser.id === fbUser.uid ? baseUser : null,
        firestoreLogsFallback,
        timeZone: streakTz,
        nowMs,
      });

      const evaluatedStreakState = safeHydration.state;
      const mergedRecoveredDates = Array.from(
        new Set([
          ...(extras.recoveredDates || []),
          ...(streakBackup?.recoveredDates || []),
          ...(baseUser.recoveredDates || []),
          ...firestoreRecoveredDatesFromLogs,
        ])
      ).sort();

      const resolvedXp = Math.max(
        0,
        typeof fsProfile?.xp === 'number' ? fsProfile.xp : 0,
        typeof streakBackup?.xp === 'number' ? streakBackup.xp : 0,
        typeof extras.xp === 'number' ? extras.xp : 0,
        typeof baseUser.xp === 'number' ? baseUser.xp : 0
      );
      const xpLevelSummary = computeUserExperienceLevel({
        xp: resolvedXp,
        currentStreak: evaluatedStreakState.currentStreak,
        longestStreak: evaluatedStreakState.longestStreak,
      });

      const streakHist =
        baseUser.streakHistory &&
        baseUser.streakHistory.length > 0 &&
        baseUser.streakDays === evaluatedStreakState.currentStreak &&
        baseUser.lastActiveDate === evaluatedStreakState.lastActiveDate
          ? baseUser.streakHistory
          : generateStreakHistory(
              evaluatedStreakState.currentStreak,
              undefined,
              streakTz,
              nowMs,
              mergedRecoveredDates
            );

      // Build hydrated profile SYNCHRONOUSLY outside setUser so React 18/19 batching never leaves snapshot null
      const hydratedProfile: UserProfile = {
        ...baseUser,
        id: fbUser.uid,
        name: resolvedName,
        nickname: resolvedNickname,
        age: resolvedAge,
        onboardingCompleted: hasCompletedOnboarding,
        username: fsProfile?.username || cleanHandle,
        email: fbUser.email || baseUser.email || '',
        avatarUrl:
          extras.customAvatarDataUrl ||
          fsProfile?.avatarUrl ||
          fbUser.photoURL ||
          baseUser.avatarUrl ||
          '',
        avatarColor: extras.avatarColor || baseUser.avatarColor || '#8b5cf6',
        country: resolvedCountryInfo.country,
        countryCode: resolvedCountryInfo.code,
        countryFlag: resolvedCountryInfo.flag,
        timezone: streakTz,
        countryDetectionMethod: resolvedCountryInfo.method,
        isManualCountry: resolvedCountryInfo.isManual,
        xp: resolvedXp,
        level: xpLevelSummary.level,
        levelTitle: xpLevelSummary.levelTitle,
        streakDays: evaluatedStreakState.currentStreak,
        currentStreak: evaluatedStreakState.currentStreak,
        longestStreak: evaluatedStreakState.longestStreak,
        streakGoalDays: extras.streakGoalDays || fsProfile?.streakGoalDays || baseUser.streakGoalDays || 30,
        lastActiveDate: evaluatedStreakState.lastActiveDate,
        recoveryCount: evaluatedStreakState.recoveryCount,
        recoveryMonth: evaluatedStreakState.recoveryMonth,
        recoveredDates:
          mergedRecoveredDates.length > 0
            ? mergedRecoveredDates
            : fsProfile?.recoveredDates || [],
        streakBeforeBreak: evaluatedStreakState.streakBeforeBreak,
        streakBrokenDate: evaluatedStreakState.streakBrokenDate,
        streakHistory: streakHist,
        termsAccepted: fsProfile?.termsAccepted ?? true,
        termsAcceptedAt: fsProfile?.termsAcceptedAt,
        provider: providerName,
        isLoggedIn: true,
        role: isVerifiedOwner ? 'admin' : fsProfile?.role || 'user',
        status: fsProfile?.status || 'active',
        createdAt: fsProfile?.createdAt || createdAtMs,
        lastActiveAt: nowMs,
        preferredLanguage: fsProfile?.preferredLanguage || getStoredSettings().uiLanguage || 'en',
        linkedProviders: Array.from(
          new Set([...(baseUser.linkedProviders || []), providerName])
        ),
      };

      userRef.current = hydratedProfile;
      setUser(hydratedProfile);
      saveStoredUser(hydratedProfile);

      if (evaluatedStreakState.lastActiveDate || evaluatedStreakState.currentStreak > 0 || resolvedXp > 0) {
        saveStoredUserStreakBackup(fbUser.uid, {
          currentStreak: evaluatedStreakState.currentStreak,
          longestStreak: evaluatedStreakState.longestStreak,
          lastActiveDate: evaluatedStreakState.lastActiveDate,
          timezone: streakTz,
          recoveryCount: evaluatedStreakState.recoveryCount,
          recoveryMonth: evaluatedStreakState.recoveryMonth,
          streakBeforeBreak: evaluatedStreakState.streakBeforeBreak,
          streakBrokenDate: evaluatedStreakState.streakBrokenDate,
          recoveredDates: mergedRecoveredDates,
          xp: resolvedXp,
          level: xpLevelSummary.level,
          levelTitle: xpLevelSummary.levelTitle,
          updatedAt: nowMs,
        });
        saveUserLocalExtras(fbUser.uid, {
          currentStreak: evaluatedStreakState.currentStreak,
          longestStreak: evaluatedStreakState.longestStreak,
          lastActiveDate: evaluatedStreakState.lastActiveDate,
          xp: resolvedXp,
          level: xpLevelSummary.level,
          levelTitle: xpLevelSummary.levelTitle,
        });
      }

      if (safeHydration.hadReadError || !safeHydration.shouldWriteToFirestore) {
        // NEVER overwrite Firestore or reset to 0 when Firestore returns permission_denied or read errors
        setStreakSyncError(
          safeHydration.hadPermissionError
            ? 'Unable to verify cloud streak due to Firestore permissions. Your saved streak is preserved.'
            : 'Unable to sync streak from cloud right now. Your saved streak is preserved.'
        );
      } else {
        // Sync non-streak profile fields (and create users/{uid} if brand new) without ever zeroing streak fields
        await syncUserProfileToFirestore(sanitizeUserForFirestore(hydratedProfile)).catch(() => {});

        // Atomically record today's active streak day on users/{uid} (idempotent: max +1 per user local calendar day)
        if (activeFbUidRef.current === fbUser.uid) {
          const txRes = await recordDailyStreakActivityInFirestoreSafe(
            fbUser.uid,
            streakTz,
            nowMs,
            {
              displayName: hydratedProfile.name,
              username: hydratedProfile.username,
              email: hydratedProfile.email,
              photoURL: sanitizeUserForFirestore(hydratedProfile).avatarUrl,
              preferredLanguage: hydratedProfile.preferredLanguage,
              provider: providerName,
              role: hydratedProfile.role,
              createdAt: hydratedProfile.createdAt,
            },
            evaluatedStreakState
          );

          if (activeFbUidRef.current !== fbUser.uid) return;

          if (txRes.ok) {
            setStreakSyncError(null);
            const next = txRes.result.nextState;
            const latestXp = Math.max(resolvedXp, userRef.current.xp || 0);
            const nextXpLevel = computeUserExperienceLevel({
              xp: latestXp,
              currentStreak: next.currentStreak,
              longestStreak: next.longestStreak,
            });
            saveStoredUserStreakBackup(fbUser.uid, {
              currentStreak: next.currentStreak,
              longestStreak: next.longestStreak,
              lastActiveDate: next.lastActiveDate,
              timezone: next.timezone,
              recoveryCount: next.recoveryCount,
              recoveryMonth: next.recoveryMonth,
              streakBeforeBreak: next.streakBeforeBreak,
              streakBrokenDate: next.streakBrokenDate,
              recoveredDates: mergedRecoveredDates,
              xp: latestXp,
              level: nextXpLevel.level,
              levelTitle: nextXpLevel.levelTitle,
              updatedAt: nowMs,
            });
            saveUserLocalExtras(fbUser.uid, {
              currentStreak: next.currentStreak,
              longestStreak: next.longestStreak,
              lastActiveDate: next.lastActiveDate,
              xp: latestXp,
              level: nextXpLevel.level,
              levelTitle: nextXpLevel.levelTitle,
            });
            setUser((prev) => {
              if (prev.id !== fbUser.uid) return prev;
              const finalXp = Math.max(latestXp, prev.xp || 0);
              const finalXpLevel = computeUserExperienceLevel({
                xp: finalXp,
                currentStreak: next.currentStreak,
                longestStreak: next.longestStreak,
              });
              const nextUser: UserProfile = {
                ...prev,
                timezone: next.timezone,
                xp: finalXp,
                level: finalXpLevel.level,
                levelTitle: finalXpLevel.levelTitle,
                streakDays: next.currentStreak,
                currentStreak: next.currentStreak,
                longestStreak: next.longestStreak,
                lastActiveDate: next.lastActiveDate,
                recoveryCount: next.recoveryCount,
                recoveryMonth: next.recoveryMonth,
                streakBeforeBreak: next.streakBeforeBreak,
                streakBrokenDate: next.streakBrokenDate,
                streakHistory: generateStreakHistory(
                  next.currentStreak,
                  undefined,
                  next.timezone,
                  nowMs,
                  prev.recoveredDates
                ),
              };
              userRef.current = nextUser;
              saveStoredUser(nextUser);
              void syncUserStreakLeaderboardEntry(nextUser);
              return nextUser;
            });
          } else {
            // Even if users/{uid} write was blocked (offline or remote rules), progress and persist
            // the user's daily streak locally + write a usage_analytics log AND inform UI honestly without resetting to 0.
            const isPermErr =
              txRes.errorCode === 'permission_denied' ||
              String(txRes.error || '').toLowerCase().includes('permission');
            setStreakSyncError(
              isPermErr
                ? 'Cloud streak write blocked by Firestore permissions. Local streak is preserved.'
                : 'Unable to sync streak to cloud right now. Your saved streak is preserved.'
            );
            const localRes = applyDailyActivityToStreakState(evaluatedStreakState, nowMs, streakTz);
            const nextLocal = localRes.nextState;
            const nextXpLevel = computeUserExperienceLevel({
              xp: resolvedXp,
              currentStreak: nextLocal.currentStreak,
              longestStreak: nextLocal.longestStreak,
            });
            saveStoredUserStreakBackup(fbUser.uid, {
              currentStreak: nextLocal.currentStreak,
              longestStreak: nextLocal.longestStreak,
              lastActiveDate: nextLocal.lastActiveDate,
              timezone: nextLocal.timezone,
              recoveryCount: nextLocal.recoveryCount,
              recoveryMonth: nextLocal.recoveryMonth,
              streakBeforeBreak: nextLocal.streakBeforeBreak,
              streakBrokenDate: nextLocal.streakBrokenDate,
              recoveredDates: mergedRecoveredDates,
              xp: resolvedXp,
              level: nextXpLevel.level,
              levelTitle: nextXpLevel.levelTitle,
              updatedAt: nowMs,
            });
            saveUserLocalExtras(fbUser.uid, {
              currentStreak: nextLocal.currentStreak,
              longestStreak: nextLocal.longestStreak,
              lastActiveDate: nextLocal.lastActiveDate,
              xp: resolvedXp,
              level: nextXpLevel.level,
              levelTitle: nextXpLevel.levelTitle,
            });
            setUser((prev) => {
              if (prev.id !== fbUser.uid) return prev;
              const nextUser: UserProfile = {
                ...prev,
                timezone: nextLocal.timezone,
                level: nextXpLevel.level,
                levelTitle: nextXpLevel.levelTitle,
                streakDays: nextLocal.currentStreak,
                currentStreak: nextLocal.currentStreak,
                longestStreak: nextLocal.longestStreak,
                lastActiveDate: nextLocal.lastActiveDate,
                recoveryCount: nextLocal.recoveryCount,
                recoveryMonth: nextLocal.recoveryMonth,
                streakBeforeBreak: nextLocal.streakBeforeBreak,
                streakBrokenDate: nextLocal.streakBrokenDate,
                streakHistory: generateStreakHistory(
                  nextLocal.currentStreak,
                  undefined,
                  nextLocal.timezone,
                  nowMs,
                  prev.recoveredDates
                ),
              };
              userRef.current = nextUser;
              saveStoredUser(nextUser);
              return nextUser;
            });
            if (localRes.streakIncreased) {
              recordUsageAnalyticsToFirestore({
                eventType: 'chat',
                timeZone: streakTz,
              }).catch(() => {});
            }
          }
        }
      }
    } finally {
      if (activeFbUidRef.current === fbUser.uid) {
        isStreakLoadingRef.current = false;
        setIsStreakLoading(false);
      }
    }

    const localMems = getStoredMemories(fbUser.uid);
    memoriesRef.current = localMems;
    setMemories(localMems);

    const resolvedMemoryConsent =
      extras.memoryConsent || fsProfile?.memoryConsent || settingsRef.current.memoryConsent;
    if (resolvedMemoryConsent === 'agreed' || resolvedMemoryConsent === 'disagreed') {
      handleUpdateSettings({
        memoryConsent: resolvedMemoryConsent,
        ...(resolvedMemoryConsent === 'disagreed' ? { aiMemoryEnabled: false } : {}),
      });
    }
    if (resolvedMemoryConsent === 'agreed') {
      void loadMemoriesFromFirestore(fbUser.uid).then((cloudMems) => {
        if (activeFbUidRef.current !== fbUser.uid) return;
        const currentLocal = getStoredMemories(fbUser.uid);
        const map = new Map<string, AIMemoryItem>();
        for (const m of currentLocal) map.set(m.id, m);
        for (const cm of cloudMems) {
          const existing = map.get(cm.id);
          if (!existing || cm.updatedAt >= existing.updatedAt) {
            map.set(cm.id, cm);
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        memoriesRef.current = merged;
        setMemories(merged);
        saveStoredMemories(merged, fbUser.uid);
      });
    }

    // If auto-detection fell back to 'Global', try approximate region lookup once without requesting GPS
    if (resolvedCountryInfo && !resolvedCountryInfo.isManual && resolvedCountryInfo.country === 'Global') {
      void detectCountryApproxViaIP().then((ipOption) => {
        if (!ipOption || activeFbUidRef.current !== fbUser.uid) return;
        setUser((prev) => {
          if (prev.id !== fbUser.uid || prev.isManualCountry || (prev.country && prev.country !== 'Global')) {
            return prev;
          }
          const updated: UserProfile = {
            ...prev,
            country: ipOption.country,
            countryCode: ipOption.code,
            countryFlag: ipOption.flag,
            timezone: resolveEffectiveStreakTimezone(ipOption.timeZone || prev.timezone),
            countryDetectionMethod: 'ip',
          };
          saveStoredUser(updated);
          syncUserProfileToFirestore(sanitizeUserForFirestore(updated)).catch(() => {});
          return updated;
        });
      });
    }

    if (lastAnalyticsAuthUidRef.current !== fbUser.uid) {
      lastAnalyticsAuthUidRef.current = fbUser.uid;
      const isNewAccount =
        Boolean(fbUser.metadata?.creationTime && fbUser.metadata?.lastSignInTime) &&
        fbUser.metadata?.creationTime === fbUser.metadata?.lastSignInTime;
      void trackAnalyticsEvent(
        isNewAccount ? 'sign_up' : 'login',
        { method: userRef.current?.provider || fsProfile?.provider || 'firebase' },
        Boolean(settingsRef.current.analyticsConsent)
      );
    }

    if (fsProfile?.preferredLanguage) {
      handleUpdateSettings({ uiLanguage: fsProfile.preferredLanguage });
    }

    if ((fsProfile as any)?.preferredTheme) {
      const savedThemeId = (fsProfile as any).preferredTheme;
      const themePreset = COLOR_THEME_PRESETS.find(
        (t) => t.id === savedThemeId || t.name.toLowerCase() === savedThemeId.toLowerCase()
      );
      if (themePreset) {
        setSettings((prev) => {
          const updated = {
            ...prev,
            colorTheme: themePreset.id,
            theme: themePreset.themeMode || 'dark',
          };
          saveStoredSettings(updated);
          return updated;
        });
      }
    }

    const fsProfileAny = fsProfile as any;
    if (
      fsProfileAny?.aiProvider ||
      fsProfileAny?.aiModel ||
      fsProfileAny?.openRouterModel ||
      fsProfileAny?.aiResponseLanguage ||
      typeof fsProfileAny?.autoDetectInputLanguage === 'boolean' ||
      typeof fsProfileAny?.translationEnabled === 'boolean' ||
      fsProfileAny?.translationLanguage
    ) {
      setSettings((prev) => {
        const nextProvider = fsProfileAny.aiProvider
          ? normalizeAIProviderId(fsProfileAny.aiProvider)
          : prev.aiProvider || 'gemini';
        const nextOpenRouterModel =
          typeof fsProfileAny.openRouterModel === 'string' && fsProfileAny.openRouterModel.trim()
            ? sanitizeOpenRouterModelId(fsProfileAny.openRouterModel)
            : prev.openRouterModel;
        const rawAiModel =
          typeof fsProfileAny.aiModel === 'string' && fsProfileAny.aiModel.trim()
            ? fsProfileAny.aiModel.trim()
            : prev.aiModel;
        const nextAiModel =
          nextProvider === 'openrouter' ? sanitizeOpenRouterModelId(rawAiModel || nextOpenRouterModel) : rawAiModel;

        const nextRespLang =
          typeof fsProfileAny.aiResponseLanguage === 'string' && fsProfileAny.aiResponseLanguage.trim()
            ? fsProfileAny.aiResponseLanguage.trim()
            : prev.aiResponseLanguage || prev.defaultTargetLanguage || 'en';

        const updated: AppSettings = {
          ...prev,
          ...(fsProfileAny.aiProvider ? { aiProvider: nextProvider } : {}),
          ...(nextAiModel ? { aiModel: nextAiModel } : {}),
          ...(nextOpenRouterModel ? { openRouterModel: nextOpenRouterModel } : {}),
          ...(fsProfileAny.aiResponseLanguage
            ? { aiResponseLanguage: nextRespLang, defaultTargetLanguage: nextRespLang }
            : {}),
          ...(typeof fsProfileAny.autoDetectInputLanguage === 'boolean'
            ? { autoDetectInputLanguage: fsProfileAny.autoDetectInputLanguage }
            : {}),
          ...(typeof fsProfileAny.translationEnabled === 'boolean'
            ? { translationEnabled: fsProfileAny.translationEnabled }
            : {}),
          ...(typeof fsProfileAny.translationLanguage === 'string' && fsProfileAny.translationLanguage.trim()
            ? { translationLanguage: fsProfileAny.translationLanguage.trim() }
            : {}),
        };
        settingsRef.current = updated;
        saveStoredSettings(updated);
        return updated;
      });
    }

    // Hydrate Suggested Replies click analytics from Firestore so future AI suggestions adapt across sessions
    const localSuggestionStats = getStoredSuggestionAnalytics(fbUser.uid);
    suggestionAnalyticsRef.current = localSuggestionStats;
    void loadTopSuggestedReplyPatternsFromFirestore(fbUser.uid)
      .then((cloudStats) => {
        if (activeFbUidRef.current !== fbUser.uid || !cloudStats.length) return;
        const mergedStats = mergeSuggestionAnalytics(suggestionAnalyticsRef.current, cloudStats);
        suggestionAnalyticsRef.current = mergedStats;
        saveStoredSuggestionAnalytics(mergedStats, fbUser.uid);
      })
      .catch(() => {});

    try {
      const sessionHeaders = await getAuthHeaders();
      fetch(buildApiUrl('/api/auth/session'), { headers: sessionHeaders }).catch(() => {});
    } catch {}

    try {
      const cloudSessions = await loadConversationsFromFirestore(fbUser.uid);
      if (activeFbUidRef.current !== fbUser.uid) return;
      if (cloudSessions.length > 0) {
        const localSessions = getStoredSessions(fbUser.uid);
        const sessionMap = new Map<string, ChatSession>();
        for (const s of localSessions) {
          sessionMap.set(s.id, s);
        }
        for (const cs of cloudSessions) {
          const existing = sessionMap.get(cs.id);
          if (!existing) {
            sessionMap.set(cs.id, cs);
          } else if (
            cs.messages.length > existing.messages.length ||
            (cs.messages.length === existing.messages.length && cs.updatedAt > existing.updatedAt)
          ) {
            sessionMap.set(cs.id, cs);
          }
        }
        const merged = Array.from(sessionMap.values());
        const resolved = resolveReopenNewChat(
          merged,
          settingsRef.current.defaultTargetLanguage,
          fbUser.uid
        );
        setSessions(resolved.sessions);
        saveStoredSessions(resolved.sessions, fbUser.uid);
        setCurrentSessionId(resolved.sessionId);
        setActiveTab('chat');
      }
    } catch {}
  };

  // Apply dynamic UI color theme derived from selected color theme or user's avatar color
  useEffect(() => {
    const presetHex = settings.colorTheme
      ? COLOR_THEME_PRESETS.find((t) => t.id === settings.colorTheme)?.hex
      : undefined;
    applyAvatarDynamicTheme(presetHex || user.avatarColor, settings.dynamicAvatarTheme !== false || Boolean(presetHex));
  }, [settings.colorTheme, user.avatarColor, settings.dynamicAvatarTheme]);

  // Sync light/dark theme, font size, and high-contrast classes reactively
  useEffect(() => {
    const isLight = settings.theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    document.documentElement.classList.toggle('dark', !isLight);
    document.body.classList.toggle('font-size-large', settings.fontSize === 'large');
    document.body.classList.toggle('font-size-xlarge', settings.fontSize === 'xlarge');
    document.body.classList.toggle('high-contrast', Boolean(settings.highContrast));
  }, [settings.theme, settings.fontSize, settings.highContrast]);

  // Detect Android/iOS virtual keyboard open state via visualViewport
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const updateKeyboardState = () => {
      const isNarrowViewport = window.innerWidth < 1024;
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
      const heightRatio = vv.height / Math.max(1, window.innerHeight);
      setIsKeyboardOpen(isNarrowViewport && isInputFocused && heightRatio < 0.8);
    };

    vv.addEventListener('resize', updateKeyboardState, { passive: true });
    window.addEventListener('focusin', updateKeyboardState, { passive: true });
    window.addEventListener('focusout', updateKeyboardState, { passive: true });
    return () => {
      vv.removeEventListener('resize', updateKeyboardState);
      window.removeEventListener('focusin', updateKeyboardState);
      window.removeEventListener('focusout', updateKeyboardState);
    };
  }, []);

  // Reset document scroll cleanly when switching between non-chat scrollable views
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeTab !== 'chat') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  // Sync voiceAssistant configuration whenever Read Aloud speed, pitch, or volume changes
  useEffect(() => {
    voiceAssistant.configure({
      rate: settings.voiceSpeed ?? 1.0,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
  }, [settings.voiceSpeed, settings.voicePitch, settings.voiceVolume]);

  // Listen for browser online / offline events, platform announcement, and Firebase Auth state
  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    saveStoredSettings(settings);

    const unsubNotice = subscribeToPlatformAnnouncement((data) => {
      setPlatformNotice(data);
    });

    const unsubscribeAuth = subscribeToAuth(async (fbUser) => {
      setFbAuthUser(fbUser);
      setIsAuthInitialized(true);
      if (fbUser && fbUser.emailVerified) {
        await hydrateVerifiedUserSession(fbUser);
      } else {
        activeFbUidRef.current = null;
        const detected = detectUserCountry();
        setUser({
          ...DEFAULT_USER,
          id: fbUser?.uid || 'unauthenticated',
          name: fbUser?.displayName || 'User',
          username: 'user',
          email: fbUser?.email || '',
          country: detected.country,
          countryFlag: detected.flag,
          isLoggedIn: false,
          provider: fbUser?.providerData[0]?.providerId?.includes('google') ? 'google' : 'email',
        });
      }
    });
    if (!unsubscribeAuth) {
      setIsAuthInitialized(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubNotice();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  // Sync session & folders when user account switches (redirect to New Chat on fresh reopen)
  useEffect(() => {
    const userSessions = getStoredSessions(user.id);
    setSessionFolders(getStoredFolders(user.id));
    if (isFreshLaunchRef.current && !hasUserPickedSessionRef.current) {
      const resolved = resolveReopenNewChat(
        userSessions,
        settingsRef.current.defaultTargetLanguage,
        user.id
      );
      setSessions(resolved.sessions);
      setCurrentSessionId(resolved.sessionId);
      setActiveTab('chat');
    } else {
      setSessions(userSessions);
      setCurrentSessionId(userSessions[0]?.id || `session-${Date.now()}`);
    }
  }, [user.id]);

  // Refresh detailed multi-provider connection & model status (keys stay strictly on server)
  const fetchProvidersStatus = async (forceRefresh = false) => {
    if (!isBrowserOnline || settingsRef.current.offlineModeForce) return;
    setIsLoadingProvidersStatus(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(buildApiUrl(`/api/providers/status${forceRefresh ? '?force=1' : ''}`), {
        headers,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.providers && typeof data.providers === 'object') {
        const normalizedProviders: Partial<Record<AIProviderId, AIProviderStatusInfo>> = {};
        for (const pid of ['gemini', 'groq', 'openrouter'] as AIProviderId[]) {
          const entry = data.providers[pid];
          if (entry) {
            normalizedProviders[pid] = normalizeProviderStatusInfo(pid, entry);
          }
        }
        setProvidersStatus(normalizedProviders);
        const activeProv = normalizeAIProviderId(settingsRef.current.aiProvider);
        const activeStatus = normalizedProviders[activeProv];
        if (activeStatus) {
          const nextState =
            activeStatus.status === 'connected' && activeStatus.generationVerified
              ? 'connected'
              : activeStatus.status === 'configured'
              ? 'configured'
              : 'error';
          setAiHealth((prev) => ({
            ...prev,
            activeProvider: activeProv,
            activeProviderConfigured: activeStatus.configured,
            activeProviderVerified: Boolean(activeStatus.generationVerified),
            providers: normalizedProviders,
            connectionHistory: Array.isArray(data.connectionHistory)
              ? data.connectionHistory
              : prev.connectionHistory,
            state: nextState,
            error:
              nextState === 'connected' || nextState === 'configured'
                ? undefined
                : activeStatus.error || prev.error,
          }));
        } else if (Array.isArray(data.connectionHistory)) {
          setAiHealth((prev) => ({
            ...prev,
            connectionHistory: data.connectionHistory,
          }));
        }
      }
    } catch {
      // Ignore transient refresh failure
    } finally {
      setIsLoadingProvidersStatus(false);
    }
  };

  // Run an authentic AI generation test on the specified provider (does NOT rely on API key metadata alone)
  const testProviderConnection = async (
    providerId: AIProviderId,
    explicitModel?: string
  ): Promise<{ ok: boolean; message: string; modelUsed?: string; latencyMs?: number }> => {
    if (!isBrowserOnline || settingsRef.current.offlineModeForce) {
      return {
        ok: false,
        message: 'You are currently offline. Reconnect to test live AI generation.',
      };
    }
    setTestingProviderId(providerId);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const fallbackModel =
        providerId === 'openrouter'
          ? settingsRef.current.openRouterModel || settingsRef.current.aiModel
          : providerId === settingsRef.current.aiProvider
          ? settingsRef.current.aiModel
          : AI_PROVIDER_METADATA[providerId].defaultModel;

      const res = await fetch(buildApiUrl('/api/providers/test'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: providerId,
          model: explicitModel || fallbackModel,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data?.statusInfo) {
        setProvidersStatus((prev) => {
          const nextMap: Partial<Record<AIProviderId, AIProviderStatusInfo>> = {
            ...(prev || {}),
            [providerId]: normalizeProviderStatusInfo(
              providerId,
              data.statusInfo,
              prev?.[providerId]?.models
            ),
          };
          const activeProv = normalizeAIProviderId(settingsRef.current.aiProvider);
          if (providerId === activeProv) {
            const info = nextMap[providerId]!;
            const nextState =
              info.status === 'connected' && info.generationVerified
                ? 'connected'
                : info.status === 'configured'
                ? 'configured'
                : 'error';
            setAiHealth((hPrev) => ({
              ...hPrev,
              backendConnected: true,
              activeProvider: activeProv,
              activeProviderConfigured: info.configured,
              activeProviderVerified: Boolean(info.generationVerified),
              providers: nextMap,
              connectionHistory: Array.isArray(data.connectionHistory)
                ? data.connectionHistory
                : hPrev.connectionHistory,
              state: nextState,
              latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : hPrev.latencyMs,
              lastConnectedAt: data.ok ? Date.now() : hPrev.lastConnectedAt,
              error: data.ok ? undefined : data.error || info.error,
            }));
          } else {
            setAiHealth((hPrev) => ({
              ...hPrev,
              providers: nextMap,
              connectionHistory: Array.isArray(data.connectionHistory)
                ? data.connectionHistory
                : hPrev.connectionHistory,
            }));
          }
          return nextMap;
        });
      }

      if (res.ok && data?.ok) {
        return {
          ok: true,
          message:
            data.message ||
            `${AI_PROVIDER_METADATA[providerId].name} responded cleanly on ${data.modelUsed || 'selected model'}.`,
          modelUsed: data.modelUsed,
          latencyMs: data.latencyMs,
        };
      }

      return {
        ok: false,
        message:
          data?.error ||
          `${AI_PROVIDER_METADATA[providerId].name} connection test failed (HTTP ${res.status}).`,
      };
    } catch (err: any) {
      return {
        ok: false,
        message:
          err?.message ||
          `Unable to reach the server to test ${AI_PROVIDER_METADATA[providerId].name}.`,
      };
    } finally {
      setTestingProviderId(null);
    }
  };

  // Real-time AI & Backend connectivity verification
  const checkAIHealth = async (forceRefresh = false) => {
    const activeProvider = normalizeAIProviderId(settingsRef.current.aiProvider);
    const activeSelectedModel =
      activeProvider === 'openrouter'
        ? settingsRef.current.openRouterModel || settingsRef.current.aiModel
        : settingsRef.current.aiModel;

    if (!isBrowserOnline || settingsRef.current.offlineModeForce) {
      setAiHealth((prev) => ({
        ...prev,
        state: 'offline',
        backendConnected: false,
        geminiConnected: false,
        activeProvider,
        model: activeSelectedModel || prev.model || AI_PROVIDER_METADATA[activeProvider].defaultModel,
        checkedAt: Date.now(),
        error: settingsRef.current.offlineModeForce
          ? 'Offline Mode is manually enabled in Settings.'
          : 'No internet connection detected.',
      }));
      setInitError(null);
      setHasInitialHealthSettled(true);
      return;
    }

    if (healthRequestInFlightRef.current && !forceRefresh) return;
    healthRequestInFlightRef.current = true;

    setAiHealth((prev) => ({
      ...prev,
      state: 'connecting',
      activeProvider,
      error: undefined,
    }));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const params = new URLSearchParams({ provider: activeProvider });
      if (activeSelectedModel) params.set('model', activeSelectedModel);
      if (forceRefresh) params.set('force', '1');
      const url = buildApiUrl(`/api/health?${params.toString()}`);
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        setAiHealth((prev) => ({
          ...prev,
          state: 'offline',
          backendConnected: false,
          geminiConnected: false,
          activeProvider,
          checkedAt: Date.now(),
          error: `Backend returned HTTP ${res.status}.`,
        }));
        setInitError(`Backend server unavailable (HTTP ${res.status}).`);
        return;
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        const msg = 'Backend health endpoint returned non-JSON content. Check API routing.';
        setAiHealth((prev) => ({
          ...prev,
          state: 'offline',
          backendConnected: false,
          geminiConnected: false,
          activeProvider,
          checkedAt: Date.now(),
          error: msg,
        }));
        setInitError(msg);
        return;
      }

      const data = await res.json();
      const nowMs = Date.now();
      const respProvider = normalizeAIProviderId(data.activeProvider || activeProvider);
      const isVerifiedAI = Boolean(data.isLiveAI ?? (data.aiService === 'connected' && data.activeProviderVerified));
      const isConfiguredOnly = data.aiService === 'configured';
      const geminiOk = Boolean(data.geminiConnected);
      const serverLastConnMs = data.lastConnectedAt ? new Date(data.lastConnectedAt).getTime() : null;

      if (data.providers && typeof data.providers === 'object') {
        setProvidersStatus((prev) => {
          const merged: Partial<Record<AIProviderId, AIProviderStatusInfo>> = {};
          for (const pid of ['gemini', 'groq', 'openrouter'] as AIProviderId[]) {
            const incoming = data.providers[pid];
            const prevEntry = prev?.[pid];
            if (incoming) {
              merged[pid] = normalizeProviderStatusInfo(pid, incoming, prevEntry?.models);
            } else if (prevEntry) {
              merged[pid] = prevEntry;
            }
          }
          return merged;
        });
      }

      setAiHealth((prev) => ({
        state: isVerifiedAI ? 'connected' : isConfiguredOnly ? 'configured' : 'error',
        backendConnected: data.backendConnected !== false,
        geminiConnected: geminiOk,
        activeProvider: respProvider,
        activeProviderConfigured: data.activeProviderConfigured !== false,
        activeProviderVerified: Boolean(data.activeProviderVerified ?? isVerifiedAI),
        providers: data.providers || prev.providers,
        connectionHistory: Array.isArray(data.connectionHistory)
          ? data.connectionHistory
          : prev.connectionHistory,
        model: activeSelectedModel || data.model || prev.model || AI_PROVIDER_METADATA[respProvider].defaultModel,
        checkedAt: nowMs,
        lastConnectedAt: isVerifiedAI
          ? nowMs
          : serverLastConnMs && !Number.isNaN(serverLastConnMs)
          ? serverLastConnMs
          : prev.lastConnectedAt,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        error:
          isVerifiedAI || isConfiguredOnly
            ? undefined
            : data.error || `${AI_PROVIDER_METADATA[respProvider].name} is currently unavailable.`,
      }));
      setInitError(null);
    } catch (err: any) {
      const timedOut = err?.name === 'AbortError';
      const errMsg = timedOut
        ? 'Connection verification timed out.'
        : 'Unable to reach the Aadesh AI backend server.';
      setAiHealth((prev) => ({
        ...prev,
        state: 'offline',
        backendConnected: false,
        geminiConnected: false,
        activeProvider,
        checkedAt: Date.now(),
        error: errMsg,
      }));
      setInitError(errMsg);
    } finally {
      window.clearTimeout(timeoutId);
      healthRequestInFlightRef.current = false;
      setHasInitialHealthSettled(true);
    }
  };

  useEffect(() => {
    void checkAIHealth(false);

    const pollInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void checkAIHealth(false);
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkAIHealth(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isBrowserOnline, settings.offlineModeForce, settings.aiProvider, settings.aiModel, settings.openRouterModel]);

  // Customizable daily local push notification reminder for streak maintenance
  useEffect(() => {
    if (!user.isLoggedIn || !settings.streakReminders) return;

    const checkAndNotifyStreakReminder = () => {
      const activeUser = userRef.current;
      if (!activeUser.isLoggedIn || !activeUser.id) return;
      const preferredTime =
        settingsRef.current.streakReminderTime || DEFAULT_STREAK_REMINDER_TIME;
      const effectiveTz = resolveEffectiveStreakTimezone(activeUser.timezone);
      const evalRes = evaluateNepalEveningReminder({
        enabled: Boolean(settingsRef.current.streakReminders),
        lastActiveDate: activeUser.lastActiveDate,
        lastNotifiedDateKey: getLastStreakReminderDate(activeUser.id),
        preferredTime,
        timeZone: effectiveTz,
        nowMs: Date.now(),
      });
      if (!evalRes.shouldNotifyNow) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      void triggerLocalStreakNotification({
        currentStreak: activeUser.currentStreak ?? activeUser.streakDays ?? 0,
        userName: activeUser.nickname || activeUser.name,
        preferredTime,
        timeZone: effectiveTz,
      }).then((sent) => {
        if (sent) {
          saveLastStreakReminderDate(activeUser.id, evalRes.nepalDateKey);
        }
      });
    };

    checkAndNotifyStreakReminder();
    const intervalId = window.setInterval(checkAndNotifyStreakReminder, 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAndNotifyStreakReminder();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    user.isLoggedIn,
    user.id,
    user.lastActiveDate,
    user.timezone,
    settings.streakReminders,
    settings.streakReminderTime,
  ]);

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    // Synchronously update settingsRef immediately so subsequent async calls read updated values without waiting for re-render
    settingsRef.current = { ...settingsRef.current, ...newSettings };
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveStoredSettings(updated);
      return updated;
    });
    if (newSettings.aiProvider || newSettings.aiModel || newSettings.openRouterModel) {
      const nextProvider = normalizeAIProviderId(
        newSettings.aiProvider || settingsRef.current.aiProvider
      );
      const nextModel =
        (nextProvider === 'openrouter'
          ? newSettings.openRouterModel || settingsRef.current.openRouterModel
          : undefined) ||
        newSettings.aiModel ||
        settingsRef.current.aiModel ||
        AI_PROVIDER_METADATA[nextProvider].defaultModel;

      const cachedStatus = providersStatus?.[nextProvider];
      setAiHealth((hPrev) => ({
        ...hPrev,
        activeProvider: nextProvider,
        model: nextModel,
        ...(cachedStatus
          ? {
              activeProviderConfigured: cachedStatus.configured,
              activeProviderVerified: Boolean(cachedStatus.generationVerified),
              state:
                cachedStatus.status === 'connected' && cachedStatus.generationVerified
                  ? 'connected'
                  : cachedStatus.status === 'configured'
                  ? 'configured'
                  : 'error',
              latencyMs:
                typeof cachedStatus.latencyMs === 'number' && cachedStatus.latencyMs > 0
                  ? cachedStatus.latencyMs
                  : undefined,
              lastConnectedAt:
                cachedStatus.generationVerified && cachedStatus.lastTestedAt
                  ? new Date(cachedStatus.lastTestedAt).getTime()
                  : null,
              error: cachedStatus.error,
            }
          : {}),
      }));
      if (newSettings.aiProvider || newSettings.aiModel || newSettings.openRouterModel) {
        lastNotifiedFallbackKeyRef.current = null;
        setModelFallbackNotice(null);
        void trackAnalyticsEvent(
          'model_switched',
          {
            provider: nextProvider,
            to_model: nextModel,
            reason: 'user_selection',
          },
          Boolean(settingsRef.current.analyticsConsent)
        );
      }
      if (newSettings.aiProvider) {
        void checkAIHealth(false);
      }
    }
    if (newSettings.memoryConsent && user.id) {
      saveUserLocalExtras(user.id, { memoryConsent: newSettings.memoryConsent });
    }
    const shouldSyncProfile = Boolean(
      newSettings.colorTheme ||
        newSettings.theme ||
        newSettings.memoryConsent ||
        newSettings.aiProvider ||
        newSettings.aiModel ||
        newSettings.openRouterModel ||
        newSettings.aiResponseLanguage ||
        typeof newSettings.autoDetectInputLanguage === 'boolean' ||
        typeof newSettings.translationEnabled === 'boolean' ||
        newSettings.translationLanguage
    );
    if (shouldSyncProfile && user.isLoggedIn) {
      const themeToSave =
        newSettings.colorTheme || (newSettings.theme === 'light' ? 'pure-light' : 'dark-galaxy');
      syncUserProfileToFirestore(
        sanitizeUserForFirestore({
          ...user,
          ...((newSettings.colorTheme || newSettings.theme) ? { preferredTheme: themeToSave } : {}),
          ...(newSettings.memoryConsent ? { memoryConsent: newSettings.memoryConsent } : {}),
          ...(newSettings.aiProvider ? { aiProvider: newSettings.aiProvider } : {}),
          ...(newSettings.aiModel ? { aiModel: newSettings.aiModel } : {}),
          ...(newSettings.openRouterModel ? { openRouterModel: newSettings.openRouterModel } : {}),
          ...(newSettings.aiResponseLanguage ? { aiResponseLanguage: newSettings.aiResponseLanguage } : {}),
          ...(typeof newSettings.autoDetectInputLanguage === 'boolean'
            ? { autoDetectInputLanguage: newSettings.autoDetectInputLanguage }
            : {}),
          ...(typeof newSettings.translationEnabled === 'boolean'
            ? { translationEnabled: newSettings.translationEnabled }
            : {}),
          ...(newSettings.translationLanguage ? { translationLanguage: newSettings.translationLanguage } : {}),
        } as any)
      ).catch(() => {});
    }
  };

  const handleToggleForceOffline = () => {
    handleUpdateSettings({ offlineModeForce: !settings.offlineModeForce });
  };

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) ||
    sessions[0] || {
      id: 'session-default-welcome',
      title: 'Aadesh AI Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.aiResponseLanguage || settings.defaultTargetLanguage || 'en',
      messages: [],
    };

  const handleStopGeneration = () => {
    stopRequestedRef.current = true;
    if (activeChatAbortRef.current) {
      activeChatAbortRef.current.abort();
    }
  };

  const applyGeminiFallbackSwitch = (params: {
    fromModel?: string;
    toModel?: string;
    reason?: string;
  }) => {
    const targetModel = params.toModel || GEMINI_QUOTA_FALLBACK_MODEL;
    const fromModel = params.fromModel || settingsRef.current.aiModel || 'gemini-primary';
    setProvidersStatus((prev) => {
      if (!prev?.gemini) return prev;
      return {
        ...prev,
        gemini: {
          ...prev.gemini,
          activeModel: targetModel,
        },
      };
    });
    setAiHealth((prev) => ({
      ...prev,
      activeProvider: 'gemini',
      model: targetModel,
      state: 'connected',
    }));

    const transitionKey = `${fromModel}->${targetModel}`;
    if (
      targetModel === GEMINI_QUOTA_FALLBACK_MODEL &&
      fromModel !== GEMINI_QUOTA_FALLBACK_MODEL &&
      lastNotifiedFallbackKeyRef.current !== transitionKey
    ) {
      lastNotifiedFallbackKeyRef.current = transitionKey;
      setModelFallbackNotice(GEMINI_QUOTA_FALLBACK_NOTICE);
      void trackAnalyticsEvent(
        'model_switched',
        {
          provider: 'gemini',
          from_model: fromModel,
          to_model: targetModel,
          reason: params.reason || 'quota',
        },
        Boolean(settingsRef.current.analyticsConsent)
      );
    }
  };

  const handleAddPowerMemory = (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
    isSensitive?: boolean;
  }): { ok: boolean; error?: string; item?: AIMemoryItem } => {
    const clean = input.content.trim();
    if (!clean) {
      return { ok: false, error: 'Please enter a memory before saving.' };
    }
    if (containsSecretOrCredential(clean)) {
      return {
        ok: false,
        error: 'Security guard: API keys, passwords, tokens, and credentials cannot be saved to Power Memory.',
      };
    }

    const activeUid = userRef.current.id || 'guest';
    const existing = memoriesRef.current.find(
      (m) => m.content.trim().toLowerCase() === clean.toLowerCase()
    );
    const now = Date.now();
    if (existing) {
      const refreshed: AIMemoryItem = {
        ...existing,
        category: input.category || existing.category,
        approved: true,
        updatedAt: now,
      };
      const next = [refreshed, ...memoriesRef.current.filter((m) => m.id !== existing.id)];
      memoriesRef.current = next;
      setMemories(next);
      saveStoredMemories(next, activeUid);
      if (userRef.current.isLoggedIn) {
        void saveMemoryToFirestore(activeUid, refreshed);
      }
      return { ok: true, item: refreshed };
    }

    const sensitivity = classifyMemorySensitivity(clean);
    const newItem: AIMemoryItem = {
      id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`,
      userId: activeUid,
      category: input.category,
      content: clean.slice(0, 500),
      approved: true,
      source: input.source || 'manual',
      isSensitive: typeof input.isSensitive === 'boolean' ? input.isSensitive : sensitivity.isSensitive,
      keywords: extractMemoryKeywords(clean),
      createdAt: now,
      updatedAt: now,
    };

    const next = [newItem, ...memoriesRef.current];
    memoriesRef.current = next;
    setMemories(next);
    saveStoredMemories(next, activeUid);
    if (userRef.current.isLoggedIn) {
      void saveMemoryToFirestore(activeUid, newItem);
    }
    return { ok: true, item: newItem };
  };

  const handleUpdatePowerMemory = (
    id: string,
    patch: { category?: MemoryCategory; content?: string }
  ): { ok: boolean; error?: string } => {
    const clean = patch.content?.trim();
    if (patch.content !== undefined && !clean) {
      return { ok: false, error: 'Memory content cannot be empty.' };
    }
    if (clean && containsSecretOrCredential(clean)) {
      return {
        ok: false,
        error: 'Security guard: API keys, passwords, tokens, and credentials cannot be saved to Power Memory.',
      };
    }

    const activeUid = userRef.current.id || 'guest';
    let updatedItem: AIMemoryItem | undefined;
    const next = memoriesRef.current.map((m) => {
      if (m.id !== id) return m;
      updatedItem = {
        ...m,
        ...(patch.category ? { category: patch.category } : {}),
        ...(clean
          ? {
              content: clean.slice(0, 500),
              keywords: extractMemoryKeywords(clean),
              isSensitive: classifyMemorySensitivity(clean).isSensitive,
            }
          : {}),
        updatedAt: Date.now(),
      };
      return updatedItem;
    });

    memoriesRef.current = next;
    setMemories(next);
    saveStoredMemories(next, activeUid);
    if (userRef.current.isLoggedIn && updatedItem) {
      void saveMemoryToFirestore(activeUid, updatedItem);
    }
    return { ok: true };
  };

  const handleTogglePowerMemory = (id: string) => {
    const activeUid = userRef.current.id || 'guest';
    let updatedItem: AIMemoryItem | undefined;
    const next = memoriesRef.current.map((m) => {
      if (m.id !== id) return m;
      updatedItem = { ...m, approved: !m.approved, updatedAt: Date.now() };
      return updatedItem;
    });
    memoriesRef.current = next;
    setMemories(next);
    saveStoredMemories(next, activeUid);
    if (userRef.current.isLoggedIn && updatedItem) {
      void saveMemoryToFirestore(activeUid, updatedItem);
    }
  };

  const handleDeletePowerMemory = (id: string) => {
    const activeUid = userRef.current.id || 'guest';
    const next = memoriesRef.current.filter((m) => m.id !== id);
    memoriesRef.current = next;
    setMemories(next);
    saveStoredMemories(next, activeUid);
    if (userRef.current.isLoggedIn) {
      void deleteMemoryFromFirestore(activeUid, id);
    }
  };

  const handleClearAllPowerMemories = async () => {
    const activeUid = userRef.current.id || 'guest';
    memoriesRef.current = [];
    setMemories([]);
    setPendingMemoryProposal(null);
    saveStoredMemories([], activeUid);
    if (userRef.current.isLoggedIn) {
      await clearAllMemoriesFromFirestore(activeUid);
    }
    setMemoryActionNotice('All Power Memory items were cleared.');
  };

  const handleConfirmMemoryProposal = () => {
    if (!pendingMemoryProposal) return;
    if (settingsRef.current.memoryConsent !== 'agreed' || settingsRef.current.aiMemoryEnabled === false) {
      handleUpdateSettings({ memoryConsent: 'agreed', aiMemoryEnabled: true });
    }
    const res = handleAddPowerMemory({
      category: pendingMemoryProposal.category,
      content: pendingMemoryProposal.content,
      source: pendingMemoryProposal.source,
      isSensitive: pendingMemoryProposal.isSensitive,
    });
    setPendingMemoryProposal(null);
    if (res.ok && res.item) {
      setMemoryActionNotice(`Saved to Power Memory (${res.item.category}): "${res.item.content}"`);
    } else if (res.error) {
      setMemoryActionNotice(res.error);
    }
  };

  const handleDismissMemoryProposal = () => {
    setPendingMemoryProposal(null);
    setMemoryActionNotice('Not saved — kept only in the current conversation.');
  };

  // Send message in Chat or Voice view (uses SSE streaming when online for text/attachments; /api/chat for multimodal/offline)
  const handleSendMessage = async (params: {
    text: string;
    imageData?: string;
    imageMimeType?: string;
    attachmentName?: string;
    attachmentContent?: string;
    location?: LocationData;
    isVoice?: boolean;
    targetLanguage: string;
    handledByVoiceView?: boolean;
  }): Promise<{ reply: string; translation?: string } | void> => {
    if (!fbAuthUser || !fbAuthUser.emailVerified) {
      throw new Error('Authentication and email verification required.');
    }
    if (isSendingRef.current) {
      throw new Error('A message is already in progress. Please wait a moment.');
    }
    hasUserPickedSessionRef.current = true;
    isSendingRef.current = true;
    stopRequestedRef.current = false;
    const requestController = new AbortController();
    activeChatAbortRef.current = requestController;

    const targetSessionId = currentSession.id;
    const userMsgId = `usr-${Date.now()}`;
    const fallbackContent = params.imageData
      ? 'Shared a photograph for visual analysis'
      : params.attachmentName
      ? `Attached file: ${params.attachmentName}`
      : '';

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      senderId: user.id,
      senderName: user.name,
      senderAvatarUrl: user.avatarUrl || undefined,
      content: params.text || fallbackContent,
      timestamp: Date.now(),
      imageUrl: params.imageData,
      attachmentName: params.attachmentName,
      location: params.location,
      isVoiceInput: params.isVoice,
    };

    const updatedMessages = [...currentSession.messages, userMessage];

    let sessionTitle = currentSession.title;
    if (currentSession.messages.length <= 1 && (params.text || params.attachmentName)) {
      const basis = params.text || params.attachmentName || 'Conversation';
      sessionTitle = basis.slice(0, 36) + (basis.length > 36 ? '...' : '');
    }

    const updatedSession: ChatSession = {
      ...currentSession,
      title: sessionTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    const updatedSessions = sessions.map((s) => (s.id === targetSessionId ? updatedSession : s));
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    if (params.isVoice && params.text) {
      addVoiceHistoryEntry(
        {
          transcript: params.text,
          language: settings.uiLanguage,
          durationSeconds: Math.max(2, Math.round(params.text.split(' ').length / 2.5)),
        },
        user.id
      );
    }

    setIsLoading(true);
    const startTime = Date.now();
    const modelMsgId = `mod-${Date.now()}`;
    let reply = '';
    const activeProviderId: AIProviderId = normalizeAIProviderId(settingsRef.current.aiProvider);
    const activeRequestedModel =
      activeProviderId === 'openrouter'
        ? settingsRef.current.openRouterModel || settingsRef.current.aiModel
        : settingsRef.current.aiModel;

    const lastNonErrorMsgContent = [...currentSession.messages]
      .reverse()
      .find((m) => !m.isError)?.content;

    const explicitCmd =
      params.text && !params.imageData && !params.attachmentName
        ? detectExplicitMemoryCommand(params.text, lastNonErrorMsgContent)
        : null;

    const finishLocalMemoryResponse = async (replyText: string) => {
      const localModelMsg: ChatMessage = {
        id: modelMsgId,
        role: 'model',
        senderName: 'Aadesh AI',
        content: replyText,
        timestamp: Date.now(),
        provider: activeProviderId,
        modelUsed: 'power-memory',
        isOffline: !isOnline,
        latencyMs: Math.max(10, Date.now() - startTime),
      };
      const localFinalSession: ChatSession = {
        ...updatedSession,
        updatedAt: Date.now(),
        messages: [...updatedMessages, localModelMsg],
      };
      setSessions((prev) => {
        const nextSessions = prev.map((s) => (s.id === targetSessionId ? localFinalSession : s));
        saveStoredSessions(nextSessions, user.id);
        return nextSessions;
      });
      if (user.isLoggedIn) {
        saveConversationAndMessagesToFirestore(user.id, localFinalSession).catch(() => {});
      }
      isSendingRef.current = false;
      activeChatAbortRef.current = null;
      setIsLoading(false);
      return { reply: replyText, translation: '' };
    };

    if (explicitCmd?.action === 'forget') {
      const matchedItems = findMatchingMemoriesToForget(explicitCmd.content, memoriesRef.current);
      if (matchedItems.length > 0) {
        for (const item of matchedItems) {
          handleDeletePowerMemory(item.id);
        }
        const summaryList = matchedItems.map((m) => `• [${m.category}] ${m.content}`).join('\n');
        setMemoryActionNotice(
          `Forgot ${matchedItems.length} item${matchedItems.length === 1 ? '' : 's'} from Power Memory.`
        );
        return finishLocalMemoryResponse(
          `Removed from Power Memory:\n${summaryList}`
        );
      }
      setMemoryActionNotice('No matching saved memory was found in Power Memory.');
      return finishLocalMemoryResponse(
        'I checked your saved Power Memory, and no matching entry was found to remove.'
      );
    }

    let explicitCommandAlreadyHandled = false;
    if (explicitCmd?.action === 'remember') {
      if (containsSecretOrCredential(explicitCmd.content)) {
        setMemoryActionNotice(
          'Security guard: API keys, passwords, tokens, and credentials cannot be saved to Power Memory.'
        );
        return finishLocalMemoryResponse(
          'For your security, I cannot store API keys, passwords, tokens, or sensitive credentials in Power Memory.'
        );
      }

      const sensitivity = classifyMemorySensitivity(explicitCmd.content);
      const isPowerMemoryReady =
        settingsRef.current.memoryConsent === 'agreed' &&
        settingsRef.current.aiMemoryEnabled !== false;
      const inferredCategory = inferMemoryCategory(explicitCmd.content);

      if (sensitivity.isSensitive || !isPowerMemoryReady) {
        setPendingMemoryProposal({
          id: `prop-${Date.now()}`,
          content: explicitCmd.content,
          category: inferredCategory,
          reason: sensitivity.isSensitive
            ? sensitivity.reason
            : 'Power Memory is currently disabled. Confirm if you would like to enable and store this.',
          isSensitive: sensitivity.isSensitive,
          source: 'command',
        });
        setMemoryActionNotice('Confirm in the Power Memory prompt below before saving.');
        explicitCommandAlreadyHandled = true;
        return finishLocalMemoryResponse(
          `I haven't saved that yet. Use the Power Memory confirmation prompt below to choose whether to save (${inferredCategory}): "${explicitCmd.content}".`
        );
      }

      const saveRes = handleAddPowerMemory({
        category: inferredCategory,
        content: explicitCmd.content,
        source: 'command',
        isSensitive: false,
      });
      if (saveRes.ok && saveRes.item) {
        setMemoryActionNotice(`Saved to Power Memory (${saveRes.item.category}): "${saveRes.item.content}"`);
        explicitCommandAlreadyHandled = true;
        if (explicitCmd.usesPreviousTurnFallback || !params.text.includes('?')) {
          return finishLocalMemoryResponse(
            `Saved to Power Memory (${saveRes.item.category}): "${saveRes.item.content}".`
          );
        }
      }
    }

    const memoryContext =
      settingsRef.current.memoryConsent === 'agreed' &&
      settingsRef.current.aiMemoryEnabled !== false
        ? retrieveRelevantMemories({
            queryText: params.text || '',
            recentMessages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            memories: memoriesRef.current,
            maxItems: 6,
          }).formattedContext
        : [];

    try {
      let translation = '';
      let detectedLanguage = 'en';
      let sentiment: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral' = 'positive';
      let suggestedQuestions: string[] = [];
      let geotagInsights: string | undefined = undefined;
      let modelUsed: string | undefined = activeRequestedModel;
      let latencyMs = 280;

      const shouldStream =
        isOnline &&
        settings.streamingResponses !== false &&
        !params.imageData;

      const cachePromptKey = params.text || params.attachmentName || '';
      const cachedResponse =
        isOnline && !params.imageData && cachePromptKey
          ? getCachedAIResponse(
              String(activeProviderId),
              String(activeRequestedModel || DEFAULT_SETTINGS.aiModel),
              String(cachePromptKey || ''),
              String(params.targetLanguage || 'en')
            )
          : null;

      if (cachedResponse) {
        reply = cachedResponse.reply;
        translation = cachedResponse.translation || '';
        detectedLanguage = cachedResponse.detectedLanguage || params.targetLanguage;
        sentiment = (cachedResponse.sentiment as any) || 'positive';
        suggestedQuestions = cachedResponse.suggestedQuestions || ['Explain in more detail', 'Give a practical example', 'Summarize key points'];
        geotagInsights = cachedResponse.geotagInsights;
        modelUsed = cachedResponse.modelUsed || activeRequestedModel;
        latencyMs = 15; // Instant local cache hit
      } else if (!isOnline) {
        latencyMs = 120;
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];

        if (params.imageData) {
          reply = `[Offline Local Engine] Registered your photo${
            params.location ? ` tagged at ${params.location.name}` : ''
          }.`;
          translation = `[${targetLangObj.name} Offline] Photo registered locally.`;
        } else {
          reply = `[Offline Mode] Recorded: "${params.text || params.attachmentName}". Reconnect for live AI reasoning.`;
          translation = `[${targetLangObj.name} Translation] Offline mode active.`;
        }
        sentiment = 'neutral';
        suggestedQuestions = ['Explain in more detail', 'Give example', 'Summarize'];
      } else if (shouldStream) {
        // Insert live streaming placeholder bubble
        const streamingPlaceholder: ChatMessage = {
          id: modelMsgId,
          role: 'model',
          senderName: 'Aadesh AI',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
          provider: activeProviderId,
          modelUsed: activeRequestedModel,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? { ...s, title: sessionTitle, updatedAt: Date.now(), messages: [...updatedMessages, streamingPlaceholder] }
              : s
          )
        );

        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });

        const streamRes = await fetch(buildApiUrl('/api/chat/stream'), {
          method: 'POST',
          headers,
          signal: requestController.signal,
          body: JSON.stringify({
            messages: updatedMessages
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, content: m.content })),
            currentMessage: params.text,
            attachmentName: params.attachmentName,
            attachmentContent: params.attachmentContent,
            targetLanguage:
              settingsRef.current.aiResponseLanguage ||
              settingsRef.current.defaultTargetLanguage ||
              params.targetLanguage ||
              'en',
            aiResponseLanguage:
              settingsRef.current.aiResponseLanguage ||
              settingsRef.current.defaultTargetLanguage ||
              params.targetLanguage ||
              'en',
            autoDetectInputLanguage: Boolean(settingsRef.current.autoDetectInputLanguage),
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            responseMode: settings.aiResponseMode || 'balanced',
            location: params.location,
            memoryContext,
            aiProvider: activeProviderId,
            aiModel: activeRequestedModel,
            isVoice: Boolean(params.isVoice),
          }),
        });

        if (!streamRes.ok || !streamRes.body) {
          const errData = await streamRes.json().catch(() => ({}));
          throw new Error(errData.error || `Streaming error (${streamRes.status})`);
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            sseBuffer += decoder.decode();
            break;
          }
          sseBuffer += decoder.decode(value, { stream: true });
          sseBuffer = sseBuffer.replace(/\r\n/g, '\n');

          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(':') || !trimmedLine.startsWith('data:')) continue;
            const jsonStr = trimmedLine.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const payload = JSON.parse(jsonStr);
              if (payload.error) {
                throw new Error(payload.error);
              }
              if (typeof payload.chunk === 'string' && payload.chunk.length > 0) {
                reply += payload.chunk;
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === targetSessionId
                      ? {
                          ...s,
                          messages: s.messages.map((m) =>
                            m.id === modelMsgId ? { ...m, content: reply, isStreaming: true } : m
                          ),
                        }
                      : s
                  )
                );
              }
              if (payload.modelUsed) {
                modelUsed = payload.modelUsed;
              }
              if (payload.fallbackSwitched || payload.fallbackUsed) {
                applyGeminiFallbackSwitch({
                  fromModel: payload.fallbackFromModel || activeRequestedModel,
                  toModel: payload.modelUsed || GEMINI_QUOTA_FALLBACK_MODEL,
                  reason: payload.fallbackReason || 'quota',
                });
              }
            } catch (parseErr: any) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }

        if (sseBuffer.trim()) {
          const lines = sseBuffer.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(':') || !trimmedLine.startsWith('data:')) continue;
            const jsonStr = trimmedLine.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const payload = JSON.parse(jsonStr);
              if (payload.error) throw new Error(payload.error);
              if (typeof payload.chunk === 'string' && payload.chunk.length > 0) {
                reply += payload.chunk;
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === targetSessionId
                      ? {
                          ...s,
                          messages: s.messages.map((m) =>
                            m.id === modelMsgId ? { ...m, content: reply, isStreaming: true } : m
                          ),
                        }
                      : s
                  )
                );
              }
              if (payload.modelUsed) modelUsed = payload.modelUsed;
              if (payload.fallbackSwitched || payload.fallbackUsed) {
                applyGeminiFallbackSwitch({
                  fromModel: payload.fallbackFromModel || activeRequestedModel,
                  toModel: payload.modelUsed || GEMINI_QUOTA_FALLBACK_MODEL,
                  reason: payload.fallbackReason || 'quota',
                });
              }
            } catch {}
          }
        }

        latencyMs = Date.now() - startTime;

        if (!reply.trim()) {
          throw new Error(
            `${AI_PROVIDER_METADATA[activeProviderId].name} stream ended without returning any text. Please retry.`
          );
        }

        // If Auto Message Translation is explicitly enabled after streaming, translate reply cleanly
        if (settingsRef.current.translationEnabled && reply.trim() && !translation) {
          const autoTransTarget = settingsRef.current.translationLanguage || 'ne';
          try {
            const transRes = await fetch(buildApiUrl('/api/translate'), {
              method: 'POST',
              headers,
              signal: requestController.signal,
              body: JSON.stringify({
                text: reply,
                sourceLang: detectedLanguage || 'auto',
                targetLang: autoTransTarget,
                aiProvider: activeProviderId,
                aiModel: modelUsed || activeRequestedModel,
              }),
            });
            if (transRes.ok) {
              const transData = await transRes.json().catch(() => ({}));
              if (typeof transData.translatedText === 'string' && transData.translatedText.trim()) {
                translation = transData.translatedText.trim();
              }
            }
          } catch {
            // Keep original reply clean if optional auto-translation fails
          }
        }

        setAiHealth((prev) => ({
          ...prev,
          state: 'connected',
          backendConnected: true,
          geminiConnected: activeProviderId === 'gemini' ? true : prev.geminiConnected,
          activeProvider: activeProviderId,
          activeProviderConfigured: true,
          model: modelUsed || prev.model,
          checkedAt: Date.now(),
          lastConnectedAt: Date.now(),
          latencyMs,
          error: undefined,
        }));
      } else {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });

        const res = await fetch(buildApiUrl('/api/chat'), {
          method: 'POST',
          headers,
          signal: requestController.signal,
          body: JSON.stringify({
            messages: updatedMessages
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, content: m.content })),
            currentMessage: params.text,
            imageData: params.imageData,
            imageMimeType: params.imageMimeType,
            attachmentName: params.attachmentName,
            attachmentContent: params.attachmentContent,
            targetLanguage:
              settingsRef.current.aiResponseLanguage ||
              settingsRef.current.defaultTargetLanguage ||
              params.targetLanguage ||
              'en',
            aiResponseLanguage:
              settingsRef.current.aiResponseLanguage ||
              settingsRef.current.defaultTargetLanguage ||
              params.targetLanguage ||
              'en',
            autoDetectInputLanguage: Boolean(settingsRef.current.autoDetectInputLanguage),
            translationEnabled: Boolean(settingsRef.current.translationEnabled),
            translationLanguage: settingsRef.current.translationLanguage || 'ne',
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            responseMode: settings.aiResponseMode || 'balanced',
            memoryContext,
            location: params.location,
            aiProvider: activeProviderId,
            aiModel: activeRequestedModel,
            mode: 'chat',
            isVoice: Boolean(params.isVoice),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        if (!data.reply || !String(data.reply).trim()) {
          throw new Error(data.error || 'The AI service returned an empty response. Please try again.');
        }
        reply = data.reply;
        translation = settingsRef.current.translationEnabled ? (data.translation || '') : '';
        detectedLanguage = data.detectedLanguage || 'en';
        sentiment = data.sentiment || 'positive';
        suggestedQuestions = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : [];
        geotagInsights = data.geotagInsights;
        modelUsed = data.modelUsed;
        latencyMs = data.latencyMs || Date.now() - startTime;

        if (data.fallbackUsed) {
          applyGeminiFallbackSwitch({
            fromModel: data.fallbackFromModel || activeRequestedModel,
            toModel: data.modelUsed || GEMINI_QUOTA_FALLBACK_MODEL,
            reason: data.fallbackReason || 'quota',
          });
        }

        if (data.isLiveAI) {
          setAiHealth((prev) => ({
            ...prev,
            state: 'connected',
            backendConnected: true,
            geminiConnected: activeProviderId === 'gemini' ? true : prev.geminiConnected,
            activeProvider: activeProviderId,
            activeProviderConfigured: true,
            model: modelUsed || prev.model,
            checkedAt: Date.now(),
            lastConnectedAt: Date.now(),
            latencyMs,
            error: undefined,
          }));
        } else {
          setAiHealth((prev) => ({
            ...prev,
            state: 'error',
            backendConnected: true,
            activeProvider: activeProviderId,
            checkedAt: Date.now(),
            error: `${AI_PROVIDER_METADATA[activeProviderId].name} returned a non-live fallback response.`,
          }));
        }
      }

      const modelMessage: ChatMessage = {
        id: modelMsgId,
        role: 'model',
        senderName: 'Aadesh AI',
        content: reply,
        translation,
        translationLanguage: translation
          ? settingsRef.current.translationEnabled
            ? settingsRef.current.translationLanguage || 'ne'
            : params.targetLanguage
          : undefined,
        detectedLanguage,
        sentiment,
        suggestedQuestions,
        geotagInsights,
        provider: activeProviderId,
        modelUsed,
        timestamp: Date.now(),
        isOffline: !isOnline,
        isStreaming: false,
        latencyMs,
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        updatedAt: Date.now(),
        messages: [...updatedMessages, modelMessage],
      };

      if (isOnline && !cachedResponse && cachePromptKey && reply.trim()) {
        cacheAIResponse(
          String(activeProviderId),
          String(modelUsed || activeRequestedModel || DEFAULT_SETTINGS.aiModel),
          String(cachePromptKey || ''),
          String(params.targetLanguage || 'en'),
          {
            reply,
            translation,
            detectedLanguage,
            sentiment,
            suggestedQuestions,
            geotagInsights,
            modelUsed,
          }
        );
      }

      setSessions((prev) => {
        const nextSessions = prev.map((s) => (s.id === targetSessionId ? finalSession : s));
        saveStoredSessions(nextSessions, user.id);
        return nextSessions;
      });

      if (settings.soundEffects !== false) {
        playSoftNotificationChime();
      }

      // Dedicated backend call for context-aware suggested reply buttons ONLY when not already included
      if (isOnline && suggestedQuestions.length === 0) {
        const suggestHeaders = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        void fetch(buildApiUrl('/api/chat/suggested-replies'), {
          method: 'POST',
          headers: suggestHeaders,
          body: JSON.stringify({
            userMessage: params.text || fallbackContent,
            aiReply: reply,
            recentMessages: updatedMessages
              .slice(-4)
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, content: m.content })),
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            location: params.location,
            hasImage: Boolean(params.imageData),
            preferredSuggestionPatterns: summarizeTopSuggestionPatterns(suggestionAnalyticsRef.current, 5),
            aiProvider: activeProviderId,
            aiModel: activeRequestedModel,
          }),
        })
          .then((suggRes) => (suggRes.ok ? suggRes.json() : null))
          .then((suggData) => {
            if (!suggData || !Array.isArray(suggData.suggestedReplies) || suggData.suggestedReplies.length === 0) {
              return;
            }
            const nextSuggestions = suggData.suggestedReplies
              .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
              .slice(0, 4);
            if (nextSuggestions.length === 0) return;

            setSessions((prevSessions) => {
              const nextSessions = prevSessions.map((s) => {
                if (s.id !== targetSessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === modelMsgId ? { ...m, suggestedQuestions: nextSuggestions } : m
                  ),
                };
              });
              saveStoredSessions(nextSessions, user.id);
              return nextSessions;
            });

            if (user.isLoggedIn) {
              saveSingleMessageToFirestore(user.id, targetSessionId, {
                ...modelMessage,
                suggestedQuestions: nextSuggestions,
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      const currentActiveUser = userRef.current;
      const effectiveStreakTz = resolveEffectiveStreakTimezone(currentActiveUser.timezone);

      // Sync conversation & usage telemetry to Firestore when signed in
      if (user.isLoggedIn) {
        saveConversationAndMessagesToFirestore(user.id, finalSession).catch(() => {});
        recordUsageAnalyticsToFirestore({
          eventType: params.isVoice
            ? 'voice'
            : params.imageData
            ? 'image'
            : params.attachmentName
            ? 'file'
            : 'chat',
          language: params.targetLanguage,
          latencyMs,
          timeZone: effectiveStreakTz,
        }).catch(() => {});
      }

      const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(
        currentActiveUser,
        params.isVoice ? 'voice' : params.imageData ? 'image' : 'chat',
        {
          timeZone: effectiveStreakTz,
          skipStreakIncrement: isStreakLoadingRef.current,
        }
      );
      userRef.current = updatedUser;
      setUser(updatedUser);
      saveStoredUser(updatedUser);
      if (updatedUser.isLoggedIn && !isStreakLoadingRef.current) {
        const activityNowMs = Date.now();
        // Immediately persist per-UID streak + XP backup BEFORE async Firestore tx settles
        // so refreshing the browser immediately after chatting never resets streak to 0.
        saveStoredUserStreakBackup(updatedUser.id, {
          currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
          longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
          lastActiveDate: updatedUser.lastActiveDate || '',
          timezone: effectiveStreakTz,
          recoveryCount: updatedUser.recoveryCount ?? 0,
          recoveryMonth: updatedUser.recoveryMonth || '',
          streakBeforeBreak: updatedUser.streakBeforeBreak ?? 0,
          streakBrokenDate: updatedUser.streakBrokenDate || '',
          recoveredDates: updatedUser.recoveredDates,
          xp: updatedUser.xp,
          level: updatedUser.level,
          levelTitle: updatedUser.levelTitle,
          updatedAt: activityNowMs,
        });
        saveUserLocalExtras(updatedUser.id, {
          currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
          longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
          lastActiveDate: updatedUser.lastActiveDate || '',
          xp: updatedUser.xp,
          level: updatedUser.level,
          levelTitle: updatedUser.levelTitle,
        });
        recordDailyStreakActivityInFirestoreSafe(
          updatedUser.id,
          effectiveStreakTz,
          activityNowMs,
          {
            displayName: updatedUser.name,
            username: updatedUser.username,
            email: updatedUser.email,
            photoURL: sanitizeUserForFirestore(updatedUser).avatarUrl,
            preferredLanguage: updatedUser.preferredLanguage,
            provider: updatedUser.provider,
            role: updatedUser.role,
            createdAt: updatedUser.createdAt,
          },
          {
            currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
            longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
            lastActiveDate: updatedUser.lastActiveDate || '',
            timezone: effectiveStreakTz,
            recoveryCount: updatedUser.recoveryCount ?? 0,
            recoveryMonth: updatedUser.recoveryMonth || '',
            streakBeforeBreak: updatedUser.streakBeforeBreak ?? 0,
            streakBrokenDate: updatedUser.streakBrokenDate || '',
          }
        ).then((txRes) => {
          if (!txRes.ok) {
            const isPermErr =
              txRes.errorCode === 'permission_denied' ||
              String(txRes.error || '').toLowerCase().includes('permission');
            setStreakSyncError(
              isPermErr
                ? 'Cloud streak write blocked by Firestore permissions. Local streak is preserved.'
                : 'Cloud streak sync paused. Local streak is preserved.'
            );
            return;
          }
          setStreakSyncError(null);
          const next = txRes.result.nextState;
          saveStoredUserStreakBackup(updatedUser.id, {
            currentStreak: next.currentStreak,
            longestStreak: next.longestStreak,
            lastActiveDate: next.lastActiveDate,
            timezone: next.timezone,
            recoveryCount: next.recoveryCount,
            recoveryMonth: next.recoveryMonth,
            streakBeforeBreak: next.streakBeforeBreak,
            streakBrokenDate: next.streakBrokenDate,
            recoveredDates: updatedUser.recoveredDates,
            xp: userRef.current.xp,
            level: userRef.current.level,
            levelTitle: userRef.current.levelTitle,
            updatedAt: activityNowMs,
          });
          setUser((prev) => {
            if (prev.id !== updatedUser.id) return prev;
            const synced: UserProfile = {
              ...prev,
              timezone: next.timezone,
              streakDays: next.currentStreak,
              currentStreak: next.currentStreak,
              longestStreak: next.longestStreak,
              lastActiveDate: next.lastActiveDate,
              recoveryCount: next.recoveryCount,
              recoveryMonth: next.recoveryMonth,
              streakBeforeBreak: next.streakBeforeBreak,
              streakBrokenDate: next.streakBrokenDate,
            };
            userRef.current = synced;
            saveStoredUser(synced);
            void syncUserStreakLeaderboardEntry(synced);
            return synced;
          });
        });
      }

      if (newBadgeUnlocked) {
        triggerConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      }

      recordMetricEvent({
        isVoice: params.isVoice,
        isImage: Boolean(params.imageData),
        isTranslation: Boolean(translation),
        language: params.targetLanguage,
        locationName: params.location?.name,
        latencyMs,
        sentiment,
      });
      setMetrics(getStoredMetrics());
      void trackAnalyticsEvent(
        'chat_message_sent',
        {
          provider: activeProviderId,
          model: modelUsed || activeRequestedModel || DEFAULT_SETTINGS.aiModel,
          language: params.targetLanguage || 'en',
          response_mode: settingsRef.current.aiResponseMode || 'balanced',
          has_attachment: Boolean(params.attachmentName),
          has_image: Boolean(params.imageData),
          latency_ms: latencyMs,
        },
        Boolean(settingsRef.current.analyticsConsent)
      );

      // Fast voice speaking: When autoSpeakAIResponses is ON or params.isVoice is true,
      // start reading the AI response immediately (within 1 second)
      if ((params.isVoice || settings.autoSpeakAIResponses) && !params.handledByVoiceView) {
        const textToRead = translation || reply;
        const speechCode = resolveSpeechCodeForText(textToRead, params.targetLanguage || settings.uiLanguage);
        window.setTimeout(() => {
          voiceAssistant.speak(textToRead, speechCode, {
            rate: Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0)),
            pitch: Math.max(0.7, Math.min(1.5, settings.voicePitch ?? 1.0)),
            volume: settings.voiceVolume ?? 1.0,
          });
        }, 20);
      }
      if (
        !explicitCommandAlreadyHandled &&
        !explicitCmd &&
        params.text &&
        !params.imageData &&
        !params.attachmentName
      ) {
        const smartCandidate = detectSmartAutoMemoryCandidate(params.text, memoriesRef.current);
        if (smartCandidate) {
          if (smartCandidate.blockedSecret) {
            setMemoryActionNotice(
              smartCandidate.sensitivityReason ||
                'Security guard: Secrets and credentials are never stored in Power Memory.'
            );
          } else {
            const canAutoSave =
              settingsRef.current.memoryConsent === 'agreed' &&
              settingsRef.current.aiMemoryEnabled !== false &&
              settingsRef.current.smartMemoryAutoSave !== false;
            if (smartCandidate.isSensitive || !canAutoSave) {
              if (settingsRef.current.memoryConsent !== 'disagreed') {
                setPendingMemoryProposal({
                  id: `prop-${Date.now()}`,
                  content: smartCandidate.content,
                  category: smartCandidate.category,
                  reason: smartCandidate.isSensitive
                    ? smartCandidate.sensitivityReason
                    : canAutoSave
                    ? undefined
                    : 'Enable Power Memory to remember this across chats.',
                  isSensitive: smartCandidate.isSensitive,
                  source: smartCandidate.source,
                });
              }
            } else {
              const autoRes = handleAddPowerMemory({
                category: smartCandidate.category,
                content: smartCandidate.content,
                source: 'smart_auto',
                isSensitive: false,
              });
              if (autoRes.ok && autoRes.item) {
                setMemoryActionNotice(
                  `Auto-saved to Power Memory (${autoRes.item.category}): "${autoRes.item.content}"`
                );
              }
            }
          }
        }
      }

      return { reply, translation };
    } catch (err: any) {
      if (err?.name === 'AbortError' || stopRequestedRef.current) {
        if (reply.trim()) {
          const stoppedMessage: ChatMessage = {
            id: modelMsgId,
            role: 'model',
            senderName: 'Aadesh AI',
            content: `${reply.trim()}\n\n*(Response stopped)*`,
            timestamp: Date.now(),
            isStreaming: false,
            latencyMs: Date.now() - startTime,
          };
          const stoppedSession: ChatSession = {
            ...updatedSession,
            updatedAt: Date.now(),
            messages: [...updatedMessages, stoppedMessage],
          };
          setSessions((prev) => {
            const nextSessions = prev.map((s) => (s.id === targetSessionId ? stoppedSession : s));
            saveStoredSessions(nextSessions, user.id);
            return nextSessions;
          });
          if (user.isLoggedIn) {
            saveConversationAndMessagesToFirestore(user.id, stoppedSession).catch(() => {});
          }
          return { reply };
        }
        // Clean up empty streaming placeholder if stopped before first chunk
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? { ...s, messages: s.messages.filter((m) => m.id !== modelMsgId) }
              : s
          )
        );
        return;
      }

      const errMsg = String(err?.message || 'Connection error');
      console.warn('Chat provider notice:', errMsg);
      const isNetworkFailure =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(errMsg);
      void trackAnalyticsEvent(
        'ai_error',
        {
          provider: activeProviderId,
          model: activeRequestedModel || DEFAULT_SETTINGS.aiModel,
          error_code: isNetworkFailure ? 'NETWORK_ERROR' : 'PROVIDER_ERROR',
        },
        Boolean(settingsRef.current.analyticsConsent)
      );
      setAiHealth((prev) => ({
        ...prev,
        state: isNetworkFailure ? 'offline' : 'error',
        backendConnected: !isNetworkFailure,
        activeProvider: activeProviderId,
        activeProviderVerified: false,
        checkedAt: Date.now(),
        error: errMsg,
      }));
      const modelErrorMsg: ChatMessage = {
        id: `mod-err-${Date.now()}`,
        role: 'model',
        content: err?.message || 'Unable to reach this AI provider right now. Check provider status or switch models.',
        provider: activeProviderId,
        modelUsed: activeRequestedModel,
        timestamp: Date.now(),
        sentiment: 'urgent',
        isError: true,
        isStreaming: false,
      };
      const finalSession: ChatSession = {
        ...updatedSession,
        messages: [...updatedMessages, modelErrorMsg],
      };
      setSessions((prev) => {
        const nextSessions = prev.map((s) => (s.id === targetSessionId ? finalSession : s));
        saveStoredSessions(nextSessions, user.id);
        return nextSessions;
      });
      throw err;
    } finally {
      activeChatAbortRef.current = null;
      stopRequestedRef.current = false;
      isSendingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
    userRef.current = updatedUser;
    setUser(updatedUser);
    saveStoredUser(updatedUser);
    if (updatedUser.id && updatedUser.id !== 'guest' && updatedUser.id !== 'unauthenticated') {
      saveUserLocalExtras(updatedUser.id, {
        country: updatedUser.country,
        countryCode: updatedUser.countryCode,
        countryFlag: updatedUser.countryFlag,
        timezone: updatedUser.timezone,
        countryDetectionMethod: updatedUser.countryDetectionMethod,
        isManualCountry: updatedUser.isManualCountry,
        avatarColor: updatedUser.avatarColor,
        ...(typeof updatedUser.streakGoalDays === 'number'
          ? { streakGoalDays: updatedUser.streakGoalDays }
          : {}),
        ...(typeof updatedUser.xp === 'number' ? { xp: updatedUser.xp } : {}),
        ...(typeof updatedUser.level === 'number' ? { level: updatedUser.level } : {}),
        ...(updatedUser.levelTitle ? { levelTitle: updatedUser.levelTitle } : {}),
        ...(typeof updatedUser.currentStreak === 'number' && updatedUser.currentStreak > 0
          ? { currentStreak: updatedUser.currentStreak }
          : {}),
        ...(typeof updatedUser.longestStreak === 'number' && updatedUser.longestStreak > 0
          ? { longestStreak: updatedUser.longestStreak }
          : {}),
        ...(updatedUser.lastActiveDate ? { lastActiveDate: updatedUser.lastActiveDate } : {}),
        ...(updatedUser.avatarUrl?.startsWith('data:')
          ? { customAvatarDataUrl: updatedUser.avatarUrl }
          : {}),
      });
    }
    if (updatedUser.isLoggedIn) {
      void syncUserProfileToFirestore(sanitizeUserForFirestore(updatedUser))
        .catch(() => {})
        .then(() => {
          if ((updatedUser.currentStreak ?? updatedUser.streakDays ?? 0) >= 1) {
            void syncUserStreakLeaderboardEntry(updatedUser);
          }
        });
    }
  };

  const handleRecoverStreak = async () => {
    if (isRecoveringStreakRef.current || isStreakLoadingRef.current) return;
    isRecoveringStreakRef.current = true;
    const effectiveTz = resolveEffectiveStreakTimezone(userRef.current.timezone);
    try {
      if (user.isLoggedIn && user.id && user.id !== 'guest' && user.id !== 'unauthenticated') {
        const txRes = await recoverDailyStreakInFirestore(user.id, effectiveTz).catch(() => null);
        if (txRes) {
          if (!txRes.ok) return;
          const next = txRes.nextState;
          const newBridged =
            txRes.recoveredDates && txRes.recoveredDates.length > 0
              ? txRes.recoveredDates
              : getRecoveredGapDateKeys(user.streakBrokenDate || user.lastActiveDate, txRes.todayKey);
          const mergedRecovered = Array.from(
            new Set([...(user.recoveredDates || []), ...newBridged])
          ).sort();
          const updated: UserProfile = {
            ...user,
            ...next,
            timezone: user.timezone || next.timezone,
            streakDays: next.currentStreak,
            recoveredDates: mergedRecovered,
            streakHistory: generateStreakHistory(
              next.currentStreak,
              undefined,
              effectiveTz,
              Date.now(),
              mergedRecovered
            ),
          };
          userRef.current = updated;
          setUser(updated);
          saveStoredUser(updated);
          saveUserLocalExtras(user.id, { recoveredDates: mergedRecovered });
          saveStoredUserStreakBackup(user.id, {
            currentStreak: next.currentStreak,
            longestStreak: next.longestStreak,
            lastActiveDate: next.lastActiveDate,
            timezone: next.timezone,
            recoveryCount: next.recoveryCount,
            recoveryMonth: next.recoveryMonth,
            streakBeforeBreak: next.streakBeforeBreak,
            streakBrokenDate: next.streakBrokenDate,
            recoveredDates: mergedRecovered,
            updatedAt: Date.now(),
          });
          void syncUserStreakLeaderboardEntry(updated);
          triggerConfetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
          return;
        }
      }

      // Offline / local fallback in user's local timezone
      const res = recoverBrokenStreakState(user, Date.now(), effectiveTz);
      if (!res.ok) {
        return;
      }
      const fallbackBridged = getRecoveredGapDateKeys(
        user.streakBrokenDate || user.lastActiveDate,
        res.todayKey
      );
      const mergedRecovered = Array.from(
        new Set([...(user.recoveredDates || []), ...fallbackBridged])
      ).sort();
      const updated: UserProfile = {
        ...user,
        ...res.nextState,
        timezone: user.timezone || res.nextState.timezone,
        streakDays: res.nextState.currentStreak,
        recoveredDates: mergedRecovered,
        streakHistory: generateStreakHistory(
          res.nextState.currentStreak,
          undefined,
          effectiveTz,
          Date.now(),
          mergedRecovered
        ),
      };
      if (user.id) {
        saveUserLocalExtras(user.id, { recoveredDates: mergedRecovered });
        saveStoredUserStreakBackup(user.id, {
          currentStreak: res.nextState.currentStreak,
          longestStreak: res.nextState.longestStreak,
          lastActiveDate: res.nextState.lastActiveDate,
          timezone: res.nextState.timezone,
          recoveryCount: res.nextState.recoveryCount,
          recoveryMonth: res.nextState.recoveryMonth,
          streakBeforeBreak: res.nextState.streakBeforeBreak,
          streakBrokenDate: res.nextState.streakBrokenDate,
          recoveredDates: mergedRecovered,
          updatedAt: Date.now(),
        });
      }
      handleUpdateUser(updated);
    } finally {
      isRecoveringStreakRef.current = false;
    }
  };

  const handleSignOut = async () => {
    activeFbUidRef.current = null;
    isStreakLoadingRef.current = false;
    setIsStreakLoading(false);
    setStreakSyncError(null);
    setShowOnboarding(false);
    setWelcomeBackName(null);
    memoriesRef.current = [];
    setMemories([]);
    setPendingMemoryProposal(null);
    setMemoryActionNotice(null);
    try {
      sessionStorage.removeItem('aadesh_welcomed_uid');
      sessionStorage.removeItem('aadesh_login_glow_uid');
    } catch {}
    try {
      await logOut();
    } catch {}
    setFbAuthUser(null);
    const detected = detectUserCountry();
    const signedOutUser: UserProfile = {
      ...DEFAULT_USER,
      id: 'unauthenticated',
      name: 'User',
      username: 'user',
      email: '',
      phone: '',
      avatarUrl: '',
      country: detected.country,
      countryFlag: detected.flag,
      provider: 'email',
      role: 'user',
      isLoggedIn: false,
      linkedProviders: [],
      createdAt: Date.now(),
    };
    userRef.current = signedOutUser;
    setUser(signedOutUser);
    saveStoredUser(signedOutUser);
    setIsAuthModalOpen(false);
    setActiveTab('chat');
  };

  const handleNewSession = (initialCategory?: string) => {
    hasUserPickedSessionRef.current = true;
    setChatDraft(null);
    setActiveTab('chat');
    const cleanCategory =
      initialCategory && initialCategory.trim() && initialCategory !== 'All'
        ? initialCategory.trim().slice(0, 48)
        : 'General';
    const newSession: ChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `Conversation ${sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage:
        settingsRef.current.aiResponseLanguage || settingsRef.current.defaultTargetLanguage || 'en',
      category: cleanCategory,
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
    saveStoredSessions(updated, user.id);
    if (user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, newSession).catch(() => {});
    }
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, title: newTitle, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleCreateFolder = (folderName: string) => {
    const clean = folderName.trim().slice(0, 48);
    if (!clean) return;
    setSessionFolders((prev) => {
      if (prev.some((f) => f.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [...prev, clean];
      saveStoredFolders(next, user.id);
      return next;
    });
  };

  const handleUpdateSessionCategory = (id: string, category: string) => {
    const clean = category.trim().slice(0, 48) || 'General';
    handleCreateFolder(clean);
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, category: clean, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleDeleteSession = (id: string) => {
    if (user.isLoggedIn) {
      deleteConversationFromFirestore(user.id, id).catch(() => {});
    }
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      handleNewSession();
      return;
    }
    setSessions(remaining);
    saveStoredSessions(remaining, user.id);
    if (currentSessionId === id) {
      setCurrentSessionId(remaining[0].id);
    }
  };

  const handleClearCurrentSession = () => {
    const updated = sessions.map((s) => (s.id === currentSession.id ? { ...s, messages: [] } : s));
    setSessions(updated);
    saveStoredSessions(updated, user.id);
  };

  const handleUpdateSessionTargetLang = (lang: string) => {
    const updated = sessions.map((s) =>
      s.id === currentSession.id ? { ...s, targetLanguage: lang, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === currentSession.id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleFeedbackMessage = (messageId: string, feedback: 'up' | 'down') => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, feedback: m.feedback === feedback ? undefined : feedback }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleTogglePinMessage = (messageId: string) => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isPinned: !m.isPinned,
                pinnedAt: !m.isPinned ? Date.now() : undefined,
              }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleReactToMessage = (messageId: string, emoji: string) => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) => {
          if (m.id !== messageId) return m;
          const prevUserReactions = Array.isArray(m.userReactions) ? m.userReactions : [];
          const hasReacted = prevUserReactions.includes(emoji);
          const nextUserReactions = hasReacted
            ? prevUserReactions.filter((e) => e !== emoji)
            : [...prevUserReactions, emoji].slice(0, 6);

          const nextReactions: Record<string, number> = { ...(m.reactions || {}) };
          const currentCount = typeof nextReactions[emoji] === 'number' ? nextReactions[emoji] : 0;
          if (hasReacted) {
            const decremented = currentCount - 1;
            if (decremented <= 0) {
              delete nextReactions[emoji];
            } else {
              nextReactions[emoji] = decremented;
            }
          } else {
            nextReactions[emoji] = Math.min(999, currentCount + 1);
          }

          return {
            ...m,
            reactions: nextReactions,
            userReactions: nextUserReactions,
          };
        }),
      };
    });

    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleTranslateMessage = async (messageId: string, targetLangCode: string): Promise<string> => {
    if (!fbAuthUser || !fbAuthUser.emailVerified) {
      throw new Error('Authentication and email verification required.');
    }
    const targetMsg = currentSession.messages.find((m) => m.id === messageId);
    if (!targetMsg) throw new Error('Message not found');

    if (
      targetMsg.translation &&
      targetMsg.translation.trim() &&
      targetMsg.translationLanguage === targetLangCode
    ) {
      return targetMsg.translation;
    }

    const targetLangObj =
      SUPPORTED_LANGUAGES.find((l) => l.code === targetLangCode) || SUPPORTED_LANGUAGES[0];

    let translatedText = '';
    let latencyMs = 150;

    if (!isOnline) {
      translatedText = `[Offline Translated (${targetLangObj.name})] ${targetMsg.content}`;
    } else {
      const activeProv = normalizeAIProviderId(settingsRef.current.aiProvider);
      const activeModelId =
        activeProv === 'openrouter'
          ? settingsRef.current.openRouterModel || settingsRef.current.aiModel
          : settingsRef.current.aiModel;
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });

      const res = await fetch(buildApiUrl('/api/translate'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: targetMsg.content,
          sourceLang: targetMsg.detectedLanguage || 'auto',
          targetLang: targetLangCode,
          aiProvider: activeProv,
          aiModel: activeModelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Translation failed (${res.status})`);
      }
      translatedText = data.translatedText || targetMsg.content;
      latencyMs = data.latencyMs || 250;
    }

    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, translation: translatedText, translationLanguage: targetLangCode }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
      recordUsageAnalyticsToFirestore({
        eventType: 'translation',
        language: targetLangCode,
        latencyMs,
      }).catch(() => {});
    }

    recordMetricEvent({
      isTranslation: true,
      language: targetLangCode,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());

    return translatedText;
  };

  const handleAddMedia = (media: GeotaggedMedia) => {
    const updated = [media, ...mediaItems];
    setMediaItems(updated);
    saveStoredMedia(updated);

    recordMetricEvent({
      isImage: true,
      locationName: media.location.name,
      sentiment: 'curious',
    });
    setMetrics(getStoredMetrics());

    triggerConfetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
  };

  const handleDeleteMedia = (id: string) => {
    const updated = mediaItems.filter((m) => m.id !== id);
    setMediaItems(updated);
    saveStoredMedia(updated);
  };

  const handleImageGenerated = (latencyMs: number) => {
    const currentActiveUser = userRef.current;
    const effectiveTz = resolveEffectiveStreakTimezone(currentActiveUser.timezone);
    const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(
      currentActiveUser,
      'image',
      {
        timeZone: effectiveTz,
        skipStreakIncrement: isStreakLoadingRef.current,
      }
    );
    userRef.current = updatedUser;
    setUser(updatedUser);
    saveStoredUser(updatedUser);
    if (updatedUser.isLoggedIn && !isStreakLoadingRef.current) {
      const nowMs = Date.now();
      saveStoredUserStreakBackup(updatedUser.id, {
        currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
        longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
        lastActiveDate: updatedUser.lastActiveDate || '',
        timezone: effectiveTz,
        recoveryCount: updatedUser.recoveryCount ?? 0,
        recoveryMonth: updatedUser.recoveryMonth || '',
        streakBeforeBreak: updatedUser.streakBeforeBreak ?? 0,
        streakBrokenDate: updatedUser.streakBrokenDate || '',
        recoveredDates: updatedUser.recoveredDates,
        xp: updatedUser.xp,
        level: updatedUser.level,
        levelTitle: updatedUser.levelTitle,
        updatedAt: nowMs,
      });
      saveUserLocalExtras(updatedUser.id, {
        currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
        longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
        lastActiveDate: updatedUser.lastActiveDate || '',
        xp: updatedUser.xp,
        level: updatedUser.level,
        levelTitle: updatedUser.levelTitle,
      });
      recordDailyStreakActivityInFirestoreSafe(
        updatedUser.id,
        effectiveTz,
        nowMs,
        {
          displayName: updatedUser.name,
          username: updatedUser.username,
          email: updatedUser.email,
          photoURL: sanitizeUserForFirestore(updatedUser).avatarUrl,
          preferredLanguage: updatedUser.preferredLanguage,
          provider: updatedUser.provider,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt,
        },
        {
          currentStreak: updatedUser.currentStreak ?? updatedUser.streakDays ?? 0,
          longestStreak: updatedUser.longestStreak ?? updatedUser.streakDays ?? 0,
          lastActiveDate: updatedUser.lastActiveDate || '',
          timezone: effectiveTz,
          recoveryCount: updatedUser.recoveryCount ?? 0,
          recoveryMonth: updatedUser.recoveryMonth || '',
          streakBeforeBreak: updatedUser.streakBeforeBreak ?? 0,
          streakBrokenDate: updatedUser.streakBrokenDate || '',
        }
      ).then((txRes) => {
        if (!txRes.ok) {
          const isPermErr =
            txRes.errorCode === 'permission_denied' ||
            String(txRes.error || '').toLowerCase().includes('permission');
          setStreakSyncError(
            isPermErr
              ? 'Cloud streak write blocked by Firestore permissions. Local streak is preserved.'
              : 'Cloud streak sync paused. Local streak is preserved.'
          );
          return;
        }
        setStreakSyncError(null);
        const next = txRes.result.nextState;
        saveStoredUserStreakBackup(updatedUser.id, {
          currentStreak: next.currentStreak,
          longestStreak: next.longestStreak,
          lastActiveDate: next.lastActiveDate,
          timezone: next.timezone,
          recoveryCount: next.recoveryCount,
          recoveryMonth: next.recoveryMonth,
          streakBeforeBreak: next.streakBeforeBreak,
          streakBrokenDate: next.streakBrokenDate,
          recoveredDates: updatedUser.recoveredDates,
          xp: userRef.current.xp,
          level: userRef.current.level,
          levelTitle: userRef.current.levelTitle,
          updatedAt: nowMs,
        });
        setUser((prev) => {
          if (prev.id !== updatedUser.id) return prev;
          const synced: UserProfile = {
            ...prev,
            timezone: next.timezone,
            streakDays: next.currentStreak,
            currentStreak: next.currentStreak,
            longestStreak: next.longestStreak,
            lastActiveDate: next.lastActiveDate,
            recoveryCount: next.recoveryCount,
            recoveryMonth: next.recoveryMonth,
            streakBeforeBreak: next.streakBeforeBreak,
            streakBrokenDate: next.streakBrokenDate,
          };
          userRef.current = synced;
          saveStoredUser(synced);
          void syncUserStreakLeaderboardEntry(synced);
          return synced;
        });
      });
    }
    if (newBadgeUnlocked) {
      triggerConfetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
    }
    recordMetricEvent({
      isImage: true,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());
  };

  const handleRecordTranslationMetric = (_langA: string, langB: string, latencyMs: number) => {
    recordMetricEvent({
      isTranslation: true,
      language: langB,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());
  };

  const handleSuggestedReplyClick = (suggestionText: string) => {
    const activeUser = userRef.current;
    const activeLang = currentSession?.targetLanguage || settingsRef.current.uiLanguage || 'en';
    const nextStats = recordLocalSuggestionClick(activeUser.id, suggestionText, activeLang);
    suggestionAnalyticsRef.current = nextStats;
    if (activeUser.isLoggedIn && activeUser.id && activeUser.id !== 'unauthenticated') {
      void recordSuggestedReplyClickInFirestore(activeUser.id, suggestionText, activeLang);
    }
  };

  const handleClearAllData = () => {
    localStorage.clear();
    saveStoredSettings(DEFAULT_SETTINGS);
    if (user.isLoggedIn) {
      saveStoredUser(user);
    }
    setSettings(DEFAULT_SETTINGS);
    const resetSessions = getStoredSessions(user.id);
    setSessions(resetSessions);
    setSessionFolders(getStoredFolders(user.id));
    setCurrentSessionId(resetSessions[0]?.id || `session-${Date.now()}`);
    saveStoredVoiceHistory([], user.id);
    setMediaItems(getStoredMedia());
    setMetrics(getStoredMetrics());
    setIsSettingsModalOpen(false);
  };

  const splashOverlay = !splashDismissed ? (
    <SplashScreen
      isAppReady={isAppReady}
      aiConnectionState={aiHealth.state}
      initError={initError}
      theme={settings.theme}
      onRetryInit={() => void checkAIHealth(true)}
      onComplete={() => setSplashDismissed(true)}
    />
  ) : null;

  if (!isAuthInitialized) {
    return (
      <>
        {splashOverlay}
        <div className="app-shell-scroll relative flex flex-col justify-center items-center min-h-[100dvh] max-w-full overflow-x-clip">
          <FuturisticBackground theme={settings.theme} />
        </div>
      </>
    );
  }

  if (!isAuthenticatedVerified) {
    return (
      <>
        {splashOverlay}
        <div className="app-shell-scroll relative flex flex-col min-h-[100dvh] max-w-full overflow-x-clip selection:bg-purple-500/30 selection:text-purple-200">
          <FuturisticBackground theme={settings.theme} />
          <Suspense fallback={<ViewLoadingFallback />}>
            <MandatoryAuthGate
              firebaseUser={fbAuthUser}
              onVerifiedComplete={(verifiedUser) => {
                setFbAuthUser(verifiedUser);
                void hydrateVerifiedUserSession(verifiedUser);
              }}
            />
          </Suspense>
        </div>
      </>
    );
  }

  return (
    <>
      {splashOverlay}
      <div
        className={`${
          activeTab === 'chat' ? 'app-shell-chat' : 'app-shell-scroll'
        } relative flex flex-col justify-between selection:bg-purple-500/30 selection:text-purple-200 max-w-full overflow-x-clip`}
      >
        {/* Futuristic Purple/Violet/Lavender 3D Liquid Waves, Orbs, Bubbles & Particles */}
        <FuturisticBackground theme={settings.theme} />

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* CLEAN TOP HEADER (Logo + Live AI Status on Left | Animated Profile Panel & Dropdown on Right) */}
      <Header
        user={user}
        isStreakLoading={isStreakLoading}
        aiHealth={aiHealth}
        providersStatus={providersStatus}
        isNetworkOnline={isOnline}
        testingProviderId={testingProviderId}
        aiResponseLanguage={settings.aiResponseLanguage || settings.defaultTargetLanguage || 'en'}
        onRetryHealth={() => {
          void checkAIHealth(true);
          void fetchProvidersStatus(true);
        }}
        onTestProvider={(providerId, modelId) => testProviderConnection(providerId, modelId)}
        onSelectProvider={(providerId, modelId) => {
          handleUpdateSettings({
            aiProvider: providerId,
            ...(modelId ? { aiModel: modelId } : {}),
            ...(providerId === 'openrouter' && modelId ? { openRouterModel: modelId } : {}),
          });
        }}
        onLogoClick={() => setActiveTab('chat')}
        onProfileClick={() => {
          setSettingsSection('profile');
          setActiveTab('settings');
        }}
        onOpenSettings={() => {
          setSettingsSection('settings');
          setActiveTab('settings');
        }}
        onStreakClick={() => setIsGamificationModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Animated Welcome Back Greeting after ~5+ hours away */}
      <AnimatePresence>
        {welcomeBackName && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl glass-card border border-sky-400/50 shadow-[0_12px_36px_rgba(56,189,248,0.28)] flex items-center gap-2.5 text-xs sm:text-sm font-bold text-white"
            role="status"
          >
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0 animate-pulse" />
            <span>Welcome Back, {welcomeBackName}!</span>
            <button
              type="button"
              onClick={() => setWelcomeBackName(null)}
              className="p-0.5 text-purple-200/75 hover:text-white cursor-pointer"
              aria-label="Dismiss welcome greeting"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Automatic Gemini Quota Fallback Banner (shown cleanly once per switch) */}
      {modelFallbackNotice && (
        <div
          role="status"
          className="bg-amber-950/90 border-b border-amber-400/45 text-amber-100 text-xs py-2 px-4 z-20 font-medium flex items-center justify-center gap-3 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-center">{modelFallbackNotice}</span>
          <button
            type="button"
            onClick={() => setModelFallbackNotice(null)}
            aria-label="Dismiss model switch notice"
            className="p-0.5 text-amber-200/80 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Owner Announcement Banner if active */}
      {platformNotice?.announcement && (
        <div className="bg-purple-950/85 border-b border-purple-500/40 text-purple-100 text-xs py-1.5 px-4 text-center z-20 font-medium shrink-0">
          📢 {platformNotice.announcement}
        </div>
      )}

      {/* Offline Alert Strip if Offline */}
      {!isOnline && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs py-1.5 px-4 text-center z-20 font-medium flex items-center justify-center gap-2 shrink-0">
          <span>⚠️ Offline Mode Active: Conversations saved locally. Syncs when reconnected.</span>
          <button
            onClick={handleToggleForceOffline}
            className="underline hover:text-white font-bold ml-1 cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main
        className={`relative z-10 w-full flex flex-col ${
          activeTab === 'chat' ? 'flex-1 min-h-0 overflow-hidden' : 'flex-grow'
        }`}
      >
        <Suspense fallback={<ViewLoadingFallback />}>
        {activeTab === 'chat' && (
          <ChatView
            currentSession={currentSession}
            allSessions={sessions}
            sessionFolders={sessionFolders}
            onSelectSession={(id) => {
              hasUserPickedSessionRef.current = true;
              setCurrentSessionId(id);
            }}
            onNewSession={handleNewSession}
            onRenameSession={handleRenameSession}
            onUpdateSessionCategory={handleUpdateSessionCategory}
            onCreateFolder={handleCreateFolder}
            onDeleteSession={handleDeleteSession}
            onClearCurrentSession={handleClearCurrentSession}
            onSendMessage={async (params) => {
              await handleSendMessage(params);
            }}
            onStopGeneration={handleStopGeneration}
            onUpdateSessionTargetLang={handleUpdateSessionTargetLang}
            onTranslateMessage={handleTranslateMessage}
            onFeedbackMessage={handleFeedbackMessage}
            onTogglePinMessage={handleTogglePinMessage}
            onReactMessage={handleReactToMessage}
            onOpenTransfer={() => setActiveTab('transfer')}
            onUpdateSettings={handleUpdateSettings}
            onImageGenerated={handleImageGenerated}
            onRecordTranslationMetric={handleRecordTranslationMetric}
            onSuggestedReplyClick={handleSuggestedReplyClick}
            mediaItems={mediaItems}
            onAddMedia={handleAddMedia}
            onDeleteMedia={handleDeleteMedia}
            user={user}
            settings={settings}
            aiHealth={aiHealth}
            providersStatus={providersStatus}
            isLoadingProvidersStatus={isLoadingProvidersStatus}
            testingProviderId={testingProviderId}
            onRefreshProvidersStatus={() => void fetchProvidersStatus(true)}
            onTestProvider={(providerId, modelId) => testProviderConnection(providerId, modelId)}
            onOpenProviderSettings={() => {
              setSettingsSection('settings');
              setActiveTab('settings');
            }}
            isOnline={isOnline}
            isLoading={isLoading}
            searchFilter={searchQuery}
            onSearchChange={setSearchQuery}
            isKeyboardOpen={isKeyboardOpen}
            externalDraft={chatDraft}
            pendingMemoryProposal={pendingMemoryProposal}
            onConfirmMemoryProposal={handleConfirmMemoryProposal}
            onDismissMemoryProposal={handleDismissMemoryProposal}
            memoryActionNotice={memoryActionNotice}
            onDismissMemoryNotice={() => setMemoryActionNotice(null)}
          />
        )}

        {activeTab === 'analysis' && (
          <AnalyticsDashboard
            metrics={metrics}
            sessions={sessions}
            user={user}
            settings={settings}
            isOnline={isOnline}
          />
        )}

        {activeTab === 'transfer' && (
          <TransferView
            userId={user.id}
            userName={user.name}
            settings={settings}
            isOnline={isOnline}
            onUpdateSettings={handleUpdateSettings}
            onRecordTranslationMetric={handleRecordTranslationMetric}
            onOpenInChat={(text) => {
              setChatDraft({ id: Date.now(), text });
              setActiveTab('chat');
            }}
            onAttachFileToChat={(file) => {
              setActiveTab('chat');
              void handleSendMessage({
                text: file.dataUrl
                  ? `Please inspect and describe this transferred image: ${file.name}`
                  : `Please analyze this transferred file (${file.name}):`,
                imageData: file.dataUrl,
                imageMimeType: file.mimeType,
                attachmentName: file.dataUrl ? undefined : file.name,
                attachmentContent: file.textContent,
                targetLanguage: currentSession.targetLanguage || settings.defaultTargetLanguage,
              }).catch(() => {});
            }}
          />
        )}

        {activeTab === 'voice' && (
          <VoicePage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            isOnline={isOnline}
            onSendVoiceMessage={async ({ text, isVoice, targetLanguage }) => {
              return handleSendMessage({
                text,
                isVoice,
                targetLanguage,
                handledByVoiceView: true,
              });
            }}
            onOpenInChat={(text) => {
              setChatDraft({ id: Date.now(), text });
              setActiveTab('chat');
            }}
          />
        )}

        {activeTab === 'more' && (
          <MoreView
            user={user}
            settings={settings}
            isOnline={isOnline}
            mediaItems={mediaItems}
            sessions={sessions}
            currentSessionId={currentSession.id}
            onSelectSession={(id) => {
              hasUserPickedSessionRef.current = true;
              setCurrentSessionId(id);
              setActiveTab('chat');
            }}
            onDeleteSession={handleDeleteSession}
            onUpdateSettings={handleUpdateSettings}
            onAddMedia={handleAddMedia}
            onDeleteMedia={handleDeleteMedia}
            onImageGenerated={handleImageGenerated}
            onRecordTranslationMetric={handleRecordTranslationMetric}
            onSendToChat={(text) => {
              setChatDraft({ id: Date.now(), text });
              setActiveTab('chat');
            }}
            onAttachPhotoToChat={(file) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const base64 = String(ev.target?.result || '');
                if (!base64) return;
                setChatDraft({
                  id: Date.now(),
                  image: { base64, mimeType: file.type || 'image/jpeg' },
                });
                setActiveTab('chat');
              };
              reader.readAsDataURL(file);
            }}
            onAttachVideoToChat={({ name, content, frameBase64 }) => {
              setChatDraft({
                id: Date.now(),
                text: `Analyze uploaded video "${name}"`,
                file: { name, content },
                ...(frameBase64 ? { image: { base64: frameBase64, mimeType: 'image/jpeg' } } : {}),
              });
              setActiveTab('chat');
            }}
            onAskAboutCountry={(countryName, city, formattedTime) => {
              setActiveTab('chat');
              void handleSendMessage({
                text: `Tell me about ${countryName} (${city}), where the current live local time is ${formattedTime}.`,
                targetLanguage: currentSession.targetLanguage || settings.defaultTargetLanguage,
              }).catch(() => {});
            }}
            onOpenScannerToChat={(dataUrl, mimeType) => {
              setChatDraft({
                id: Date.now(),
                text: 'Scan, extract all text cleanly (OCR), and summarize this document.',
                image: { base64: dataUrl, mimeType },
              });
              setActiveTab('chat');
            }}
            onOpenSettings={() => {
              setSettingsSection('settings');
              setActiveTab('settings');
            }}
            onOpenProfile={() => {
              setSettingsSection('profile');
              setActiveTab('settings');
            }}
            memories={memories}
            onAddMemory={handleAddPowerMemory}
            onUpdateMemory={handleUpdatePowerMemory}
            onToggleMemoryApproved={handleTogglePowerMemory}
            onDeleteMemory={handleDeletePowerMemory}
            onClearAllMemories={handleClearAllPowerMemories}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            initialSection={settingsSection}
            user={user}
            settings={settings}
            sessions={sessions}
            mediaItems={mediaItems}
            metrics={metrics}
            aiHealth={aiHealth}
            providersStatus={providersStatus}
            isLoadingProvidersStatus={isLoadingProvidersStatus}
            testingProviderId={testingProviderId}
            onRefreshProvidersStatus={() => {
              void checkAIHealth(true);
              void fetchProvidersStatus(true);
            }}
            onTestProvider={(providerId, modelId) => testProviderConnection(providerId, modelId)}
            fbAuthUser={fbAuthUser}
            isOnline={isOnline}
            isOwnerAdmin={isOwnerAdmin}
            onUpdateUser={handleUpdateUser}
            onUpdateSettings={handleUpdateSettings}
            onToggleForceOffline={handleToggleForceOffline}
            onClearAllData={handleClearAllData}
            onSignOut={handleSignOut}
            onOpenInstall={() => setIsInstallModalOpen(true)}
            onOpenAdmin={() => setActiveTab('admin')}
            onOpenFullBackup={() => setIsSettingsModalOpen(true)}
            memories={memories}
            onAddMemory={handleAddPowerMemory}
            onUpdateMemory={handleUpdatePowerMemory}
            onToggleMemoryApproved={handleTogglePowerMemory}
            onDeleteMemory={handleDeletePowerMemory}
            onClearAllMemories={handleClearAllPowerMemories}
          />
        )}

        {activeTab === 'admin' && (
          <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 pt-4 pb-28 space-y-3">
            <button
              type="button"
              onClick={() => {
                setSettingsSection('settings');
                setActiveTab('settings');
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl glass-card text-xs font-bold text-purple-200 hover:text-white border border-purple-400/30 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Settings</span>
            </button>
            <AdminDashboardView
              currentUser={user}
              onOpenAuth={() => {
                setAuthModalMode('signin');
                setIsAuthModalOpen(true);
              }}
            />
          </div>
        )}
        </Suspense>
      </main>
      </div>

      {/* NAVIGATION: Exact 6 buttons (Chat, Analysis, Transfer, Voice, More, Setting) + Owner exclusively for aadeshjaisi6@gmail.com */}
      <NavigationDock
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'settings') {
            setSettingsSection('settings');
          }
          setActiveTab(tab);
        }}
        onLogoClick={() => setActiveTab('chat')}
        isKeyboardOpen={isKeyboardOpen}
        isOwner={isOwner}
      />

      {/* FULL ADVANCED SETTINGS & EXPORT BACKUP MODAL */}
      {isSettingsModalOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            isOnline={isOnline}
            onToggleForceOffline={handleToggleForceOffline}
            onClearAllData={handleClearAllData}
            sessionCount={sessions.length}
            mediaCount={mediaItems.length}
            mediaItems={mediaItems}
            sessions={sessions}
            currentSession={currentSession}
            userName={user.name}
            providersStatus={providersStatus}
            isLoadingProvidersStatus={isLoadingProvidersStatus}
            onRefreshProvidersStatus={() => void fetchProvidersStatus(true)}
          />
        </Suspense>
      )}

      {/* MULTI-ACCOUNT AUTH MODAL */}
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            currentUser={user}
            onUpdateUser={handleUpdateUser}
            onSignOut={handleSignOut}
            initialMode={authModalMode}
          />
        </Suspense>
      )}

      {/* GAMIFICATION & STREAKS MODAL */}
      {isGamificationModalOpen && (
        <Suspense fallback={null}>
          <GamificationModal
            isOpen={isGamificationModalOpen}
            onClose={() => setIsGamificationModalOpen(false)}
            user={user}
            isStreakLoading={isStreakLoading}
            streakSyncError={streakSyncError}
            onRecoverStreak={handleRecoverStreak}
            onStreakFreeze={() => {
              const freezeNowMs = Date.now();
              const res = processStreakFreeze(userRef.current, 150, freezeNowMs);
              if (!res.ok) {
                setStreakSyncError('Streak Freeze requires at least 150 XP. Keep chatting or using voice to earn more XP!');
                return;
              }
              const frozenUser = res.updatedUser;
              if (frozenUser.id && frozenUser.id !== 'guest' && frozenUser.id !== 'unauthenticated') {
                saveStoredUserStreakBackup(frozenUser.id, {
                  currentStreak: frozenUser.currentStreak ?? frozenUser.streakDays ?? 1,
                  longestStreak: frozenUser.longestStreak ?? frozenUser.streakDays ?? 1,
                  lastActiveDate: frozenUser.lastActiveDate || '',
                  timezone: resolveEffectiveStreakTimezone(frozenUser.timezone),
                  recoveryCount: frozenUser.recoveryCount ?? 1,
                  recoveryMonth: frozenUser.recoveryMonth || '',
                  streakBeforeBreak: 0,
                  streakBrokenDate: '',
                  recoveredDates: frozenUser.recoveredDates,
                  xp: frozenUser.xp,
                  level: frozenUser.level,
                  levelTitle: frozenUser.levelTitle,
                  updatedAt: freezeNowMs,
                });
              }
              handleUpdateUser(frozenUser);
              if (frozenUser.isLoggedIn && frozenUser.id) {
                void syncStreakFreezeToFirestoreSafe(
                  frozenUser.id,
                  frozenUser,
                  resolveEffectiveStreakTimezone(frozenUser.timezone),
                  freezeNowMs
                ).then((syncRes) => {
                  if (!syncRes.ok) {
                    setStreakSyncError('Cloud streak freeze sync paused. Local freeze is preserved.');
                  }
                });
              }
              setStreakSyncError(null);
              triggerConfetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });
            }}
            onUpdateStreakGoal={(goalDays) => {
              handleUpdateUser({ ...userRef.current, streakGoalDays: goalDays });
            }}
            streakRemindersEnabled={Boolean(settings.streakReminders)}
            streakReminderTime={settings.streakReminderTime || DEFAULT_STREAK_REMINDER_TIME}
            onToggleStreakReminders={(enabled) => {
              handleUpdateSettings({ streakReminders: enabled });
            }}
          />
        </Suspense>
      )}

      {/* ANDROID, IOS & DESKTOP INSTALL MODAL */}
      {isInstallModalOpen && (
        <Suspense fallback={null}>
          <InstallAppModal
            isOpen={isInstallModalOpen}
            onClose={() => setIsInstallModalOpen(false)}
          />
        </Suspense>
      )}

      {/* FIRST-TIME VERIFIED USER ONBOARDING */}
      {showOnboarding && isAuthenticatedVerified && user.isLoggedIn && (
        <Suspense fallback={null}>
          <OnboardingModal
            user={user}
            onComplete={(data) => {
              const nextUser: UserProfile = {
                ...user,
                name: data.name,
                nickname: data.nickname,
                age: data.age,
                onboardingCompleted: true,
                country: data.country,
                countryFlag: data.countryFlag,
                isManualCountry: data.isManualCountry,
              };
              saveUserLocalExtras(user.id, {
                nickname: data.nickname,
                age: data.age,
                onboardingCompleted: true,
                country: data.country,
                countryFlag: data.countryFlag,
                isManualCountry: data.isManualCountry,
              });
              handleUpdateUser(nextUser);
              setShowOnboarding(false);
            }}
          />
        </Suspense>
      )}
      </div>
    </>
  );
}
