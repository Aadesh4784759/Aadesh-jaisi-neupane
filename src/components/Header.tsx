import React, { useEffect, useRef, useState } from 'react';
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
  onStreakClick?: () => void;
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
  onStreakClick,
}) => {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (
        statusContainerRef.current &&
        !statusContainerRef.current.contains(e.target as Node)
      ) {
        setStatusOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [statusOpen]);

  const avatarTokens = generateThemeTokensFromColor(user.avatarColor);
  const displayName = user.name?.trim() || 'User';
  const actualUsername = (user.username?.trim() || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user').replace(/^@/, '');
  const shortUid = user.id ? user.id.slice(0, 8) : 'guest';
  const flagEmoji = user.countryFlag || '🌐';
  const countryName = user.country || 'Global';
  const streakCount = Math.max(1, user.streakDays || 1);

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
    <header className="sticky top-0 z-40 w-full safe-top glass-nav border-b border-purple-400/20 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 shadow-[0_8px_32px_rgba(8,5,20,0.45)] max-w-full shrink-0">
      {/* LEFT: Animated Aadesh AI Logo + Compact Live AI Status Button (Gemini Connect text hidden) */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center gap-2 min-w-0 shrink cursor-pointer group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-xl pr-1"
          aria-label="Aadesh AI Home"
        >
          <BrandLogo
            size="md"
            animated={true}
            className="transition-transform duration-200 group-hover:scale-105 shrink-0"
          />
          <span className="text-sm sm:text-base font-black tracking-tight text-white whitespace-nowrap leading-none">
            Aadesh AI
          </span>
        </button>

        {/* Compact Live AI Status Button (Gemini Connect text hidden, shows Live AI badge) */}
        <div className="relative" ref={statusContainerRef}>
          <button
            type="button"
            onClick={() => setStatusOpen((prev) => !prev)}
            aria-expanded={statusOpen}
            aria-label={`AI status: ${statusMeta.label}. Click for details`}
            className={`min-h-[26px] px-2 py-0.5 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${statusMeta.badgeClass}`}
          >
            {statusMeta.isWarningIcon ? (
              <AlertTriangle className="w-2.5 h-2.5 text-amber-300 shrink-0" aria-hidden="true" />
            ) : (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dotClass}`}
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

              {/* Separate Network vs Backend vs Google Gemini checks */}
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
                        : aiHealth.state === 'connecting'
                        ? 'text-amber-300 font-semibold'
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

      {/* RIGHT: Separate Daily Streak Counter + Clickable Profile (Flag, Actual Username, User ID, Profile Photo) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
        {/* Daily Streak Counter (Displayed Separately, No Profile Photo Inside) */}
        <button
          type="button"
          onClick={onStreakClick || onProfileClick}
          title={`${streakCount}-Day Streak`}
          aria-label={`Daily streak: ${streakCount} days`}
          className="min-h-[42px] px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-purple-950/60 hover:bg-purple-900/70 border border-amber-400/35 flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-amber-300 shadow-[0_0_16px_rgba(139,92,246,0.2)] transition-all cursor-pointer shrink-0 tabular-nums whitespace-nowrap"
        >
          <span aria-hidden="true">🔥</span>
          <Flame className="w-3.5 h-3.5 text-amber-400 hidden sm:inline shrink-0" />
          <span>{streakCount}</span>
        </button>

        {/* Clickable User Profile Block (Opens Profile Settings) */}
        <button
          type="button"
          onClick={onProfileClick}
          title={`${displayName} (@${actualUsername}) • ${countryName} • UID: ${user.id}`}
          aria-label={`Open profile settings for @${actualUsername}`}
          className="min-h-[42px] flex items-center gap-2 sm:gap-2.5 pl-2.5 pr-1.5 sm:pl-3 sm:pr-2 py-1 rounded-2xl glass-card hover:border-purple-400/70 transition-all cursor-pointer group min-w-0 max-w-[185px] sm:max-w-[290px]"
        >
          {/* Country Flag, Actual Username & Unique User ID */}
          <div className="flex flex-col items-end text-right min-w-0">
            <div className="flex items-center gap-1.5 max-w-full">
              <span
                className="text-sm leading-none shrink-0"
                title={countryName}
                aria-label={countryName}
              >
                {flagEmoji}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-200 transition-colors truncate max-w-[85px] sm:max-w-[160px]">
                @{actualUsername}
              </span>
            </div>
            <span className="text-[10px] font-mono tabular-nums text-purple-300/85 truncate max-w-[110px] sm:max-w-[180px] leading-tight">
              ID: {shortUid}
            </span>
          </div>

          {/* Clickable Profile Photo */}
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full p-[1.5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.lightHex})`,
              boxShadow: `0 0 14px rgba(${avatarTokens.primaryRgb}, 0.45)`,
            }}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={actualUsername}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-full bg-[#120e24]"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-black"
                style={{
                  background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #16102b)`,
                }}
              >
                {(actualUsername || displayName).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
