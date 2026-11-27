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
  FlaskConical,
  CheckCircle2,
} from 'lucide-react';
import { AIConnectionHealth, UserProfile } from '../types';
import {
  AIProviderId,
  AIProviderStatusInfo,
} from '../utils/aiProviders';
import {
  buildLiveAIMonitoringSnapshot,
  formatLiveConnectionTimestamp,
} from './LiveAIControlCenter';
import { generateThemeTokensFromColor } from '../utils/avatarTheme';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  user: UserProfile;
  isStreakLoading?: boolean;
  aiHealth: AIConnectionHealth;
  providersStatus?: Partial<Record<AIProviderId, AIProviderStatusInfo>> | null;
  isNetworkOnline: boolean;
  testingProviderId?: AIProviderId | null;
  aiResponseLanguage?: string;
  onRetryHealth: () => void;
  onTestProvider?: (
    providerId: AIProviderId,
    modelId?: string
  ) => Promise<{ ok: boolean; message: string; modelUsed?: string; latencyMs?: number }>;
  onSelectProvider?: (providerId: AIProviderId, modelId?: string) => void;
  onLogoClick: () => void;
  onProfileClick: () => void;
  onOpenSettings?: () => void;
  onStreakClick?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isStreakLoading = false,
  aiHealth,
  providersStatus = null,
  isNetworkOnline,
  testingProviderId = null,
  aiResponseLanguage,
  onRetryHealth,
  onTestProvider,
  onSelectProvider,
  onLogoClick,
  onProfileClick,
  onOpenSettings,
  onStreakClick,
  onSignOut,
}) => {
  const [statusOpen, setStatusOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [headerTestFeedback, setHeaderTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
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
  const streakCount = Math.max(0, user.currentStreak ?? user.streakDays ?? 0);

  const [isLoginLighting, setIsLoginLighting] = useState<boolean>(false);
  const [isStreakCelebrating, setIsStreakCelebrating] = useState<boolean>(false);
  const [streakDelta, setStreakDelta] = useState<number>(0);
  const prevLoggedInRef = useRef<boolean>(false);
  const prevUserIdRef = useRef<string | null>(null);
  const prevStreakRef = useRef<number | null>(null);

  useEffect(() => {
    // Trigger the blue-purple glow and fire-lighting animation on genuine login (once per session, not every refresh)
    if (user.isLoggedIn && user.id && user.id !== 'guest' && user.id !== 'unauthenticated') {
      const isNewLoginTransition = !prevLoggedInRef.current || prevUserIdRef.current !== user.id;
      prevLoggedInRef.current = true;
      prevUserIdRef.current = user.id;

      let alreadyLitThisSession = false;
      try {
        alreadyLitThisSession = sessionStorage.getItem('aadesh_login_glow_uid') === user.id;
      } catch {}

      if (isNewLoginTransition && !alreadyLitThisSession) {
        try {
          sessionStorage.setItem('aadesh_login_glow_uid', user.id);
        } catch {}
        setIsLoginLighting(true);
        const timer = window.setTimeout(() => {
          setIsLoginLighting(false);
        }, 3600);
        return () => window.clearTimeout(timer);
      }
    } else {
      prevLoggedInRef.current = false;
      prevUserIdRef.current = null;
      prevStreakRef.current = null;
    }
  }, [user.isLoggedIn, user.id]);

  useEffect(() => {
    // Animate streak number transition & short celebration burst ONLY when streak genuinely increases (never replays on refresh)
    if (!user.isLoggedIn || !user.id || user.id === 'guest' || user.id === 'unauthenticated') {
      return;
    }
    const storageKey = `aadesh_last_celebrated_streak_${user.id}`;
    const currentDateKey = user.lastActiveDate || '';
    let stored: { date?: string; streak?: number } | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    const prevInMemory = prevStreakRef.current;
    prevStreakRef.current = streakCount;

    const increasedInSession =
      prevInMemory !== null && streakCount > prevInMemory && streakCount > 0;
    const increasedAcrossDays =
      stored !== null &&
      typeof stored.streak === 'number' &&
      streakCount > stored.streak &&
      currentDateKey !== '' &&
      stored.date !== currentDateKey;

    if (increasedInSession || increasedAcrossDays) {
      const basePrev =
        increasedInSession && prevInMemory !== null
          ? prevInMemory
          : typeof stored?.streak === 'number'
          ? stored.streak
          : Math.max(0, streakCount - 1);
      const delta = Math.max(1, streakCount - basePrev);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ date: currentDateKey, streak: streakCount })
        );
      } catch {}
      setStreakDelta(delta);
      setIsStreakCelebrating(true);
      const timer = window.setTimeout(() => {
        setIsStreakCelebrating(false);
        setStreakDelta(0);
      }, 2800);
      return () => window.clearTimeout(timer);
    }

    // Initialize or sync baseline without replaying celebration on page refresh
    if (!stored || stored.streak !== streakCount || stored.date !== currentDateKey) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ date: currentDateKey, streak: streakCount })
        );
      } catch {}
    }
  }, [user.isLoggedIn, user.id, streakCount, user.lastActiveDate]);

  const snapshot = buildLiveAIMonitoringSnapshot({
    aiHealth,
    providersStatus,
    settings: aiResponseLanguage ? { aiResponseLanguage } : undefined,
    isNetworkOnline,
    isRefreshing: aiHealth.state === 'connecting',
    testingProviderId,
  });

  const statusMeta = (() => {
    const tone = snapshot.providerIndicator.tone;
    if (tone === 'green') {
      return {
        label: `${snapshot.providerName} · ${snapshot.providerIndicator.label}`,
        dotClass: snapshot.providerIndicator.dotClass,
        badgeClass:
          'bg-emerald-950/55 border-emerald-400/40 text-emerald-200 hover:border-emerald-300/70 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
        isWarningIcon: false,
      };
    }
    if (tone === 'yellow') {
      return {
        label: `${snapshot.providerName} · ${snapshot.providerIndicator.label}`,
        dotClass: snapshot.providerIndicator.dotClass,
        badgeClass:
          'bg-amber-950/55 border-amber-400/45 text-amber-200 hover:border-amber-300/70 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
        isWarningIcon: false,
      };
    }
    if (tone === 'red') {
      return {
        label: !snapshot.effectiveOnline
          ? 'System Offline'
          : `${snapshot.providerName} · ${snapshot.providerIndicator.label}`,
        dotClass: snapshot.providerIndicator.dotClass,
        badgeClass:
          'bg-rose-950/60 border-rose-400/45 text-rose-200 hover:border-rose-300/70 shadow-[0_0_12px_rgba(244,63,94,0.22)]',
        isWarningIcon: snapshot.effectiveOnline,
      };
    }
    return {
      label: `${snapshot.providerName} · ${snapshot.providerIndicator.label}`,
      dotClass: snapshot.providerIndicator.dotClass,
      badgeClass:
        'bg-slate-900/65 border-slate-400/40 text-slate-200 hover:border-slate-300/65',
      isWarningIcon: false,
    };
  })();

  const handleHeaderTest = async (pid: AIProviderId) => {
    if (!onTestProvider || testingProviderId) return;
    setHeaderTestFeedback(null);
    const res = await onTestProvider(pid, snapshot.currentModel);
    setHeaderTestFeedback({ ok: res.ok, message: res.message });
  };

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
              aria-label={`Live AI status: ${statusMeta.label}. Click for details`}
              className={`min-h-[20px] px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${statusMeta.badgeClass}`}
            >
              {statusMeta.isWarningIcon ? (
                <AlertTriangle className="w-2.5 h-2.5 text-rose-300 shrink-0" aria-hidden="true" />
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
                aria-label="Live AI Real-Time Monitoring Dashboard"
                className="absolute left-0 top-full mt-2 w-[315px] sm:w-[365px] max-w-[92vw] z-50 rounded-2xl glass-card border border-purple-400/40 p-4 shadow-[0_18px_48px_rgba(4,2,14,0.88)] space-y-3"
              >
                {/* Dialog Header */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-purple-400/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${snapshot.providerIndicator.dotClass}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-white truncate">
                        Live AI Monitor
                      </div>
                      <div className="text-[10px] text-purple-200/70 truncate">
                        Real-time system &amp; connection telemetry
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wider shrink-0 ${snapshot.providerIndicator.badgeClass}`}
                  >
                    {snapshot.providerIndicator.label}
                  </span>
                </div>

                {/* Exact 7 Live AI Monitoring Fields */}
                <div className="space-y-2 text-[11px]">
                  {/* 1. Internet Network */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 flex items-center gap-1.5">
                      {snapshot.effectiveOnline ? (
                        <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span>Internet Network</span>
                    </span>
                    <span className={`font-semibold inline-flex items-center gap-1.5 ${snapshot.networkIndicator.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${snapshot.networkIndicator.dotClass}`} />
                      <span>{snapshot.networkIndicator.label}</span>
                    </span>
                  </div>

                  {/* 2. Backend API */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span>Backend API</span>
                    </span>
                    <span className={`font-semibold inline-flex items-center gap-1.5 ${snapshot.backendIndicator.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${snapshot.backendIndicator.dotClass}`} />
                      <span>{snapshot.backendIndicator.label}</span>
                    </span>
                  </div>

                  {/* 3. AI Provider API */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span>AI Provider API</span>
                    </span>
                    <span className={`font-semibold inline-flex items-center gap-1.5 ${snapshot.providerIndicator.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${snapshot.providerIndicator.dotClass}`} />
                      <span>{snapshot.providerIndicator.label}</span>
                    </span>
                  </div>

                  {/* 4. Current Provider */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span>Current Provider</span>
                    </span>
                    <span className="font-bold text-white truncate">
                      {snapshot.providerName}
                    </span>
                  </div>

                  {/* 5. Current Model */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 shrink-0">Current Model</span>
                    <span
                      className="font-mono text-[10.5px] font-semibold text-sky-300 truncate max-w-[185px]"
                      title={snapshot.currentModel}
                    >
                      {snapshot.currentModel}
                    </span>
                  </div>

                  {/* 6. API Connection Latency */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 shrink-0">API Connection Latency</span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {snapshot.measuredLatency !== null ? `${snapshot.measuredLatency} ms` : 'Not tested'}
                    </span>
                  </div>

                  {/* 7. Last Successful Connection */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>Last Successful Connection</span>
                    </span>
                    <span className="font-mono text-[10px] text-purple-100 tabular-nums text-right truncate">
                      {formatLiveConnectionTimestamp(snapshot.lastConnectedTimestamp)}
                    </span>
                  </div>

                  {/* 8. Selected Response Language */}
                  <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                    <span className="text-purple-200/80 shrink-0">Selected Response Language</span>
                    <span className="font-semibold text-white truncate text-right">
                      {snapshot.selectedResponseLanguage}
                    </span>
                  </div>

                  {/* 9. Actual AI Generation Status */}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-purple-200/80 shrink-0">Actual AI Generation Status</span>
                    <span
                      className={`font-bold text-right ${
                        snapshot.actualGenerationStatus === 'Verified'
                          ? 'text-emerald-300'
                          : snapshot.actualGenerationStatus === 'Failed'
                          ? 'text-rose-300'
                          : snapshot.actualGenerationStatus === 'Testing AI...'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {snapshot.actualGenerationStatus}
                    </span>
                  </div>
                </div>

                {/* Action Buttons: Refresh Status & Test Connection */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-400/20">
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderTestFeedback(null);
                      onRetryHealth();
                    }}
                    disabled={snapshot.isChecking}
                    className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-purple-600/25 hover:bg-purple-600/45 border border-purple-400/35 text-[11px] font-bold text-purple-100 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-sky-300 ${snapshot.isChecking ? 'animate-spin' : ''}`}
                    />
                    <span>{snapshot.isChecking ? 'Checking...' : 'Refresh Status'}</span>
                  </button>

                  {onTestProvider && (
                    <button
                      type="button"
                      onClick={() => void handleHeaderTest(snapshot.activeProvider)}
                      disabled={Boolean(testingProviderId) || !snapshot.effectiveOnline}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-xl electric-purple-btn text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 transition-all"
                    >
                      <FlaskConical
                        className={`w-3.5 h-3.5 ${snapshot.isTestingActive ? 'animate-pulse' : ''}`}
                      />
                      <span>{snapshot.isTestingActive ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                  )}
                </div>

                {headerTestFeedback && (
                  <div
                    role="status"
                    className={`rounded-xl px-2.5 py-2 text-[10.5px] leading-snug border flex items-start gap-1.5 ${
                      headerTestFeedback.ok
                        ? 'bg-emerald-950/60 border-emerald-400/35 text-emerald-200'
                        : 'bg-rose-950/60 border-rose-400/40 text-rose-200'
                    }`}
                  >
                    {headerTestFeedback.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{headerTestFeedback.message}</span>
                  </div>
                )}

                {snapshot.lastErrorText && !headerTestFeedback && (
                  <div
                    role="alert"
                    className="rounded-xl bg-rose-950/55 border border-rose-400/35 px-2.5 py-2 text-[10.5px] text-rose-200 leading-snug flex items-start gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{snapshot.lastErrorText}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Animated Unified Rectangular Profile Panel (Premium Streak Badge + Photo + Full Name + Country + Dropdown) */}
      <div className="relative min-w-0 shrink" ref={profileContainerRef}>
        <motion.div
          whileHover={{ scale: 1.015 }}
          className={`min-h-[44px] flex items-center p-1 sm:p-1.5 rounded-2xl glass-card border transition-all cursor-pointer group min-w-0 max-w-[275px] sm:max-w-[420px] relative overflow-hidden select-none ${
            isLoginLighting
              ? 'border-purple-400/90 shadow-[0_0_30px_rgba(59,130,246,0.65),0_0_55px_rgba(147,51,234,0.55),0_0_75px_rgba(245,158,11,0.35)]'
              : 'border-purple-400/40 hover:border-sky-400/70 shadow-[0_0_24px_rgba(139,92,246,0.22)]'
          }`}
        >
          {/* Ambient Blue-Purple Background Glow Sweep */}
          <motion.div
            aria-hidden="true"
            animate={
              isLoginLighting
                ? {
                    opacity: [0.35, 0.85, 0.45, 0.9, 0.35],
                    background: [
                      'radial-gradient(circle at 15% 50%, rgba(59,130,246,0.45), rgba(147,51,234,0.35), transparent 70%)',
                      'radial-gradient(circle at 50% 50%, rgba(147,51,234,0.55), rgba(59,130,246,0.45), transparent 70%)',
                      'radial-gradient(circle at 85% 50%, rgba(59,130,246,0.45), rgba(245,158,11,0.35), transparent 70%)',
                    ],
                  }
                : {
                    opacity: [0.25, 0.5, 0.25],
                    scale: [1, 1.04, 1],
                  }
            }
            transition={{
              duration: isLoginLighting ? 1.8 : 3.8,
              repeat: isLoginLighting ? 2 : Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-0 bg-gradient-to-r from-blue-600/15 via-purple-600/20 to-amber-500/15 pointer-events-none rounded-2xl"
          />

          {/* Shimmer sweep line on login */}
          {isLoginLighting && (
            <motion.div
              aria-hidden="true"
              initial={{ x: '-120%' }}
              animate={{ x: '180%' }}
              transition={{ duration: 1.4, repeat: 2, ease: 'easeInOut' }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-sky-300/35 to-transparent pointer-events-none z-10"
            />
          )}

          {/* 1. PREMIUM ROUNDED-RECTANGLE STREAK BADGE */}
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onStreakClick) {
                onStreakClick();
              } else {
                setProfileMenuOpen((prev) => !prev);
              }
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            aria-label={`${streakCount} Day Streak. Click to view streak tracker and gamification`}
            title={`${streakCount}-Day Activity Streak (Click to view)`}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-xl border transition-all cursor-pointer relative shrink-0 overflow-hidden ${
              isLoginLighting || isStreakCelebrating
                ? 'bg-gradient-to-r from-amber-500/40 via-orange-500/35 to-purple-600/35 border-amber-300/85 shadow-[0_0_24px_rgba(251,191,36,0.65)]'
                : 'bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-purple-600/20 border-amber-400/40 hover:border-amber-300/70 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
            }`}
          >
            {/* Fire Ignition & Celebration Aura */}
            <div className="relative flex items-center justify-center shrink-0">
              {(isLoginLighting || isStreakCelebrating) && (
                <motion.span
                  aria-hidden="true"
                  initial={{ scale: 0.6, opacity: 0.95 }}
                  animate={{ scale: [0.6, 2.1, 1.2], opacity: [0.95, 0.45, 0] }}
                  transition={{ duration: 1.15, repeat: 2, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 via-amber-400 to-purple-500 blur-sm pointer-events-none"
                />
              )}

              {/* Glowing Fire Icon with Login Flame Ignition & Streak Increment Celebration */}
              <motion.div
                animate={
                  isLoginLighting || isStreakCelebrating
                    ? {
                        scale: [0.65, 1.45, 0.95, 1.25, 1],
                        rotate: [0, -12, 10, -5, 0],
                        filter: [
                          'drop-shadow(0 0 4px #3b82f6)',
                          'drop-shadow(0 0 18px #f59e0b) drop-shadow(0 0 28px #9333ea)',
                          'drop-shadow(0 0 10px #f59e0b)',
                        ],
                      }
                    : {
                        scale: [1, 1.12, 1],
                        rotate: [0, 3, -3, 0],
                      }
                }
                transition={{
                  duration: isLoginLighting || isStreakCelebrating ? 1.4 : 2.6,
                  repeat: isLoginLighting || isStreakCelebrating ? 2 : Infinity,
                  ease: 'easeInOut',
                }}
                className="flex items-center justify-center text-amber-400 leading-none drop-shadow-[0_0_10px_rgba(251,191,36,0.95)]"
                aria-hidden="true"
              >
                <Flame className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-amber-400 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.95)]" />
              </motion.div>
            </div>

            {/* Streak Count (animated roll on increment) & Uppercase DAY STREAK Label */}
            <div className="flex flex-col items-start leading-none pr-0.5 relative">
              <div className="flex items-center gap-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {isStreakLoading && streakCount === 0 ? (
                    <motion.span
                      key="streak-loading"
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                      aria-label="Loading saved streak"
                      className="text-xs sm:text-sm font-black text-amber-200/80 leading-none tracking-tight inline-block"
                    >
                      …
                    </motion.span>
                  ) : (
                    <motion.span
                      key={streakCount}
                      initial={
                        isStreakCelebrating
                          ? { y: 10, opacity: 0, scale: 0.75 }
                          : false
                      }
                      animate={
                        isLoginLighting || isStreakCelebrating
                          ? {
                              y: 0,
                              opacity: 1,
                              scale: [0.85, 1.28, 1],
                              color: ['#fbbf24', '#ffffff', '#fde68a'],
                              textShadow: [
                                '0 0 4px rgba(59,130,246,0.8)',
                                '0 0 16px rgba(251,191,36,1)',
                                '0 0 8px rgba(251,191,36,0.6)',
                              ],
                            }
                          : { y: 0, opacity: 1, scale: 1 }
                      }
                      exit={{ y: -10, opacity: 0, scale: 0.75 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                      className="text-xs sm:text-sm font-black text-amber-300 tabular-nums leading-none tracking-tight inline-block"
                    >
                      {streakCount}
                    </motion.span>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {isStreakCelebrating && streakDelta > 0 && (
                    <motion.span
                      initial={{ opacity: 0, y: 4, scale: 0.7 }}
                      animate={{ opacity: [0, 1, 1, 0], y: [4, -4, -6, -10], scale: [0.7, 1.15, 1, 0.9] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2.2, ease: 'easeOut' }}
                      className="text-[9px] font-black text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)] leading-none"
                    >
                      +{streakDelta}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <span className="text-[8px] sm:text-[8.5px] font-black text-amber-200/90 uppercase tracking-tight leading-tight mt-0.5 whitespace-nowrap">
                Day Streak
              </span>
            </div>
          </motion.button>

          {/* Luminous Vertical Divider Transitioning into User Profile Area */}
          <div
            aria-hidden="true"
            className="h-6 w-[1px] bg-gradient-to-b from-transparent via-purple-400/40 to-transparent mx-1 sm:mx-1.5 shrink-0"
          />

          {/* 2. USER PROFILE INTERACTIVE AREA (Photo + Full Name + Country + Dropdown Chevron) */}
          <button
            type="button"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-label={`Open account menu for ${displayName}`}
            title={`${displayName} • ${countryName} • ${streakCount}-Day Streak`}
            className="flex items-center gap-2 min-w-0 flex-1 px-1 py-0.5 cursor-pointer text-left focus:outline-none"
          >
            {/* Circular Profile Photo with Glowing Theme Border */}
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full p-[1.5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.lightHex})`,
                boxShadow: isLoginLighting
                  ? `0 0 18px rgba(147,51,234,0.85), 0 0 25px rgba(59,130,246,0.6)`
                  : `0 0 12px rgba(${avatarTokens.primaryRgb}, 0.5)`,
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
                  className="w-full h-full rounded-full flex items-center justify-center text-white text-[11px] font-black"
                  style={{
                    background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #16102b)`,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Full Display Name + Country Flag & Name */}
            <div className="flex flex-col items-start min-w-0 leading-tight">
              <span className="text-xs sm:text-sm font-extrabold text-white group-hover:text-purple-200 transition-colors truncate max-w-[85px] sm:max-w-[145px]">
                {displayName}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[10.5px] text-purple-200/80 font-medium truncate max-w-[85px] sm:max-w-[145px]">
                <span aria-hidden="true">{flagEmoji}</span>
                <span className="truncate">{countryName}</span>
              </span>
            </div>

            {/* Dropdown Chevron */}
            <ChevronDown
              className={`w-3.5 h-3.5 text-purple-300/80 transition-transform duration-150 shrink-0 ml-auto ${
                profileMenuOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        </motion.div>

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
