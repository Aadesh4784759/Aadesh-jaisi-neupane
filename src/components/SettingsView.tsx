import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import {
  AIConnectionHealth,
  AppSettings,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  LoginActivityEntry,
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
import { updateUserProfile } from '../utils/firebase';
import { getStoredLoginActivity, saveUserLocalExtras } from '../utils/storage';
import { voiceAssistant } from '../utils/speech';
import {
  AVATAR_COLOR_PRESETS,
  COLOR_THEME_PRESETS,
  DEFAULT_AVATAR_COLOR,
  generateThemeTokensFromColor,
} from '../utils/avatarTheme';
import { TermsPrivacyModal } from './TermsPrivacyModal';

interface SettingsViewProps {
  initialSection?: 'profile' | 'settings';
  user: UserProfile;
  settings: AppSettings;
  sessions: ChatSession[];
  mediaItems: GeotaggedMedia[];
  metrics?: EngagementMetrics;
  aiHealth?: AIConnectionHealth;
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
}) => {
  const [section, setSection] = useState<'profile' | 'settings'>(initialSection);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name || '');
  const [editNickname, setEditNickname] = useState(user.nickname || '');
  const [editAge, setEditAge] = useState(user.age ? String(user.age) : '');
  const [editCountry, setEditCountry] = useState(user.country || 'Global');
  const [editFlag, setEditFlag] = useState(user.countryFlag || '🌐');
  const [editAvatar, setEditAvatar] = useState(user.avatarUrl || '');
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [biometricHardwareAvailable, setBiometricHardwareAvailable] = useState<boolean | null>(null);
  const [loginActivity, setLoginActivity] = useState<LoginActivityEntry[]>(() =>
    getStoredLoginActivity(user.id)
  );
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');

  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setEditName(user.name || '');
    setEditNickname(user.nickname || '');
    setEditAge(user.age ? String(user.age) : '');
    setEditCountry(user.country || 'Global');
    setEditFlag(user.countryFlag || '🌐');
    setEditAvatar(user.avatarUrl || '');
    setLoginActivity(getStoredLoginActivity(user.id));
  }, [user]);

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
      saveUserLocalExtras(user.id, {
        nickname: cleanNickname,
        age: validAge,
        onboardingCompleted: true,
        country: editCountry,
        countryFlag: editFlag,
        isManualCountry: true,
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
        countryFlag: editFlag,
        isManualCountry: true,
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

  const handleTestVoice = () => {
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    voiceAssistant.configure({
      rate: settings.voiceSpeed ?? 1.0,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
    voiceAssistant.speak(
      `Hello ${user.name || 'friend'}! Aadesh AI voice is active.`,
      targetLangObj?.speechCode || 'en-US'
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
                          const detected = detectUserCountry();
                          if (detected.country !== 'Global') {
                            setEditCountry(detected.country);
                            setEditFlag(detected.flag);
                            showToast(`Auto-detected: ${detected.country} ${detected.flag}`);
                            return;
                          }
                          const ipMatch = await detectCountryApproxViaIP();
                          if (ipMatch) {
                            setEditCountry(ipMatch.country);
                            setEditFlag(ipMatch.flag);
                            showToast(`Auto-detected: ${ipMatch.country} ${ipMatch.flag}`);
                          } else {
                            setEditCountry(detected.country);
                            setEditFlag(detected.flag);
                            showToast('Using Global default. Choose manually or try GPS.');
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
                          const gpsResult = await detectCountryViaGPSDetailed();
                          setIsDetectingGps(false);
                          if (gpsResult.option) {
                            setEditCountry(gpsResult.option.country);
                            setEditFlag(gpsResult.option.flag);
                            const label =
                              gpsResult.source === 'gps'
                                ? 'GPS Detected'
                                : gpsResult.source === 'ip-approximate'
                                ? 'Approximate Region Detected'
                                : 'Timezone Detected';
                            showToast(`${label}: ${gpsResult.option.country} ${gpsResult.option.flag}`);
                          } else {
                            showToast(
                              gpsResult.error ||
                                'GPS unavailable. Please select your country manually below.'
                            );
                          }
                        }}
                        className="text-[11px] text-sky-300 hover:text-white underline cursor-pointer disabled:opacity-50"
                      >
                        {isDetectingGps ? 'Detecting GPS...' : 'Detect via GPS'}
                      </button>
                    </div>
                  </div>

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
                      const chosen = COUNTRY_OPTIONS.find((c) => c.country === e.target.value);
                      if (chosen) {
                        setEditCountry(chosen.country);
                        setEditFlag(chosen.flag);
                      } else {
                        setEditCountry('Global');
                        setEditFlag('🌐');
                      }
                    }}
                    size={5}
                    className="w-full px-2 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none font-medium cursor-pointer"
                  >
                    <option value="Global">🌐 Global (International)</option>
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
        </div>
      ) : (
        /* SETTINGS SECTION: 5 Structured Controls Groups */
        <div className="space-y-5">
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
                <span className="text-purple-200/80 font-semibold block">Default Target Language</span>
                <select
                  value={settings.defaultTargetLanguage}
                  onChange={(e) => onUpdateSettings({ defaultTargetLanguage: e.target.value })}
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
                description="Render Gemini output progressively word by word."
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
                checked={settings.streakReminders ?? true}
                onChange={() =>
                  onUpdateSettings({ streakReminders: !(settings.streakReminders ?? true) })
                }
                label="Streak Reminders"
                description="Keep daily productivity & learning streak active."
              />
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
                <span>Backup &amp; Custom API Key ({sessions.length} chats)</span>
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

          {/* 3. APPEARANCE */}
          <section className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white">3. Appearance &amp; Theme</h2>
              </div>
              <span className="text-[11px] font-semibold text-sky-300">
                Active:{' '}
                {settings.theme === 'light'
                  ? 'Pure Light'
                  : COLOR_THEME_PRESETS.find((p) => p.id === settings.colorTheme)?.name || 'Dark Galaxy'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {COLOR_THEME_PRESETS.filter((p) => p.id !== 'purple-galaxy').map((preset) => {
                const isSelected =
                  (preset.id === 'pure-light' && settings.theme === 'light') ||
                  (settings.theme !== 'light' &&
                    (settings.colorTheme === preset.id ||
                      (preset.id === 'dark-galaxy' &&
                        (!settings.colorTheme || settings.colorTheme === 'purple-galaxy'))));

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      const isLight = preset.themeMode === 'light';
                      onUpdateSettings({
                        theme: isLight ? 'light' : 'dark',
                        colorTheme: preset.id,
                      });
                      if (isLight) {
                        document.body.classList.add('light-theme');
                        document.documentElement.classList.remove('dark');
                      } else {
                        document.body.classList.remove('light-theme');
                        document.documentElement.classList.add('dark');
                      }
                      showToast(`Applied ${preset.name} theme.`);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-sky-500/15 border-sky-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.28)]'
                        : 'v2-neu-inset border-white/10 text-purple-200/80 hover:border-sky-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="text-xs font-bold text-white">{preset.name}</span>
                      </div>
                      {isSelected ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-400 text-emerald-300 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-gray-400">
                          {preset.themeMode === 'light' ? 'Light' : 'Dark'}
                        </span>
                      )}
                    </div>
                    <div
                      className={`h-2 w-full rounded-full bg-gradient-to-r ${preset.gradientClass} opacity-85`}
                    />
                    <p className="text-[11px] text-purple-200/65 line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
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

            {/* Voice Persona */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VOICE_PERSONAS.map((persona) => {
                const active = (settings.voicePersona || 'friendly') === persona.id;
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        voicePersona: persona.id as VoicePersona,
                        voicePitch: persona.pitch,
                      })
                    }
                    className={`p-2.5 rounded-xl border text-left text-xs cursor-pointer transition-all ${
                      active
                        ? 'bg-purple-600/35 border-sky-400 text-white font-bold'
                        : 'v2-neu-inset border-white/10 text-purple-200/80'
                    }`}
                  >
                    <div className="truncate">{persona.name}</div>
                    <div className="text-[10px] opacity-75 truncate">{persona.tagline}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="space-y-1.5">
                <div className="flex justify-between text-purple-200/80">
                  <span className="flex items-center gap-1">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Speech Speed</span>
                  </span>
                  <span className="font-mono tabular-nums">{(settings.voiceSpeed ?? 1).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={settings.voiceSpeed ?? 1.0}
                  onChange={(e) => onUpdateSettings({ voiceSpeed: Number(e.target.value) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>

              <label className="space-y-1.5">
                <div className="flex justify-between text-purple-200/80">
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Volume</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {Math.round((settings.voiceVolume ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={settings.voiceVolume ?? 1.0}
                  onChange={(e) => onUpdateSettings({ voiceVolume: Number(e.target.value) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>
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
                label="Voice Reader (Auto-Speak Replies)"
                description="Automatically speak AI answers aloud when enabled."
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
              <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-sky-400" />
                    <span>Google Gemini Engine</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      aiHealth?.state === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : aiHealth?.state === 'offline'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-purple-500/20 text-purple-200'
                    }`}
                  >
                    {aiHealth?.state || (isOnline ? 'Ready' : 'Offline')}
                  </span>
                </div>
                <div className="text-[11px] text-purple-200/75 tabular-nums">
                  Model: {aiHealth?.model || settings.geminiModel || 'gemini-4-hydrogen'}
                  {aiHealth?.latencyMs ? ` · ${aiHealth.latencyMs} ms` : ''}
                </div>
              </div>

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
      <TermsPrivacyModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        initialTab={termsModalTab}
      />
    </div>
  );
};
