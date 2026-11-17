import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
  Sparkles,
  AlertTriangle,
  Clock,
  ChevronDown,
  User as UserIcon,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';
import { AIConnectionHealth, UserProfile } from '../types';
import { generateThemeTokensFromColor } from '../utils/avatarTheme';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  user: UserProfile;
  aiHealth: AIConnectionHealth;
  isNetworkOnline: boolean;
  onRetryHealth: () => void;
  onLogoClick: () => void;
  onProfileClick: () => void;
  onOpenSettings?: () => void;
  onStreakClick?: () => void;
  onSignOut?: () => void;
}

function formatConnectionTime(ts: number | null): string {
  if (!ts) return 'Not yet verified';
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export const Header: React.FC<HeaderProps> = ({
  user,
  aiHealth,
  isNetworkOnline,
  onRetryHealth,
  onLogoClick,
  onProfileClick,
  onOpenSettings,
  onStreakClick,
  onSignOut,
}) => {
  const [statusOpen, setStatusOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const statusContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen && !profileMenuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        statusOpen &&
        statusContainerRef.current &&
        !statusContainerRef.current.contains(target)
      ) {
        setStatusOpen(false);
      }
      if (
        profileMenuOpen &&
        profileContainerRef.current &&
        !profileContainerRef.current.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusOpen(false);
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [statusOpen, profileMenuOpen]);

  const avatarTokens = generateThemeTokensFromColor(user.avatarColor);
  const displayName = user.name?.trim() || 'User';
  const flagEmoji = user.countryFlag || '🌐';
  const countryName = user.country || 'Global';
  const streakCount = Math.max(0, user.streakDays || 0);

  const statusMeta = (() => {
    switch (aiHealth.state) {
      case 'connected':
        return {
          label: 'Live AI | Gemini Connected',
          dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.95)] animate-pulse',
          badgeClass:
            'bg-emerald-950/55 border-emerald-400/35 text-emerald-200 hover:border-emerald-300/60',
          isWarningIcon: false,
        };
      case 'connecting':
        return {
          label: 'Live AI | Connecting...',
          dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse',
          badgeClass:
            'bg-amber-950/50 border-amber-400/35 text-amber-200 hover:border-amber-300/60',
          isWarningIcon: false,
        };
      case 'offline':
        return {
          label: 'Live AI | Offline',
          dotClass: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]',
          badgeClass:
            'bg-rose-950/55 border-rose-400/40 text-rose-200 hover:border-rose-300/65',
          isWarningIcon: false,
        };
      case 'error':
      default:
        return {
          label: 'Live AI | Service Error',
          dotClass: 'bg-amber-400',
          badgeClass:
            'bg-amber-950/60 border-amber-400/45 text-amber-200 hover:border-amber-300/70',
          isWarningIcon: true,
        };
    }
  })();

  return (
    <header className="sticky top-0 z-30 w-full safe-top glass-nav border-b border-purple-400/20 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 shadow-[0_8px_32px_rgba(8,5,20,0.45)] max-w-full shrink-0">
      {/* LEFT: Animated Aadesh AI Logo + App Name with Live AI underneath */}
      <div className="flex items-center gap-2.5 min-w-0 shrink">
        <button
          type="button"
          onClick={onLogoClick}
          className="cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-xl shrink-0"
          aria-label="Aadesh AI Home"
        >
          <BrandLogo
            size="md"
            animated={true}
            className="transition-transform duration-200 group-hover:scale-105 shrink-0"
          />
        </button>

        <div className="flex flex-col items-start min-w-0">
          <button
            type="button"
            onClick={onLogoClick}
            className="cursor-pointer group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-md"
            aria-label="Aadesh AI Home"
          >
            <span className="text-sm sm:text-base font-black tracking-tight text-white group-hover:text-purple-200 transition-colors whitespace-nowrap leading-none block">
              Aadesh AI
            </span>
          </button>

          {/* Compact Live AI Status Button directly below App Name */}
          <div className="relative mt-0.5" ref={statusContainerRef}>
            <button
              type="button"
              onClick={() => setStatusOpen((prev) => !prev)}
              aria-expanded={statusOpen}
              aria-label={`AI status: ${statusMeta.label}. Click for details`}
              className={`min-h-[20px] px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${statusMeta.badgeClass}`}
            >
              {statusMeta.isWarningIcon ? (
                <AlertTriangle className="w-2.5 h-2.5 text-amber-300 shrink-0" aria-hidden="true" />
              ) : (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.dotClass}`}
                  aria-hidden="true"
                />
              )}
              <span>Live AI</span>
              <ChevronDown
                className={`w-2.5 h-2.5 opacity-75 transition-transform duration-150 shrink-0 ${
                  statusOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {statusOpen && (
              <div
                role="dialog"
                aria-label="Live AI Connection Details"
                className="absolute left-0 top-full mt-2 w-[275px] sm:w-[310px] z-50 rounded-2xl glass-card border border-purple-400/40 p-3.5 shadow-[0_18px_48px_rgba(4,2,14,0.82)] space-y-3"
              >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-purple-400/20">
                <div className="flex items-center gap-2 min-w-0">
                  {statusMeta.isWarningIcon ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusMeta.dotClass}`} />
                  )}
                  <span className="text-xs font-extrabold text-white truncate">
                    {statusMeta.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRetryHealth()}
                  disabled={aiHealth.state === 'connecting'}
                  className="px-2 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/45 border border-purple-400/35 text-[10px] font-bold text-purple-100 flex items-center gap-1 cursor-pointer disabled:opacity-60 shrink-0"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${aiHealth.state === 'connecting' ? 'animate-spin' : ''}`}
                  />
                  <span>Check</span>
                </button>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    {isNetworkOnline ? (
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    Internet Network
                  </span>
                  <span className={isNetworkOnline ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}>
                    {isNetworkOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-purple-300" />
                    Backend API
                  </span>
                  <span
                    className={
                      aiHealth.backendConnected
                        ? 'text-emerald-300 font-semibold'
                        : 'text-rose-300 font-semibold'
                    }
                  >
                    {aiHealth.backendConnected ? 'Reachable' : 'Unreachable'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    Google Gemini API
                  </span>
                  <span
                    className={
                      aiHealth.geminiConnected
                        ? 'text-emerald-300 font-semibold'
                        : 'text-amber-300 font-semibold'
                    }
                  >
                    {aiHealth.geminiConnected
                      ? `Connected${typeof aiHealth.latencyMs === 'number' ? ` (${aiHealth.latencyMs}ms)` : ''}`
                      : aiHealth.state === 'connecting'
                      ? 'Checking...'
                      : 'Unavailable'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-purple-400/15">
                  <span className="text-purple-200/70">Model</span>
                  <span className="font-mono text-[10px] text-purple-100 truncate max-w-[160px]">
                    {aiHealth.model || 'gemini-4-hydrogen'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/70 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last Connected
                  </span>
                  <span className="font-mono text-[10px] text-purple-100 tabular-nums">
                    {formatConnectionTime(aiHealth.lastConnectedAt)}
                  </span>
                </div>
              </div>

              {aiHealth.error && (
                <div className="rounded-xl bg-amber-950/50 border border-amber-400/30 px-2.5 py-2 text-[10.5px] text-amber-200 leading-snug">
                  {aiHealth.error}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* RIGHT: Animated Unified Rectangular Profile Panel (Streak first + Photo + Full Name + Country Flag & Name + Dropdown) */}
      <div className="relative min-w-0 shrink" ref={profileContainerRef}>
        <motion.button
          type="button"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => setProfileMenuOpen((prev) => !prev)}
          aria-expanded={profileMenuOpen}
          aria-haspopup="menu"
          title={`${displayName} • ${countryName} • ${streakCount}-Day Streak`}
          aria-label={`Open account menu for ${displayName}`}
          className="min-h-[42px] flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 rounded-xl glass-card border border-purple-400/35 hover:border-purple-400/70 transition-colors cursor-pointer group min-w-0 max-w-[235px] sm:max-w-[360px] shadow-[0_0_20px_rgba(139,92,246,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          {/* 1. Daily Streak Counter First */}
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-400/35 text-xs font-extrabold text-amber-300 tabular-nums shrink-0"
            title={`${streakCount}-Day Consecutive Streak`}
          >
            <span aria-hidden="true">🔥</span>
            <span>{streakCount}</span>
          </span>

          {/* 2. Circular Profile Photo */}
          <div
            className="w-8 h-8 rounded-full p-[1.5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.lightHex})`,
              boxShadow: `0 0 12px rgba(${avatarTokens.primaryRgb}, 0.45)`,
            }}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-full bg-[#120e24]"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-black"
                style={{
                  background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #16102b)`,
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* 3. Full Display Name + Country Flag & Name (No @ prefix, No UID) */}
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-200 transition-colors truncate max-w-[95px] sm:max-w-[165px] leading-tight">
              {displayName}
            </span>
            <span className="inline-flex items-center gap-1 text-[10.5px] text-purple-200/80 font-medium truncate max-w-[95px] sm:max-w-[165px] leading-tight">
              <span aria-hidden="true">{flagEmoji}</span>
              <span className="truncate">{countryName}</span>
            </span>
          </div>

          {/* 4. Dropdown Chevron */}
          <ChevronDown
            className={`w-3.5 h-3.5 text-purple-300/80 transition-transform duration-150 shrink-0 ${
              profileMenuOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </motion.button>

        {/* Animated Profile Dropdown Menu */}
        <AnimatePresence>
          {profileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full mt-2 w-60 z-50 rounded-2xl glass-card border border-purple-400/40 p-2 shadow-[0_18px_48px_rgba(4,2,14,0.88)] space-y-1"
            >
              <div className="px-3 py-2 border-b border-white/10 mb-1">
                <div className="text-xs font-extrabold text-white truncate">{displayName}</div>
                {user.email && (
                  <div className="text-[11px] text-purple-200/75 truncate">{user.email}</div>
                )}
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  onProfileClick();
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-purple-600/25 flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                <span>Profile Settings</span>
              </button>

              {onOpenSettings && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-purple-600/25 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <SettingsIcon className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span>App Settings &amp; Theme</span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  (onStreakClick || onProfileClick)();
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-amber-500/20 flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Daily Streak</span>
                </span>
                <span className="text-[11px] font-bold text-amber-300 tabular-nums">
                  🔥 {streakCount}
                </span>
              </button>

              {onSignOut && (
                <div className="pt-1 mt-1 border-t border-white/10">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
