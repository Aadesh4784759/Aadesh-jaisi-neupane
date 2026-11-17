import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  Settings as SettingsIcon,
  Sun,
  Moon,
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
} from 'lucide-react';
import { AppSettings, ChatSession, GeotaggedMedia, UserProfile, VoicePersona } from '../types';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS } from '../data/languages';
import { COUNTRY_OPTIONS, detectUserCountry, detectCountryViaGPS } from '../utils/country';
import { updateUserProfile } from '../utils/firebase';
import { saveUserLocalExtras } from '../utils/storage';
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

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSection = 'settings',
  user,
  settings,
  sessions,
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
  const [editUsername, setEditUsername] = useState(user.username || '');
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
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');

  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setEditName(user.name || '');
    setEditUsername(user.username || '');
    setEditCountry(user.country || 'Global');
    setEditFlag(user.countryFlag || '🌐');
    setEditAvatar(user.avatarUrl || '');
  }, [user]);

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
    const cleanHandle =
      editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || user.username || 'user';

    setSavingProfile(true);
    try {
      saveUserLocalExtras(user.id, {
        country: editCountry,
        countryFlag: editFlag,
        isManualCountry: true,
        customAvatarDataUrl: editAvatar.startsWith('data:') ? editAvatar : undefined,
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
        username: cleanHandle,
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

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {toast && (
        <div className="fixed top-18 right-4 z-50 glass-card rounded-2xl px-4 py-2.5 border border-purple-400/50 text-xs font-semibold text-white flex items-center gap-2 shadow-xl">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Section Switcher: Profile vs Settings */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {section === 'profile' ? 'User Profile' : 'Settings & Preferences'}
          </h1>
          <p className="text-xs text-purple-200/75">
            {section === 'profile'
              ? 'Manage your identity, country flag, profile photo, and streak overview.'
              : 'Theme, language, voice, notifications, privacy, security, and account controls.'}
          </p>
        </div>

        <div className="inline-flex p-1 rounded-2xl bg-[#0b0818] border border-purple-400/25 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setSection('profile')}
            className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              section === 'profile' ? 'purple-glow-btn text-white' : 'text-purple-200/75 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('settings')}
            className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              section === 'settings' ? 'purple-glow-btn text-white' : 'text-purple-200/75 hover:text-white'
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
          <div className="glass-card rounded-3xl p-5 sm:p-7 border border-purple-400/35 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full p-[2.5px]"
                    style={{
                      background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.lightHex})`,
                      boxShadow: `0 8px 24px rgba(${avatarTokens.primaryRgb}, 0.4)`,
                    }}
                  >
                    {(editAvatar || user.avatarUrl) ? (
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
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full purple-glow-btn text-white flex items-center justify-center border border-white/30 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl leading-none">{user.countryFlag || '🌐'}</span>
                    <h2 className="text-lg sm:text-xl font-black text-white truncate">
                      {user.name || user.username}
                    </h2>
                    {isOwnerAdmin && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-400/40">
                        Owner Admin
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-purple-300">@{user.username || 'member'}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-purple-200/75">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-purple-400" />
                      <span>{user.email || 'No email'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-purple-400" />
                      <span>{user.country || 'Global'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingProfile((prev) => !prev)}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/45 text-purple-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-center"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
              </button>
            </div>

            {/* Edit Profile Form */}
            {isEditingProfile && (
              <form
                onSubmit={handleSaveProfile}
                className="p-4 sm:p-5 rounded-2xl bg-[#0b0818]/85 border border-purple-400/35 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs">
                    <span className="text-purple-200/80 font-semibold block">Display Name</span>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-purple-400 text-white outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-xs">
                    <span className="text-purple-200/80 font-semibold block">Username</span>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-purple-400 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-purple-200/80 font-semibold">Country &amp; Flag (Manual or Auto)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const detected = detectUserCountry();
                          setEditCountry(detected.country);
                          setEditFlag(detected.flag);
                          showToast(`Auto-detected: ${detected.country} ${detected.flag}`);
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
                          const gpsResult = await detectCountryViaGPS();
                          setIsDetectingGps(false);
                          if (gpsResult) {
                            setEditCountry(gpsResult.country);
                            setEditFlag(gpsResult.flag);
                            showToast(`GPS Detected: ${gpsResult.country} ${gpsResult.flag}`);
                          } else {
                            showToast('GPS permission denied or unavailable. Please select manually.');
                          }
                        }}
                        className="text-[11px] text-cyan-300 hover:text-white underline cursor-pointer disabled:opacity-50"
                      >
                        {isDetectingGps ? 'Detecting GPS...' : 'Detect via GPS'}
                      </button>
                    </div>
                  </div>

                  {/* Searchable country filter input */}
                  <input
                    type="text"
                    value={countrySearchQuery}
                    onChange={(e) => setCountrySearchQuery(e.target.value)}
                    placeholder="Search country name or code (e.g., US, Nepal, Japan)..."
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-purple-400 text-white outline-none text-xs"
                  />

                  {/* Searchable Country Selector */}
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
                    className="w-full px-2 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-purple-400 text-white outline-none font-medium cursor-pointer"
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
                    className="purple-glow-btn min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}

            {/* Account Information & Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
              <div className="p-3.5 rounded-2xl bg-[#0b0818]/75 border border-white/10 space-y-1">
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
                    className="text-purple-300 hover:text-white cursor-pointer shrink-0"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0b0818]/75 border border-white/10 space-y-1">
                <div className="text-[11px] text-purple-300/80 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Daily Streak</span>
                </div>
                <div className="text-sm font-black text-white tabular-nums">
                  🔥 {user.streakDays || 1} Days · {(user.xp || 0).toLocaleString()} XP
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0b0818]/75 border border-white/10 space-y-1">
                <div className="text-[11px] text-purple-300/80 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>Account Info</span>
                </div>
                <div className="text-xs font-bold text-white capitalize">
                  {user.provider} · Joined {createdDateStr}
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Avatar Accent Color */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Palette className="w-4 h-4 text-purple-400" />
              <span>Accent Glow Color</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLOR_PRESETS.map((preset) => {
                const selected = (user.avatarColor || DEFAULT_AVATAR_COLOR).toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onUpdateUser({ ...user, avatarColor: preset.hex })}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                      selected
                        ? 'bg-purple-600/35 border-purple-300 text-white'
                        : 'bg-[#0b0818]/75 border-white/10 text-purple-200/80 hover:border-purple-400/40'
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
        /* SETTINGS SECTION */
        <div className="space-y-4">
          {/* 1. Theme & Appearance Selection */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-300" />
                <h2 className="text-sm font-bold text-white">App Theme &amp; Visual Style</h2>
              </div>
              <span className="text-[11px] font-semibold text-purple-300/80">
                Active: {settings.theme === 'light' ? 'Pure Light' : COLOR_THEME_PRESETS.find((p) => p.id === settings.colorTheme)?.name || 'Dark Galaxy'}
              </span>
            </div>

            <p className="text-xs text-purple-200/75">
              Select your preferred appearance. Your chosen theme is persisted across browser refreshes and synced to your cloud account.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {COLOR_THEME_PRESETS.filter((p) => p.id !== 'purple-galaxy').map((preset) => {
                const isSelected =
                  (preset.id === 'pure-light' && settings.theme === 'light') ||
                  (settings.theme !== 'light' && (
                    settings.colorTheme === preset.id ||
                    (preset.id === 'dark-galaxy' && (!settings.colorTheme || settings.colorTheme === 'purple-galaxy'))
                  ));

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
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-purple-600/30 border-purple-300 text-white shadow-[0_0_22px_rgba(139,92,246,0.35)] ring-1 ring-purple-400'
                        : 'bg-[#0b0818]/75 border-white/10 text-purple-200/80 hover:border-purple-400/40 hover:bg-[#120e24]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-white/30 shadow-sm shrink-0"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="text-xs font-bold text-white">{preset.name}</span>
                      </div>
                      {isSelected ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-400 text-emerald-300 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-gray-500">
                          {preset.themeMode === 'light' ? 'Light' : 'Dark'}
                        </span>
                      )}
                    </div>

                    <div
                      className={`h-2 w-full rounded-full bg-gradient-to-r ${preset.gradientClass} opacity-85`}
                    />

                    <p className="text-[11px] text-purple-200/65 line-clamp-2">
                      {preset.description || `${preset.name} ambient coloring.`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Language Preferences */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Globe className="w-4 h-4 text-purple-300" />
              <h2 className="text-sm font-bold text-white">Language Preferences</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1.5">
                <span className="text-purple-200/80 font-semibold block">Interface Language</span>
                <select
                  value={settings.uiLanguage}
                  onChange={(e) => onUpdateSettings({ uiLanguage: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0b0818] border border-purple-400/30 text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-purple-200/80 font-semibold block">Default Translation Target</span>
                <select
                  value={settings.defaultTargetLanguage}
                  onChange={(e) => onUpdateSettings({ defaultTargetLanguage: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0b0818] border border-purple-400/30 text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* 3. Voice Settings */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-purple-300" />
                <h2 className="text-sm font-bold text-white">Voice Settings</h2>
              </div>
              <button
                type="button"
                onClick={handleTestVoice}
                className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-xs font-semibold text-purple-100 flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>Test Voice</span>
              </button>
            </div>

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
                        ? 'bg-purple-600/35 border-purple-300 text-white font-bold'
                        : 'bg-[#0b0818]/75 border-white/10 text-purple-200/80'
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
                  <span>Speech Speed</span>
                  <span className="font-mono tabular-nums">{(settings.voiceSpeed ?? 1).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={settings.voiceSpeed ?? 1.0}
                  onChange={(e) => onUpdateSettings({ voiceSpeed: Number(e.target.value) })}
                  className="w-full accent-purple-500 cursor-pointer"
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
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 text-xs cursor-pointer">
                <span className="text-purple-100 font-semibold">Auto-Speak AI Replies</span>
                <input
                  type="checkbox"
                  checked={settings.autoSpeakAIResponses}
                  onChange={(e) => onUpdateSettings({ autoSpeakAIResponses: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 text-xs cursor-pointer">
                <span className="text-purple-100 font-semibold">Hands-Free Voice Mode</span>
                <input
                  type="checkbox"
                  checked={settings.handsFreeMode}
                  onChange={(e) => onUpdateSettings({ handsFreeMode: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>
            </div>
          </div>

          {/* 4. Notification Preferences */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-300" />
                <h2 className="text-sm font-bold text-white">Notification Preferences</h2>
              </div>
              <span className="text-[11px] text-purple-300/75 capitalize">
                Browser: {notifPermission}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <button
                type="button"
                onClick={handleToggleNotifications}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer"
              >
                <span className="text-purple-100 font-semibold">Push Alerts</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    settings.notificationsEnabled ?? true
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {settings.notificationsEnabled ?? true ? 'ON' : 'OFF'}
                </span>
              </button>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer">
                <span className="text-purple-100 font-semibold">Sound Effects</span>
                <input
                  type="checkbox"
                  checked={settings.soundEffects ?? true}
                  onChange={(e) => onUpdateSettings({ soundEffects: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer">
                <span className="text-purple-100 font-semibold">Streak Reminders</span>
                <input
                  type="checkbox"
                  checked={settings.streakReminders ?? true}
                  onChange={(e) => onUpdateSettings({ streakReminders: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>
            </div>
          </div>

          {/* 5. Account, Privacy & Security */}
          <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Shield className="w-4 h-4 text-purple-300" />
              <h2 className="text-sm font-bold text-white">Account, Privacy &amp; Security</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer">
                <span className="text-purple-100 font-semibold">Streaming AI Responses</span>
                <input
                  type="checkbox"
                  checked={settings.streamingResponses !== false}
                  onChange={(e) => onUpdateSettings({ streamingResponses: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer">
                <span className="text-purple-100 font-semibold">AI Personalization Memory</span>
                <input
                  type="checkbox"
                  checked={settings.aiMemoryEnabled !== false}
                  onChange={(e) => onUpdateSettings({ aiMemoryEnabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
              </label>

              <button
                type="button"
                onClick={onToggleForceOffline}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 border border-white/10 cursor-pointer"
              >
                <span className="text-purple-100 font-semibold">Offline Local Mode</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    !isOnline ? 'bg-amber-500/25 text-amber-300' : 'bg-emerald-500/25 text-emerald-300'
                  }`}
                >
                  {!isOnline ? 'Offline' : 'Online'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenInstall}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0818]/75 hover:bg-purple-900/30 border border-white/10 cursor-pointer"
              >
                <span className="text-purple-100 font-semibold flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Install App (PWA)</span>
                </span>
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTermsModalTab('terms');
                  setIsTermsModalOpen(true);
                }}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/35 text-xs font-semibold text-purple-100 flex items-center gap-2 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-purple-300" />
                <span>Terms of Service &amp; Privacy Policy</span>
              </button>

              <button
                type="button"
                onClick={onOpenFullBackup}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-purple-100 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-purple-300" />
                <span>Advanced Backup &amp; API Settings ({sessions.length} chats)</span>
              </button>

              {isOwnerAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="min-h-[42px] px-4 py-2 rounded-2xl bg-amber-950/60 hover:bg-amber-900/70 border border-amber-400/40 text-xs font-bold text-amber-200 flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Owner Admin Dashboard</span>
                </button>
              )}

              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllData();
                      setConfirmClear(false);
                      showToast('Local cache cleared.');
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-2xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Clear Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="min-h-[42px] px-3 py-2 rounded-2xl bg-white/10 text-xs text-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/5 hover:bg-rose-950/50 border border-white/10 hover:border-rose-400/35 text-xs font-semibold text-purple-200 hover:text-rose-200 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Local Cache</span>
                </button>
              )}
            </div>
          </div>

          {/* 6. Sign Out */}
          <div className="glass-card rounded-3xl p-4 border border-rose-400/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">Session Control</div>
              <div className="text-xs text-purple-200/70">
                Signed in as {user.email || user.name}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-rose-600/85 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-lg shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
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
