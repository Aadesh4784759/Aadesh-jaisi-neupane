import React from 'react';
import {
  User,
  Mail,
  Calendar,
  Globe2,
  Edit3,
  LogIn,
  LogOut,
  ShieldCheck,
  Flame,
  Trophy,
  MessageSquare,
  Mic,
  Languages,
  Check,
  Sparkles,
  Palette,
} from 'lucide-react';
import { AppSettings, EngagementMetrics, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import { computeLevelInfo } from '../utils/gamification';
import {
  AVATAR_COLOR_PRESETS,
  DEFAULT_AVATAR_COLOR,
  generateThemeTokensFromColor,
} from '../utils/avatarTheme';

interface ProfileViewProps {
  user: UserProfile;
  settings: AppSettings;
  metrics: EngagementMetrics;
  sessionCount: number;
  totalMessages: number;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateUser: (updated: UserProfile) => void;
  onOpenAuth: (mode?: 'signin' | 'register' | 'profile') => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onOpenAdmin?: () => void;
  isOwnerAdmin: boolean;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  settings,
  metrics,
  sessionCount,
  totalMessages,
  onUpdateSettings,
  onUpdateUser,
  onOpenAuth,
  onSignOut,
  onOpenSettings,
  onOpenAdmin,
  isOwnerAdmin,
}) => {
  const levelInfo = computeLevelInfo(user.xp || 0);
  const createdDateStr = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Session Active';

  const preferredLang = user.preferredLanguage || settings.uiLanguage || 'en';
  const activeAvatarColor = user.avatarColor || DEFAULT_AVATAR_COLOR;
  const themeTokens = generateThemeTokensFromColor(activeAvatarColor);
  const dynamicThemeEnabled = settings.dynamicAvatarTheme !== false;

  const handleSelectPreferredLanguage = (langCode: string) => {
    onUpdateSettings({ uiLanguage: langCode });
    onUpdateUser({ ...user, preferredLanguage: langCode });
  };

  const handleSelectAvatarColor = (hex: string) => {
    onUpdateUser({ ...user, avatarColor: hex });
    if (!dynamicThemeEnabled) {
      onUpdateSettings({ dynamicAvatarTheme: true });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-32 w-full">
      {/* Main Identity Card */}
      <div className="glass-card rounded-3xl p-5 sm:p-7 border border-purple-500/35 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl p-[2.5px] shrink-0 shadow-lg transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, ${themeTokens.primaryHex}, ${themeTokens.secondaryHex}, ${themeTokens.lightHex})`,
                boxShadow: `0 8px 24px rgba(${themeTokens.primaryRgb}, 0.38)`,
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-full h-full object-cover rounded-[13px]"
                />
              ) : (
                <div
                  className="w-full h-full rounded-[13px] flex items-center justify-center text-white text-2xl font-black transition-colors duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${themeTokens.deepHex}, #131520)`,
                  }}
                >
                  {(user.name || 'G').charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white truncate">{user.name}</h2>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    user.isLoggedIn
                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                      : 'bg-purple-950/70 text-purple-300 border-purple-500/40'
                  }`}
                >
                  {user.isLoggedIn ? `${user.provider} Account` : 'Guest Session'}
                </span>
                {isOwnerAdmin && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-500/40">
                    Platform Owner
                  </span>
                )}
              </div>

              <p className="text-xs text-purple-300 font-semibold">@{user.username || 'guest'}</p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-0.5">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-purple-400" />
                  <span>{user.email || 'Not signed in — sign in to sync across devices'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Joined: {createdDateStr}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {user.isLoggedIn ? (
              <>
                <button
                  onClick={() => onOpenAuth('profile')}
                  className="px-3.5 py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={onSignOut}
                  className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => onOpenAuth('signin')}
                className="purple-glow-btn px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
            )}
          </div>
        </div>

        {/* Account Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738]">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
              <span>Conversations</span>
            </div>
            <div className="text-xl font-black text-white mt-1">{sessionCount}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738]">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Total Messages</span>
            </div>
            <div className="text-xl font-black text-white mt-1">{totalMessages}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738]">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-emerald-400" />
              <span>Translations</span>
            </div>
            <div className="text-xl font-black text-white mt-1">{metrics.totalTranslations}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738]">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Level & Streak</span>
            </div>
            <div className="text-sm font-black text-white mt-1.5">
              Lv.{levelInfo.level} · {user.streakDays || 1}d
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Color & Dynamic UI Theme Studio */}
      <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{
                background: `linear-gradient(135deg, ${themeTokens.primaryHex}, ${themeTokens.secondaryHex})`,
              }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Avatar Color &amp; Dynamic Dashboard Theme</h3>
              <p className="text-[11px] text-gray-400">
                Choose your signature avatar color to automatically generate a personalized UI palette across glows, buttons, and accents.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={dynamicThemeEnabled}
            onClick={() => onUpdateSettings({ dynamicAvatarTheme: !dynamicThemeEnabled })}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              dynamicThemeEnabled
                ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                : 'bg-[#090a0f] border-[#232738] text-gray-400 hover:text-white'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                dynamicThemeEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span>{dynamicThemeEnabled ? 'Dynamic Theme: Active' : 'Dynamic Theme: Default'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {AVATAR_COLOR_PRESETS.map((preset) => {
            const isSelected = activeAvatarColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectAvatarColor(preset.hex)}
                aria-pressed={isSelected}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                  isSelected
                    ? 'bg-white/10 border-white/50 shadow-md'
                    : 'bg-[#090a0f] border-[#232738] hover:border-white/25'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-lg shrink-0 border border-white/25 flex items-center justify-center shadow-inner"
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{preset.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{preset.tagline}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
          <label className="flex items-center gap-3 text-xs text-gray-300 cursor-pointer">
            <input
              type="color"
              aria-label="Pick custom avatar color"
              value={activeAvatarColor}
              onChange={(e) => handleSelectAvatarColor(e.target.value)}
              className="w-9 h-9 rounded-lg border border-white/20 bg-transparent cursor-pointer p-0.5"
            />
            <div>
              <span className="font-semibold text-white block">Custom Hex Color</span>
              <span className="text-[11px] font-mono text-gray-400 uppercase">{activeAvatarColor}</span>
            </div>
          </label>

          {/* Live Generated Palette Preview */}
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <span>Generated Palette:</span>
            <span
              className="px-2 py-1 rounded-lg border border-white/15 text-white font-semibold"
              style={{ backgroundColor: themeTokens.primaryHex }}
            >
              Primary
            </span>
            <span
              className="px-2 py-1 rounded-lg border border-white/15 text-white font-semibold"
              style={{ backgroundColor: themeTokens.secondaryHex }}
            >
              Secondary
            </span>
            <span
              className="px-2 py-1 rounded-lg border border-white/15 text-[#090a0f] font-bold"
              style={{ backgroundColor: themeTokens.lightHex }}
            >
              Highlight
            </span>
          </div>
        </div>
      </div>

      {/* Preferred Language & Preferences Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
            <Globe2 className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Preferred Language (Remembered)</h3>
          </div>

          <p className="text-xs text-gray-400">
            Default primary languages are <strong className="text-gray-200">English</strong> and{' '}
            <strong className="text-gray-200">नेपाली (Nepali)</strong>. RTL layout automatically activates for Arabic and Urdu.
          </p>

          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = preferredLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelectPreferredLanguage(lang.code)}
                  className={`p-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                    selected
                      ? 'bg-purple-600/30 border-purple-400 text-white font-bold shadow'
                      : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
                  }`}
                >
                  <span className="truncate">
                    {lang.flag} {lang.nativeName}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Account Preferences & Quick Controls */}
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
              <User className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Account Settings & Security</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#090a0f] border border-[#232738] flex items-center justify-between">
                <span className="text-gray-300">Default Translation Target</span>
                <select
                  value={settings.defaultTargetLanguage}
                  onChange={(e) => onUpdateSettings({ defaultTargetLanguage: e.target.value })}
                  className="bg-[#131520] border border-purple-500/30 rounded-lg px-2 py-1 text-purple-200 font-semibold outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#090a0f] border border-[#232738] flex items-center justify-between">
                <span className="text-gray-300 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-purple-400" />
                  <span>Voice Persona</span>
                </span>
                <span className="capitalize font-bold text-purple-300">{settings.voicePersona}</span>
              </div>

              <button
                onClick={onOpenSettings}
                className="w-full py-2.5 px-3 rounded-xl bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/40 text-purple-200 font-semibold transition-all cursor-pointer"
              >
                Open Full AI, Gemini API Key & Voice Settings
              </button>

              {isOwnerAdmin && onOpenAdmin && (
                <button
                  onClick={onOpenAdmin}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 text-amber-200 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Open Owner Admin Dashboard</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-[11px] text-gray-400 flex items-center justify-between">
            <span>Aadesh AI Global Hub</span>
            <span className="text-purple-300 font-semibold">Created by Aadesh Jaisi</span>
          </div>
        </div>
      </div>
    </div>
  );
};
