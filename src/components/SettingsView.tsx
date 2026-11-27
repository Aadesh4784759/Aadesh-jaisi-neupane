import React, { Suspense, useState, useRef, useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  User,
  Settings as SettingsIcon,
  Globe,
  Mic,
  Volume2,
  Bell,
  Shield,
  LogOut,
  Edit3,
  Check,
  Copy,
  Camera,
  Flame,
  Mail,
  Calendar,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Trash2,
  Download,
  Palette,
  Play,
  MapPin,
  Cpu,
  Lock,
  Fingerprint,
  Activity,
  Eye,
  Zap,
  Sliders,
  Database,
  BellRing,
  Clock,
  FileCode,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Languages,
  History,
  RefreshCw,
} from 'lucide-react';
import {
  AIConnectionHealth,
  AIMemoryItem,
  AppSettings,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  LoginActivityEntry,
  MemoryCategory,
  UserProfile,
  VoicePersona,
} from '../types';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS } from '../data/languages';
import {
  COUNTRY_OPTIONS,
  detectUserCountry,
  detectCountryApproxViaIP,
  detectCountryViaGPSDetailed,
} from '../utils/country';
import {
  clearAllMemoriesFromFirestore,
  deleteMemoryFromFirestore,
  saveMemoryToFirestore,
  updateUserProfile,
} from '../utils/firebase';
import {
  getLastStreakReminderDate,
  getStoredLoginActivity,
  getStoredMemories,
  saveStoredMemories,
  saveUserLocalExtras,
} from '../utils/storage';
import { containsSecretOrCredential, extractMemoryKeywords } from '../utils/powerMemory';
import { voiceAssistant } from '../utils/speech';
import { downloadChatHistoryFile } from '../utils/exportHistory';
import { resolveEffectiveStreakTimezone } from '../utils/gamification';
import {
  DEFAULT_STREAK_REMINDER_TIME,
  evaluateNepalEveningReminder,
  getBrowserNotificationPermission,
  parseReminderTime,
  requestStreakReminderPermission,
  triggerLocalStreakNotification,
} from '../utils/streakReminder';
import {
  AVATAR_COLOR_PRESETS,
  COLOR_THEME_PRESETS,
  ColorThemePreset,
  DEFAULT_AVATAR_COLOR,
  applyAvatarDynamicTheme,
  generateThemeTokensFromColor,
} from '../utils/avatarTheme';
import {
  AI_PROVIDER_METADATA,
  AIProviderId,
  AIProviderStatusInfo,
  getProviderStatusLabel,
  normalizeProviderStatusInfo,
  resolveProviderHealthDisplay,
} from '../utils/aiProviders';
import { getNotificationReadinessSnapshot } from '../utils/notifications';
import { AIProviderSelector } from './AIProviderSelector';
import { LiveAIControlCenter } from './LiveAIControlCenter';
import { PowerMemorySection } from './PowerMemorySection';

const LazyTermsPrivacyModal = React.lazy(() =>
  import('./TermsPrivacyModal').then((m) => ({ default: m.TermsPrivacyModal }))
);

interface SettingsViewProps {
  initialSection?: 'profile' | 'settings';
  user: UserProfile;
  settings: AppSettings;
  sessions: ChatSession[];
  mediaItems: GeotaggedMedia[];
  metrics?: EngagementMetrics;
  aiHealth?: AIConnectionHealth;
  providersStatus?: Partial<Record<AIProviderId, AIProviderStatusInfo>> | null;
  isLoadingProvidersStatus?: boolean;
  testingProviderId?: AIProviderId | null;
  onRefreshProvidersStatus?: () => void;
  onTestProvider?: (
    providerId: AIProviderId,
    modelId?: string
  ) => Promise<{ ok: boolean; message: string; modelUsed?: string; latencyMs?: number }>;
  fbAuthUser?: FirebaseUser | null;
  isOnline: boolean;
  isOwnerAdmin: boolean;
  onUpdateUser: (updated: UserProfile) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onToggleForceOffline: () => void;
  onClearAllData: () => void;
  onSignOut: () => void;
  onOpenInstall: () => void;
  onOpenAdmin: () => void;
  onOpenFullBackup: () => void;
  memories?: AIMemoryItem[];
  onAddMemory?: (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
  }) => { ok: boolean; error?: string };
  onUpdateMemory?: (id: string, patch: { category?: MemoryCategory; content?: string }) => {
    ok: boolean;
    error?: string;
  };
  onToggleMemoryApproved?: (id: string) => void;
  onDeleteMemory?: (id: string) => void;
  onClearAllMemories?: () => Promise<void> | void;
}

const PillSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl v2-neu-inset border border-white/10 hover:border-sky-400/35 text-left transition-all cursor-pointer"
  >
    <div className="min-w-0">
      <div className="text-xs font-bold text-white">{label}</div>
      {description && <div className="text-[11px] text-purple-200/65 mt-0.5">{description}</div>}
    </div>
    <span
      className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
        checked ? 'bg-gradient-to-r from-sky-500 to-purple-500 justify-end' : 'bg-white/15 justify-start'
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-md" />
    </span>
  </button>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSection = 'settings',
  user,
  settings,
  sessions,
  metrics,
  aiHealth,
  providersStatus = null,
  isLoadingProvidersStatus = false,
  testingProviderId = null,
  onRefreshProvidersStatus,
  onTestProvider,
  fbAuthUser,
  isOnline,
  isOwnerAdmin,
  onUpdateUser,
  onUpdateSettings,
  onToggleForceOffline,
  onClearAllData,
  onSignOut,
  onOpenInstall,
  onOpenAdmin,
  onOpenFullBackup,
  memories: propMemories,
  onAddMemory,
  onUpdateMemory,
  onToggleMemoryApproved,
  onDeleteMemory,
  onClearAllMemories,
}) => {
  const [section, setSection] = useState<'profile' | 'settings'>(initialSection);
  const [localMemories, setLocalMemories] = useState<AIMemoryItem[]>(() => getStoredMemories(user.id));
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name || '');
  const [editNickname, setEditNickname] = useState(user.nickname || '');
  const [editAge, setEditAge] = useState(user.age ? String(user.age) : '');
  const [editCountry, setEditCountry] = useState(user.country || 'Global');
  const [editCountryCode, setEditCountryCode] = useState(user.countryCode || 'GLOBAL');
  const [editFlag, setEditFlag] = useState(user.countryFlag || '🌐');
  const [editTimezone, setEditTimezone] = useState(user.timezone || '');
  const [editCountryMethod, setEditCountryMethod] = useState<'gps' | 'ip' | 'manual' | 'timezone' | undefined>(
    user.countryDetectionMethod || (user.isManualCountry ? 'manual' : undefined)
  );
  const [editAvatar, setEditAvatar] = useState(user.avatarUrl || '');
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsFeedback, setGpsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    getBrowserNotificationPermission()
  );
  const [reminderTestNotice, setReminderTestNotice] = useState<string | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{
    format: 'json' | 'md';
    filename: string;
    sessionCount: number;
    messageCount: number;
    kbLabel: string;
  } | null>(null);
  const [biometricHardwareAvailable, setBiometricHardwareAvailable] = useState<boolean | null>(null);
  const [loginActivity, setLoginActivity] = useState<LoginActivityEntry[]>(() =>
    getStoredLoginActivity(user.id)
  );
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const themeCarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setEditName(user.name || '');
    setEditNickname(user.nickname || '');
    setEditAge(user.age ? String(user.age) : '');
    setEditCountry(user.country || 'Global');
    setEditCountryCode(user.countryCode || 'GLOBAL');
    setEditFlag(user.countryFlag || '🌐');
    setEditTimezone(user.timezone || '');
    setEditCountryMethod(user.countryDetectionMethod || (user.isManualCountry ? 'manual' : undefined));
    setEditAvatar(user.avatarUrl || '');
    setLoginActivity(getStoredLoginActivity(user.id));
    if (!propMemories) {
      setLocalMemories(getStoredMemories(user.id));
    }
  }, [user, propMemories]);

  const effectiveMemories = propMemories ?? localMemories;

  const fallbackAddMemory = (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
  }) => {
    const clean = input.content.trim();
    if (!clean) return { ok: false, error: 'Please write a memory before saving.' };
    if (containsSecretOrCredential(clean)) {
      return { ok: false, error: 'Blocked: passwords, tokens, and API keys cannot be saved.' };
    }
    const now = Date.now();
    const item: AIMemoryItem = {
      id: `mem-${now}`,
      userId: user.id,
      category: input.category,
      content: clean,
      approved: true,
      source: input.source || 'manual',
      keywords: extractMemoryKeywords(clean),
      createdAt: now,
      updatedAt: now,
    };
    const next = [item, ...effectiveMemories];
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn) void saveMemoryToFirestore(user.id, item);
    return { ok: true };
  };

  const fallbackUpdateMemory = (id: string, patch: { category?: MemoryCategory; content?: string }) => {
    const clean = patch.content?.trim();
    if (patch.content !== undefined && !clean) {
      return { ok: false, error: 'Memory text cannot be empty.' };
    }
    if (clean && containsSecretOrCredential(clean)) {
      return { ok: false, error: 'Blocked: passwords, tokens, and API keys cannot be saved.' };
    }
    let updatedItem: AIMemoryItem | undefined;
    const next = effectiveMemories.map((m) => {
      if (m.id !== id) return m;
      updatedItem = {
        ...m,
        ...(patch.category ? { category: patch.category } : {}),
        ...(clean ? { content: clean, keywords: extractMemoryKeywords(clean) } : {}),
        updatedAt: Date.now(),
      };
      return updatedItem;
    });
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn && updatedItem) void saveMemoryToFirestore(user.id, updatedItem);
    return { ok: true };
  };

  const fallbackToggleApproved = (id: string) => {
    let updatedItem: AIMemoryItem | undefined;
    const next = effectiveMemories.map((m) => {
      if (m.id !== id) return m;
      updatedItem = { ...m, approved: !m.approved, updatedAt: Date.now() };
      return updatedItem;
    });
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn && updatedItem) void saveMemoryToFirestore(user.id, updatedItem);
  };

  const fallbackDeleteMemory = (id: string) => {
    const next = effectiveMemories.filter((m) => m.id !== id);
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn) void deleteMemoryFromFirestore(user.id, id);
  };

  const fallbackClearMemories = async () => {
    setLocalMemories([]);
    saveStoredMemories([], user.id);
    if (user.isLoggedIn) await clearAllMemoriesFromFirestore(user.id);
  };

  useEffect(() => {
    const clampedSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
    voiceAssistant.configure({
      rate: clampedSpeed,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
  }, [settings.voiceSpeed, settings.voicePitch, settings.voiceVolume]);

  useEffect(() => {
    let active = true;
    const checkHardware = async () => {
      try {
        const fn = (window.PublicKeyCredential as any)?.isUserVerifyingPlatformAuthenticatorAvailable;
        if (typeof fn === 'function') {
          const ok = await fn();
          if (active) setBiometricHardwareAvailable(Boolean(ok));
        } else if (active) {
          setBiometricHardwareAvailable(false);
        }
      } catch {
        if (active) setBiometricHardwareAvailable(false);
      }
    };
    void checkHardware();
    return () => {
      active = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  const avatarTokens = generateThemeTokensFromColor(user.avatarColor || DEFAULT_AVATAR_COLOR);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.84);
        setEditAvatar(compressed);
        setIsEditingProfile(true);
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = editName.trim() || user.name || 'User';
    const cleanNickname = editNickname.trim() || undefined;
    const parsedAgeNum = editAge.trim() ? Number(editAge.trim()) : undefined;
    const validAge =
      typeof parsedAgeNum === 'number' &&
      Number.isFinite(parsedAgeNum) &&
      parsedAgeNum >= 1 &&
      parsedAgeNum <= 130
        ? Math.floor(parsedAgeNum)
        : undefined;

    setSavingProfile(true);
    try {
      const matchedOpt = COUNTRY_OPTIONS.find(
        (c) => c.country === editCountry || (editCountryCode && c.code === editCountryCode)
      );
      const resolvedCode =
        editCountry === 'Global'
          ? 'GLOBAL'
          : (editCountryCode && editCountryCode !== 'GLOBAL' ? editCountryCode : matchedOpt?.code || 'GLOBAL');
      const resolvedTz = editTimezone || matchedOpt?.timeZone || user.timezone;
      const isManualChoice = editCountryMethod === 'manual';

      saveUserLocalExtras(user.id, {
        nickname: cleanNickname,
        age: validAge,
        onboardingCompleted: true,
        country: editCountry,
        countryCode: resolvedCode,
        countryFlag: editFlag,
        timezone: resolvedTz,
        countryDetectionMethod: editCountryMethod,
        isManualCountry: isManualChoice,
        ...(editAvatar.startsWith('data:') ? { customAvatarDataUrl: editAvatar } : {}),
      });

      if (user.isLoggedIn) {
        const fbPayload: { displayName?: string; photoURL?: string } = { displayName: cleanName };
        if (editAvatar && !editAvatar.startsWith('data:') && editAvatar.length < 1000) {
          fbPayload.photoURL = editAvatar;
        }
        await updateUserProfile(fbPayload).catch(() => {});
      }

      onUpdateUser({
        ...user,
        name: cleanName,
        nickname: cleanNickname,
        age: validAge,
        onboardingCompleted: true,
        country: editCountry,
        countryCode: resolvedCode,
        countryFlag: editFlag,
        timezone: resolvedTz,
        countryDetectionMethod: editCountryMethod,
        isManualCountry: isManualChoice,
        avatarUrl: editAvatar,
      });

      setIsEditingProfile(false);
      showToast('Profile updated successfully.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleNotifications = async () => {
    const nextVal = !(settings.notificationsEnabled ?? true);
    if (nextVal && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      } catch {}
    }
    onUpdateSettings({ notificationsEnabled: nextVal });
    showToast(nextVal ? 'Notifications enabled.' : 'Notifications muted.');
  };

  const streakRemindersEnabled = settings.streakReminders ?? true;
  const preferredReminderTime = parseReminderTime(
    settings.streakReminderTime || DEFAULT_STREAK_REMINDER_TIME
  );
  const effectiveStreakTz = resolveEffectiveStreakTimezone(user.timezone);
  const streakReminderStatus = evaluateNepalEveningReminder({
    enabled: streakRemindersEnabled,
    lastActiveDate: user.lastActiveDate,
    lastNotifiedDateKey: getLastStreakReminderDate(user.id),
    preferredTime: preferredReminderTime.normalized,
    timeZone: effectiveStreakTz,
  });

  const handleToggleDailyStreakReminder = async () => {
    const nextVal = !streakRemindersEnabled;
    if (nextVal) {
      const perm = await requestStreakReminderPermission();
      setNotifPermission(perm);
      onUpdateSettings({
        streakReminders: true,
        streakReminderTime: preferredReminderTime.normalized,
      });
      if (perm === 'granted') {
        setReminderTestNotice(
          `Daily streak reminder enabled for ${preferredReminderTime.label12h} (${effectiveStreakTz}).`
        );
        showToast(`Streak reminder active at ${preferredReminderTime.label12h}.`);
      } else if (perm === 'denied') {
        setReminderTestNotice(
          'Notifications are currently blocked in browser site settings. See the warning guide below to allow push alerts.'
        );
        showToast('Reminder saved — allow browser notifications to receive push alerts.');
      } else {
        setReminderTestNotice(
          perm === 'unsupported'
            ? 'Preference saved, though this view does not support browser Notification popups.'
            : 'Click "Allow & Test Alert" below when ready to grant browser notification permission.'
        );
        showToast('Daily streak reminder enabled.');
      }
      return;
    }

    onUpdateSettings({ streakReminders: false });
    setReminderTestNotice('Daily streak reminder paused.');
    showToast('Daily streak reminders paused.');
  };

  const handleReminderTimeChange = (rawTime: string) => {
    const parsed = parseReminderTime(rawTime);
    onUpdateSettings({ streakReminderTime: parsed.normalized });
    setReminderTestNotice(
      `Preferred reminder time updated to ${parsed.label12h} (${effectiveStreakTz}).`
    );
    showToast(`Streak reminder time set to ${parsed.label12h}.`);
  };

  const handleTestDailyStreakNotification = async () => {
    let perm = getBrowserNotificationPermission();
    if (perm === 'default') {
      perm = await requestStreakReminderPermission();
    }
    setNotifPermission(perm);
    if (perm !== 'granted') {
      setReminderTestNotice(
        perm === 'denied'
          ? 'Push alerts are blocked by your browser. Click the site lock/settings icon in the address bar and set Notifications to "Allow".'
          : 'Browser notification permission is required before a push alert can be displayed.'
      );
      return;
    }
    const sent = await triggerLocalStreakNotification({
      currentStreak: user.currentStreak ?? user.streakDays ?? 0,
      userName: user.nickname || user.name,
      preferredTime: preferredReminderTime.normalized,
      timeZone: effectiveStreakTz,
      isTest: true,
    });
    setReminderTestNotice(
      sent
        ? `Test alert sent! Your daily streak reminder is scheduled for ${preferredReminderTime.label12h} (${effectiveStreakTz}).`
        : 'Unable to display notification in the current browser window.'
    );
  };

  const handleExportAllSessionsBackup = (format: 'json' | 'md') => {
    const fallbackSession: ChatSession = sessions[0] || {
      id: 'empty-backup-session',
      title: 'Empty Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.aiResponseLanguage || settings.defaultTargetLanguage || 'en',
      messages: [],
    };
    const result = downloadChatHistoryFile({
      scope: 'all',
      format,
      currentSession: fallbackSession,
      allSessions: sessions,
      userName: user.nickname || user.name,
    });
    const kbLabel =
      result.byteSize >= 1024
        ? `${(result.byteSize / 1024).toFixed(1)} KB`
        : `${result.byteSize} B`;
    setBackupFeedback({
      format,
      filename: result.filename,
      sessionCount: result.sessionCount,
      messageCount: result.messageCount,
      kbLabel,
    });
    showToast(`Exported ${result.sessionCount} chat sessions as ${format.toUpperCase()}.`);
  };

  const applyVoiceSpeed = (rawSpeed: number) => {
    const nextSpeed = Math.max(0.5, Math.min(2.0, Number(rawSpeed.toFixed(2))));
    voiceAssistant.setPlaybackSpeed(nextSpeed);
    voiceAssistant.configure({
      rate: nextSpeed,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
    onUpdateSettings({ voiceSpeed: nextSpeed });
  };

  const handleTestVoice = () => {
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    const clampedSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
    voiceAssistant.configure({
      rate: clampedSpeed,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
    voiceAssistant.speak(
      `Hello ${user.name || 'friend'}! Aadesh AI voice is active at ${clampedSpeed.toFixed(2)}x speed.`,
      targetLangObj?.speechCode || 'en-US',
      { rate: clampedSpeed }
    );
  };

  const createdDateStr = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Active Session';

  const mfaEnrolled = Boolean((fbAuthUser as any)?.multiFactor?.enrolledFactors?.length);
  const emailVerified = Boolean(fbAuthUser?.emailVerified);

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {toast && (
        <div className="fixed top-18 right-4 z-50 v2-neu-card rounded-2xl px-4 py-2.5 border border-sky-400/50 text-xs font-semibold text-white flex items-center gap-2 shadow-xl">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Section Switcher: Profile vs Settings */}
      <div className="v2-neu-card rounded-3xl p-4 sm:p-5 border border-sky-400/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {section === 'profile' ? 'Identity & Profile' : 'Aadesh AI Control Center'}
          </h1>
          <p className="text-xs text-purple-200/75">
            {section === 'profile'
              ? 'Manage your verified identity, country flag, profile photo, and engagement streak.'
              : 'General, privacy & security, appearance, AI & voice modes, and connected services.'}
          </p>
        </div>

        <div className="inline-flex p-1 rounded-2xl v2-neu-inset border border-white/10 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setSection('profile')}
            className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              section === 'profile' ? 'electric-purple-btn text-white' : 'text-purple-200/75 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('settings')}
            className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              section === 'settings' ? 'electric-purple-btn text-white' : 'text-purple-200/75 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {section === 'profile' ? (
        <div className="space-y-5">
          {/* Profile Identity Card */}
          <div className="v2-neu-card rounded-3xl p-5 sm:p-7 border border-sky-400/30 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full p-[2.5px]"
                    style={{
                      background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, #38bdf8)`,
                      boxShadow: `0 8px 26px rgba(${avatarTokens.primaryRgb}, 0.45)`,
                    }}
                  >
                    {editAvatar || user.avatarUrl ? (
                      <img
                        src={editAvatar || user.avatarUrl}
                        alt={user.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover rounded-full bg-[#120e24]"
                      />
                    ) : (
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center text-white text-2xl font-black"
                        style={{
                          background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #16102b)`,
                        }}
                      >
                        {(user.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title="Upload profile picture"
                    aria-label="Upload profile picture"
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full electric-purple-btn text-white flex items-center justify-center border border-white/30 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl leading-none">{user.countryFlag || '🌐'}</span>
                    <h2 className="text-lg sm:text-xl font-black text-white truncate">
                      {user.name || 'Member'}
                    </h2>
                    {isOwnerAdmin && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-400/40">
                        Owner
                      </span>
                    )}
                  </div>

                  {(user.nickname || user.age) && (
                    <p className="text-xs font-semibold text-sky-300">
                      {user.nickname ? `Nickname: ${user.nickname}` : ''}
                      {user.nickname && user.age ? ' · ' : ''}
                      {user.age ? `Age ${user.age}` : ''}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-purple-200/75">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-purple-400" />
                      <span>{user.email || 'No email'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span>{user.country || 'Global'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingProfile((prev) => !prev)}
                className="min-h-[42px] px-4 py-2 rounded-2xl electric-purple-btn text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-center"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingProfile ? 'Cancel Edit' : 'Edit Profile & Country'}</span>
              </button>
            </div>

            {isEditingProfile && (
              <form
                onSubmit={handleSaveProfile}
                className="p-4 sm:p-5 rounded-2xl v2-neu-inset border border-sky-400/30 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="space-y-1 text-xs">
                    <span className="text-purple-200/80 font-semibold block">Full Name</span>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-xs">
                    <span className="text-purple-200/80 font-semibold block">Nickname</span>
                    <input
                      type="text"
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      placeholder="Optional"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-xs">
                    <span className="text-purple-200/80 font-semibold block">Age (Optional)</span>
                    <input
                      type="number"
                      min={1}
                      max={130}
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      placeholder="Optional"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-purple-200/80 font-semibold">Country &amp; Flag (Manual or Auto)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setGpsFeedback(null);
                          const detected = detectUserCountry();
                          if (detected.country !== 'Global') {
                            setEditCountry(detected.country);
                            setEditCountryCode(detected.code);
                            setEditFlag(detected.flag);
                            setEditTimezone(detected.timeZone || '');
                            setEditCountryMethod('timezone');
                            showToast(`Timezone detected: ${detected.country} ${detected.flag}`);
                            return;
                          }
                          const ipMatch = await detectCountryApproxViaIP();
                          if (ipMatch) {
                            setEditCountry(ipMatch.country);
                            setEditCountryCode(ipMatch.code);
                            setEditFlag(ipMatch.flag);
                            setEditTimezone(ipMatch.timeZone || '');
                            setEditCountryMethod('ip');
                            showToast(`IP region detected: ${ipMatch.country} ${ipMatch.flag}`);
                          } else {
                            showToast('Automatic region detection unavailable. Choose manually or use GPS.');
                          }
                        }}
                        className="text-[11px] text-purple-300 hover:text-white underline cursor-pointer"
                      >
                        Auto-Detect
                      </button>
                      <span className="text-purple-400/50">•</span>
                      <button
                        type="button"
                        disabled={isDetectingGps}
                        onClick={async () => {
                          setIsDetectingGps(true);
                          setGpsFeedback(null);
                          const gpsResult = await detectCountryViaGPSDetailed();
                          setIsDetectingGps(false);
                          if (gpsResult.option && gpsResult.source === 'gps') {
                            const detectedOpt = gpsResult.option;
                            const resolvedTz =
                              detectedOpt.timeZone ||
                              (() => {
                                try {
                                  return Intl.DateTimeFormat().resolvedOptions().timeZone;
                                } catch {
                                  return user.timezone || '';
                                }
                              })();
                            setEditCountry(detectedOpt.country);
                            setEditCountryCode(detectedOpt.code);
                            setEditFlag(detectedOpt.flag);
                            setEditTimezone(resolvedTz);
                            setEditCountryMethod('gps');
                            // Persist GPS-detected country immediately to authenticated user profile
                            saveUserLocalExtras(user.id, {
                              country: detectedOpt.country,
                              countryCode: detectedOpt.code,
                              countryFlag: detectedOpt.flag,
                              timezone: resolvedTz,
                              countryDetectionMethod: 'gps',
                              isManualCountry: false,
                            });
                            onUpdateUser({
                              ...user,
                              country: detectedOpt.country,
                              countryCode: detectedOpt.code,
                              countryFlag: detectedOpt.flag,
                              timezone: resolvedTz,
                              countryDetectionMethod: 'gps',
                              isManualCountry: false,
                            });
                            const msg = `GPS detected & saved: ${detectedOpt.flag} ${detectedOpt.country} (${detectedOpt.code})`;
                            setGpsFeedback({ type: 'success', message: msg });
                            showToast(msg);
                          } else {
                            const errMsg =
                              gpsResult.error ||
                              'GPS country detection failed. Please select your country manually below.';
                            setGpsFeedback({ type: 'error', message: errMsg });
                            showToast(errMsg);
                          }
                        }}
                        className="text-[11px] text-sky-300 hover:text-white underline cursor-pointer disabled:opacity-50"
                      >
                        {isDetectingGps ? 'Detecting GPS...' : 'Detect via GPS'}
                      </button>
                    </div>
                  </div>

                  {gpsFeedback && (
                    <div
                      role="status"
                      className={`px-3 py-2 rounded-xl border text-[11px] font-medium ${
                        gpsFeedback.type === 'success'
                          ? 'bg-emerald-950/55 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/60 border-rose-500/45 text-rose-200'
                      }`}
                    >
                      {gpsFeedback.message}
                    </div>
                  )}

                  <input
                    type="text"
                    value={countrySearchQuery}
                    onChange={(e) => setCountrySearchQuery(e.target.value)}
                    placeholder="Search country name or code (e.g., US, Nepal, Japan)..."
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none text-xs"
                  />

                  <select
                    value={editCountry}
                    onChange={(e) => {
                      setGpsFeedback(null);
                      const chosen = COUNTRY_OPTIONS.find((c) => c.country === e.target.value);
                      if (chosen) {
                        setEditCountry(chosen.country);
                        setEditCountryCode(chosen.code);
                        setEditFlag(chosen.flag);
                        if (chosen.timeZone) {
                          setEditTimezone(chosen.timeZone);
                        }
                        setEditCountryMethod('manual');
                      } else if (e.target.value === 'Global') {
                        setEditCountry('Global');
                        setEditCountryCode('GLOBAL');
                        setEditFlag('🌐');
                        setEditCountryMethod('manual');
                      }
                    }}
                    size={5}
                    className="w-full px-2 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none font-medium cursor-pointer"
                  >
                    <option value="Global">🌐 Global (International)</option>
                    {editCountry &&
                      editCountry !== 'Global' &&
                      !COUNTRY_OPTIONS.some((c) => c.country === editCountry) && (
                        <option value={editCountry}>
                          {editFlag} {editCountry} ({editCountryCode})
                        </option>
                      )}
                    {COUNTRY_OPTIONS.filter((c) => {
                      if (!countrySearchQuery.trim()) return true;
                      const q = countrySearchQuery.toLowerCase();
                      return (
                        c.country.toLowerCase().includes(q) ||
                        c.code.toLowerCase().includes(q)
                      );
                    }).map((c) => (
                      <option key={c.code} value={c.country}>
                        {c.flag} {c.country} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="electric-purple-btn min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}

            {/* Account Information & Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                <div className="text-[11px] text-purple-300/80">Unique User ID</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-white truncate tabular-nums">{user.id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(user.id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 1800);
                    }}
                    aria-label="Copy User ID"
                    className="text-sky-300 hover:text-white cursor-pointer shrink-0"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                <div className="text-[11px] text-purple-300/80 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Streak &amp; XP</span>
                </div>
                <div className="text-sm font-black text-white tabular-nums">
                  {user.streakDays || 0} Days · {(user.xp || 0).toLocaleString()} XP
                </div>
              </div>

              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                <div className="text-[11px] text-purple-300/80 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>Account Summary</span>
                </div>
                <div className="text-xs font-bold text-white capitalize">
                  {user.provider} · {createdDateStr}
                  {metrics ? ` · ${metrics.totalQueries} queries` : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Avatar Accent Color */}
          <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Palette className="w-4 h-4 text-sky-400" />
              <span>Accent Glow Color</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLOR_PRESETS.map((preset) => {
                const selected =
                  (user.avatarColor || DEFAULT_AVATAR_COLOR).toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onUpdateUser({ ...user, avatarColor: preset.hex })}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                      selected
                        ? 'bg-sky-500/25 border-sky-300 text-white'
                        : 'v2-neu-inset border-white/10 text-purple-200/80 hover:border-sky-400/40'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/30"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live AI Control Center (accessible from Profile section) */}
          <LiveAIControlCenter
            aiHealth={aiHealth}
            providersStatus={providersStatus}
            settings={settings}
            isNetworkOnline={isOnline}
            isRefreshing={isLoadingProvidersStatus}
            testingProviderId={testingProviderId}
            onRefreshStatus={onRefreshProvidersStatus}
            onTestProvider={onTestProvider}
            compact={true}
          />
        </div>
      ) : (
        /* SETTINGS SECTION: Live AI Control Center + Structured Controls Groups */
        <div className="space-y-5">
          <LiveAIControlCenter
            aiHealth={aiHealth}
            providersStatus={providersStatus}
            settings={settings}
            isNetworkOnline={isOnline}
            isRefreshing={isLoadingProvidersStatus}
            testingProviderId={testingProviderId}
            onRefreshStatus={onRefreshProvidersStatus}
            onTestProvider={onTestProvider}
          />

          {/* 1. GENERAL SETTINGS */}
          <section className="v2-neu-card rounded-3xl p-5 border border-sky-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white">1. General Settings</h2>
              </div>
              <span className="text-[11px] text-purple-300/75 capitalize">
                Browser Permission: {notifPermission}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PillSwitch
                checked={settings.notificationsEnabled ?? true}
                onChange={handleToggleNotifications}
                label="Notifications"
                description="Show live alerts when responses or schedules complete."
              />
              <PillSwitch
                checked={Boolean(settings.emailUpdatesEnabled)}
                onChange={() =>
                  onUpdateSettings({ emailUpdatesEnabled: !settings.emailUpdatesEnabled })
                }
                label="Email Updates"
                description="Receive account summaries and milestone recaps."
              />
              <PillSwitch
                checked={settings.soundEffects ?? true}
                onChange={() => onUpdateSettings({ soundEffects: !(settings.soundEffects ?? true) })}
                label="App Sound Effects"
                description="Soft tactile chimes for completed replies."
              />
              <PillSwitch
                checked={Boolean(settings.privateAccount)}
                onChange={() => onUpdateSettings({ privateAccount: !settings.privateAccount })}
                label="Private Account"
                description="Hide public activity badges across shared surfaces."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <label className="space-y-1.5">
                <span className="text-purple-200/80 font-semibold block">Interface Language</span>
                <select
                  value={settings.uiLanguage}
                  onChange={(e) => onUpdateSettings({ uiLanguage: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-purple-200/80 font-semibold block">Default AI Response Language</span>
                <select
                  aria-label="Default AI Response Language"
                  value={settings.aiResponseLanguage || settings.defaultTargetLanguage || 'en'}
                  onChange={(e) =>
                    onUpdateSettings({
                      aiResponseLanguage: e.target.value,
                      defaultTargetLanguage: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1.5">
                <span className="text-purple-200/80 font-semibold block">Active Country</span>
                <button
                  type="button"
                  onClick={() => {
                    setSection('profile');
                    setIsEditingProfile(true);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-sky-400/30 hover:border-sky-400/60 text-white flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="truncate font-semibold">
                    {user.countryFlag || '🌐'} {user.country || 'Global'}
                  </span>
                  <span className="text-[11px] text-sky-300 font-bold">Change</span>
                </button>
              </div>
            </div>

            {/* Dedicated AI Response Preferences & Independent AI Message Translation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/10">
              {/* AI Response Preferences */}
              <div
                aria-label="AI Response Preferences"
                className="p-4 rounded-2xl v2-neu-inset border border-sky-400/25 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    <span>AI Response Preferences</span>
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30">
                    Default: English
                  </span>
                </div>
                <label className="block space-y-1 text-xs">
                  <span className="text-purple-200/80 font-semibold block">AI Response Language</span>
                  <select
                    aria-label="AI Response Language"
                    value={settings.aiResponseLanguage || settings.defaultTargetLanguage || 'en'}
                    onChange={(e) =>
                      onUpdateSettings({
                        aiResponseLanguage: e.target.value,
                        defaultTargetLanguage: e.target.value,
                      })
                    }
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 text-white outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={`resp-lang-${l.code}`} value={l.code}>
                        {l.flag} {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </label>
                <PillSwitch
                  checked={Boolean(settings.autoDetectInputLanguage)}
                  onChange={() =>
                    onUpdateSettings({ autoDetectInputLanguage: !settings.autoDetectInputLanguage })
                  }
                  label="Auto-detect Input Language"
                  description="Match the user's message language automatically. When off, AI strictly replies in the selected language while preserving code blocks."
                />
              </div>

              {/* Independent AI Message Translation (Default: OFF) */}
              <div
                aria-label="AI Message Translation"
                className="p-4 rounded-2xl v2-neu-inset border border-purple-400/25 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-purple-300" />
                    <span>AI Message Translation</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      settings.translationEnabled
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                        : 'bg-white/10 text-purple-200/75 border-white/15'
                    }`}
                  >
                    {settings.translationEnabled ? 'Auto-Translate ON' : 'OFF by Default'}
                  </span>
                </div>
                <PillSwitch
                  checked={Boolean(settings.translationEnabled)}
                  onChange={() =>
                    onUpdateSettings({ translationEnabled: !settings.translationEnabled })
                  }
                  label="Auto-Translate Every AI Reply"
                  description="Independent from AI Response Language. Keep off for clean replies; per-message Translate button remains available below every reply."
                />
                <label className="block space-y-1 text-xs">
                  <span className="text-purple-200/80 font-semibold block">Translation Target Language</span>
                  <select
                    aria-label="Translation Target Language"
                    value={settings.translationLanguage || 'ne'}
                    onChange={(e) => onUpdateSettings({ translationLanguage: e.target.value })}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 text-white outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={`trans-lang-${l.code}`} value={l.code}>
                        {l.flag} {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>

          {/* 2. PRIVACY & SECURITY */}
          <section className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-300" />
                <h2 className="text-sm font-bold text-white">2. Privacy &amp; Security</h2>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                TLS Encrypted
              </span>
            </div>

            {/* Shield Overview Banner */}
            <div className="p-4 rounded-2xl v2-neu-inset border border-sky-400/25 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[11px] text-purple-200/70">Email Verification</div>
                  <div className="font-bold text-white">
                    {emailVerified ? 'Verified Account' : user.provider === 'google' ? 'Google Verified' : 'Unverified'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0">
                  <Lock className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[11px] text-purple-200/70">Two-Factor Auth (MFA)</div>
                  <div className="font-bold text-white">
                    {mfaEnrolled ? 'Enrolled (Firebase MFA)' : 'Managed via Google / Auth'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                  <Fingerprint className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[11px] text-purple-200/70">Biometric Capability</div>
                  <div className="font-bold text-white">
                    {biometricHardwareAvailable === null
                      ? 'Checking device...'
                      : biometricHardwareAvailable
                      ? 'Hardware Supported'
                      : 'Passkey Not Detected'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PillSwitch
                checked={Boolean(settings.biometricLockEnabled)}
                onChange={() =>
                  onUpdateSettings({ biometricLockEnabled: !settings.biometricLockEnabled })
                }
                label="Biometric / Device Lock Preference"
                description={
                  biometricHardwareAvailable
                    ? 'Platform authenticator available on this device.'
                    : 'Stores lock preference for compatible passkey browsers.'
                }
              />
              <PillSwitch
                checked={settings.streamingResponses !== false}
                onChange={() =>
                  onUpdateSettings({ streamingResponses: settings.streamingResponses === false })
                }
                label="Streaming AI Responses"
                description="Render AI output progressively word by word."
              />
              <PillSwitch
                checked={settings.memoryConsent === 'agreed' && settings.aiMemoryEnabled !== false}
                onChange={() => {
                  const nextEnabled = !(
                    settings.memoryConsent === 'agreed' && settings.aiMemoryEnabled !== false
                  );
                  onUpdateSettings({
                    aiMemoryEnabled: nextEnabled,
                    memoryConsent: nextEnabled ? 'agreed' : 'disagreed',
                  });
                }}
                label="Personal Memory Permission"
                description="Allow approved preferences from More > Personal Memory in chats."
              />
              <PillSwitch
                checked={streakRemindersEnabled}
                onChange={handleToggleDailyStreakReminder}
                label="Daily Streak Push Reminder"
                description={`Notify at ${preferredReminderTime.label12h} (${effectiveStreakTz}) if inactive.`}
              />
              <PillSwitch
                checked={Boolean(settings.analyticsConsent)}
                onChange={() =>
                  onUpdateSettings({ analyticsConsent: !settings.analyticsConsent })
                }
                label="Privacy-Safe Usage Analytics"
                description="Share anonymous feature counts & errors (no emails, keys, or chat text)."
              />
            </div>

            {(() => {
              const notifSnapshot = getNotificationReadinessSnapshot();
              return (
                <div className="px-3.5 py-2.5 rounded-2xl v2-neu-inset border border-white/10 text-[11px] text-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white">
                      Push &amp; FCM Readiness: <span className="text-cyan-300">{notifSnapshot.statusLabel}</span>
                    </div>
                    <p className="text-[10.5px] text-purple-200/65 leading-relaxed">
                      {notifSnapshot.guidance}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Toggle-Based Daily Streak Reminder Scheduler & Time Picker */}
            <div className="p-4 rounded-2xl v2-neu-inset border border-cyan-400/25 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellRing
                    className={`w-4 h-4 shrink-0 ${
                      streakRemindersEnabled && notifPermission === 'granted'
                        ? 'text-cyan-400'
                        : 'text-purple-300'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-white">
                      Daily Streak Reminder Schedule
                    </div>
                    <div className="text-[11px] text-purple-200/70">
                      Pick your preferred daily push notification time ({effectiveStreakTz})
                    </div>
                  </div>
                </div>
                <span className="text-[10.5px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-400/35 text-cyan-200 tabular-nums">
                  {streakRemindersEnabled
                    ? streakReminderStatus.reason === 'already_active_today'
                      ? `Safe today · Next in ${streakReminderStatus.countdownLabel}`
                      : `Next check in ${streakReminderStatus.countdownLabel}`
                    : 'Paused'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <label className="space-y-1 text-xs flex-1">
                  <span className="text-purple-200/80 font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Preferred Notification Time</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      aria-label="Preferred daily streak reminder time"
                      value={preferredReminderTime.normalized}
                      disabled={!streakRemindersEnabled}
                      onChange={(e) => handleReminderTimeChange(e.target.value)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/35 focus:border-cyan-400 text-white text-xs font-mono tabular-nums outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { time: '09:00', label: '9 AM' },
                        { time: '18:00', label: '6 PM' },
                        { time: '20:00', label: '8 PM' },
                        { time: '21:30', label: '9:30 PM' },
                      ].map((preset) => (
                        <button
                          key={preset.time}
                          type="button"
                          disabled={!streakRemindersEnabled}
                          onClick={() => handleReminderTimeChange(preset.time)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            preferredReminderTime.normalized === preset.time
                              ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-200'
                              : 'bg-white/5 border-white/10 text-purple-200/80 hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleTestDailyStreakNotification}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{notifPermission === 'granted' ? 'Send Test Alert' : 'Allow & Test Alert'}</span>
                </button>
              </div>

              {reminderTestNotice && (
                <p
                  role="status"
                  className="text-[11px] text-cyan-100 bg-cyan-950/45 border border-cyan-400/30 rounded-xl px-3 py-2"
                >
                  {reminderTestNotice}
                </p>
              )}

              {streakRemindersEnabled && notifPermission !== 'granted' && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-amber-950/40 border border-amber-400/35 flex items-start gap-2.5 text-[11px] text-amber-100/90 leading-relaxed"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-amber-200">
                      {notifPermission === 'denied'
                        ? 'Browser Push Permission Blocked'
                        : notifPermission === 'unsupported'
                        ? 'Browser Notification API Unavailable'
                        : 'Push Notification Permission Pending'}
                    </div>
                    <p>
                      {notifPermission === 'denied'
                        ? 'Browsers suppress silent web push alerts until site Notifications are explicitly set to "Allow" in Chrome/Android Site Settings. Enable Notifications in your browser address bar, then tap Send Test Alert.'
                        : notifPermission === 'unsupported'
                        ? 'This embedded webview blocks OS push popups. Install Aadesh AI as a PWA or open in Chrome to receive scheduled daily streak notifications.'
                        : 'Browsers require a user tap to grant Notification permission before scheduled alerts can fire. Tap "Allow & Test Alert" to authorize notifications.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Local Chat Sessions Backup (JSON & Markdown) */}
            <div className="p-4 rounded-2xl v2-neu-inset border border-purple-400/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-purple-300 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      Local Chat Sessions Backup
                    </div>
                    <div className="text-[11px] text-purple-200/70">
                      Export all {sessions.length} chat sessions (
                      {sessions.reduce((sum, s) => sum + s.messages.length, 0)} messages) for offline safekeeping
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-400/35 text-purple-200">
                  JSON &amp; Markdown
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleExportAllSessionsBackup('json')}
                  className="min-h-[42px] px-4 py-2.5 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/45 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <FileCode className="w-4 h-4 text-purple-300" />
                  <span>Export All Chats as JSON (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportAllSessionsBackup('md')}
                  className="min-h-[42px] px-4 py-2.5 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-400/45 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <FileText className="w-4 h-4 text-sky-300" />
                  <span>Export All Chats as Markdown (.md)</span>
                </button>
              </div>

              {backupFeedback && (
                <div
                  role="status"
                  className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-400/40 text-emerald-200 text-[11px] flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    Downloaded <strong>{backupFeedback.filename}</strong> ({backupFeedback.sessionCount} sessions,{' '}
                    {backupFeedback.messageCount} msgs · {backupFeedback.kbLabel})
                  </span>
                </div>
              )}
            </div>

            {/* Real Login Activity Panel */}
            <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Recent Login Activity</span>
                </span>
                {fbAuthUser?.metadata?.lastSignInTime && (
                  <span className="text-[11px] text-purple-200/70 tabular-nums">
                    Last Sign-In: {new Date(fbAuthUser.metadata.lastSignInTime).toLocaleString()}
                  </span>
                )}
              </div>

              {loginActivity.length === 0 ? (
                <div className="text-[11px] text-purple-200/65">
                  Current verified session active ({user.provider}).
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {loginActivity.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-white/5 last:border-none"
                    >
                      <span className="text-white font-semibold capitalize">
                        {item.provider} · {item.deviceSummary}
                      </span>
                      <span className="text-purple-200/65 tabular-nums">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTermsModalTab('terms');
                  setIsTermsModalOpen(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-2xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/35 text-xs font-semibold text-purple-100 flex items-center gap-2 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-purple-300" />
                <span>Terms &amp; Privacy Policy</span>
              </button>

              <button
                type="button"
                onClick={onOpenFullBackup}
                className="min-h-[40px] px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-purple-100 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-sky-300" />
                <span>Backup &amp; AI Providers ({sessions.length} chats)</span>
              </button>

              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllData();
                      setConfirmClear(false);
                      showToast('Local cache cleared.');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-2xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Clear Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="min-h-[40px] px-3 py-2 rounded-2xl bg-white/10 text-xs text-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="min-h-[40px] px-4 py-2 rounded-2xl bg-white/5 hover:bg-rose-950/50 border border-white/10 hover:border-rose-400/35 text-xs font-semibold text-purple-200 hover:text-rose-200 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Local Cache</span>
                </button>
              )}
            </div>
          </section>

          {/* POWER MEMORY PERSISTENT SYSTEM */}
          <PowerMemorySection
            user={user}
            settings={settings}
            memories={effectiveMemories}
            onUpdateSettings={onUpdateSettings}
            onAddMemory={onAddMemory || fallbackAddMemory}
            onUpdateMemory={onUpdateMemory || fallbackUpdateMemory}
            onToggleMemoryApproved={onToggleMemoryApproved || fallbackToggleApproved}
            onDeleteMemory={onDeleteMemory || fallbackDeleteMemory}
            onClearAllMemories={onClearAllMemories || fallbackClearMemories}
          />

          {/* 3. APPEARANCE & THEME SWITCHER */}
          <section
            aria-label="Theme Switcher"
            className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white">3. Appearance &amp; Theme Switcher</h2>
              </div>
              <span className="text-[11px] font-semibold text-sky-300">
                Active:{' '}
                {settings.theme === 'light'
                  ? 'Pure Light'
                  : COLOR_THEME_PRESETS.find((p) => p.id === settings.colorTheme)?.name || 'Dark Galaxy'}
              </span>
            </div>

            {/* Theme Switcher Horizontal Color Palette Carousel */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-white">Theme Switcher</h3>
                  <p className="text-[11px] text-purple-200/70">
                    Swipe or browse color palettes to apply a global theme instantly.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      themeCarouselRef.current?.scrollBy({ left: -240, behavior: 'smooth' })
                    }
                    aria-label="Scroll theme palettes left"
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-purple-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      themeCarouselRef.current?.scrollBy({ left: 240, behavior: 'smooth' })
                    }
                    aria-label="Scroll theme palettes right"
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-purple-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div
                ref={themeCarouselRef}
                role="listbox"
                aria-label="Color theme palette carousel"
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1"
              >
                {COLOR_THEME_PRESETS.map((preset: ColorThemePreset) => {
                  const isSelected =
                    (preset.id === 'pure-light' && settings.theme === 'light') ||
                    (settings.theme !== 'light' &&
                      (settings.colorTheme === preset.id ||
                        (preset.id === 'dark-galaxy' && !settings.colorTheme)));
                  const paletteTokens = generateThemeTokensFromColor(preset.hex);

                  const handleSelectThemePalette = () => {
                    const isLight = preset.themeMode === 'light';
                    applyAvatarDynamicTheme(preset.hex, true);
                    if (isLight) {
                      document.body.classList.add('light-theme');
                      document.documentElement.classList.remove('dark');
                    } else {
                      document.body.classList.remove('light-theme');
                      document.documentElement.classList.add('dark');
                    }
                    onUpdateSettings({
                      theme: isLight ? 'light' : 'dark',
                      colorTheme: preset.id,
                    });
                    showToast(`Applied ${preset.name} theme globally.`);
                  };

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={handleSelectThemePalette}
                      className={`snap-start shrink-0 w-52 sm:w-56 p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.28)]'
                          : 'v2-neu-inset border-white/10 text-purple-200/80 hover:border-sky-400/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-4 h-4 rounded-full border border-white/35 shrink-0"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <span className="text-xs font-bold text-white truncate">
                            {preset.name}
                          </span>
                        </div>
                        {isSelected ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-400 text-emerald-300 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-gray-400 shrink-0">
                            {preset.themeMode === 'light' ? 'Light' : 'Dark'}
                          </span>
                        )}
                      </div>

                      {/* Palette Color Swatches + Gradient Strip */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-md border border-white/20"
                            style={{ backgroundColor: paletteTokens.primaryHex }}
                            title="Primary"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-md border border-white/20"
                            style={{ backgroundColor: paletteTokens.secondaryHex }}
                            title="Secondary"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-md border border-white/20"
                            style={{ backgroundColor: paletteTokens.lightHex }}
                            title="Highlight"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-md border border-white/20"
                            style={{ backgroundColor: paletteTokens.deepHex }}
                            title="Surface"
                          />
                        </div>
                        <div
                          className={`h-2 w-full rounded-full bg-gradient-to-r ${preset.gradientClass} opacity-90`}
                        />
                      </div>

                      <p className="text-[11px] text-purple-200/65 line-clamp-2">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-2">
                <div className="font-bold text-white">Chat Density</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['spacious', 'compact'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ chatAppearance: mode })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold capitalize cursor-pointer ${
                        (settings.chatAppearance || 'spacious') === mode
                          ? 'electric-purple-btn text-white'
                          : 'bg-white/5 text-purple-200/75 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-2">
                <div className="font-bold text-white">Font Size</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'large', 'xlarge'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onUpdateSettings({ fontSize: sz })}
                      className={`py-2 px-2 rounded-xl text-xs font-bold uppercase cursor-pointer ${
                        (settings.fontSize || 'normal') === sz
                          ? 'electric-purple-btn text-white'
                          : 'bg-white/5 text-purple-200/75 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PillSwitch
                checked={Boolean(settings.reducedAnimations)}
                onChange={() => onUpdateSettings({ reducedAnimations: !settings.reducedAnimations })}
                label="Reduced Animations"
                description="Minimize background shimmer and motion transitions."
              />
              <PillSwitch
                checked={Boolean(settings.highContrast)}
                onChange={() => onUpdateSettings({ highContrast: !settings.highContrast })}
                label="High Contrast Mode"
                description="Boost text borders and focus outline visibility."
              />
            </div>
          </section>

          {/* 4. AI & VOICE CONTROLS */}
          <section className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white">4. AI &amp; Voice Controls</h2>
              </div>
              <button
                type="button"
                onClick={handleTestVoice}
                className="px-3 py-1.5 rounded-xl electric-purple-btn text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>Test Voice</span>
              </button>
            </div>

            {/* AI Response Mode */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-purple-200/85 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>AI Response Style</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'fast', label: 'Fast', desc: 'Concise & direct' },
                    { id: 'balanced', label: 'Balanced', desc: 'Clear & helpful' },
                    { id: 'detailed', label: 'Detailed', desc: 'Deep & thorough' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ aiResponseMode: mode.id })}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      (settings.aiResponseMode || 'balanced') === mode.id
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'v2-neu-inset border-white/10 text-purple-200/80'
                    }`}
                  >
                    <div className="text-xs font-bold">{mode.label}</div>
                    <div className="text-[10px] opacity-75">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Provider Switch (Google Gemini Default, Groq, OpenRouter) */}
            <div
              aria-label="AI Provider Switch"
              className="p-4 rounded-2xl v2-neu-inset border border-sky-400/25 space-y-3"
            >
              <AIProviderSelector
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                providersStatus={providersStatus ?? aiHealth?.providers ?? null}
                isLoadingStatus={isLoadingProvidersStatus}
                testingProviderId={testingProviderId}
                onRefreshStatus={onRefreshProvidersStatus}
                onTestProvider={onTestProvider}
              />
            </div>

            {/* Voice Section: Persona, Speaking Speed (0.5x–2.0x), and Volume */}
            <div
              aria-label="Voice"
              className="p-4 rounded-2xl v2-neu-inset border border-sky-400/20 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-sky-400" />
                  <span>Voice</span>
                </span>
                <span className="text-[11px] font-mono text-sky-300 tabular-nums">
                  Rate {Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0)).toFixed(2)}x
                </span>
              </div>

              {/* Voice Persona */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {VOICE_PERSONAS.map((persona) => {
                  const active = (settings.voicePersona || 'friendly') === persona.id;
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => {
                        voiceAssistant.configure({ pitch: persona.pitch });
                        onUpdateSettings({
                          voicePersona: persona.id as VoicePersona,
                          voicePitch: persona.pitch,
                        });
                      }}
                      className={`p-2.5 rounded-xl border text-left text-xs cursor-pointer transition-all ${
                        active
                          ? 'bg-purple-600/35 border-sky-400 text-white font-bold'
                          : 'bg-white/5 border-white/10 text-purple-200/80 hover:border-sky-400/35'
                      }`}
                    >
                      <div className="truncate">{persona.name}</div>
                      <div className="text-[10px] opacity-75 truncate">{persona.tagline}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <label htmlFor="settings-voice-speed-slider" className="block space-y-1.5">
                    <div className="flex justify-between text-purple-200/80">
                      <span className="flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5 text-sky-400" />
                        <span>Speaking Speed (Rate)</span>
                      </span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0)).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      id="settings-voice-speed-slider"
                      type="range"
                      aria-label="AI speaking speed"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0))}
                      onChange={(e) => applyVoiceSpeed(Number(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-purple-200/55 font-mono tabular-nums">
                      <span>0.5x</span>
                      <span>1.0x</span>
                      <span>1.5x</span>
                      <span>2.0x</span>
                    </div>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((presetSpeed) => {
                      const currentSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
                      const isActive = Math.abs(currentSpeed - presetSpeed) < 0.01;
                      return (
                        <button
                          key={presetSpeed}
                          type="button"
                          onClick={() => applyVoiceSpeed(presetSpeed)}
                          className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-mono font-bold cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-sky-500/25 border-sky-400/70 text-sky-200'
                              : 'bg-white/5 border-white/10 text-purple-200/75 hover:text-white'
                          }`}
                        >
                          {presetSpeed}x
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
                    <div className="text-[11px] font-bold text-sky-300">Quick-Select Common Speeds:</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { label: '0.75x', val: 0.75 },
                        { label: '1.0x', val: 1.0 },
                        { label: '1.25x', val: 1.25 },
                        { label: '1.5x', val: 1.5 },
                      ].map((item) => {
                        const currentSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
                        const isActive = Math.abs(currentSpeed - item.val) < 0.01;
                        return (
                          <button
                            key={item.val}
                            type="button"
                            onClick={() => applyVoiceSpeed(item.val)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                              isActive
                                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                                : 'bg-white/5 border-white/10 text-purple-200/75 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <label className="space-y-1.5">
                  <div className="flex justify-between text-purple-200/80">
                    <span className="flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>Volume</span>
                    </span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {Math.round((settings.voiceVolume ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Voice volume"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={settings.voiceVolume ?? 1.0}
                    onChange={(e) => {
                      const nextVolume = Number(e.target.value);
                      voiceAssistant.configure({ volume: nextVolume });
                      onUpdateSettings({ voiceVolume: nextVolume });
                    }}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PillSwitch
                checked={settings.autoSpeakAIResponses}
                onChange={() => {
                  const nextVal = !settings.autoSpeakAIResponses;
                  if (!nextVal) {
                    voiceAssistant.stopSpeaking();
                  }
                  onUpdateSettings({ autoSpeakAIResponses: nextVal });
                }}
                label="Voice Reader (Voice Studio Auto-Speak)"
                description="Off by default. Chat responses stay silent unless you click Read on a message."
              />
              <PillSwitch
                checked={settings.handsFreeMode}
                onChange={() => onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })}
                label="Hands-Free Voice Mode"
                description="Automatically re-listen after an assistant reply finishes."
              />
            </div>

            {/* Focus Modes */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-purple-200/85 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span>Ambient Focus Mode</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['normal', 'study', 'night', 'relax'] as const).map((fm) => (
                  <button
                    key={fm}
                    type="button"
                    onClick={() => onUpdateSettings({ focusMode: fm })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize cursor-pointer ${
                      (settings.focusMode || 'normal') === fm
                        ? 'electric-purple-btn text-white border-sky-400/50'
                        : 'v2-neu-inset border-white/10 text-purple-200/75'
                    }`}
                  >
                    {fm}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 5. CONNECTED SERVICES */}
          <section className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Database className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">5. Connected Services &amp; Session</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {(() => {
                const activeProviderId: AIProviderId = settings.aiProvider || aiHealth?.activeProvider || 'gemini';
                const providerMeta = AI_PROVIDER_METADATA[activeProviderId];
                const rawProviderStatus = (providersStatus || aiHealth?.providers)?.[activeProviderId];
                const normalizedStatus = normalizeProviderStatusInfo(activeProviderId, rawProviderStatus);
                const healthDisplay = resolveProviderHealthDisplay(normalizedStatus, {
                  isTesting: testingProviderId === activeProviderId,
                  isRefreshing: isLoadingProvidersStatus,
                });
                const resolvedStatus =
                  rawProviderStatus?.status ||
                  (aiHealth?.state === 'connected'
                    ? 'connected'
                    : aiHealth?.activeProviderConfigured === false
                    ? 'not_configured'
                    : 'error');
                const compactLatencyText =
                  typeof normalizedStatus.latencyMs === 'number'
                    ? `${Math.round(normalizedStatus.latencyMs)}ms`
                    : 'Untested';
                return (
                  <div
                    className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5"
                    title={healthDisplay.tooltip}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white flex items-center gap-2 min-w-0">
                        <span
                          role="status"
                          aria-label={healthDisplay.tooltip}
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDisplay.dotClass}`}
                        />
                        <span
                          className={`text-[11px] font-semibold tabular-nums shrink-0 ${
                            healthDisplay.tone === 'green'
                              ? 'text-emerald-300'
                              : healthDisplay.tone === 'yellow'
                              ? 'text-amber-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {compactLatencyText}
                        </span>
                        <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="truncate">{providerMeta.name} Engine</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                          healthDisplay.tone === 'green'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : healthDisplay.tone === 'yellow'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {isOnline ? healthDisplay.label : 'Offline'}
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-200/75 tabular-nums truncate">
                      Model:{' '}
                      {(activeProviderId === 'openrouter' ? settings.openRouterModel : undefined) ||
                        settings.aiModel ||
                        aiHealth?.model ||
                        providerMeta.defaultModel}
                      {` · ${healthDisplay.latencyText} · ${healthDisplay.timestampText}`}
                    </div>
                  </div>
                );
              })()}

              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-amber-400" />
                    <span>Firebase Auth &amp; Firestore</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                    {fbAuthUser ? 'Connected' : 'Local Session'}
                  </span>
                </div>
                <div className="text-[11px] text-purple-200/75 truncate">
                  {fbAuthUser?.email || user.email || user.id} · UID {user.id.slice(0, 10)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onToggleForceOffline}
                className="flex items-center justify-between p-3.5 rounded-2xl v2-neu-inset border border-white/10 cursor-pointer text-xs"
              >
                <span className="text-white font-bold">Offline Local Mode</span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    !isOnline ? 'bg-amber-500/25 text-amber-300' : 'bg-emerald-500/25 text-emerald-300'
                  }`}
                >
                  {!isOnline ? 'Offline' : 'Online'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenInstall}
                className="flex items-center justify-between p-3.5 rounded-2xl v2-neu-inset hover:border-sky-400/40 border border-white/10 cursor-pointer text-xs"
              >
                <span className="text-white font-bold flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Install App (PWA)</span>
                </span>
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              </button>
            </div>

            {/* Real Backend Connection History Log */}
            <div
              aria-label="Connection History"
              className="p-4 rounded-2xl v2-neu-inset border border-white/10 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <History className="w-4 h-4 text-sky-400" />
                  <span>Connection History</span>
                </div>
                {onRefreshProvidersStatus && (
                  <button
                    type="button"
                    onClick={onRefreshProvidersStatus}
                    disabled={isLoadingProvidersStatus}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10.5px] font-semibold text-purple-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingProvidersStatus ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                )}
              </div>

              {aiHealth?.connectionHistory && aiHealth.connectionHistory.length > 0 ? (
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-purple-200/65">
                        <th className="py-1.5 pr-2">Provider</th>
                        <th className="py-1.5 pr-2">Model</th>
                        <th className="py-1.5 pr-2">Status</th>
                        <th className="py-1.5 pr-2">Latency</th>
                        <th className="py-1.5 pr-2">Time</th>
                        <th className="py-1.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {aiHealth.connectionHistory.slice(0, 15).map((entry) => (
                        <tr key={entry.id} className="text-purple-100/90">
                          <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">
                            {AI_PROVIDER_METADATA[entry.provider]?.shortName || entry.provider}
                          </td>
                          <td className="py-1.5 pr-2 font-mono text-[10px] text-sky-300 max-w-[140px] truncate" title={entry.model}>
                            {entry.model}
                          </td>
                          <td className="py-1.5 pr-2 whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                entry.status === 'success'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {entry.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 font-mono tabular-nums whitespace-nowrap">
                            {typeof entry.latencyMs === 'number' && entry.latencyMs > 0 ? `${entry.latencyMs} ms` : '—'}
                          </td>
                          <td className="py-1.5 pr-2 font-mono tabular-nums text-[10px] text-purple-200/70 whitespace-nowrap">
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-1.5 text-[10px] text-rose-200/85 max-w-[200px] truncate" title={entry.error || entry.source}>
                            {entry.error || (entry.source === 'test' ? 'Connection Test' : 'Chat Request')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-purple-200/65">
                  No connection tests or generation events recorded yet in this server session. Run Test Connection above to record live telemetry.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              {isOwnerAdmin ? (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="min-h-[42px] px-4 py-2 rounded-2xl bg-amber-950/60 hover:bg-amber-900/70 border border-amber-400/40 text-xs font-bold text-amber-200 flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Owner Admin Dashboard</span>
                </button>
              ) : (
                <div className="text-xs text-purple-200/70">
                  Signed in as {user.email || user.name}
                </div>
              )}

              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-rose-600/85 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-lg shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Terms of Service & Privacy Policy Modal */}
      {isTermsModalOpen && (
        <Suspense fallback={null}>
          <LazyTermsPrivacyModal
            isOpen={isTermsModalOpen}
            onClose={() => setIsTermsModalOpen(false)}
            initialTab={termsModalTab}
          />
        </Suspense>
      )}
    </div>
  );
};
