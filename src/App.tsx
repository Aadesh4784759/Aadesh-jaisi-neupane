import React, { useState, useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
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
  UserProfile,
} from './types';
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
  getUserLocalExtras,
  saveUserLocalExtras,
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
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS } from './data/languages';
import { detectUserCountry, detectCountryApproxViaIP, resolveCountryForProfile } from './utils/country';
import { Header } from './components/Header';
import { NavigationDock, BottomNavTab } from './components/NavigationDock';
import { FuturisticBackground } from './components/FuturisticBackground';
import { ChatView } from './components/ChatView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { TransferView } from './components/TransferView';
import { VoicePage } from './components/VoicePage';
import { MoreView } from './components/MoreView';
import { SettingsView } from './components/SettingsView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { MandatoryAuthGate } from './components/MandatoryAuthGate';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { GamificationModal } from './components/GamificationModal';
import { InstallAppModal } from './components/InstallAppModal';
import { SplashScreen } from './components/SplashScreen';
import {
  recordGamificationActivity,
  evaluateCurrentStreakOnLoad,
  evaluateStreakStateOnRead,
  applyDailyActivityToStreakState,
  isStreakRecoveryEligible,
  recoverBrokenStreakState,
  generateStreakHistory,
} from './utils/gamification';
import { voiceAssistant } from './utils/speech';
import { applyAvatarDynamicTheme, COLOR_THEME_PRESETS } from './utils/avatarTheme';
import {
  subscribeToAuth,
  syncUserProfileToFirestore,
  loadUserProfileFromFirestore,
  loadConversationsFromFirestore,
  loadMemoriesFromFirestore,
  saveConversationAndMessagesToFirestore,
  saveSingleMessageToFirestore,
  deleteConversationFromFirestore,
  recordUsageAnalyticsToFirestore,
  subscribeToPlatformAnnouncement,
  getAuthHeaders,
  logOut,
} from './utils/firebase';

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
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register' | 'profile'>('signin');
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [aiHealth, setAiHealth] = useState<AIConnectionHealth>({
    state: 'connecting',
    backendConnected: false,
    geminiConnected: false,
    model: 'gemini-4-hydrogen',
    checkedAt: null,
    lastConnectedAt: null,
  });
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
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef<boolean>(false);
  const activeFbUidRef = useRef<string | null>(null);
  const [fbAuthUser, setFbAuthUser] = useState<FirebaseUser | null>(null);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [welcomeBackName, setWelcomeBackName] = useState<string | null>(null);
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

  const hydrateVerifiedUserSession = async (fbUser: FirebaseUser) => {
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

    const fsProfile = await loadUserProfileFromFirestore(fbUser.uid).catch(() => null);
    if (activeFbUidRef.current !== fbUser.uid) return;

    const extras = getUserLocalExtras(fbUser.uid);
    const nowMs = Date.now();
    const previousLastSeen = extras.lastSeenAt || fsProfile?.lastActiveAt;
    saveUserLocalExtras(fbUser.uid, { lastSeenAt: nowMs });

    const resolvedCountryInfo = resolveCountryForProfile({
      savedCountry: extras.country || fsProfile?.country,
      savedCountryCode: extras.countryCode || (fsProfile as any)?.countryCode,
      savedFlag: extras.countryFlag || fsProfile?.countryFlag,
      savedTimezone: extras.timezone || (fsProfile as any)?.timezone,
      savedMethod: extras.countryDetectionMethod || (fsProfile as any)?.countryDetectionMethod,
      isManual: extras.isManualCountry || (fsProfile as any)?.isManualCountry,
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

    if (previousLastSeen && nowMs - previousLastSeen >= 5 * 60 * 60 * 1000) {
      const greetingTarget = resolvedNickname || resolvedName.split(/\s+/)[0] || 'Friend';
      setWelcomeBackName(greetingTarget);
      window.setTimeout(() => {
        setWelcomeBackName((cur) => (cur === greetingTarget ? null : cur));
      }, 5500);
    }

    setUser((prev) => {
      const baseUser = prev.id === fbUser.uid ? prev : { ...DEFAULT_USER };
      const hasFsProfile = Boolean(fsProfile && typeof fsProfile === 'object');
      const resolvedTz = resolvedCountryInfo.timeZone;

      // Authoritative Firestore streak record cross-referenced with user timezone and lastActiveDate
      const rawState = {
        currentStreak: hasFsProfile
          ? Number((fsProfile as any)?.currentStreak ?? (fsProfile as any)?.streakDays ?? 0)
          : Number(baseUser.currentStreak ?? baseUser.streakDays ?? 0),
        longestStreak: hasFsProfile
          ? Math.max(
              Number((fsProfile as any)?.longestStreak || 0),
              Number((fsProfile as any)?.currentStreak ?? (fsProfile as any)?.streakDays ?? 0)
            )
          : Math.max(Number(baseUser.longestStreak || 0), Number(baseUser.currentStreak ?? baseUser.streakDays ?? 0)),
        lastActiveDate: hasFsProfile
          ? (fsProfile as any)?.lastActiveDate || ''
          : baseUser.lastActiveDate || '',
        timezone: resolvedTz,
        recoveryCount: hasFsProfile
          ? Number((fsProfile as any)?.recoveryCount ?? 0)
          : Number(baseUser.recoveryCount ?? 0),
        recoveryMonth: hasFsProfile
          ? (fsProfile as any)?.recoveryMonth || ''
          : baseUser.recoveryMonth || '',
        streakBeforeBreak: hasFsProfile
          ? Number((fsProfile as any)?.streakBeforeBreak ?? 0)
          : Number(baseUser.streakBeforeBreak ?? 0),
        streakBrokenDate: hasFsProfile
          ? (fsProfile as any)?.streakBrokenDate || ''
          : baseUser.streakBrokenDate || '',
      };

      const evaluatedStreakState = evaluateStreakStateOnRead(rawState, nowMs, resolvedTz);
      const streakHist =
        baseUser.streakHistory &&
        baseUser.streakHistory.length > 0 &&
        baseUser.streakDays === evaluatedStreakState.currentStreak
          ? baseUser.streakHistory
          : generateStreakHistory(evaluatedStreakState.currentStreak, undefined, resolvedTz, nowMs);

      const updated: UserProfile = {
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
        timezone: resolvedCountryInfo.timeZone,
        countryDetectionMethod: resolvedCountryInfo.method,
        isManualCountry: resolvedCountryInfo.isManual,
        streakDays: evaluatedStreakState.currentStreak,
        currentStreak: evaluatedStreakState.currentStreak,
        longestStreak: evaluatedStreakState.longestStreak,
        lastActiveDate: evaluatedStreakState.lastActiveDate,
        recoveryCount: evaluatedStreakState.recoveryCount,
        recoveryMonth: evaluatedStreakState.recoveryMonth,
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
      saveStoredUser(updated);
      syncUserProfileToFirestore(sanitizeUserForFirestore(updated)).catch(() => {});
      return updated;
    });

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
        if (!cloudMems.length || activeFbUidRef.current !== fbUser.uid) return;
        const localMems = getStoredMemories(fbUser.uid);
        const map = new Map<string, AIMemoryItem>();
        for (const m of localMems) map.set(m.id, m);
        for (const cm of cloudMems) {
          const existing = map.get(cm.id);
          if (!existing || cm.updatedAt >= existing.updatedAt) {
            map.set(cm.id, cm);
          }
        }
        saveStoredMemories(
          Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt),
          fbUser.uid
        );
      });
    }

    // If auto-detection fell back to 'Global', try approximate region lookup once without requesting GPS
    if (!resolvedCountryInfo.isManual && resolvedCountryInfo.country === 'Global') {
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
            timezone: ipOption.timeZone || prev.timezone,
            countryDetectionMethod: 'ip',
          };
          saveStoredUser(updated);
          syncUserProfileToFirestore(sanitizeUserForFirestore(updated)).catch(() => {});
          return updated;
        });
      });
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
        handleUpdateSettings({
          colorTheme: themePreset.id,
          theme: themePreset.themeMode || 'dark',
        });
      }
    }

    try {
      const sessionHeaders = await getAuthHeaders();
      fetch('/api/auth/session', { headers: sessionHeaders }).catch(() => {});
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

    vv.addEventListener('resize', updateKeyboardState);
    window.addEventListener('focusin', updateKeyboardState);
    window.addEventListener('focusout', updateKeyboardState);
    return () => {
      vv.removeEventListener('resize', updateKeyboardState);
      window.removeEventListener('focusin', updateKeyboardState);
      window.removeEventListener('focusout', updateKeyboardState);
    };
  }, []);

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

  // Real-time AI & Backend connectivity verification
  const checkAIHealth = async (forceRefresh = false) => {
    if (!isBrowserOnline || settings.offlineModeForce) {
      setAiHealth((prev) => ({
        ...prev,
        state: 'offline',
        backendConnected: false,
        geminiConnected: false,
        checkedAt: Date.now(),
        error: settings.offlineModeForce
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
      error: undefined,
    }));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7500);

    try {
      const headers: Record<string, string> = {};
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }
      const url = forceRefresh ? '/api/health?force=1' : '/api/health';
      const res = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        setAiHealth((prev) => ({
          ...prev,
          state: 'offline',
          backendConnected: false,
          geminiConnected: false,
          checkedAt: Date.now(),
          error: `Backend returned HTTP ${res.status}.`,
        }));
        setInitError(`Backend server unavailable (HTTP ${res.status}).`);
        return;
      }

      const data = await res.json();
      const nowMs = Date.now();
      const geminiOk = Boolean(data.geminiConnected ?? data.isLiveAI);
      const serverLastConnMs = data.lastConnectedAt ? new Date(data.lastConnectedAt).getTime() : null;

      setAiHealth((prev) => ({
        state: geminiOk ? 'connected' : 'error',
        backendConnected: data.backendConnected !== false,
        geminiConnected: geminiOk,
        model: data.model || prev.model || 'gemini-4-hydrogen',
        checkedAt: nowMs,
        lastConnectedAt: geminiOk
          ? nowMs
          : serverLastConnMs && !Number.isNaN(serverLastConnMs)
          ? serverLastConnMs
          : prev.lastConnectedAt,
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        error: geminiOk ? undefined : data.error || 'Google Gemini API is currently unavailable.',
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
  }, [isBrowserOnline, settings.offlineModeForce, settings.customGeminiApiKey]);

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveStoredSettings(updated);
      return updated;
    });
    if (newSettings.memoryConsent && user.id) {
      saveUserLocalExtras(user.id, { memoryConsent: newSettings.memoryConsent });
    }
    if ((newSettings.colorTheme || newSettings.theme || newSettings.memoryConsent) && user.isLoggedIn) {
      const themeToSave =
        newSettings.colorTheme || (newSettings.theme === 'light' ? 'pure-light' : 'dark-galaxy');
      syncUserProfileToFirestore(
        sanitizeUserForFirestore({
          ...user,
          ...((newSettings.colorTheme || newSettings.theme) ? { preferredTheme: themeToSave } : {}),
          ...(newSettings.memoryConsent ? { memoryConsent: newSettings.memoryConsent } : {}),
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
      targetLanguage: settings.defaultTargetLanguage,
      messages: [],
    };

  const handleStopGeneration = () => {
    stopRequestedRef.current = true;
    if (activeChatAbortRef.current) {
      activeChatAbortRef.current.abort();
    }
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
    const memoryContext =
      settingsRef.current.memoryConsent === 'agreed' &&
      settingsRef.current.aiMemoryEnabled !== false
        ? getStoredMemories(user.id)
            .filter((m) => m.approved)
            .map((m) => `[${m.category}] ${m.content}`)
        : [];

    try {
      let translation = '';
      let detectedLanguage = 'en';
      let sentiment: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral' = 'positive';
      let suggestedQuestions: string[] = [];
      let geotagInsights: string | undefined = undefined;
      let modelUsed: string | undefined = undefined;
      let latencyMs = 280;

      const shouldStream =
        isOnline &&
        settings.streamingResponses !== false &&
        !params.imageData;

      if (!isOnline) {
        latencyMs = 120;
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];

        if (params.imageData) {
          reply = `[Offline Local Engine] Registered your photo${
            params.location ? ` tagged at ${params.location.name}` : ''
          }.`;
          translation = `[${targetLangObj.name} Offline] Photo registered locally.`;
        } else {
          reply = `[Offline Mode] Recorded: "${params.text || params.attachmentName}". Reconnect for live Gemini reasoning.`;
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
          ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
        });

        const streamRes = await fetch('/api/chat/stream', {
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
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            responseMode: settings.aiResponseMode || 'balanced',
            location: params.location,
            memoryContext,
            customApiKey: settings.customGeminiApiKey,
          }),
        });

        if (!streamRes.ok || !streamRes.body) {
          const errData = await streamRes.json().catch(() => ({}));
          throw new Error(errData.error || `Streaming error (${streamRes.status})`);
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        const processRawEvents = (events: string[]) => {
          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine.startsWith('data:')) continue;
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
              } catch (parseErr: any) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            sseBuffer += decoder.decode();
            break;
          }
          sseBuffer += decoder.decode(value, { stream: true });
          sseBuffer = sseBuffer.replace(/\r\n/g, '\n');

          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';
          processRawEvents(events);
        }

        if (sseBuffer.trim()) {
          sseBuffer = sseBuffer.replace(/\r\n/g, '\n');
          processRawEvents(sseBuffer.split('\n\n'));
        }

        latencyMs = Date.now() - startTime;

        // If stream yielded no text, automatically fall back to non-streaming /api/chat
        if (!reply.trim()) {
          const fallbackRes = await fetch('/api/chat', {
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
              targetLanguage: params.targetLanguage,
              userLanguage: settings.uiLanguage,
              voicePersona: settings.voicePersona || 'friendly',
              responseMode: settings.aiResponseMode || 'balanced',
              memoryContext,
              customApiKey: settings.customGeminiApiKey,
              mode: 'chat',
            }),
          });
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          if (!fallbackRes.ok) {
            throw new Error(fallbackData.error || `Server returned ${fallbackRes.status}`);
          }
          if (!fallbackData.reply || !String(fallbackData.reply).trim()) {
            throw new Error('The AI service returned an empty response. Please try again.');
          }
          reply = fallbackData.reply;
          translation = fallbackData.translation || '';
          detectedLanguage = fallbackData.detectedLanguage || 'en';
          sentiment = fallbackData.sentiment || 'positive';
          suggestedQuestions = Array.isArray(fallbackData.suggestedQuestions)
            ? fallbackData.suggestedQuestions
            : [];
          geotagInsights = fallbackData.geotagInsights;
          modelUsed = fallbackData.modelUsed || modelUsed;
          latencyMs = fallbackData.latencyMs || Date.now() - startTime;
        }

        setAiHealth((prev) => ({
          ...prev,
          state: 'connected',
          backendConnected: true,
          geminiConnected: true,
          model: modelUsed || prev.model,
          checkedAt: Date.now(),
          lastConnectedAt: Date.now(),
          latencyMs,
          error: undefined,
        }));
      } else {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
          ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
        });

        const res = await fetch('/api/chat', {
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
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            responseMode: settings.aiResponseMode || 'balanced',
            memoryContext,
            location: params.location,
            customApiKey: settings.customGeminiApiKey,
            mode: 'chat',
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
        translation = data.translation || '';
        detectedLanguage = data.detectedLanguage || 'en';
        sentiment = data.sentiment || 'positive';
        suggestedQuestions = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : [];
        geotagInsights = data.geotagInsights;
        modelUsed = data.modelUsed;
        latencyMs = data.latencyMs || Date.now() - startTime;

        if (data.isLiveAI) {
          setAiHealth((prev) => ({
            ...prev,
            state: 'connected',
            backendConnected: true,
            geminiConnected: true,
            model: modelUsed || prev.model,
            checkedAt: Date.now(),
            lastConnectedAt: Date.now(),
            latencyMs,
            error: undefined,
          }));
        } else if (!settings.customGeminiApiKey) {
          setAiHealth((prev) => ({
            ...prev,
            state: 'error',
            backendConnected: true,
            geminiConnected: false,
            checkedAt: Date.now(),
            error: 'Gemini service returned a fallback response.',
          }));
        }
      }

      const modelMessage: ChatMessage = {
        id: modelMsgId,
        role: 'model',
        senderName: 'Aadesh AI',
        content: reply,
        translation,
        translationLanguage: translation ? params.targetLanguage : undefined,
        detectedLanguage,
        sentiment,
        suggestedQuestions,
        geotagInsights,
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

      setSessions((prev) => {
        const nextSessions = prev.map((s) => (s.id === targetSessionId ? finalSession : s));
        saveStoredSessions(nextSessions, user.id);
        return nextSessions;
      });

      if (settings.soundEffects !== false) {
        playSoftNotificationChime();
      }

      // Dedicated backend call for context-aware suggested reply buttons after every AI response
      if (isOnline) {
        const suggestHeaders = await getAuthHeaders({
          'Content-Type': 'application/json',
          ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
        });
        void fetch('/api/chat/suggested-replies', {
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
            customApiKey: settings.customGeminiApiKey,
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
          timeZone: user.timezone,
        }).catch(() => {});
      }

      const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(
        user,
        params.isVoice ? 'voice' : params.imageData ? 'image' : 'chat'
      );
      setUser(updatedUser);
      saveStoredUser(updatedUser);
      if (updatedUser.isLoggedIn) {
        syncUserProfileToFirestore(sanitizeUserForFirestore(updatedUser)).catch(() => {});
      }

      if (newBadgeUnlocked) {
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch {}
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

      if (settingsRef.current.autoSpeakAIResponses && activeTab === 'chat') {
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];
        const activePersonaObj =
          VOICE_PERSONAS.find((p) => p.id === (settingsRef.current.voicePersona || 'friendly')) ||
          VOICE_PERSONAS[3];
        voiceAssistant.speak(translation || reply, targetLangObj.speechCode, {
          rate: settingsRef.current.voiceSpeed ?? 1.0,
          pitch: settingsRef.current.voicePitch ?? activePersonaObj.pitch,
          volume: settingsRef.current.voiceVolume ?? 1.0,
        });
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

      console.error('Chat error:', err);
      const errMsg = String(err?.message || 'Connection error');
      const isNetworkFailure =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(errMsg);
      setAiHealth((prev) => ({
        ...prev,
        state: isNetworkFailure ? 'offline' : 'error',
        backendConnected: !isNetworkFailure,
        geminiConnected: false,
        checkedAt: Date.now(),
        error: errMsg,
      }));
      const errorMessageText = `⚠️ ${err?.message || 'Connection error'}. Please verify your internet connection or Gemini API key in Settings.`;
      const modelErrorMsg: ChatMessage = {
        id: `mod-err-${Date.now()}`,
        role: 'model',
        content: errorMessageText,
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
    setUser(updatedUser);
    saveStoredUser(updatedUser);
    if (updatedUser.id) {
      saveUserLocalExtras(updatedUser.id, {
        country: updatedUser.country,
        countryFlag: updatedUser.countryFlag,
        isManualCountry: updatedUser.isManualCountry,
        avatarColor: updatedUser.avatarColor,
        ...(updatedUser.avatarUrl?.startsWith('data:')
          ? { customAvatarDataUrl: updatedUser.avatarUrl }
          : {}),
      });
    }
    if (updatedUser.isLoggedIn) {
      syncUserProfileToFirestore(sanitizeUserForFirestore(updatedUser)).catch(() => {});
    }
  };

  const handleRecoverStreak = () => {
    const res = recoverBrokenStreakState(user);
    if (!res.ok) {
      return;
    }
    const updated: UserProfile = {
      ...user,
      ...res.nextState,
      streakDays: res.nextState.currentStreak,
    };
    handleUpdateUser(updated);
  };

  const handleSignOut = async () => {
    activeFbUidRef.current = null;
    setShowOnboarding(false);
    setWelcomeBackName(null);
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
      targetLanguage: settings.defaultTargetLanguage,
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

    const targetLangObj =
      SUPPORTED_LANGUAGES.find((l) => l.code === targetLangCode) || SUPPORTED_LANGUAGES[0];

    let translatedText = '';
    let latencyMs = 150;

    if (!isOnline) {
      translatedText = `[Offline Translated (${targetLangObj.name})] ${targetMsg.content}`;
    } else {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
        ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
      });

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: targetMsg.content,
          sourceLang: targetMsg.detectedLanguage || 'auto',
          targetLang: targetLangCode,
          customApiKey: settings.customGeminiApiKey,
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

    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
    } catch {}
  };

  const handleDeleteMedia = (id: string) => {
    const updated = mediaItems.filter((m) => m.id !== id);
    setMediaItems(updated);
    saveStoredMedia(updated);
  };

  const handleImageGenerated = (latencyMs: number) => {
    const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(user, 'image');
    setUser(updatedUser);
    saveStoredUser(updatedUser);
    if (newBadgeUnlocked) {
      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
      } catch {}
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
        <div className="app-shell-scroll relative flex flex-col justify-center items-center min-h-screen max-w-full overflow-x-hidden">
          <FuturisticBackground theme={settings.theme} />
        </div>
      </>
    );
  }

  if (!isAuthenticatedVerified) {
    return (
      <>
        {splashOverlay}
        <div className="app-shell-scroll relative flex flex-col min-h-screen max-w-full overflow-x-hidden selection:bg-purple-500/30 selection:text-purple-200">
          <FuturisticBackground theme={settings.theme} />
          <MandatoryAuthGate
            firebaseUser={fbAuthUser}
            onVerifiedComplete={(verifiedUser) => {
              setFbAuthUser(verifiedUser);
              void hydrateVerifiedUserSession(verifiedUser);
            }}
          />
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
        } relative flex flex-col justify-between selection:bg-purple-500/30 selection:text-purple-200 max-w-full overflow-x-hidden`}
      >
        {/* Futuristic Purple/Violet/Lavender 3D Liquid Waves, Orbs, Bubbles & Particles */}
        <FuturisticBackground theme={settings.theme} />

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* CLEAN TOP HEADER (Logo + Live AI Status on Left | Animated Profile Panel & Dropdown on Right) */}
      <Header
        user={user}
        aiHealth={aiHealth}
        isNetworkOnline={isOnline}
        onRetryHealth={() => void checkAIHealth(true)}
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
            mediaItems={mediaItems}
            onAddMedia={handleAddMedia}
            onDeleteMedia={handleDeleteMedia}
            user={user}
            settings={settings}
            isOnline={isOnline}
            isLoading={isLoading}
            searchFilter={searchQuery}
            onSearchChange={setSearchQuery}
            isKeyboardOpen={isKeyboardOpen}
            externalDraft={chatDraft}
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
      />

      {/* MULTI-ACCOUNT AUTH MODAL */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={user}
        onUpdateUser={handleUpdateUser}
        onSignOut={handleSignOut}
        initialMode={authModalMode}
      />

      {/* GAMIFICATION & STREAKS MODAL */}
      <GamificationModal
        isOpen={isGamificationModalOpen}
        onClose={() => setIsGamificationModalOpen(false)}
        user={user}
        onRecoverStreak={handleRecoverStreak}
      />

      {/* ANDROID, IOS & DESKTOP INSTALL MODAL */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* FIRST-TIME VERIFIED USER ONBOARDING */}
      {showOnboarding && isAuthenticatedVerified && user.isLoggedIn && (
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
      )}
      </div>
    </>
  );
}
