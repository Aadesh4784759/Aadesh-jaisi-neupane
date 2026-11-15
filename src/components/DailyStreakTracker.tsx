import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Flame, Target, Calendar, Sparkles, Database, RefreshCw, Trophy, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';
import {
  CalculatedStreakSummary,
  calculateConsecutiveStreakFromDates,
  computeLevelInfo,
} from '../utils/gamification';
import { fetchUserUsageDatesFromFirestore } from '../utils/firebase';

interface DailyStreakTrackerProps {
  user: UserProfile;
  onOpenGamification?: () => void;
  onStreakCalculated?: (summary: CalculatedStreakSummary) => void;
  className?: string;
}

export const DailyStreakTracker: React.FC<DailyStreakTrackerProps> = ({
  user,
  onOpenGamification,
  onStreakCalculated,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [firestoreDateCounts, setFirestoreDateCounts] = useState<Record<string, number>>({});
  const [logSource, setLogSource] = useState<'firestore' | 'local'>('local');
  const [isSyncingLogs, setIsSyncingLogs] = useState(false);

  const loadFirestoreLogs = async () => {
    if (!user.isLoggedIn || !user.id || user.id === 'guest') {
      setLogSource('local');
      return;
    }
    setIsSyncingLogs(true);
    try {
      const res = await fetchUserUsageDatesFromFirestore(user.id);
      setFirestoreDateCounts(res.dateCounts);
      setLogSource(res.source);
    } catch (err) {
      console.warn('Could not load Firestore usage logs for streak:', err);
      setLogSource('local');
    } finally {
      setIsSyncingLogs(false);
    }
  };

  useEffect(() => {
    loadFirestoreLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.isLoggedIn, user.xp]);

  // Merge Firestore logs with local streakHistory so offline or newly earned interactions reflect immediately
  const streakSummary = useMemo<CalculatedStreakSummary>(() => {
    const merged: Record<string, number> = { ...firestoreDateCounts };
    (user.streakHistory || []).forEach((day) => {
      if (day.completed && day.date) {
        merged[day.date] = Math.max(merged[day.date] || 0, day.activityCount || 1);
      }
    });
    if (user.lastActiveDate) {
      merged[user.lastActiveDate] = Math.max(merged[user.lastActiveDate] || 0, 1);
    }
    return calculateConsecutiveStreakFromDates(
      merged,
      user.streakDays || 1,
      user.longestStreak || 1,
      30
    );
  }, [firestoreDateCounts, user.streakHistory, user.lastActiveDate, user.streakDays, user.longestStreak]);

  useEffect(() => {
    onStreakCalculated?.(streakSummary);
  }, [streakSummary, onStreakCalculated]);

  const levelInfo = computeLevelInfo(user.xp || 0);
  const goalPercent = Math.min(
    100,
    Math.round(((user.dailyGoalCurrent || 0) / (user.dailyGoalTarget || 5)) * 100)
  );

  const [previewMilestone, setPreviewMilestone] = useState<30 | 60 | 100 | null>(null);

  const STREAK_MILESTONE_TIERS: Array<{
    days: 30 | 60 | 100;
    label: string;
    subtitle: string;
    accentText: string;
    borderGlow: string;
    bgGrad: string;
    barGrad: string;
  }> = [
    {
      days: 30,
      label: '30-Day Ember',
      subtitle: 'Monthly Focus',
      accentText: 'text-amber-200',
      borderGlow: 'border-amber-400/60 shadow-[0_0_16px_rgba(251,191,36,0.22)]',
      bgGrad: 'from-amber-500/20 via-orange-500/10 to-transparent',
      barGrad: 'from-amber-400 to-orange-500',
    },
    {
      days: 60,
      label: '60-Day Aura',
      subtitle: 'Deep Consistency',
      accentText: 'text-cyan-200',
      borderGlow: 'border-cyan-400/60 shadow-[0_0_18px_rgba(34,211,238,0.22)]',
      bgGrad: 'from-cyan-500/20 via-blue-500/10 to-transparent',
      barGrad: 'from-cyan-400 to-blue-500',
    },
    {
      days: 100,
      label: '100-Day Legend',
      subtitle: 'Century Mastery',
      accentText: 'text-purple-200',
      borderGlow: 'border-purple-400/65 shadow-[0_0_20px_rgba(192,132,252,0.26)]',
      bgGrad: 'from-purple-500/20 via-fuchsia-500/10 to-transparent',
      barGrad: 'from-purple-400 via-fuchsia-400 to-cyan-400',
    },
  ];

  // Weekly Master badge tracks progress towards 7 consecutive interaction days
  const weeklyMasterDays = Math.min(streakSummary.consecutiveDays, 7);
  const weeklyMasterPercent = Math.min(100, Math.round((weeklyMasterDays / 7) * 100));
  const weeklyMasterUnlocked = streakSummary.consecutiveDays >= 7;

  return (
    <div
      onClick={onOpenGamification}
      className={`glass-card rounded-2xl p-4 sm:p-5 border border-amber-500/40 shadow-[0_0_28px_rgba(245,158,11,0.16)] space-y-4 transition-all relative overflow-hidden ${
        onOpenGamification ? 'cursor-pointer hover:border-amber-400/70' : ''
      } ${className}`}
      title={onOpenGamification ? 'Click to view full gamification & streak badges' : undefined}
    >
      {/* Very Light Ambient Streak Glow */}
      <motion.div
        aria-hidden="true"
        animate={
          prefersReducedMotion
            ? undefined
            : { opacity: [0.35, 0.6, 0.35], scale: [1, 1.06, 1] }
        }
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/15 blur-3xl rounded-full pointer-events-none"
      />

      {/* Header + Very Light Continuous Streak Animation */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative">
        <div className="flex items-center gap-3">
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.72, opacity: 0 }}
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : {
                    scale: [1, 1.045, 1],
                    opacity: 1,
                    boxShadow: [
                      '0 0 12px rgba(245,158,11,0.38)',
                      '0 0 22px rgba(251,191,36,0.62)',
                      '0 0 12px rgba(245,158,11,0.38)',
                    ],
                  }
            }
            transition={{
              duration: prefersReducedMotion ? 0.15 : 3.2,
              repeat: prefersReducedMotion ? 0 : Infinity,
              ease: 'easeInOut',
            }}
            className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white shrink-0"
          >
            <Flame className="w-6 h-6 fill-white text-white" />
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-[#090a0f] border border-amber-400 text-[9px] font-black text-amber-300 shadow">
              {streakSummary.consecutiveDays}d
            </span>
          </motion.div>

          <div>
            <h4 className="text-xs sm:text-sm font-black text-white flex flex-wrap items-center gap-2">
              <span>Consecutive Interaction Streak</span>
              <motion.span
                initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
                animate={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : {
                        scale: 1,
                        opacity: 1,
                        boxShadow: [
                          '0 0 8px rgba(251,191,36,0.22)',
                          '0 0 16px rgba(251,191,36,0.48)',
                          '0 0 8px rgba(251,191,36,0.22)',
                        ],
                      }
                }
                transition={{
                  duration: prefersReducedMotion ? 0.15 : 3.4,
                  repeat: prefersReducedMotion ? 0 : Infinity,
                  ease: 'easeInOut',
                }}
                className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400/25 via-yellow-500/20 to-orange-500/20 text-amber-200 border border-amber-300/65 font-bold"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>{streakSummary.consecutiveDays}-Day Streak Badge</span>
              </motion.span>
            </h4>
            <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-2 mt-0.5">
              <span>
                Level {levelInfo.level}: {levelInfo.levelTitle}
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                <Database className="w-3 h-3" />
                <span>
                  {isSyncingLogs
                    ? 'Syncing Firestore logs...'
                    : logSource === 'firestore'
                    ? 'Calculated from Firestore Logs'
                    : 'Local Activity Cache'}
                </span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-amber-300">
              Best: {streakSummary.longestStreak}d
            </div>
            <div className="text-[10px] text-gray-400">
              {streakSummary.totalActiveDays} active days
            </div>
          </div>
          {!onOpenGamification && user.isLoggedIn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadFirestoreLogs();
              }}
              aria-label="Refresh Firestore streak logs"
              title="Refresh Firestore streak logs"
              className="p-1.5 rounded-xl bg-[#090a0f] border border-white/10 text-gray-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLogs ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Towards 'Weekly Master' Streak Badge */}
      <div className="p-3.5 rounded-xl bg-[#090a0f]/85 border border-amber-400/35 space-y-2 shadow-[0_0_16px_rgba(245,158,11,0.12)]">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span className="text-amber-200 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Next Badge: Weekly Master (7-Day Streak)</span>
          </span>
          {weeklyMasterUnlocked ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-500/40">
              <CheckCircle2 className="w-3 h-3" />
              <span>Unlocked! ({streakSummary.consecutiveDays}d)</span>
            </span>
          ) : (
            <span className="text-amber-300 font-mono font-bold">
              {weeklyMasterDays} / 7 Days ({weeklyMasterPercent}%)
            </span>
          )}
        </div>
        <div className="w-full h-2.5 rounded-full bg-[#131520] overflow-hidden p-0.5 border border-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(8, weeklyMasterPercent)}%` }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 shadow-[0_0_14px_rgba(251,191,36,0.85)]"
          />
        </div>
        <p className="text-[10px] text-gray-400">
          {weeklyMasterUnlocked
            ? `Weekly Master earned! Next overarching milestone: ${streakSummary.nextMilestone} consecutive days (${streakSummary.milestoneProgressPercent}%).`
            : `${7 - weeklyMasterDays} more consecutive day${7 - weeklyMasterDays === 1 ? '' : 's'} to unlock the Weekly Master badge.`}
        </p>
      </div>

      {/* 30-Day, 60-Day & 100-Day Very Light Streak Milestone Animations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-gray-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Long-Term Streak Milestones (30d • 60d • 100d)</span>
          </span>
          <span className="text-[10px] text-gray-400">Click any tier to preview glow</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {STREAK_MILESTONE_TIERS.map((tier) => {
            const bestOrCurrent = Math.max(
              streakSummary.consecutiveDays,
              streakSummary.longestStreak
            );
            const reached = bestOrCurrent >= tier.days;
            const isPreviewed = previewMilestone === tier.days;
            const shouldAnimateGlow = (reached || isPreviewed) && !prefersReducedMotion;
            const pct = Math.min(100, Math.round((bestOrCurrent / tier.days) * 100));

            return (
              <motion.button
                key={tier.days}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMilestone((prev) => (prev === tier.days ? null : tier.days));
                }}
                animate={
                  shouldAnimateGlow
                    ? {
                        scale: [1, 1.018, 1],
                        opacity: [0.92, 1, 0.92],
                      }
                    : undefined
                }
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                className={`relative p-2.5 rounded-xl border text-left overflow-hidden cursor-pointer transition-all bg-gradient-to-br ${
                  reached || isPreviewed
                    ? `${tier.bgGrad} ${tier.borderGlow}`
                    : 'from-white/[0.02] to-transparent border-white/10 hover:border-white/25'
                }`}
              >
                {shouldAnimateGlow && (
                  <motion.span
                    aria-hidden="true"
                    animate={{ x: ['-100%', '180%'] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                  />
                )}
                <div className="flex items-center justify-between gap-1.5 relative">
                  <span className={`text-xs font-extrabold ${reached || isPreviewed ? tier.accentText : 'text-gray-200'}`}>
                    {tier.label}
                  </span>
                  <span className="text-[10px] font-mono text-gray-300">
                    {reached ? 'Unlocked' : isPreviewed ? 'Preview' : `${pct}%`}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 relative">
                  {tier.subtitle} • {tier.days} days
                </div>
                <div className="w-full h-1 rounded-full bg-[#131520] overflow-hidden mt-2 relative">
                  <div
                    style={{ width: `${isPreviewed ? 100 : pct}%` }}
                    className={`h-full rounded-full bg-gradient-to-r ${tier.barGrad} transition-all duration-500`}
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 30-Day Visual Calendar-Based Streak Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-gray-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Last 30 Days Interaction Calendar</span>
          </span>
          <span className="text-[10px] text-gray-400">
            {streakSummary.totalInteractions} logged interactions
          </span>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
          {streakSummary.calendarGrid.map((cell) => (
            <div
              key={cell.date}
              title={`${cell.date} (${cell.dayLabel}): ${cell.completed ? `${cell.count} interaction(s) completed` : 'No completed activity'}`}
              className={`py-1.5 px-1 rounded-xl text-center flex flex-col items-center justify-between border transition-all ${
                cell.completed
                  ? 'bg-gradient-to-b from-amber-400/30 via-orange-500/20 to-rose-950/50 border-amber-400/75 text-white shadow-[0_0_14px_rgba(245,158,11,0.32)]'
                  : 'bg-[#090a0f]/70 border-white/5 text-gray-500'
              } ${cell.isToday ? 'ring-1 ring-amber-300/90' : ''}`}
            >
              <span className="text-[8px] font-bold uppercase tracking-tight leading-none">
                {cell.dayLabel.slice(0, 2)}
              </span>
              <div className="my-1">
                {cell.completed ? (
                  <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-700 border-dashed" />
                )}
              </div>
              <span className="text-[9px] font-mono text-gray-200 leading-none">
                {cell.dayNum}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Query Goal Mini Progress */}
      <div className="space-y-1.5 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-300">
          <span className="flex items-center gap-1 text-rose-300">
            <Target className="w-3 h-3" />
            <span>Today&apos;s Query Goal</span>
          </span>
          <span className="text-rose-200">
            {user.dailyGoalCurrent || 0} / {user.dailyGoalTarget || 5}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#131520] overflow-hidden">
          <div
            style={{ width: `${goalPercent}%` }}
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );
};
