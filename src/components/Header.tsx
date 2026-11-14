import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  Mic,
  Volume2,
  VolumeX,
  Sliders,
  Type,
  SunMoon,
  Sun,
  Moon,
  Sparkles,
  Flame,
  Search,
  Check,
  User as UserIcon,
  LogIn,
  LogOut,
  ShieldCheck,
  Trophy,
  Activity,
  ChevronDown,
  RefreshCw,
  Edit3,
  Download,
  Smartphone,
} from 'lucide-react';
import { AIConnectionState, AppSettings, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from '../data/languages';
import { computeLevelInfo } from '../utils/gamification';
import { GamificationWidget } from './GamificationWidget';
import { generateThemeTokensFromColor } from '../utils/avatarTheme';

interface HeaderProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  aiStatus: AIConnectionState;
  onRefreshAIStatus: () => void;
  isOnline: boolean;
  onToggleForceOffline: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSettings: () => void;
  totalTranslations: number;
  user: UserProfile;
  isOwnerAdmin?: boolean;
  onOpenAuth: (mode?: 'signin' | 'register' | 'profile') => void;
  onOpenGamification: () => void;
  onOpenInstall?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  aiStatus,
  onRefreshAIStatus,
  isOnline,
  onToggleForceOffline,
  activeTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  user,
  isOwnerAdmin = false,
  onOpenAuth,
  onOpenGamification,
  onOpenInstall,
}) => {
  const avatarTokens = generateThemeTokensFromColor(user.avatarColor);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const accessRef = useRef<HTMLDivElement>(null);

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;
  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage) || SUPPORTED_LANGUAGES[0];

  const levelInfo = computeLevelInfo(user.xp || 0);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangDropdownOpen(false);
      }
      if (accessRef.current && !accessRef.current.contains(event.target as Node)) {
        setAccessMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-nav px-3 sm:px-6 py-2.5 flex items-center justify-between border-b border-white/10 shadow-lg">
      {/* BRAND LOGO & LIVE AI STATUS */}
      <div className="flex items-center space-x-3">
        <div
          onClick={() => onSelectTab('chat')}
          className="w-10 h-10 rounded-xl purple-glow-btn flex items-center justify-center text-white font-bold text-xl shadow-md transition-transform hover:scale-105 cursor-pointer shrink-0"
        >
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div>
          <div
            onClick={() => onSelectTab('chat')}
            className="cursor-pointer flex items-center gap-1.5"
          >
            <span className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1">
              Aadesh <span className="text-gradient">AI</span>
            </span>
            <span className="text-xs font-semibold text-purple-300 hidden md:inline">
              Global Hub
            </span>
          </div>

          {/* LIVE AI STATUS BADGE (Connected / Connecting / Disconnected) */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              onClick={onRefreshAIStatus}
              title={
                aiStatus === 'connected'
                  ? 'AI Service Connected & Live (Click to verify connection)'
                  : aiStatus === 'connecting'
                  ? 'Verifying AI API Service...'
                  : 'AI Service Disconnected. Click to reconnect or configure API Key.'
              }
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1.5 transition-all cursor-pointer ${
                aiStatus === 'connected'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                  : aiStatus === 'connecting'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40 hover:bg-amber-900/60'
                  : 'bg-rose-950/80 text-rose-300 border-rose-500/40 hover:bg-rose-900/60'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  aiStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : aiStatus === 'connecting'
                    ? 'bg-amber-400 animate-spin'
                    : 'bg-rose-500'
                }`}
              />
              <span>
                {aiStatus === 'connected'
                  ? 'Live AI'
                  : aiStatus === 'connecting'
                  ? 'Connecting...'
                  : 'Disconnected'}
              </span>
            </button>

            {/* Offline indicator if forced offline */}
            {!isOnline && (
              <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                Offline Cache
              </span>
            )}
          </div>
        </div>
      </div>

      {/* CENTER SEARCH BAR */}
      <div className="hidden md:flex items-center relative w-1/3 max-w-md">
        <Search className="absolute left-3.5 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchPlaceholder || 'Search messages, sessions, or geotags...'}
          className="w-full bg-[#131520]/80 border border-[#232738] focus:border-purple-500 text-xs sm:text-sm rounded-xl pl-10 pr-4 py-2 text-gray-200 placeholder-gray-500 outline-none transition-all focus:ring-1 focus:ring-purple-500/50"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 text-xs text-gray-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* RIGHT CONTROLS: STREAK/XP PILL + USER IDENTITY WITH ORANGE HIGHLIGHT + UTILITIES */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* GAMIFICATION STREAK, XP & DAILY GOALS WIDGET */}
        <GamificationWidget user={user} onClick={onOpenGamification} />

        {/* USER PROFILE & IDENTITY WITH ORANGE HIGHLIGHTED IDENTITY LINE */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setProfileDropdownOpen(!profileDropdownOpen);
              setLangDropdownOpen(false);
              setAccessMenuOpen(false);
            }}
            className="flex items-center space-x-2.5 bg-[#131520] hover:bg-[#1a172c] border border-amber-500/80 hover:border-amber-400 py-1 px-2 sm:px-3 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.28)] hover:shadow-[0_0_22px_rgba(245,158,11,0.45)] transition-all cursor-pointer group"
            title="User Profile, Identity & Account Settings"
          >
            {/* User Avatar */}
            <div
              className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full p-[2px] shrink-0 transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.secondaryHex}, ${avatarTokens.lightHex})`,
                boxShadow: `0 0 10px rgba(${avatarTokens.primaryRgb}, 0.45)`,
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-black"
                  style={{
                    background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #131520)`,
                  }}
                >
                  {(user.name || 'G').charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#131520] shadow-sm animate-pulse"
                style={{ backgroundColor: avatarTokens.lightHex }}
              />
            </div>

            {/* User Name & Handle */}
            <div className="flex flex-col text-left">
              <span className="text-[11px] sm:text-xs font-black text-white leading-tight group-hover:text-amber-200 transition-colors truncate max-w-[100px] sm:max-w-[130px]">
                {user.name}
              </span>
              <div className="text-[9px] font-extrabold text-amber-300 flex items-center gap-1 leading-none mt-0.5 bg-gradient-to-r from-amber-500/25 via-amber-500/15 to-transparent px-1.5 py-0.5 rounded border border-amber-400/50 shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-ping" />
                <span className="tracking-wider uppercase truncate">@{user.username || 'guest'}</span>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 ml-0.5" />
          </button>

          {/* USER PROFILE DROPDOWN */}
          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 glass-card rounded-2xl p-3 border border-purple-500/40 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
              {/* Profile Card Header */}
              <div className="flex items-center gap-3 p-2 rounded-xl bg-[#090a0f] border border-amber-500/30">
                <div
                  className="w-11 h-11 rounded-full p-[2px] shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.secondaryHex}, ${avatarTokens.lightHex})`,
                  }}
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-white text-sm font-black"
                      style={{
                        background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #131520)`,
                      }}
                    >
                      {(user.name || 'G').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <span>{user.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-semibold uppercase">
                      {isOwnerAdmin ? 'Owner' : user.isLoggedIn ? 'Member' : 'Guest'}
                    </span>
                  </h4>
                  <p className="text-[10px] text-amber-400 font-semibold truncate">
                    @{user.username || 'guest'}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {user.email || 'Not signed in'}
                  </p>
                </div>
              </div>

              {/* Quick Gamification Bar in Dropdown */}
              <div
                onClick={() => {
                  setProfileDropdownOpen(false);
                  onOpenGamification();
                }}
                className="p-2.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 cursor-pointer transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                  <span className="flex items-center gap-1 text-amber-400">
                    <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>{user.streakDays || 1}-Day Streak</span>
                  </span>
                  <span className="text-purple-300 font-mono">
                    {(user.xp || 0).toLocaleString()} XP
                  </span>
                </div>
                <div className="text-[10px] text-gray-300 flex items-center justify-between">
                  <span>Level {levelInfo.level}: {levelInfo.levelTitle}</span>
                  <span className="text-purple-400 text-[9px] underline">View Details</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-1 text-xs">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onSelectTab('profile');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-purple-400" />
                  <span>Open Profile & Language</span>
                </button>

                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenAuth(user.isLoggedIn ? 'profile' : 'signin');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-purple-400" />
                  <span>{user.isLoggedIn ? 'Edit Profile & Photo' : 'Sign In / Create Account'}</span>
                </button>

                {isOwnerAdmin && (
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onSelectTab('admin');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-amber-300 hover:text-white hover:bg-amber-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Owner Admin Dashboard</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenGamification();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Activity & Achievement Badges</span>
                </button>

                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Account & AI Settings</span>
                </button>

                {onOpenInstall && (
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onOpenInstall();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-gray-200 hover:text-white hover:bg-emerald-950/30 border border-transparent hover:border-emerald-500/30 flex items-center gap-2.5 transition-colors cursor-pointer text-emerald-300"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>Install App (Android & iOS)</span>
                  </button>
                )}
              </div>

              {/* Sign In / Sign Out Button */}
              <div className="pt-2 border-t border-white/10">
                {user.isLoggedIn ? (
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onOpenAuth('profile');
                    }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Manage Account & Sign Out</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onOpenAuth('signin');
                    }}
                    className="purple-glow-btn w-full py-2 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Global Hub</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* UI LANGUAGE SELECTOR DROPDOWN */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => {
              setLangDropdownOpen(!langDropdownOpen);
              setProfileDropdownOpen(false);
              setAccessMenuOpen(false);
            }}
            className="flex items-center gap-1.5 bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/50 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-200 transition-all cursor-pointer"
            title="Change Interface Language"
          >
            <span className="text-sm">{currentLang.flag}</span>
            <span className="hidden sm:inline font-medium">{currentLang.name}</span>
            <Globe className="w-3.5 h-3.5 text-purple-400 ml-0.5" />
          </button>

          {langDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 max-h-72 overflow-y-auto glass-card rounded-2xl p-2 border border-purple-500/40 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-[11px] font-semibold text-gray-400 px-2 py-1 uppercase tracking-wider">
                Select UI Language
              </div>
              <div className="space-y-0.5 mt-1">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onUpdateSettings({ uiLanguage: lang.code });
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      settings.uiLanguage === lang.code
                        ? 'bg-purple-600/30 text-purple-200 font-semibold border border-purple-500/40'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                    {settings.uiLanguage === lang.code && (
                      <Check className="w-3 h-3 text-purple-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* HANDS-FREE VOICE TOGGLE */}
        <button
          onClick={() => onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })}
          className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border cursor-pointer ${
            settings.handsFreeMode
              ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/40 animate-pulse'
              : 'bg-[#131520] text-gray-400 border-[#232738] hover:text-white'
          }`}
          title={
            settings.handsFreeMode
              ? 'Hands-Free Voice Active (Listening & Speaking)'
              : 'Turn On Hands-Free Mode'
          }
        >
          <Mic className="w-4 h-4" />
          <span className="hidden xl:inline text-xs font-medium">Hands-Free</span>
        </button>

        {/* AUTO-SPEECH READOUT TOGGLE */}
        <button
          onClick={() =>
            onUpdateSettings({ autoSpeakAIResponses: !settings.autoSpeakAIResponses })
          }
          className={`p-2 rounded-xl text-xs transition-all border cursor-pointer ${
            settings.autoSpeakAIResponses
              ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
              : 'bg-[#131520] text-gray-400 border-[#232738] hover:text-white'
          }`}
          title={
            settings.autoSpeakAIResponses
              ? 'Auto Speech Readout ON'
              : 'Auto Speech Readout OFF'
          }
        >
          {settings.autoSpeakAIResponses ? (
            <Volume2 className="w-4 h-4 text-indigo-400" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>

        {/* MODERN DARK / LIGHT THEME SWITCHER */}
        <button
          onClick={() => {
            const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
            onUpdateSettings({ theme: nextTheme });
            if (nextTheme === 'light') {
              document.body.classList.add('light-theme');
            } else {
              document.body.classList.remove('light-theme');
            }
          }}
          className="p-2 rounded-xl bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/50 text-gray-300 hover:text-white transition-all cursor-pointer"
          title={
            settings.theme === 'light'
              ? 'Switch to Dark Theme'
              : 'Switch to Light Theme'
          }
          aria-label="Toggle dark/light theme"
        >
          {settings.theme === 'light' ? (
            <Moon className="w-4 h-4 text-purple-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </button>

        {/* ACCESSIBILITY & DISPLAY CONTROLS */}
        <div className="relative" ref={accessRef}>
          <button
            onClick={() => {
              setAccessMenuOpen(!accessMenuOpen);
              setLangDropdownOpen(false);
              setProfileDropdownOpen(false);
            }}
            className="p-2 rounded-xl bg-[#131520] border border-[#232738] text-gray-300 hover:text-purple-300 hover:border-purple-500/50 transition-all cursor-pointer"
            title="Accessibility & Display"
            aria-label="Accessibility settings"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {accessMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 glass-card rounded-2xl p-4 border border-purple-500/40 shadow-2xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-xs font-bold text-white border-b border-white/10 pb-2 flex items-center justify-between">
                <span>Accessibility & Display</span>
                <button
                  onClick={() => {
                    setAccessMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="text-[10px] text-purple-400 hover:underline cursor-pointer"
                >
                  All Settings
                </button>
              </div>

              {/* Text Size */}
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <Type className="w-3 h-3 text-purple-400" />
                  <span>Text Scaling</span>
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['normal', 'large', 'xlarge'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => onUpdateSettings({ fontSize: size })}
                      className={`text-xs py-1 rounded-lg border font-medium capitalize cursor-pointer ${
                        settings.fontSize === size
                          ? 'bg-purple-600/40 border-purple-400 text-purple-200'
                          : 'bg-[#090a0f] border-[#232738] text-gray-400 hover:text-white'
                      }`}
                    >
                      {size === 'normal' ? 'Default' : size === 'large' ? 'Large' : 'XL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* High Contrast */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-300 flex items-center gap-1.5">
                  <SunMoon className="w-3.5 h-3.5 text-purple-400" />
                  <span>High Contrast</span>
                </span>
                <button
                  onClick={() => onUpdateSettings({ highContrast: !settings.highContrast })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    settings.highContrast ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.highContrast ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
