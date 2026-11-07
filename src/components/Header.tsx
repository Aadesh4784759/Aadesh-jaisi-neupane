import React, { useState } from 'react';
import {
  Globe,
  Mic,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Sliders,
  Type,
  SunMoon,
  Sparkles,
  Flame,
  Search,
  Check,
} from 'lucide-react';
import { AppSettings, LanguageOption } from '../types';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from '../data/languages';

interface HeaderProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  isOnline: boolean;
  onToggleForceOffline: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSettings: () => void;
  totalTranslations: number;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  isOnline,
  onToggleForceOffline,
  activeTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  totalTranslations,
}) => {
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <header className="sticky top-0 z-40 w-full glass-nav px-3 sm:px-6 py-2.5 flex items-center justify-between border-b border-white/10 shadow-lg">
      {/* Brand & Logo */}
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab('chat')}>
        <div className="w-10 h-10 rounded-xl purple-glow-btn flex items-center justify-center text-white font-bold text-xl shadow-md transition-transform hover:scale-105">
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div>
          <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
            Aadesh <span className="text-gradient">AI</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/30 tracking-wide hidden xs:inline-block">
              Learning AI
            </span>
            {/* Online / Offline status badge */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleForceOffline();
              }}
              title={isOnline ? 'Online mode. Click to simulate offline mode.' : 'Offline mode active. Click to reconnect.'}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 transition-colors ${
                isOnline
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50'
                  : 'bg-amber-950/70 text-amber-300 border-amber-500/30 hover:bg-amber-900/50'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
              <span>{isOnline ? 'Live AI' : 'Offline'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Center Search Input */}
      <div className="hidden md:flex items-center relative w-1/3 max-w-md">
        <Search className="absolute left-3.5 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full bg-[#131520]/80 border border-[#232738] focus:border-purple-500 text-xs sm:text-sm rounded-xl pl-10 pr-4 py-2 text-gray-200 placeholder-gray-500 outline-none transition-all focus:ring-1 focus:ring-purple-500/50"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 text-xs text-gray-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Right Controls: Language Dropdown, Voice Toggle, Accessibility */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Stats Pill */}
        <div className="hidden sm:flex items-center space-x-2.5 bg-[#131520]/90 border border-[#232738] px-3 py-1 rounded-xl text-xs">
          <span className="flex items-center gap-1 text-amber-400 font-semibold" title="Day Streak">
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
            <span>7 Days</span>
          </span>
          <span className="w-px h-3 bg-gray-700" />
          <span className="flex items-center gap-1 text-purple-300 font-semibold" title="XP Points">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>2,450 XP</span>
          </span>
        </div>

        {/* Author Attribution Snippet */}
        <div className="hidden md:flex items-center space-x-2 bg-[#131520]/80 border border-purple-500/30 py-1 px-2.5 rounded-xl shadow-sm">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 p-[1.5px] shrink-0">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
              alt="Aadesh Jaisi"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-bold text-gray-200 leading-tight">Aadesh Jaisi</span>
            <span className="text-[9px] text-purple-400 font-medium leading-none">आदेश जैसी</span>
          </div>
        </div>

        {/* UI Language Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setLangDropdownOpen(!langDropdownOpen);
              setAccessMenuOpen(false);
            }}
            className="flex items-center gap-1.5 bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/50 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-200 transition-all"
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
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      settings.uiLanguage === lang.code
                        ? 'bg-purple-600/30 text-purple-200 font-semibold border border-purple-500/40'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                    {settings.uiLanguage === lang.code && <Check className="w-3 h-3 text-purple-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hands-free Voice Toggle */}
        <button
          onClick={() => onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })}
          className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border ${
            settings.handsFreeMode
              ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/40 animate-pulse'
              : 'bg-[#131520] text-gray-400 border-[#232738] hover:text-white'
          }`}
          title={settings.handsFreeMode ? 'Hands-Free Voice Active (Listening & Speaking)' : 'Turn On Hands-Free Mode'}
        >
          <Mic className="w-4 h-4" />
          <span className="hidden xl:inline text-xs font-medium">Hands-Free</span>
        </button>

        {/* Auto-Speech Readout Toggle */}
        <button
          onClick={() => onUpdateSettings({ autoSpeakAIResponses: !settings.autoSpeakAIResponses })}
          className={`p-2 rounded-xl text-xs transition-all border ${
            settings.autoSpeakAIResponses
              ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
              : 'bg-[#131520] text-gray-400 border-[#232738] hover:text-white'
          }`}
          title={settings.autoSpeakAIResponses ? 'Auto Speech Readout ON' : 'Auto Speech Readout OFF'}
        >
          {settings.autoSpeakAIResponses ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Accessibility & Display Controls Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setAccessMenuOpen(!accessMenuOpen);
              setLangDropdownOpen(false);
            }}
            className="p-2 rounded-xl bg-[#131520] border border-[#232738] text-gray-300 hover:text-purple-300 hover:border-purple-500/50 transition-all"
            title="Accessibility Options"
            aria-label="Accessibility settings"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {accessMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 glass-card rounded-2xl p-4 border border-purple-500/40 shadow-2xl z-50 space-y-3">
              <div className="text-xs font-bold text-white border-b border-white/10 pb-2 flex items-center justify-between">
                <span>Accessibility & Display</span>
                <button
                  onClick={() => {
                    setAccessMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="text-[10px] text-purple-400 hover:underline"
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
                      className={`text-xs py-1 rounded-lg border font-medium capitalize ${
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
                  className={`w-9 h-5 rounded-full transition-colors relative ${
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
