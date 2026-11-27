import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  X,
  Flame,
  Sparkles,
  Trophy,
  Target,
  Award,
  Zap,
  Crown,
  CalendarDays,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  Lock,
  AlertCircle,
  Share2,
  Download,
  Loader2,
  Flag,
  Quote,
  Clock,
  SlidersHorizontal,
  Check,
  Bell,
  BellOff,
  BellRing,
  Star,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  CalculatedStreakSummary,
  clampStreakGoalDays,
  computeLevelInfo,
  computeStreakGoalProgress,
  computeStreakInsights,
  computeUserExperienceLevel,
  DEFAULT_STREAK_GOAL_DAYS,
  evaluateStreakMilestones,
  formatCountdownHoursMinutes,
  generateStreakTrendData,
  MAX_STREAK_GOAL_DAYS,
  MIN_STREAK_GOAL_DAYS,
  resolveCelebratedMilestone,
  resolveDailyMotivationQuote,
  resolveEffectiveStreakTimezone,
  STREAK_GOAL_PRESETS,
  StreakMilestoneItem,
  UserExperienceBadgeTier,
} from '../utils/gamification';
import {
  getLastStreakReminderDate,
  getSeenStreakMilestones,
  getStoredDailyMotivation,
  saveSeenStreakMilestones,
  saveStoredDailyMotivation,
} from '../utils/storage';
import {
  BrowserNotificationPermissionState,
  evaluateNepalEveningReminder,
  getBrowserNotificationPermission,
  requestStreakReminderPermission,
  triggerLocalStreakNotification,
} from '../utils/streakReminder';
import {
  downloadStreakCardBlob,
  generateStreakShareCardImage,
  shareStreakCardViaBrowser,
  StreakShareCardPayload,
} from '../utils/streakShareCard';
import { DailyStreakTracker } from './DailyStreakTracker';
import { StreakCalendar } from './StreakCalendar';
import { GlobalLeaderboard } from './GlobalLeaderboard';
import { StreakLeaderboard } from './StreakLeaderboard';
import { StreakAnalyticsCard } from './StreakAnalyticsCard';

const LazyStreakMilestonesChart = React.lazy(() =>
  import('./StreakMilestonesChart').then((m) => ({ default: m.StreakMilestonesChart }))
);
const LazyStreakTrendsChart = React.lazy(() =>
  import('./StreakTrendsChart').then((m) => ({ default: m.StreakTrendsChart }))
);

interface GamificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  isStreakLoading?: boolean;
  streakSyncError?: string | null;
  onRecoverStreak?: () => void;
  onStreakFreeze?: () => void;
  onUpdateStreakGoal?: (goalDays: number) => void;
  streakRemindersEnabled?: boolean;
  streakReminderTime?: string;
  onToggleStreakReminders?: (enabled: boolean) => void;
}

const MILESTONE_ACCENT_STYLES: Record<
  StreakMilestoneItem['accent'],
  {
    border: string;
    iconBg: string;
    iconText: string;
    bar: string;
    badgeBg: string;
  }
> = {
  amber: {
    border: 'border-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.16)]',
    iconBg: 'bg-amber-500/20 border-amber-400/45',
    iconText: 'text-amber-300',
    bar: 'from-amber-400 to-orange-500',
    badgeBg: 'bg-amber-950/90 text-amber-200 border-amber-400/50',
  },
  orange: {
    border: 'border-orange-400/50 shadow-[0_0_18px_rgba(249,115,22,0.16)]',
    iconBg: 'bg-orange-500/20 border-orange-400/45',
    iconText: 'text-orange-300',
    bar: 'from-orange-400 to-amber-500',
    badgeBg: 'bg-orange-950/90 text-orange-200 border-orange-400/50',
  },
  purple: {
    border: 'border-purple-400/55 shadow-[0_0_20px_rgba(168,85,247,0.2)]',
    iconBg: 'bg-purple-500/20 border-purple-400/50',
    iconText: 'text-purple-300',
    bar: 'from-purple-400 to-fuchsia-500',
    badgeBg: 'bg-purple-950/90 text-purple-200 border-purple-400/50',
  },
  cyan: {
    border: 'border-cyan-400/55 shadow-[0_0_20px_rgba(34,211,238,0.18)]',
    iconBg: 'bg-cyan-500/20 border-cyan-400/50',
    iconText: 'text-cyan-300',
    bar: 'from-cyan-400 to-emerald-400',
    badgeBg: 'bg-cyan-950/90 text-cyan-200 border-cyan-400/50',
  },
  emerald: {
    border: 'border-emerald-400/50 shadow-[0_0_18px_rgba(52,211,153,0.16)]',
    iconBg: 'bg-emerald-500/20 border-emerald-400/45',
    iconText: 'text-emerald-300',
    bar: 'from-emerald-400 to-teal-400',
    badgeBg: 'bg-emerald-950/90 text-emerald-200 border-emerald-400/50',
  },
  rose: {
    border: 'border-rose-400/55 shadow-[0_0_20px_rgba(244,63,94,0.18)]',
    iconBg: 'bg-rose-500/20 border-rose-400/50',
    iconText: 'text-rose-300',
    bar: 'from-rose-400 to-amber-400',
    badgeBg: 'bg-rose-950/90 text-rose-200 border-rose-400/50',
  },
};

function renderMilestoneIcon(icon: StreakMilestoneItem['icon'], className: string) {
  switch (icon) {
    case 'flame':
      return <Flame className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'shield':
      return <ShieldCheck className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'trophy':
    default:
      return <Trophy className={className} />;
  }
}

export const GamificationModal: React.FC<GamificationModalProps> = ({
  isOpen,
  onClose,
  user,
  isStreakLoading = false,
  streakSyncError = null,
  onRecoverStreak,
  onStreakFreeze,
  onUpdateStreakGoal,
  streakRemindersEnabled = true,
  streakReminderTime = '20:00',
  onToggleStreakReminders,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [liveStreakSummary, setLiveStreakSummary] = useState<CalculatedStreakSummary | null>(null);
  const [activityLogs, setActivityLogs] = useState<{
    dateCounts: Record<string, number>;
    recoveredDates: string[];
    source: 'firestore' | 'local';
    isSyncing: boolean;
  }>({
    dateCounts: {},
    recoveredDates: [],
    source: 'local',
    isSyncing: false,
  });
  const [newlyEarnedMilestoneIds, setNewlyEarnedMilestoneIds] = useState<string[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<'longest' | 'current'>('longest');
  const [celebrationMilestone, setCelebrationMilestone] = useState<StreakMilestoneItem | null>(null);
  const lastCelebratedIdRef = useRef<string | null>(null);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [isSharingStreak, setIsSharingStreak] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<{
    status: 'shared' | 'downloaded' | 'error';
    message: string;
    previewDataUrl?: string;
    filename?: string;
  } | null>(null);

  const initialGoalDays = clampStreakGoalDays(user.streakGoalDays ?? DEFAULT_STREAK_GOAL_DAYS);
  const [streakGoalDays, setStreakGoalDays] = useState<number>(initialGoalDays);
  const [isEditingGoal, setIsEditingGoal] = useState<boolean>(false);
  const [customGoalInput, setCustomGoalInput] = useState<string>(String(initialGoalDays));
  const [motivationClockMs, setMotivationClockMs] = useState<number>(() => Date.now());
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermissionState>(() => getBrowserNotificationPermission());
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);

  useEffect(() => {
    const syncedGoal = clampStreakGoalDays(user.streakGoalDays ?? DEFAULT_STREAK_GOAL_DAYS);
    setStreakGoalDays(syncedGoal);
    setCustomGoalInput(String(syncedGoal));
  }, [user.streakGoalDays, user.id]);

  useEffect(() => {
    if (!isOpen) {
      setShareFeedback(null);
      setIsSharingStreak(false);
      setIsEditingGoal(false);
      setReminderFeedback(null);
      setCelebrationMilestone(null);
      lastCelebratedIdRef.current = null;
      return;
    }
    setNotificationPermission(getBrowserNotificationPermission());
    setMotivationClockMs(Date.now());
    const interval = window.setInterval(() => {
      setMotivationClockMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !celebrationMilestone) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setCelebrationMilestone(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, celebrationMilestone]);

  const effectiveTz = useMemo(
    () => resolveEffectiveStreakTimezone(user.timezone),
    [user.timezone]
  );

  const streakInsights = useMemo(
    () =>
      computeStreakInsights({
        user,
        dateCounts: activityLogs.dateCounts,
        recoveredDates: activityLogs.recoveredDates,
        timeZone: effectiveTz,
      }),
    [user, activityLogs.dateCounts, activityLogs.recoveredDates, effectiveTz]
  );

  const streakMilestones = useMemo(
    () =>
      evaluateStreakMilestones({
        user,
        dateCounts: activityLogs.dateCounts,
        recoveredDates: activityLogs.recoveredDates,
        timeZone: effectiveTz,
      }),
    [user, activityLogs.dateCounts, activityLogs.recoveredDates, effectiveTz]
  );

  const unlockedMilestoneSignature = useMemo(
    () =>
      streakMilestones
        .filter((m) => m.unlocked)
        .map((m) => m.id)
        .join(','),
    [streakMilestones]
  );

  // Detect newly earned milestones when the modal opens or a milestone unlocks,
  // animating them once before recording them as seen for this user.
  useEffect(() => {
    if (!isOpen || isStreakLoading) return;
    const unlockedIds = unlockedMilestoneSignature
      ? unlockedMilestoneSignature.split(',').filter(Boolean)
      : [];
    if (unlockedIds.length === 0) {
      setNewlyEarnedMilestoneIds([]);
      return;
    }
    const seen = new Set(getSeenStreakMilestones(user.id));
    const newlyUnlocked = unlockedIds.filter((id) => !seen.has(id));
    if (newlyUnlocked.length > 0) {
      setNewlyEarnedMilestoneIds(newlyUnlocked);
      const celebrated = resolveCelebratedMilestone(streakMilestones, newlyUnlocked);
      if (celebrated && lastCelebratedIdRef.current !== celebrated.id) {
        lastCelebratedIdRef.current = celebrated.id;
        setCelebrationMilestone(celebrated);
      }
      const timer = window.setTimeout(() => {
        saveSeenStreakMilestones(user.id, [...seen, ...unlockedIds]);
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    setNewlyEarnedMilestoneIds([]);
  }, [isOpen, isStreakLoading, user.id, unlockedMilestoneSignature, streakMilestones]);

  const consecutiveDays = liveStreakSummary?.consecutiveDays ?? user.currentStreak ?? user.streakDays ?? 0;

  // Resolve and persist the user's 24-hour Daily Motivation quote when they maintain an active streak
  const dailyMotivation = useMemo(() => {
    const stored = getStoredDailyMotivation(user.id);
    return resolveDailyMotivationQuote({
      currentStreak: consecutiveDays,
      existingState: stored,
      nowMs: motivationClockMs,
    });
  }, [user.id, consecutiveDays, motivationClockMs]);

  useEffect(() => {
    if (!isOpen) return;
    if (dailyMotivation.isUnlocked && dailyMotivation.didRotate && dailyMotivation.nextState) {
      saveStoredDailyMotivation(user.id, dailyMotivation.nextState);
    }
  }, [isOpen, user.id, dailyMotivation]);

  const streakGoalProgress = useMemo(
    () => computeStreakGoalProgress(consecutiveDays, streakGoalDays),
    [consecutiveDays, streakGoalDays]
  );

  const bestStreak = Math.max(
    liveStreakSummary?.longestStreak ?? 0,
    streakInsights.bestEverStreak,
    user.longestStreak ?? 0
  );

  const experienceSummary = useMemo(
    () =>
      computeUserExperienceLevel({
        xp: user.xp || 0,
        currentStreak: consecutiveDays,
        longestStreak: bestStreak,
        totalActiveDays: streakInsights.totalDaysActive,
      }),
    [user.xp, consecutiveDays, bestStreak, streakInsights.totalDaysActive]
  );

  const trendData = useMemo(
    () => generateStreakTrendData(activityLogs.dateCounts, effectiveTz, motivationClockMs),
    [activityLogs.dateCounts, effectiveTz, motivationClockMs]
  );

  const eveningReminderStatus = useMemo(
    () =>
      evaluateNepalEveningReminder({
        enabled: streakRemindersEnabled,
        lastActiveDate: user.lastActiveDate,
        lastNotifiedDateKey: getLastStreakReminderDate(user.id),
        preferredTime: streakReminderTime,
        timeZone: effectiveTz,
        nowMs: motivationClockMs,
      }),
    [streakRemindersEnabled, streakReminderTime, effectiveTz, user.lastActiveDate, user.id, motivationClockMs]
  );

  const handleApplyStreakGoal = (targetDays: number) => {
    const clamped = clampStreakGoalDays(targetDays);
    setStreakGoalDays(clamped);
    setCustomGoalInput(String(clamped));
    setIsEditingGoal(false);
    onUpdateStreakGoal?.(clamped);
  };

  const handleToggleReminderSwitch = async () => {
    const nextEnabled = !streakRemindersEnabled;
    if (nextEnabled) {
      const perm = await requestStreakReminderPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        onToggleStreakReminders?.(true);
        setReminderFeedback(`${eveningReminderStatus.preferredTimeLabel} daily streak reminders enabled!`);
      } else if (perm === 'denied') {
        onToggleStreakReminders?.(false);
        setReminderFeedback(
          `Browser notifications are blocked. Allow notifications in your browser site settings to receive ${eveningReminderStatus.preferredTimeLabel} alerts.`
        );
      } else if (perm === 'unsupported') {
        onToggleStreakReminders?.(true);
        setReminderFeedback('Reminders saved. Your current browser does not support native push popups.');
      } else {
        setReminderFeedback('Notification permission prompt was dismissed. Click Enable again to allow alerts.');
      }
      return;
    }
    onToggleStreakReminders?.(false);
    setReminderFeedback(`${eveningReminderStatus.preferredTimeLabel} daily streak reminders paused.`);
  };

  const handleTestStreakNotification = async () => {
    let perm = getBrowserNotificationPermission();
    if (perm === 'default') {
      perm = await requestStreakReminderPermission();
    }
    setNotificationPermission(perm);
    if (perm !== 'granted') {
      setReminderFeedback(
        perm === 'unsupported'
          ? 'Browser Notification API is not supported in this view.'
          : `Please allow browser notifications first to preview the ${eveningReminderStatus.preferredTimeLabel} reminder.`
      );
      return;
    }
    const ok = await triggerLocalStreakNotification({
      currentStreak: consecutiveDays,
      userName: user.nickname || user.name,
      preferredTime: streakReminderTime,
      timeZone: effectiveTz,
      isTest: true,
    });
    setReminderFeedback(
      ok
        ? `Test notification sent! You will be reminded at ${eveningReminderStatus.preferredTimeLabel} (${eveningReminderStatus.effectiveTimezone}) if you have not opened Aadesh AI.`
        : 'Could not display browser notification right now.'
    );
  };

  if (!isOpen) return null;

  const levelInfo = computeLevelInfo(experienceSummary.totalExperienceXp);
  const goalPercent = Math.min(
    100,
    Math.round(((user.dailyGoalCurrent || 0) / (user.dailyGoalTarget || 5)) * 100)
  );
  const unlockedMilestonesCount = streakMilestones.filter((m) => m.unlocked).length;

  const buildSharePayload = (): StreakShareCardPayload => ({
    displayName: user.nickname || user.name || 'Aadesh Explorer',
    countryFlag: user.countryFlag,
    country: user.country,
    currentStreak: consecutiveDays,
    bestEverStreak: bestStreak,
    totalDaysActive: streakInsights.totalDaysActive,
    recoveryEfficiencyPercent: streakInsights.monthlyRecoveryEfficiencyPercent,
    level: experienceSummary.level,
    levelTitle: experienceSummary.badgeName,
    xp: experienceSummary.totalExperienceXp,
    unlockedMilestonesCount,
    totalMilestonesCount: streakMilestones.length,
    globalRank,
    streakHistory: user.streakHistory,
  });

  const handleShareStreak = async () => {
    if (isSharingStreak) return;
    setIsSharingStreak(true);
    try {
      const result = await shareStreakCardViaBrowser(buildSharePayload());
      if (result.status === 'shared') {
        setShareFeedback({
          status: 'shared',
          message: 'Streak card shared via your device share sheet!',
          previewDataUrl: result.previewDataUrl,
          filename: result.filename,
        });
      } else if (result.status === 'downloaded') {
        setShareFeedback({
          status: 'downloaded',
          message: 'Streak card PNG saved — ready to share anywhere!',
          previewDataUrl: result.previewDataUrl,
          filename: result.filename,
        });
      } else if (result.status === 'error') {
        setShareFeedback({
          status: 'error',
          message: result.error || 'Could not generate streak card image.',
        });
      }
    } finally {
      setIsSharingStreak(false);
    }
  };

  const handleRedownloadShareCard = async () => {
    try {
      const { blob, filename } = await generateStreakShareCardImage(buildSharePayload());
      downloadStreakCardBlob(blob, filename);
    } catch {
      // Quietly ignore if download fails
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.12 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card rounded-3xl max-w-2xl w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[90vh] max-h-[90dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      scale: [0.6, 1.2, 0.95, 1],
                      opacity: 1,
                      boxShadow: [
                        '0 0 10px rgba(245,158,11,0.3)',
                        '0 0 36px rgba(251,191,36,0.95)',
                        '0 0 20px rgba(245,158,11,0.55)',
                      ],
                    }
              }
              transition={{ duration: prefersReducedMotion ? 0.12 : 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white shrink-0"
            >
              <Flame className="w-6 h-6 fill-white text-white" />
            </motion.div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex flex-wrap items-center gap-2">
                <span>Activity Streak &amp; Gamification</span>
                <motion.span
                  initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                  animate={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : {
                          scale: [0.7, 1.15, 1],
                          opacity: 1,
                          boxShadow: [
                            '0 0 6px rgba(251,191,36,0.2)',
                            '0 0 24px rgba(251,191,36,0.85)',
                            '0 0 12px rgba(245,158,11,0.4)',
                          ],
                        }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0.12 : 0.7,
                    delay: prefersReducedMotion ? 0 : 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400/30 to-orange-500/25 border border-amber-300/75 text-amber-200 inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>
                    {isStreakLoading && consecutiveDays === 0
                      ? 'Syncing Streak…'
                      : `${consecutiveDays}d Golden Streak`}
                  </span>
                </motion.span>
              </h3>
              <p className="text-xs text-gray-400">
                Track your consecutive interaction days from Firestore logs, XP points, and milestones
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleShareStreak}
              disabled={isSharingStreak}
              aria-label="Share Streak Card"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/90 via-indigo-600/90 to-amber-500/85 hover:from-purple-500 hover:via-indigo-500 hover:to-amber-400 text-white text-xs font-bold border border-purple-300/40 shadow-[0_0_16px_rgba(168,85,247,0.35)] cursor-pointer transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              {isSharingStreak ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Share Streak</span>
              <span className="sm:hidden">Share</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close Activity Streak and Gamification modal"
              className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto scroll-pane space-y-5">
          {shareFeedback && (
            <div
              role="status"
              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                shareFeedback.status === 'error'
                  ? 'bg-rose-950/45 border-rose-400/40 text-rose-200'
                  : 'bg-purple-950/45 border-purple-400/45 text-purple-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {shareFeedback.previewDataUrl && (
                  <img
                    src={shareFeedback.previewDataUrl}
                    alt="Generated streak share card preview"
                    className="w-12 h-12 rounded-xl border border-white/20 object-cover shrink-0 shadow-md"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{shareFeedback.message}</p>
                  {shareFeedback.filename && (
                    <p className="text-[10.5px] text-purple-200/75 truncate">
                      {shareFeedback.filename} · 1080×1080 PNG
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {shareFeedback.previewDataUrl && (
                  <button
                    type="button"
                    onClick={handleRedownloadShareCard}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save PNG</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShareFeedback(null)}
                  aria-label="Dismiss share card notice"
                  className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {streakSyncError && (
            <div
              role="status"
              className="px-3.5 py-2.5 rounded-xl bg-amber-950/55 border border-amber-400/40 text-amber-200 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{streakSyncError}</span>
            </div>
          )}

          {/* Glowing Gamified DailyStreakTracker (Firestore Logs + Badge + Weekly Master Progress Bar) */}
          <DailyStreakTracker
            user={user}
            onStreakCalculated={setLiveStreakSummary}
            onActivityLogsLoaded={setActivityLogs}
            onRecoverStreak={onRecoverStreak}
            hideCalendarGrid={true}
          />

          {/* Streak Goal: User-configurable streak target (e.g. 30-day streak) with animated progress bar */}
          <section
            aria-label="Streak Goal"
            className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 space-y-3.5 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Streak Goal
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 tabular-nums">
                  {streakGoalProgress.goalDays}-Day Target
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomGoalInput(String(streakGoalDays));
                  setIsEditingGoal((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#141728] hover:bg-[#1c2038] border border-purple-400/35 text-purple-200 hover:text-white text-[11px] font-bold cursor-pointer transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{isEditingGoal ? 'Cancel' : 'Set Target'}</span>
              </button>
            </div>

            {/* Target Editor Drawer */}
            {isEditingGoal && (
              <div className="p-3 rounded-xl bg-[#101220] border border-purple-400/35 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {STREAK_GOAL_PRESETS.map((preset) => {
                    const isSelected = streakGoalDays === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleApplyStreakGoal(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors tabular-nums ${
                          isSelected
                            ? 'bg-gradient-to-r from-amber-500/30 to-purple-500/30 border-amber-400/70 text-amber-200'
                            : 'bg-[#16192c] border-white/10 text-gray-300 hover:border-purple-400/50 hover:text-white'
                        }`}
                      >
                        {preset} Days
                      </button>
                    );
                  })}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = parseInt(customGoalInput, 10);
                    if (Number.isFinite(parsed) && parsed >= MIN_STREAK_GOAL_DAYS) {
                      handleApplyStreakGoal(parsed);
                    }
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <label htmlFor="custom-streak-goal-input" className="text-[11px] text-gray-300 font-semibold">
                    Custom target ({MIN_STREAK_GOAL_DAYS}–{MAX_STREAK_GOAL_DAYS} days):
                  </label>
                  <input
                    id="custom-streak-goal-input"
                    type="number"
                    min={MIN_STREAK_GOAL_DAYS}
                    max={MAX_STREAK_GOAL_DAYS}
                    value={customGoalInput}
                    onChange={(e) => setCustomGoalInput(e.target.value)}
                    className="w-20 px-2.5 py-1 rounded-lg bg-[#090a0f] border border-purple-400/40 text-white text-xs font-bold tabular-nums focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    <span>Save</span>
                  </button>
                </form>
              </div>
            )}

            {/* Progress Bar Visualization */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white tabular-nums">
                  {streakGoalProgress.currentStreak} / {streakGoalProgress.goalDays}{' '}
                  <span className="text-gray-400 font-medium">days completed</span>
                </span>
                <span
                  className={`font-extrabold tabular-nums ${
                    streakGoalProgress.isCompleted ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {streakGoalProgress.progressPercent}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-label="Streak goal progress"
                aria-valuemin={0}
                aria-valuemax={streakGoalProgress.goalDays}
                aria-valuenow={Math.min(streakGoalProgress.currentStreak, streakGoalProgress.goalDays)}
                className="w-full h-3 rounded-full bg-[#131520] overflow-hidden p-0.5 border border-white/10"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${streakGoalProgress.progressPercent}%` }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`h-full rounded-full ${
                    streakGoalProgress.isCompleted
                      ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                      : 'bg-gradient-to-r from-purple-500 via-amber-400 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                  }`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                {streakGoalProgress.isCompleted ? (
                  <>
                    <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Goal achieved! You reached your {streakGoalProgress.goalDays}-day streak target.
                      </span>
                    </span>
                    {streakGoalProgress.suggestedNextGoal && (
                      <button
                        type="button"
                        onClick={() => handleApplyStreakGoal(streakGoalProgress.suggestedNextGoal!)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-200 cursor-pointer transition-colors"
                      >
                        Level up to {streakGoalProgress.suggestedNextGoal}d
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 tabular-nums">
                    {streakGoalProgress.remainingDays}{' '}
                    {streakGoalProgress.remainingDays === 1 ? 'more day' : 'more days'} to hit your{' '}
                    <span className="text-white font-semibold">
                      {streakGoalProgress.goalDays}-day
                    </span>{' '}
                    streak goal.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Daily Motivation: Random inspirational quote unlocked by maintaining a streak, refreshed every 24h */}
          <section
            aria-label="Daily Motivation"
            className={`rounded-2xl p-4 sm:p-5 space-y-3 border shadow-[0_10px_30px_rgba(6,4,18,0.45)] ${
              dailyMotivation.isUnlocked
                ? 'bg-gradient-to-br from-[#120d26]/95 via-[#0c0d18]/95 to-[#090a0f]/95 border-purple-400/40'
                : 'bg-[#090a0f]/90 border-[#232738]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Quote className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Daily Motivation
                </h4>
                {dailyMotivation.isUnlocked && dailyMotivation.quote && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200">
                    {dailyMotivation.quote.category}
                  </span>
                )}
              </div>

              {dailyMotivation.isUnlocked ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-gray-400 tabular-nums">
                  <Clock className="w-3 h-3 text-purple-300" aria-hidden="true" />
                  <span>
                    Updates in {formatCountdownHoursMinutes(dailyMotivation.msUntilNextUpdate)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  <span>Streak Required</span>
                </span>
              )}
            </div>

            {dailyMotivation.isUnlocked && dailyMotivation.quote ? (
              <blockquote className="space-y-2">
                <p className="text-xs sm:text-sm font-medium text-purple-50 leading-relaxed italic">
                  &ldquo;{dailyMotivation.quote.text}&rdquo;
                </p>
                <footer className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-amber-300">
                    — {dailyMotivation.quote.author}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Unlocked by your {consecutiveDays}d active streak
                  </span>
                </footer>
              </blockquote>
            ) : (
              <div className="p-3 rounded-xl bg-[#101220] border border-white/5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                </div>
                <p className="text-xs text-gray-300 leading-snug">
                  Maintain an active daily streak to unlock a fresh inspirational quote every 24 hours.
                </p>
              </div>
            )}
          </section>

          {/* Interactive Monthly Streak Calendar (Maintained, Missed & Recovered Patterns) */}
          <StreakCalendar
            user={user}
            dateCounts={activityLogs.dateCounts}
            recoveredDates={activityLogs.recoveredDates}
            logSource={activityLogs.source}
            isSyncing={activityLogs.isSyncing}
            onRecoverStreak={onRecoverStreak}
          />

          {/* Streak Analytics: Last 30 Days Calendar Heatmap & Consistency Patterns */}
          <StreakAnalyticsCard
            user={user}
            dateCounts={activityLogs.dateCounts}
            recoveredDates={activityLogs.recoveredDates}
            authoritativeStreak={consecutiveDays}
            timeZone={effectiveTz}
          />

          {/* Streak Insights Card: Best Ever Streak, Total Days Active & Monthly Recovery Efficiency */}
          <section
            aria-label="Streak Insights"
            className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 space-y-3.5 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Streak Insights
                </h4>
              </div>
              <span className="text-[10.5px] text-gray-400 tabular-nums">
                {streakInsights.monthlyMaintainedDays} maintained · {streakInsights.monthlyRecoveriesRemaining}/5 shields left
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Best Ever Streak */}
              <div className="p-3.5 rounded-xl bg-[#101220] border border-amber-400/30 flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    <span>Best Ever Streak</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-white tabular-nums tracking-tight leading-none">
                  {bestStreak}{' '}
                  <span className="text-xs font-semibold text-amber-300/90">
                    {bestStreak === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
                <p className="text-[10.5px] text-gray-400 leading-snug">
                  Personal longest unbroken streak
                </p>
              </div>

              {/* Total Days Active */}
              <div className="p-3.5 rounded-xl bg-[#101220] border border-purple-400/30 flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />
                    <span>Total Days Active</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-white tabular-nums tracking-tight leading-none">
                  {streakInsights.totalDaysActive}{' '}
                  <span className="text-xs font-semibold text-purple-300/90">
                    {streakInsights.totalDaysActive === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
                <p className="text-[10.5px] text-gray-400 leading-snug">
                  Unique days logged across history
                </p>
              </div>

              {/* Monthly Recovery Efficiency */}
              <div className="p-3.5 rounded-xl bg-[#101220] border border-cyan-400/30 flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-300">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                    <span>Recovery Efficiency</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-white tabular-nums tracking-tight leading-none">
                  {streakInsights.monthlyRecoveryEfficiencyPercent}
                  <span className="text-sm font-bold text-cyan-300/90">%</span>
                </div>
                <p className="text-[10.5px] text-gray-400 leading-snug">
                  {streakInsights.hasMonthMisses
                    ? `${streakInsights.monthlyRecoveredDays}/${streakInsights.monthlyRecoveredDays + streakInsights.monthlyMissedDays} missed days recovered this month`
                    : streakInsights.monthlyMaintainedDays > 0
                    ? 'Zero missed days this month'
                    : 'Start a streak to track efficiency'}
                </p>
              </div>
            </div>
          </section>

          {/* Streak Trends Line Chart (3-Month Activity Growth via Recharts) */}
          <section
            aria-label="Streak Trends"
            className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 space-y-3.5 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Streak Trends &amp; Activity Growth (3 Months)
                </h4>
              </div>
              <span className="text-[10.5px] text-gray-400 tabular-nums">
                Active days per week
              </span>
            </div>

            <Suspense
              fallback={
                <div className="w-full h-48 sm:h-56 pt-2 flex items-center justify-center rounded-xl bg-[#101220] border border-white/10 text-xs text-purple-200/70 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Loading 3-month trends chart…</span>
                </div>
              }
            >
              <LazyStreakTrendsChart trendData={trendData} />
            </Suspense>
          </section>

          {/* Streak Freeze Card (Spend XP to protect/freeze a missed day) */}
          <section
            aria-label="Streak Freeze"
            className="rounded-2xl bg-gradient-to-br from-[#120e24]/95 via-[#0b0d19]/95 to-[#090a0f]/95 border border-amber-500/35 p-4 sm:p-5 space-y-3 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Streak Freeze Shield
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200">
                  150 XP Cost
                </span>
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums">
                Current XP: <span className="text-white font-bold">{(user.xp || 0).toLocaleString()} XP</span>
              </span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Use <span className="text-amber-300 font-bold">150 XP</span> to instantly freeze and protect your streak from resetting if you miss a calendar day.
            </p>

            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                onClick={() => onStreakFreeze?.()}
                disabled={(user.xp || 0) < 150}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs cursor-pointer transition-all shadow-[0_0_16px_rgba(251,191,36,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Activate Streak Freeze (150 XP)</span>
              </button>
            </div>
          </section>

          {/* Real-Time Top 10 Leaderboards (Streak Leaderboard by longestStreak + Global Active) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Live Firestore Rankings
              </span>
              <div
                role="tablist"
                aria-label="Leaderboard view switcher"
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#090a0f] border border-white/10"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={leaderboardMode === 'longest'}
                  onClick={() => setLeaderboardMode('longest')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    leaderboardMode === 'longest'
                      ? 'bg-gradient-to-r from-amber-500/30 to-orange-500/25 border border-amber-400/50 text-amber-200'
                      : 'text-gray-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span>Streak Leaderboard</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={leaderboardMode === 'current'}
                  onClick={() => setLeaderboardMode('current')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    leaderboardMode === 'current'
                      ? 'bg-purple-600/35 border border-purple-400/50 text-purple-100'
                      : 'text-gray-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Flame className="w-3 h-3 text-purple-300" />
                  <span>Active Now</span>
                </button>
              </div>
            </div>

            {leaderboardMode === 'longest' ? (
              <StreakLeaderboard
                user={user}
                isActive={isOpen}
                onCurrentUserRankChange={setGlobalRank}
              />
            ) : (
              <GlobalLeaderboard
                user={user}
                isActive={isOpen}
                onCurrentUserRankChange={setGlobalRank}
              />
            )}
          </div>

          {/* Main Streak & XP Scoreboard */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#090a0f] border border-amber-500/40 relative overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.12)]">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                  <span>Current Streak</span>
                </span>
                <span className="text-[10px] text-gray-400 font-normal">
                  Best: {bestStreak}d
                </span>
              </div>
              <div className="text-3xl font-black text-white tracking-tight tabular-nums">
                {isStreakLoading && consecutiveDays === 0 ? '…' : consecutiveDays}{' '}
                <span className="text-base font-semibold text-amber-300">Days</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Consecutive interaction days synced with activity logs
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#090a0f] border border-purple-500/40 relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between text-xs text-purple-300 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Experience XP</span>
                </span>
                <span className="text-[10px] bg-purple-950 text-purple-200 px-1.5 py-0.5 rounded font-mono">
                  Lvl {experienceSummary.level}
                </span>
              </div>
              <div className="text-3xl font-black text-white tracking-tight tabular-nums">
                {experienceSummary.totalExperienceXp.toLocaleString()}{' '}
                <span className="text-base font-semibold text-purple-300">XP</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {experienceSummary.badgeName} · +{experienceSummary.streakBonusXp.toLocaleString()} streak XP
              </p>
            </div>
          </div>

          {/* User Experience Level System & Special Profile Badges */}
          <section
            aria-label="User Experience Level"
            className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#100d22]/95 via-[#0a0b14]/95 to-[#090a0f]/95 border border-purple-500/40 space-y-3.5 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  User Experience Level
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-amber-500/25 border border-amber-300/50 text-amber-200">
                  Lvl {experienceSummary.level} · {experienceSummary.badgeName}
                </span>
              </div>
              <span className="text-purple-200 font-semibold text-[11px] tabular-nums">
                {experienceSummary.isMaxLevel
                  ? `${experienceSummary.totalExperienceXp.toLocaleString()} XP (MAX)`
                  : `${experienceSummary.totalExperienceXp.toLocaleString()} / ${experienceSummary.nextLevelXp.toLocaleString()} XP (${levelInfo.progressPercent}%)`}
              </span>
            </div>

            {/* XP Breakdown (Consistent Usage + Streak Consistency Bonus) */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="px-3 py-2 rounded-xl bg-[#111322] border border-white/10 flex items-center justify-between gap-2">
                <span className="text-gray-400">Usage XP</span>
                <span className="font-bold text-purple-200 tabular-nums">
                  +{experienceSummary.usageXp.toLocaleString()} XP
                </span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#111322] border border-amber-400/25 flex items-center justify-between gap-2">
                <span className="text-gray-400">Streak Bonus XP</span>
                <span className="font-bold text-amber-300 tabular-nums">
                  +{experienceSummary.streakBonusXp.toLocaleString()} XP
                </span>
              </div>
            </div>

            {/* Experience Progress Bar */}
            <div className="space-y-1.5">
              <div
                role="progressbar"
                aria-label="User Experience Level progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={experienceSummary.progressPercent}
                className="w-full h-2.5 rounded-full bg-[#131520] overflow-hidden p-0.5 border border-white/10"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${experienceSummary.progressPercent}%` }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-400 to-amber-400 shadow-sm shadow-purple-500/50"
                />
              </div>
              <p className="text-[10.5px] text-gray-400 tabular-nums">
                {experienceSummary.isMaxLevel
                  ? 'You have unlocked the highest Aadesh Master profile badge!'
                  : `${experienceSummary.xpToNextLevel.toLocaleString()} more XP from daily streaks and conversations to unlock the next profile badge.`}
              </p>
            </div>

            {/* Special Profile Badges Grid (Novice -> Explorer -> Pro -> Elite -> Aadesh Master) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-0.5">
              {experienceSummary.unlockedBadges.map((tier: UserExperienceBadgeTier & { unlocked: boolean; isCurrent: boolean }) => (
                <div
                  key={tier.badgeName}
                  className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-between gap-1 transition-all ${
                    tier.isCurrent
                      ? 'bg-gradient-to-b from-purple-600/30 to-amber-500/15 border-amber-400/75 shadow-[0_0_16px_rgba(251,191,36,0.25)]'
                      : tier.unlocked
                      ? 'bg-[#121426] border-purple-400/45 text-white'
                      : 'bg-[#0b0d17]/70 border-white/10 opacity-55'
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    {tier.icon}
                  </span>
                  <span className="text-[11px] font-extrabold text-white leading-tight">
                    {tier.badgeName}
                  </span>
                  <span className="text-[9.5px] font-mono text-gray-400 tabular-nums">
                    {tier.minXp.toLocaleString()}+ XP
                  </span>
                  {tier.isCurrent ? (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/25 border border-amber-300/60 text-amber-200">
                      Active
                    </span>
                  ) : tier.unlocked ? (
                    <span className="text-[9px] font-semibold text-emerald-300 flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>Unlocked</span>
                    </span>
                  ) : (
                    <span className="text-[9px] text-gray-500 flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Locked</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 8:00 PM Nepal Time Push Notification Streak Reminder */}
          <section
            aria-label="Streak Push Notification Reminder"
            className="p-4 sm:p-5 rounded-2xl bg-[#090a0f]/95 border border-cyan-500/35 space-y-3 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {streakRemindersEnabled && notificationPermission === 'granted' ? (
                  <BellRing className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                ) : streakRemindersEnabled ? (
                  <Bell className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
                ) : (
                  <BellOff className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                )}
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  {eveningReminderStatus.preferredTimeLabel} Daily Streak Reminder
                </h4>
              </div>
              <span className="text-[10.5px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-400/30 px-2 py-0.5 rounded-full tabular-nums">
                {eveningReminderStatus.nepalTimeLabel}
              </span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Triggers a local browser push notification at{' '}
              <span className="text-white font-semibold">
                {eveningReminderStatus.preferredTimeLabel} ({eveningReminderStatus.effectiveTimezone})
              </span>{' '}
              if you haven&apos;t opened Aadesh AI yet that day to protect your streak.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="text-[11px] text-gray-400 tabular-nums">
                {eveningReminderStatus.reason === 'already_active_today' ? (
                  <span className="text-emerald-300 font-semibold">
                    Today&apos;s streak is safe · Next check in {eveningReminderStatus.countdownLabel}
                  </span>
                ) : streakRemindersEnabled ? (
                  <span>
                    Next {eveningReminderStatus.preferredTimeLabel} check in{' '}
                    <span className="text-white font-semibold">
                      {eveningReminderStatus.countdownLabel}
                    </span>
                  </span>
                ) : (
                  <span>Daily reminder is currently paused</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestStreakNotification}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#141728] hover:bg-[#1c2038] border border-cyan-400/35 text-cyan-200 hover:text-white text-[11px] font-bold cursor-pointer transition-colors"
                >
                  <BellRing className="w-3 h-3" />
                  <span>Test Alert</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleReminderSwitch}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border cursor-pointer transition-colors ${
                    streakRemindersEnabled && notificationPermission === 'granted'
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400/50 text-cyan-200'
                      : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border-purple-300/40 text-white'
                  }`}
                >
                  {streakRemindersEnabled && notificationPermission === 'granted' ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Enabled</span>
                    </>
                  ) : streakRemindersEnabled ? (
                    <>
                      <Bell className="w-3 h-3" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-3 h-3" />
                      <span>Enable 8 PM Alert</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {reminderFeedback && (
              <p
                role="status"
                className="text-[11px] text-cyan-200 bg-cyan-950/45 border border-cyan-400/30 rounded-xl px-3 py-2"
              >
                {reminderFeedback}
              </p>
            )}
          </section>

          {/* Daily Learning Goal */}
          <div className="p-4 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-rose-400" />
                <span>Daily Learning Goal</span>
              </span>
              <span className="text-xs font-semibold text-rose-300 tabular-nums">
                {user.dailyGoalCurrent || 0} / {user.dailyGoalTarget || 5} Queries
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#131520] overflow-hidden border border-white/5">
              <div
                style={{ width: `${goalPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300"
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Each AI message (+25 XP), voice prompt (+50 XP), image analysis (+40 XP), and translation (+30 XP) contributes to your daily goal.
            </p>
          </div>

          {/* Achievement Badges */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  Achievement Badges
                </h4>
              </div>
              <span className="text-xs text-gray-400 tabular-nums">
                {user.badges.filter((b) => b.unlocked).length} / {user.badges.length} Unlocked
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {user.badges.map((badge) => (
                <div
                  key={badge.id}
                  className={`p-3 rounded-2xl border flex items-start gap-3 transition-all ${
                    badge.unlocked
                      ? 'bg-[#090a0f] border-purple-500/40 text-white shadow-md'
                      : 'bg-[#090a0f]/40 border-[#232738] text-gray-500 opacity-60'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-xl shrink-0">
                    {badge.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs font-bold text-white truncate">
                        {badge.name}
                      </h5>
                      {badge.unlocked ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-500/30 shrink-0">
                          Unlocked
                        </span>
                      ) : (
                        <span className="text-[9px] text-gray-500 shrink-0">In Progress</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                      {badge.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Streak Milestones Section (D3 Circular Progress Bar + Unlocked Milestone Cards) */}
          <section aria-label="Streak Milestones" className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Streak Milestones
                </h4>
              </div>
              <span className="text-xs text-gray-400 tabular-nums">
                {unlockedMilestonesCount} / {streakMilestones.length} Earned
              </span>
            </div>

            <Suspense
              fallback={
                <div className="w-full h-56 flex items-center justify-center rounded-2xl bg-[#090a0f] border border-purple-500/30 text-xs text-purple-200/70 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading milestone visualization…</span>
                </div>
              }
            >
              <LazyStreakMilestonesChart
                currentStreak={consecutiveDays}
                longestStreak={bestStreak}
                goalDays={streakGoalProgress.goalDays}
                milestones={streakMilestones}
                onApplyGoal={handleApplyStreakGoal}
              />
            </Suspense>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {streakMilestones.map((milestone, index) => {
                const styles = MILESTONE_ACCENT_STYLES[milestone.accent];
                const isNewlyEarned = newlyEarnedMilestoneIds.includes(milestone.id);
                const isCelebratingCard = isNewlyEarned || celebrationMilestone?.id === milestone.id;

                return (
                  <motion.div
                    key={milestone.id}
                    initial={
                      isNewlyEarned && !prefersReducedMotion
                        ? { opacity: 0, scale: 0.88, y: 12 }
                        : false
                    }
                    animate={
                      isNewlyEarned && !prefersReducedMotion
                        ? {
                            opacity: 1,
                            scale: [0.88, 1.05, 1],
                            y: 0,
                          }
                        : { opacity: 1, scale: 1, y: 0 }
                    }
                    transition={
                      isNewlyEarned && !prefersReducedMotion
                        ? {
                            duration: 0.65,
                            delay: index * 0.06,
                            ease: [0.22, 1, 0.36, 1],
                          }
                        : { duration: 0.15 }
                    }
                    className={`relative p-3.5 rounded-2xl border overflow-hidden transition-all ${
                      isCelebratingCard ? 'milestone-celebrate-card ' : ''
                    }${
                      milestone.unlocked
                        ? `bg-[#090a0f] ${styles.border}`
                        : 'bg-[#090a0f]/45 border-[#232738] opacity-75'
                    }`}
                  >
                    {/* Celebratory shimmer sweep exclusively on newly earned milestones */}
                    {isCelebratingCard && !prefersReducedMotion && (
                      <motion.div
                        aria-hidden="true"
                        initial={{ x: '-120%' }}
                        animate={{ x: '220%' }}
                        transition={{ duration: 1.25, delay: 0.15, ease: 'easeInOut' }}
                        className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      />
                    )}

                    <div className="flex items-start gap-3 relative">
                      <div className="relative shrink-0">
                        {isCelebratingCard && (
                          <span
                            aria-hidden="true"
                            className="milestone-celebrate-ring pointer-events-none absolute inset-0 rounded-xl border-2 border-amber-300/75"
                          />
                        )}
                        <div
                          className={`relative w-10 h-10 rounded-xl border flex items-center justify-center ${
                            isCelebratingCard ? 'milestone-celebrate-badge ' : ''
                          }${
                            milestone.unlocked
                              ? `${styles.iconBg} ${styles.iconText}`
                              : 'bg-[#121422] border-white/10 text-gray-500'
                          }`}
                        >
                          {milestone.unlocked ? (
                            renderMilestoneIcon(milestone.icon, 'w-5 h-5')
                          ) : (
                            <Lock className="w-4 h-4" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-extrabold text-white truncate">
                            {milestone.title}
                          </h5>
                          {isNewlyEarned ? (
                            <motion.span
                              initial={prefersReducedMotion ? false : { scale: 0.7 }}
                              animate={prefersReducedMotion ? undefined : { scale: [0.7, 1.15, 1] }}
                              transition={{ duration: 0.45 }}
                              className="milestone-celebrate-badge text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-400 to-orange-500 text-black shrink-0"
                            >
                              New!
                            </motion.span>
                          ) : milestone.unlocked ? (
                            <button
                              type="button"
                              onClick={() => setCelebrationMilestone(milestone)}
                              title={`Celebrate ${milestone.title}`}
                              className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer hover:brightness-110 transition-all ${styles.badgeBg}`}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Earned</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-gray-400 tabular-nums shrink-0">
                              {milestone.progressCurrent}/{milestone.progressTarget}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                          {milestone.description}
                        </p>

                        <div className="mt-2 space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-[#131520] overflow-hidden border border-white/5">
                            <motion.div
                              initial={
                                isNewlyEarned && !prefersReducedMotion
                                  ? { width: '0%' }
                                  : false
                              }
                              animate={{ width: `${milestone.progressPercent}%` }}
                              transition={{ duration: prefersReducedMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
                              className={`h-full rounded-full bg-gradient-to-r ${
                                milestone.unlocked
                                  ? styles.bar
                                  : 'from-purple-500/70 to-indigo-500/70'
                              }`}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400 font-medium tabular-nums">
                            <span>{milestone.metricLabel}</span>
                            {milestone.unlocked && (
                              <button
                                type="button"
                                onClick={() => setCelebrationMilestone(milestone)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer transition-colors"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Celebrate</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#090a0f] flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Earn XP with every query and translation</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareStreak}
              disabled={isSharingStreak}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141728] hover:bg-[#1c2038] border border-purple-400/40 text-purple-200 hover:text-white font-bold text-xs cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSharingStreak ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              <span>Share Streak</span>
            </button>
            <button
              onClick={onClose}
              className="purple-glow-btn text-white font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>

        {/* Framer Motion Streak Celebration Pop-Up Card Overlay */}
        <AnimatePresence>
          {celebrationMilestone && (
            <motion.div
              key={celebrationMilestone.id}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
              onClick={() => setCelebrationMilestone(null)}
              role="dialog"
              aria-modal="true"
              aria-label={`Streak milestone celebration: ${celebrationMilestone.title}`}
              className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.84, y: 24 }
                }
                animate={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                exit={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.9, y: 16 }
                }
                transition={
                  prefersReducedMotion
                    ? { duration: 0.12 }
                    : { type: 'spring', stiffness: 360, damping: 24 }
                }
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#171130] via-[#0e0c1f] to-[#090a12] border border-amber-400/60 p-6 text-center shadow-[0_0_50px_rgba(251,191,36,0.28)] space-y-4 overflow-hidden"
              >
                {!prefersReducedMotion && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-140%' }}
                    animate={{ x: '240%' }}
                    transition={{ duration: 1.4, delay: 0.2, ease: 'easeInOut' }}
                    className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-amber-200/15 to-transparent"
                  />
                )}

                <button
                  type="button"
                  onClick={() => setCelebrationMilestone(null)}
                  aria-label="Dismiss milestone celebration"
                  className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
                  <span
                    aria-hidden="true"
                    className="milestone-celebrate-ring pointer-events-none absolute inset-0 rounded-2xl border-2 border-amber-400/75"
                  />
                  <div className="milestone-celebrate-badge relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white shadow-[0_0_28px_rgba(245,158,11,0.55)]">
                    {renderMilestoneIcon(celebrationMilestone.icon, 'w-8 h-8')}
                  </div>
                </div>

                <div className="space-y-1.5 relative">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/60 text-amber-200">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>Streak Milestone Unlocked</span>
                  </span>
                  <h4 className="text-lg font-black text-white tracking-tight">
                    {celebrationMilestone.title}
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {celebrationMilestone.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs relative">
                  <div className="p-2.5 rounded-xl bg-[#121426] border border-amber-400/30">
                    <div className="text-[10px] text-gray-400">Active Streak</div>
                    <div className="text-sm font-black text-amber-300 tabular-nums">
                      {consecutiveDays} Days
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#121426] border border-purple-400/30">
                    <div className="text-[10px] text-gray-400">Best Record</div>
                    <div className="text-sm font-black text-purple-200 tabular-nums">
                      {bestStreak} Days
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 relative">
                  <button
                    type="button"
                    onClick={() => {
                      void handleShareStreak();
                      setCelebrationMilestone(null);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#141728] hover:bg-[#1c2038] border border-purple-400/45 text-purple-100 text-xs font-bold cursor-pointer transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Streak</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCelebrationMilestone(null)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 text-black text-xs font-black cursor-pointer transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                  >
                    <span>Keep Going!</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

