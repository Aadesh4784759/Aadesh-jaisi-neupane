import { AchievementBadge, DailyStreakDay, UserProfile } from '../types';

export const INITIAL_BADGES: AchievementBadge[] = [
  {
    id: 'first_query',
    name: 'First Spark',
    icon: '🌟',
    description: 'Sent your first message to Aadesh AI Global Hub',
    unlocked: false,
    category: 'xp',
  },
  {
    id: 'voice_explorer',
    name: 'Voice Pioneer',
    icon: '🎙️',
    description: 'Engaged with hands-free natural voice speech recognition',
    unlocked: false,
    category: 'voice',
  },
  {
    id: 'vision_analyst',
    name: 'Vision Analyst',
    icon: '📸',
    description: 'Uploaded and analyzed visual photo context with AI',
    unlocked: false,
    category: 'vision',
  },
  {
    id: 'streak_master',
    name: 'Consistent Explorer',
    icon: '🔥',
    description: 'Maintained a 7-day consecutive activity streak',
    unlocked: false,
    category: 'streak',
  },
  {
    id: 'polyglot',
    name: 'Global Polyglot',
    icon: '🌐',
    description: 'Translated or practiced across multiple languages',
    unlocked: false,
    category: 'multilingual',
  },
  {
    id: 'power_scholar',
    name: 'AI Grand Scholar',
    icon: '⚡',
    description: 'Surpassed 2,000 XP in learning and reasoning',
    unlocked: false,
    category: 'xp',
  },
];

export const MAX_MONTHLY_STREAK_RECOVERIES = 5;
export const NEPAL_TIMEZONE = 'Asia/Kathmandu';

export interface PersistentStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD in user's saved IANA timezone
  timezone: string; // IANA timezone identifier e.g. 'Asia/Kathmandu'
  recoveryCount: number; // 0..5 used in recoveryMonth
  recoveryMonth: string; // YYYY-MM in user's saved IANA timezone
  streakBeforeBreak: number; // Previous streak available for eligible recovery
  streakBrokenDate: string; // YYYY-MM-DD of lastActiveDate before the break
}

export interface StreakActivityTransitionResult {
  nextState: PersistentStreakState;
  todayKey: string;
  monthKey: string;
  streakIncreased: boolean;
  streakBroken: boolean;
  alreadyActiveToday: boolean;
}

export interface StreakRecoveryResult {
  ok: boolean;
  reason?:
    | 'monthly_limit_reached'
    | 'not_broken'
    | 'no_previous_streak'
    | 'recovery_window_expired';
  nextState: PersistentStreakState;
  todayKey: string;
  monthKey: string;
}

export function resolveValidTimezone(preferredTz?: string): string {
  const tryTz = (tz?: string): string | null => {
    if (!tz || typeof tz !== 'string' || !tz.trim()) return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
      return tz.trim();
    } catch {
      return null;
    }
  };

  const explicit = tryTz(preferredTz);
  if (explicit) return explicit;

  return NEPAL_TIMEZONE;
}

/**
 * Resolves the user's effective local IANA timezone for consecutive calendar day calculations.
 * Prefers a saved non-UTC IANA timezone, then the browser's detected local timezone,
 * then an explicit timezone (including UTC), falling back to Nepal Time (Asia/Kathmandu).
 */
export function resolveEffectiveStreakTimezone(
  savedTz?: string,
  browserTz?: string
): string {
  const tryTz = (tz?: string): string | null => {
    if (!tz || typeof tz !== 'string' || !tz.trim()) return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
      return tz.trim();
    } catch {
      return null;
    }
  };

  const validSaved = tryTz(savedTz);
  if (validSaved && validSaved !== 'UTC' && validSaved !== 'Etc/UTC') {
    return validSaved;
  }

  let detectedBrowserTz = browserTz;
  if (!detectedBrowserTz) {
    try {
      detectedBrowserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      detectedBrowserTz = undefined;
    }
  }
  const validBrowser = tryTz(detectedBrowserTz);
  if (validBrowser && validBrowser !== 'UTC' && validBrowser !== 'Etc/UTC') {
    return validBrowser;
  }

  return NEPAL_TIMEZONE;
}

export function getDatePartsInTimezone(
  dateOrMs: Date | number = Date.now(),
  timeZone?: string
): {
  year: number;
  month: number;
  day: number;
  dateKey: string;
  monthKey: string;
  dayLabel: string;
} {
  const tz = resolveValidTimezone(timeZone);
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;

  const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = partsFormatter.formatToParts(safeDate);
  const yearStr = parts.find((p) => p.type === 'year')?.value || String(safeDate.getUTCFullYear());
  const monthStr = parts.find((p) => p.type === 'month')?.value || '01';
  const dayStr = parts.find((p) => p.type === 'day')?.value || '01';
  const weekday = parts.find((p) => p.type === 'weekday')?.value || 'Mon';

  const dateKey = `${yearStr}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
    dateKey,
    monthKey: dateKey.slice(0, 7),
    dayLabel: weekday.slice(0, 3),
  };
}

export function getLocalDateKeyInTimezone(
  dateOrMs: Date | number = Date.now(),
  timeZone?: string
): string {
  return getDatePartsInTimezone(dateOrMs, timeZone).dateKey;
}

export function getLocalMonthKeyInTimezone(
  dateOrMs: Date | number = Date.now(),
  timeZone?: string
): string {
  return getDatePartsInTimezone(dateOrMs, timeZone).monthKey;
}

export function isValidIsoDateKey(value?: string): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function diffCalendarDays(fromDateKey: string, toDateKey: string): number {
  if (!isValidIsoDateKey(fromDateKey) || !isValidIsoDateKey(toDateKey)) return Number.NaN;
  const [fy, fm, fd] = fromDateKey.split('-').map(Number);
  const [ty, tm, td] = toDateKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  if (!isValidIsoDateKey(dateKey)) return getLocalDateKeyInTimezone(Date.now());
  const [y, m, d] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getWeekdayForDateKey(dateKey: string): string {
  if (!isValidIsoDateKey(dateKey)) return 'Mon';
  const [y, m, d] = dateKey.split('-').map(Number);
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return daysOfWeek[dayIdx] || 'Mon';
}

export function normalizeStreakStateFromProfile(
  raw?: Partial<PersistentStreakState> & { streakDays?: number }
): PersistentStreakState {
  const tz = resolveValidTimezone(raw?.timezone);
  const currentMonthKey = getLocalMonthKeyInTimezone(Date.now(), tz);
  const currentStreak = Math.max(
    0,
    Math.floor(Number(raw?.currentStreak ?? raw?.streakDays ?? 0) || 0)
  );
  const longestStreak = Math.max(
    currentStreak,
    Math.floor(Number(raw?.longestStreak ?? 0) || 0)
  );
  const lastActiveDate = isValidIsoDateKey(raw?.lastActiveDate) ? raw!.lastActiveDate : '';
  const recoveryMonth =
    typeof raw?.recoveryMonth === 'string' && /^\d{4}-\d{2}$/.test(raw.recoveryMonth)
      ? raw.recoveryMonth
      : currentMonthKey;
  const recoveryCount =
    recoveryMonth === currentMonthKey
      ? Math.max(0, Math.min(MAX_MONTHLY_STREAK_RECOVERIES, Math.floor(Number(raw?.recoveryCount ?? 0) || 0)))
      : 0;
  const streakBeforeBreak = Math.max(0, Math.floor(Number(raw?.streakBeforeBreak ?? 0) || 0));
  const streakBrokenDate = isValidIsoDateKey(raw?.streakBrokenDate) ? raw!.streakBrokenDate : '';

  return {
    currentStreak,
    longestStreak,
    lastActiveDate,
    timezone: tz,
    recoveryCount,
    recoveryMonth,
    streakBeforeBreak,
    streakBrokenDate,
  };
}

export function getMonthlyRecoveryUsage(
  state: Pick<PersistentStreakState, 'recoveryCount' | 'recoveryMonth' | 'timezone'>,
  nowMs: number = Date.now()
): { recoveryCount: number; remaining: number; recoveryMonth: string } {
  const tz = resolveValidTimezone(state.timezone);
  const monthKey = getLocalMonthKeyInTimezone(nowMs, tz);
  const used =
    state.recoveryMonth === monthKey
      ? Math.max(0, Math.min(MAX_MONTHLY_STREAK_RECOVERIES, Math.floor(state.recoveryCount || 0)))
      : 0;
  return {
    recoveryCount: used,
    remaining: Math.max(0, MAX_MONTHLY_STREAK_RECOVERIES - used),
    recoveryMonth: monthKey,
  };
}

export function evaluateStreakStateOnRead(
  rawState: Partial<PersistentStreakState> & { streakDays?: number },
  nowMs: number = Date.now(),
  explicitTimezone?: string
): PersistentStreakState {
  const state = normalizeStreakStateFromProfile({
    ...rawState,
    timezone: explicitTimezone || rawState.timezone,
  });
  const tz = state.timezone;
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const monthKey = todayKey.slice(0, 7);
  const monthly = getMonthlyRecoveryUsage(state, nowMs);

  let currentStreak = state.currentStreak;
  let streakBeforeBreak = state.streakBeforeBreak;
  let streakBrokenDate = state.streakBrokenDate;

  if (state.lastActiveDate) {
    const diff = diffCalendarDays(state.lastActiveDate, todayKey);
    if (diff >= 2) {
      // Missed at least one complete local calendar day -> streak is broken
      if (currentStreak > 0) {
        streakBeforeBreak = currentStreak;
        streakBrokenDate = state.lastActiveDate;
      }
      currentStreak = 0;
    } else if (diff === 0 && currentStreak === 0 && !streakBrokenDate) {
      currentStreak = 1;
    }
  }

  return {
    ...state,
    timezone: tz,
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    recoveryCount: monthly.recoveryCount,
    recoveryMonth: monthKey,
    streakBeforeBreak,
    streakBrokenDate,
  };
}

export function applyDailyActivityToStreakState(
  rawState: Partial<PersistentStreakState> & { streakDays?: number },
  nowMs: number = Date.now(),
  explicitTimezone?: string
): StreakActivityTransitionResult {
  const state = normalizeStreakStateFromProfile({
    ...rawState,
    timezone: explicitTimezone || rawState.timezone,
  });
  const tz = state.timezone;
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const monthKey = todayKey.slice(0, 7);
  const monthly = getMonthlyRecoveryUsage({ ...state, timezone: tz }, nowMs);

  let nextStreak = state.currentStreak;
  let nextLastActive = state.lastActiveDate;
  let streakBeforeBreak = state.streakBeforeBreak;
  let streakBrokenDate = state.streakBrokenDate;
  let streakIncreased = false;
  let streakBroken = false;
  let alreadyActiveToday = false;

  if (!state.lastActiveDate) {
    // First active day ever starts streak at 1
    nextStreak = 1;
    nextLastActive = todayKey;
    streakBeforeBreak = 0;
    streakBrokenDate = '';
    streakIncreased = true;
  } else {
    const diff = diffCalendarDays(state.lastActiveDate, todayKey);
    if (diff <= 0) {
      // Same local calendar date (or minor clock skew behind lastActiveDate): NEVER double increment
      alreadyActiveToday = true;
      if (nextStreak <= 0) {
        nextStreak = 1;
      }
    } else if (diff === 1) {
      // Next consecutive local calendar day -> increment by 1
      nextStreak = Math.max(1, state.currentStreak) + 1;
      nextLastActive = todayKey;
      streakBeforeBreak = 0;
      streakBrokenDate = '';
      streakIncreased = true;
    } else {
      // Missed at least one complete local calendar day -> previous streak breaks; snapshot for recovery
      streakBroken = state.currentStreak > 0;
      if (state.currentStreak > 0) {
        streakBeforeBreak = state.currentStreak;
        streakBrokenDate = state.lastActiveDate;
      }
      nextStreak = 1;
      nextLastActive = todayKey;
      streakIncreased = true;
    }
  }

  const nextState: PersistentStreakState = {
    currentStreak: nextStreak,
    longestStreak: Math.max(state.longestStreak, nextStreak),
    lastActiveDate: nextLastActive,
    timezone: tz,
    recoveryCount: monthly.recoveryCount,
    recoveryMonth: monthKey,
    streakBeforeBreak,
    streakBrokenDate,
  };

  return {
    nextState,
    todayKey,
    monthKey,
    streakIncreased,
    streakBroken,
    alreadyActiveToday,
  };
}

export function isStreakRecoveryEligible(
  rawState: Partial<PersistentStreakState> & { streakDays?: number },
  nowMs: number = Date.now(),
  explicitTimezone?: string
): {
  eligible: boolean;
  reason?: StreakRecoveryResult['reason'];
  restorableStreak: number;
  recoveryCount: number;
  recoveriesRemaining: number;
  recoveryMonth: string;
} {
  const evaluated = evaluateStreakStateOnRead(rawState, nowMs, explicitTimezone);
  const tz = evaluated.timezone;
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const monthly = getMonthlyRecoveryUsage(evaluated, nowMs);

  const hasBrokenSnapshot =
    evaluated.streakBeforeBreak >= 1 && isValidIsoDateKey(evaluated.streakBrokenDate);

  if (!hasBrokenSnapshot) {
    return {
      eligible: false,
      reason: evaluated.currentStreak === 0 ? 'no_previous_streak' : 'not_broken',
      restorableStreak: 0,
      recoveryCount: monthly.recoveryCount,
      recoveriesRemaining: monthly.remaining,
      recoveryMonth: monthly.recoveryMonth,
    };
  }

  const daysSinceBreak = diffCalendarDays(evaluated.streakBrokenDate, todayKey);
  if (daysSinceBreak < 2) {
    return {
      eligible: false,
      reason: 'not_broken',
      restorableStreak: 0,
      recoveryCount: monthly.recoveryCount,
      recoveriesRemaining: monthly.remaining,
      recoveryMonth: monthly.recoveryMonth,
    };
  }

  if (daysSinceBreak > 7) {
    return {
      eligible: false,
      reason: 'recovery_window_expired',
      restorableStreak: 0,
      recoveryCount: monthly.recoveryCount,
      recoveriesRemaining: monthly.remaining,
      recoveryMonth: monthly.recoveryMonth,
    };
  }

  if (monthly.recoveryCount >= MAX_MONTHLY_STREAK_RECOVERIES) {
    return {
      eligible: false,
      reason: 'monthly_limit_reached',
      restorableStreak: evaluated.streakBeforeBreak,
      recoveryCount: monthly.recoveryCount,
      recoveriesRemaining: 0,
      recoveryMonth: monthly.recoveryMonth,
    };
  }

  return {
    eligible: true,
    restorableStreak: evaluated.streakBeforeBreak,
    recoveryCount: monthly.recoveryCount,
    recoveriesRemaining: monthly.remaining,
    recoveryMonth: monthly.recoveryMonth,
  };
}

export function recoverBrokenStreakState(
  rawState: Partial<PersistentStreakState> & { streakDays?: number },
  nowMs: number = Date.now(),
  explicitTimezone?: string
): StreakRecoveryResult {
  const evaluated = evaluateStreakStateOnRead(rawState, nowMs, explicitTimezone);
  const tz = evaluated.timezone;
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const check = isStreakRecoveryEligible(evaluated, nowMs, tz);

  if (!check.eligible) {
    return {
      ok: false,
      reason: check.reason,
      nextState: evaluated,
      todayKey,
      monthKey: check.recoveryMonth,
    };
  }

  // Restores the exact previously broken streak number and marks today as active without duplicating active days
  const restoredStreak = Math.max(1, evaluated.streakBeforeBreak);
  const nextState: PersistentStreakState = {
    currentStreak: restoredStreak,
    longestStreak: Math.max(evaluated.longestStreak, restoredStreak),
    lastActiveDate: todayKey,
    timezone: tz,
    recoveryCount: check.recoveryCount + 1,
    recoveryMonth: check.recoveryMonth,
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  return {
    ok: true,
    nextState,
    todayKey,
    monthKey: check.recoveryMonth,
  };
}

export function generateStreakHistory(
  streakDays: number,
  dateCounts?: Record<string, number>,
  timeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now(),
  recoveredDates?: string[]
): DailyStreakDay[] {
  const result: DailyStreakDay[] = [];
  const tz = resolveValidTimezone(timeZone);
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const safeStreak = Math.max(0, Math.floor(streakDays || 0));
  const recoveredSet = new Set<string>(
    (recoveredDates || []).filter((d) => isValidIsoDateKey(d))
  );

  for (let i = 6; i >= 0; i--) {
    const dateStr = addDaysToDateKey(todayKey, -i);
    const dayLabel = getWeekdayForDateKey(dateStr);
    const recordedCount = dateCounts?.[dateStr] || 0;
    const isRecovered = recoveredSet.has(dateStr);
    const completed = isRecovered || recordedCount > 0 || (safeStreak > 0 && i < safeStreak);
    const status: DailyStreakDay['status'] = isRecovered
      ? 'recovered'
      : completed
      ? 'maintained'
      : i > 0
      ? 'missed'
      : undefined;
    result.push({
      date: dateStr,
      dayLabel,
      completed,
      activityCount: recordedCount > 0 ? recordedCount : completed ? 1 : 0,
      ...(status ? { status } : {}),
    });
  }

  return result;
}

export interface UserExperienceBadgeTier {
  level: number;
  badgeName: 'Novice' | 'Explorer' | 'Pro' | 'Elite' | 'Aadesh Master';
  title: string;
  minXp: number;
  nextLevelXp: number;
  icon: string;
  tagline: string;
  accent: 'slate' | 'cyan' | 'purple' | 'amber' | 'rose';
}

export const USER_EXPERIENCE_LEVELS: UserExperienceBadgeTier[] = [
  {
    level: 1,
    badgeName: 'Novice',
    title: 'Novice',
    minXp: 0,
    nextLevelXp: 250,
    icon: '🌱',
    tagline: 'Starting your daily AI journey',
    accent: 'slate',
  },
  {
    level: 2,
    badgeName: 'Explorer',
    title: 'Explorer',
    minXp: 250,
    nextLevelXp: 750,
    icon: '🧭',
    tagline: 'Building consistent daily curiosity',
    accent: 'cyan',
  },
  {
    level: 3,
    badgeName: 'Pro',
    title: 'Pro',
    minXp: 750,
    nextLevelXp: 1750,
    icon: '⚡',
    tagline: 'Consistent daily streak & AI fluency',
    accent: 'purple',
  },
  {
    level: 4,
    badgeName: 'Elite',
    title: 'Elite Strategist',
    minXp: 1750,
    nextLevelXp: 3500,
    icon: '💎',
    tagline: 'High-momentum power learner',
    accent: 'amber',
  },
  {
    level: 5,
    badgeName: 'Aadesh Master',
    title: 'Aadesh Master',
    minXp: 3500,
    nextLevelXp: 5000,
    icon: '👑',
    tagline: 'Peak mastery across streaks & usage',
    accent: 'rose',
  },
];

export interface UserExperienceLevelSummary {
  level: number;
  badgeName: UserExperienceBadgeTier['badgeName'];
  levelTitle: string;
  usageXp: number;
  streakBonusXp: number;
  totalExperienceXp: number;
  currentTierMinXp: number;
  nextLevelXp: number;
  xpToNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
  unlockedBadges: Array<UserExperienceBadgeTier & { unlocked: boolean; isCurrent: boolean }>;
}

export function computeLevelInfo(xp: number): {
  level: number;
  levelTitle: string;
  badgeName: UserExperienceBadgeTier['badgeName'];
  nextLevelXp: number;
  progressPercent: number;
} {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let activeTier = USER_EXPERIENCE_LEVELS[0];
  for (const tier of USER_EXPERIENCE_LEVELS) {
    if (safeXp >= tier.minXp) {
      activeTier = tier;
    }
  }
  const span = Math.max(1, activeTier.nextLevelXp - activeTier.minXp);
  const progressPercent =
    activeTier.level === USER_EXPERIENCE_LEVELS[USER_EXPERIENCE_LEVELS.length - 1].level &&
    safeXp >= activeTier.nextLevelXp
      ? 100
      : Math.min(100, Math.max(0, Math.round(((safeXp - activeTier.minXp) / span) * 100)));

  return {
    level: activeTier.level,
    levelTitle: activeTier.title,
    badgeName: activeTier.badgeName,
    nextLevelXp: activeTier.nextLevelXp,
    progressPercent,
  };
}

/**
 * Computes the complete User Experience Level summary where both consistent usage XP
 * and active/historical streak consistency grant XP to unlock special profile badges
 * ('Novice', 'Explorer', 'Pro', 'Elite', 'Aadesh Master').
 */
export function computeUserExperienceLevel(params: {
  xp: number;
  currentStreak: number;
  longestStreak?: number;
  totalActiveDays?: number;
}): UserExperienceLevelSummary {
  const usageXp = Math.max(0, Math.floor(Number(params.xp) || 0));
  const safeCurrent = Math.max(0, Math.floor(Number(params.currentStreak) || 0));
  const safeLongest = Math.max(safeCurrent, Math.floor(Number(params.longestStreak) || 0));
  const safeActiveDays = Math.max(safeLongest, Math.floor(Number(params.totalActiveDays) || 0));

  // Streaks & consistent active days directly contribute XP toward profile badges
  const streakBonusXp = safeCurrent * 50 + safeLongest * 25 + safeActiveDays * 15;
  const totalExperienceXp = usageXp + streakBonusXp;

  const info = computeLevelInfo(totalExperienceXp);
  const activeTier =
    USER_EXPERIENCE_LEVELS.find((t) => t.level === info.level) || USER_EXPERIENCE_LEVELS[0];
  const isMaxLevel = activeTier.level === USER_EXPERIENCE_LEVELS[USER_EXPERIENCE_LEVELS.length - 1].level;
  const xpToNextLevel = isMaxLevel ? 0 : Math.max(0, activeTier.nextLevelXp - totalExperienceXp);

  const unlockedBadges = USER_EXPERIENCE_LEVELS.map((tier) => ({
    ...tier,
    unlocked: totalExperienceXp >= tier.minXp,
    isCurrent: tier.level === activeTier.level,
  }));

  return {
    level: activeTier.level,
    badgeName: activeTier.badgeName,
    levelTitle: activeTier.title,
    usageXp,
    streakBonusXp,
    totalExperienceXp,
    currentTierMinXp: activeTier.minXp,
    nextLevelXp: activeTier.nextLevelXp,
    xpToNextLevel,
    progressPercent: info.progressPercent,
    isMaxLevel,
    unlockedBadges,
  };
}

export function evaluateCurrentStreakOnLoad(
  savedStreakDays: number,
  lastActiveDate?: string,
  timeZone?: string,
  nowMs: number = Date.now(),
  options?: { hasPermissionError?: boolean; hadReadError?: boolean }
): number {
  const cleanSaved = Math.max(0, Math.floor(savedStreakDays || 0));
  // Never overwrite or reset a saved streak to 0 when Firestore returns permission-denied or read errors
  if (options?.hasPermissionError || options?.hadReadError) {
    return cleanSaved;
  }
  if (!isValidIsoDateKey(lastActiveDate)) {
    return cleanSaved;
  }
  const tz = resolveValidTimezone(timeZone);
  const todayStr = getLocalDateKeyInTimezone(nowMs, tz);
  const diffDays = diffCalendarDays(lastActiveDate, todayStr);

  if (diffDays <= 0) return Math.max(1, cleanSaved);
  // Active yesterday -> alive today awaiting next activity; missed >= 1 full calendar day -> broken (0)
  if (diffDays === 1) return cleanSaved;
  return 0;
}

export function recordGamificationActivity(
  user: UserProfile,
  activityType: 'chat' | 'voice' | 'image' | 'translation',
  options?: { nowMs?: number; skipStreakIncrement?: boolean; timeZone?: string }
): {
  updatedUser: UserProfile;
  xpEarned: number;
  streakIncreased: boolean;
  newBadgeUnlocked?: AchievementBadge;
} {
  const nowMs = options?.nowMs ?? Date.now();
  const tz = resolveEffectiveStreakTimezone(options?.timeZone || user.timezone);
  const todayStr = getLocalDateKeyInTimezone(nowMs, tz);
  const xpValues: Record<string, number> = {
    chat: 25,
    voice: 50,
    image: 40,
    translation: 30,
  };
  const xpEarned = xpValues[activityType] || 25;

  const isSameDay = user.lastActiveDate === todayStr;
  let dailyGoalCurrent = isSameDay
    ? Math.min(user.dailyGoalTarget || 5, (user.dailyGoalCurrent || 0) + 1)
    : 1;

  const streakTransition = options?.skipStreakIncrement
    ? {
        nextState: normalizeStreakStateFromProfile({
          ...user,
          timezone: tz,
        }),
        streakIncreased: false,
      }
    : applyDailyActivityToStreakState(
        {
          currentStreak: user.currentStreak ?? user.streakDays,
          longestStreak: user.longestStreak,
          lastActiveDate: user.lastActiveDate,
          timezone: tz,
          recoveryCount: user.recoveryCount,
          recoveryMonth: user.recoveryMonth,
          streakBeforeBreak: user.streakBeforeBreak,
          streakBrokenDate: user.streakBrokenDate,
        },
        nowMs,
        tz
      );

  const nextStreakState = streakTransition.nextState;
  const streakDays = nextStreakState.currentStreak;
  const longestStreak = nextStreakState.longestStreak;

  // Grant a daily streak bonus XP when advancing a streak day (scales with streak length)
  const streakDayBonusXp = streakTransition.streakIncreased
    ? Math.min(200, 50 + streakDays * 10)
    : 0;
  const totalXpEarned = xpEarned + streakDayBonusXp;
  const newXp = (user.xp || 0) + totalXpEarned;
  const levelData = computeUserExperienceLevel({
    xp: newXp,
    currentStreak: streakDays,
    longestStreak,
  });

  const prevCounts: Record<string, number> = {};
  (user.streakHistory || []).forEach((h) => {
    if (h.completed && h.date) prevCounts[h.date] = Math.max(1, h.activityCount || 1);
  });
  prevCounts[todayStr] = (prevCounts[todayStr] || 0) + 1;

  const history = generateStreakHistory(
    streakDays,
    prevCounts,
    tz,
    nowMs,
    user.recoveredDates
  );

  const baseBadges = Array.isArray(user.badges) && user.badges.length > 0 ? user.badges : INITIAL_BADGES;
  let newBadgeUnlocked: AchievementBadge | undefined = undefined;
  const updatedBadges = baseBadges.map((b) => {
    if (b.unlocked) return b;
    if (b.id === 'first_query') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    if (b.id === 'voice_explorer' && activityType === 'voice') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    if (b.id === 'vision_analyst' && activityType === 'image') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    if (b.id === 'polyglot' && activityType === 'translation') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    if (b.id === 'streak_master' && streakDays >= 7) {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    if (b.id === 'power_scholar' && newXp >= 2000) {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: nowMs };
      return newBadgeUnlocked;
    }
    return b;
  });

  const updatedUser: UserProfile = {
    ...user,
    xp: newXp,
    streakDays,
    currentStreak: streakDays,
    longestStreak,
    timezone: user.timezone || nextStreakState.timezone,
    recoveryCount: nextStreakState.recoveryCount,
    recoveryMonth: nextStreakState.recoveryMonth,
    streakBeforeBreak: nextStreakState.streakBeforeBreak,
    streakBrokenDate: nextStreakState.streakBrokenDate,
    level: levelData.level,
    levelTitle: levelData.levelTitle,
    dailyGoalCurrent,
    lastActiveDate: nextStreakState.lastActiveDate || todayStr,
    streakHistory: history,
    badges: updatedBadges,
  };

  return {
    updatedUser,
    xpEarned: totalXpEarned,
    streakIncreased: streakTransition.streakIncreased,
    newBadgeUnlocked,
  };
}

export interface StreakCalendarCell {
  date: string;
  dayLabel: string;
  dayNum: string;
  completed: boolean;
  count: number;
  isToday: boolean;
}

export interface CalculatedStreakSummary {
  consecutiveDays: number;
  longestStreak: number;
  totalActiveDays: number;
  totalInteractions: number;
  nextMilestone: number;
  milestoneProgressPercent: number;
  calendarGrid: StreakCalendarCell[];
}

export function calculateConsecutiveStreakFromDates(
  dateCounts: Record<string, number>,
  fallbackStreakDays: number = 0,
  fallbackLongestStreak: number = 0,
  daysToShow: number = 14,
  options?: {
    timeZone?: string;
    authoritativeStreak?: number;
    lastActiveDate?: string;
    nowMs?: number;
  }
): CalculatedStreakSummary {
  const nowMs = options?.nowMs ?? Date.now();
  const tz = resolveValidTimezone(options?.timeZone);
  const todayLocalKey = getLocalDateKeyInTimezone(nowMs, tz);
  const yesterdayLocalKey = addDaysToDateKey(todayLocalKey, -1);

  const normalizedCounts: Record<string, number> = { ...dateCounts };
  if (isValidIsoDateKey(options?.lastActiveDate)) {
    normalizedCounts[options.lastActiveDate] = Math.max(normalizedCounts[options.lastActiveDate] || 0, 1);
  }

  const activeKeys = Object.keys(normalizedCounts)
    .filter((k) => (normalizedCounts[k] || 0) > 0 && isValidIsoDateKey(k))
    .sort();

  // Compute current consecutive streak in the user's saved IANA timezone
  let consecutiveDays = 0;
  if (activeKeys.length > 0) {
    let cursorKey: string | null = null;
    if ((normalizedCounts[todayLocalKey] || 0) > 0) {
      cursorKey = todayLocalKey;
    } else if ((normalizedCounts[yesterdayLocalKey] || 0) > 0) {
      cursorKey = yesterdayLocalKey;
    }
    while (cursorKey && (normalizedCounts[cursorKey] || 0) > 0) {
      consecutiveDays += 1;
      cursorKey = addDaysToDateKey(cursorKey, -1);
    }
  }

  // Prefer authoritative persistent streak state when supplied, so transactional streaks & recoveries stay consistent across tabs/devices
  const effectiveConsecutive =
    typeof options?.authoritativeStreak === 'number' && Number.isFinite(options.authoritativeStreak)
      ? Math.max(0, Math.floor(options.authoritativeStreak))
      : activeKeys.length > 0
      ? consecutiveDays
      : Math.max(0, fallbackStreakDays);

  let computedLongest = consecutiveDays;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of activeKeys) {
    if (prevKey !== null && diffCalendarDays(prevKey, key) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > computedLongest) computedLongest = run;
    prevKey = key;
  }

  const longestStreak = Math.max(
    computedLongest,
    effectiveConsecutive,
    Math.max(0, fallbackLongestStreak)
  );

  const calendarGrid: StreakCalendarCell[] = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const localKey = addDaysToDateKey(todayLocalKey, -i);
    const count = normalizedCounts[localKey] || 0;
    const completed =
      count > 0 || (effectiveConsecutive > 0 && normalizedCounts[todayLocalKey] > 0 && i < effectiveConsecutive);
    calendarGrid.push({
      date: localKey,
      dayLabel: getWeekdayForDateKey(localKey),
      dayNum: localKey.slice(8),
      completed,
      count: count || (completed ? 1 : 0),
      isToday: i === 0,
    });
  }

  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const nextMilestone = milestones.find((m) => m > effectiveConsecutive) || 365;
  const milestoneProgressPercent = Math.min(
    100,
    Math.round((effectiveConsecutive / nextMilestone) * 100)
  );

  return {
    consecutiveDays: effectiveConsecutive,
    longestStreak,
    totalActiveDays: Math.max(activeKeys.length, effectiveConsecutive),
    totalInteractions: Object.values(normalizedCounts).reduce((sum, n) => sum + n, 0),
    nextMilestone,
    milestoneProgressPercent,
    calendarGrid,
  };
}

export type StreakDayStatus = 'maintained' | 'missed' | 'recovered' | 'inactive' | 'future';

export interface StreakCalendarDayEntry {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  dayLabel: string; // Sun..Sat
  status: StreakDayStatus;
  count: number;
  isToday: boolean;
  isPartOfCurrentBreak?: boolean;
}

export interface StreakCalendarMonthData {
  year: number;
  month: number; // 1..12
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "November 2026"
  leadingEmptySlots: number; // 0 (Sun) .. 6 (Sat)
  days: StreakCalendarDayEntry[];
  maintainedCount: number;
  missedCount: number;
  recoveredCount: number;
  totalInteractions: number;
  consistencyPercent: number;
  isCurrentMonth: boolean;
  todayKey: string;
}

/**
 * Returns the missed calendar date(s) bridged by a streak recovery between
 * `streakBrokenDate` (exclusive) and `recoveryDateKey` (exclusive), falling back
 * to `[recoveryDateKey]` if the gap is unknown.
 */
export function getRecoveredGapDateKeys(
  streakBrokenDate?: string,
  recoveryDateKey?: string
): string[] {
  if (!isValidIsoDateKey(recoveryDateKey)) return [];
  if (!isValidIsoDateKey(streakBrokenDate)) {
    return [recoveryDateKey];
  }
  const gap = diffCalendarDays(streakBrokenDate, recoveryDateKey);
  if (!Number.isFinite(gap) || gap < 2 || gap > 7) {
    return [recoveryDateKey];
  }
  const bridged: string[] = [];
  for (let offset = 1; offset < gap; offset++) {
    bridged.push(addDaysToDateKey(streakBrokenDate, offset));
  }
  return bridged.length > 0 ? bridged : [recoveryDateKey];
}

/**
 * Builds a timezone-aware monthly Streak Calendar model distinguishing
 * maintained, missed, recovered, inactive (pre-join), and future dates.
 */
export function buildStreakCalendarMonth(params: {
  year: number;
  month: number; // 1..12
  dateCounts?: Record<string, number>;
  recoveredDates?: string[];
  missedDates?: string[];
  timeZone?: string;
  authoritativeStreak?: number;
  lastActiveDate?: string;
  streakBrokenDate?: string;
  streakBeforeBreak?: number;
  accountCreatedAtMs?: number;
  nowMs?: number;
}): StreakCalendarMonthData {
  const nowMs = params.nowMs ?? Date.now();
  const tz = resolveValidTimezone(params.timeZone);
  const todayParts = getDatePartsInTimezone(nowMs, tz);
  const todayKey = todayParts.dateKey;

  const safeYear = Math.max(2000, Math.min(2100, Math.floor(params.year)));
  const safeMonth = Math.max(1, Math.min(12, Math.floor(params.month)));
  const monthKey = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate();
  const leadingEmptySlots = new Date(Date.UTC(safeYear, safeMonth - 1, 1)).getUTCDay();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthLabel = `${monthNames[safeMonth - 1] || 'Month'} ${safeYear}`;

  const normalizedCounts: Record<string, number> = { ...(params.dateCounts || {}) };
  if (isValidIsoDateKey(params.lastActiveDate)) {
    normalizedCounts[params.lastActiveDate] = Math.max(normalizedCounts[params.lastActiveDate] || 0, 1);
  }

  const recoveredSet = new Set<string>(
    (params.recoveredDates || []).filter((d) => isValidIsoDateKey(d))
  );
  const explicitMissedSet = new Set<string>(
    (params.missedDates || []).filter((d) => isValidIsoDateKey(d))
  );

  // Backfill contiguous streak dates implied by authoritativeStreak ending at lastActiveDate (unless marked recovered)
  const streakLen = Math.max(0, Math.floor(params.authoritativeStreak || 0));
  const streakAnchor = isValidIsoDateKey(params.lastActiveDate)
    ? params.lastActiveDate
    : streakLen > 0
    ? todayKey
    : '';
  const impliedActiveSet = new Set<string>();
  if (streakLen > 0 && isValidIsoDateKey(streakAnchor)) {
    for (let i = 0; i < streakLen; i++) {
      const k = addDaysToDateKey(streakAnchor, -i);
      if (!recoveredSet.has(k)) {
        impliedActiveSet.add(k);
      }
    }
  }

  // Determine earliest known tracking date so dates before a user ever started aren't falsely flagged "missed"
  const allKnownDates: string[] = [];
  for (const [k, cnt] of Object.entries(normalizedCounts)) {
    if (cnt > 0 && isValidIsoDateKey(k)) allKnownDates.push(k);
  }
  recoveredSet.forEach((k) => allKnownDates.push(k));
  impliedActiveSet.forEach((k) => allKnownDates.push(k));
  if (isValidIsoDateKey(params.streakBrokenDate)) {
    allKnownDates.push(params.streakBrokenDate);
  }
  if (typeof params.accountCreatedAtMs === 'number' && Number.isFinite(params.accountCreatedAtMs) && params.accountCreatedAtMs > 0) {
    allKnownDates.push(getLocalDateKeyInTimezone(params.accountCreatedAtMs, tz));
  }
  allKnownDates.sort();
  const baselineStartKey = allKnownDates.length > 0 ? allKnownDates[0] : todayKey;

  // Identify currently unrecovered break gap dates (for inline recovery hint)
  const currentBreakGapSet = new Set<string>();
  if (
    (params.streakBeforeBreak || 0) >= 1 &&
    isValidIsoDateKey(params.streakBrokenDate)
  ) {
    const gap = diffCalendarDays(params.streakBrokenDate, todayKey);
    if (Number.isFinite(gap) && gap >= 2 && gap <= 7) {
      for (let offset = 1; offset < gap; offset++) {
        currentBreakGapSet.add(addDaysToDateKey(params.streakBrokenDate, offset));
      }
    }
  }

  const days: StreakCalendarDayEntry[] = [];
  let maintainedCount = 0;
  let missedCount = 0;
  let recoveredCount = 0;
  let totalInteractions = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${monthKey}-${String(d).padStart(2, '0')}`;
    const isToday = dateKey === todayKey;
    const rawCount = normalizedCounts[dateKey] || 0;
    const isRecovered = recoveredSet.has(dateKey);
    const isMaintained = !isRecovered && (rawCount > 0 || impliedActiveSet.has(dateKey));
    const isPartOfCurrentBreak = currentBreakGapSet.has(dateKey);

    let status: StreakDayStatus;
    if (dateKey > todayKey) {
      status = 'future';
    } else if (isRecovered) {
      status = 'recovered';
      recoveredCount += 1;
    } else if (isMaintained) {
      status = 'maintained';
      maintainedCount += 1;
    } else if (isToday) {
      // Today hasn't ended yet, so it's awaiting activity rather than missed
      status = 'inactive';
    } else if (explicitMissedSet.has(dateKey) || isPartOfCurrentBreak || dateKey >= baselineStartKey) {
      status = 'missed';
      missedCount += 1;
    } else {
      status = 'inactive';
    }

    const effectiveCount = rawCount > 0 ? rawCount : status === 'maintained' ? 1 : 0;
    totalInteractions += effectiveCount;

    days.push({
      date: dateKey,
      dayOfMonth: d,
      dayLabel: getWeekdayForDateKey(dateKey),
      status,
      count: effectiveCount,
      isToday,
      isPartOfCurrentBreak,
    });
  }

  const trackedDays = maintainedCount + recoveredCount + missedCount;
  const consistencyPercent =
    trackedDays > 0 ? Math.round(((maintainedCount + recoveredCount) / trackedDays) * 100) : 0;

  return {
    year: safeYear,
    month: safeMonth,
    monthKey,
    monthLabel,
    leadingEmptySlots,
    days,
    maintainedCount,
    missedCount,
    recoveredCount,
    totalInteractions,
    consistencyPercent,
    isCurrentMonth: safeYear === todayParts.year && safeMonth === todayParts.month,
    todayKey,
  };
}

export type StreakHydrationSource =
  | { status: 'found'; state: Partial<PersistentStreakState> & { streakDays?: number } }
  | { status: 'not_found' }
  | { status: 'permission_denied'; error?: string }
  | { status: 'error'; error?: string };

export interface SafeStreakHydrationResult {
  state: PersistentStreakState;
  shouldWriteToFirestore: boolean;
  source: 'firestore' | 'backup' | 'initial';
  hadReadError: boolean;
  hadPermissionError?: boolean;
  isMissingDocument?: boolean;
}

/**
 * Resolves a user's persisted streak state on login or page refresh without ever
 * resetting saved data to 0 during loading or transient Firestore read failures.
 */
export function mergeStreakStateSafely(params: {
  firestoreResult: StreakHydrationSource;
  localBackup?: (Partial<PersistentStreakState> & { streakDays?: number }) | null;
  currentState?: (Partial<PersistentStreakState> & { streakDays?: number }) | null;
  firestoreLogsFallback?: (Partial<PersistentStreakState> & { streakDays?: number }) | null;
  timeZone: string;
  nowMs?: number;
}): SafeStreakHydrationResult {
  const nowMs = params.nowMs ?? Date.now();
  const tz = resolveValidTimezone(params.timeZone);
  const backup = params.localBackup || null;
  const current = params.currentState || null;
  const logsFallback = params.firestoreLogsFallback || null;

  const hasSavedStreakRecord = (
    rec?: (Partial<PersistentStreakState> & { streakDays?: number }) | null
  ): boolean => {
    if (!rec) return false;
    return (
      isValidIsoDateKey(rec.lastActiveDate) ||
      Number(rec.currentStreak ?? rec.streakDays ?? 0) > 0 ||
      Number(rec.longestStreak ?? 0) > 0 ||
      Number(rec.recoveryCount ?? 0) > 0
    );
  };

  // Pick the freshest non-empty candidate among backup, in-memory same-UID current state, and Firestore usage logs
  const pickBestFallback = (): (Partial<PersistentStreakState> & { streakDays?: number }) | null => {
    const candidates = [backup, current, logsFallback].filter(hasSavedStreakRecord) as Array<
      Partial<PersistentStreakState> & { streakDays?: number }
    >;
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const dateA = isValidIsoDateKey(a.lastActiveDate) ? a.lastActiveDate : '';
      const dateB = isValidIsoDateKey(b.lastActiveDate) ? b.lastActiveDate : '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const streakA = Number(a.currentStreak ?? a.streakDays ?? 0);
      const streakB = Number(b.currentStreak ?? b.streakDays ?? 0);
      if (streakA !== streakB) return streakB - streakA;
      return Number(b.longestStreak ?? 0) - Number(a.longestStreak ?? 0);
    });
    return candidates[0];
  };

  const bestLocalOrLogs = pickBestFallback();

  // On Firestore permission_denied or read error: NEVER overwrite Firestore, treat as missing doc, or reset streak to 0.
  if (
    params.firestoreResult.status === 'permission_denied' ||
    params.firestoreResult.status === 'error'
  ) {
    const isPermissionError = params.firestoreResult.status === 'permission_denied';
    const fallbackRaw = bestLocalOrLogs
      ? { ...bestLocalOrLogs, timezone: tz }
      : { currentStreak: 0, longestStreak: 0, lastActiveDate: '', timezone: tz };
    const normalized = normalizeStreakStateFromProfile(fallbackRaw);
    const preservedCurrent = evaluateCurrentStreakOnLoad(
      normalized.currentStreak,
      normalized.lastActiveDate,
      tz,
      nowMs,
      { hasPermissionError: isPermissionError, hadReadError: true }
    );
    const monthly = getMonthlyRecoveryUsage(normalized, nowMs);
    return {
      state: {
        ...normalized,
        currentStreak: preservedCurrent,
        longestStreak: Math.max(normalized.longestStreak, preservedCurrent),
        recoveryCount: monthly.recoveryCount,
        recoveryMonth: monthly.recoveryMonth,
      },
      shouldWriteToFirestore: false,
      source: bestLocalOrLogs ? 'backup' : 'initial',
      hadReadError: true,
      hadPermissionError: isPermissionError,
      isMissingDocument: false,
    };
  }

  // Authoritative Firestore record exists -> trust Firestore, but NEVER regress to 0 if users/{uid}
  // is missing streak fields or has an older lastActiveDate than a just-saved local/logs record.
  if (params.firestoreResult.status === 'found') {
    const fsRaw = params.firestoreResult.state;
    const fsHasRecord = hasSavedStreakRecord(fsRaw);
    const fsDate = isValidIsoDateKey(fsRaw.lastActiveDate) ? fsRaw.lastActiveDate : '';
    const fsStreak = Number(fsRaw.currentStreak ?? fsRaw.streakDays ?? 0);
    const localDate =
      bestLocalOrLogs && isValidIsoDateKey(bestLocalOrLogs.lastActiveDate)
        ? bestLocalOrLogs.lastActiveDate
        : '';
    const localStreak = bestLocalOrLogs
      ? Number(bestLocalOrLogs.currentStreak ?? bestLocalOrLogs.streakDays ?? 0)
      : 0;

    const sameOrAdjacentBrokenZero =
      fsStreak === 0 &&
      localStreak > 0 &&
      localDate !== '' &&
      (fsDate === '' || diffCalendarDays(localDate, fsDate) <= 1);

    const localIsFresherThanFs =
      Boolean(bestLocalOrLogs) &&
      (!fsHasRecord ||
        sameOrAdjacentBrokenZero ||
        (localDate !== '' && (fsDate === '' || localDate > fsDate)) ||
        (localDate === fsDate && localStreak > fsStreak));

    const chosenBase = localIsFresherThanFs ? bestLocalOrLogs! : fsRaw;
    const mergedRaw: Partial<PersistentStreakState> & { streakDays?: number } = {
      ...chosenBase,
      longestStreak: Math.max(
        Number(fsRaw.longestStreak ?? 0),
        fsStreak,
        Number(backup?.longestStreak ?? 0),
        Number(current?.longestStreak ?? 0),
        Number(logsFallback?.longestStreak ?? 0),
        localStreak
      ),
      recoveryCount: Math.max(
        Number(fsRaw.recoveryCount ?? 0),
        Number(bestLocalOrLogs?.recoveryCount ?? 0)
      ),
      recoveryMonth: fsRaw.recoveryMonth || bestLocalOrLogs?.recoveryMonth || '',
      timezone: tz,
    };

    return {
      state: evaluateStreakStateOnRead(mergedRaw, nowMs, tz),
      shouldWriteToFirestore: true,
      source: fsHasRecord && !localIsFresherThanFs ? 'firestore' : bestLocalOrLogs ? 'backup' : 'initial',
      hadReadError: false,
      hadPermissionError: false,
      isMissingDocument: false,
    };
  }

  // Firestore document does not yet exist for this UID -> preserve any per-UID backup/current/logs or initialize cleanly.
  if (bestLocalOrLogs) {
    return {
      state: evaluateStreakStateOnRead({ ...bestLocalOrLogs, timezone: tz }, nowMs, tz),
      shouldWriteToFirestore: true,
      source: 'backup',
      hadReadError: false,
      hadPermissionError: false,
      isMissingDocument: true,
    };
  }

  return {
    state: evaluateStreakStateOnRead(
      { currentStreak: 0, longestStreak: 0, lastActiveDate: '', timezone: tz },
      nowMs,
      tz
    ),
    shouldWriteToFirestore: true,
    source: 'initial',
    hadReadError: false,
    hadPermissionError: false,
    isMissingDocument: true,
  };
}

export interface StreakInsightsSummary {
  bestEverStreak: number;
  totalDaysActive: number;
  monthlyRecoveryEfficiencyPercent: number;
  monthlyRecoveriesUsed: number;
  monthlyRecoveriesRemaining: number;
  monthlyMaintainedDays: number;
  monthlyRecoveredDays: number;
  monthlyMissedDays: number;
  hasMonthMisses: boolean;
}

/**
 * Calculates high-level Streak Insights for the GamificationModal:
 * Best Ever Streak, Total Days Active, and Monthly Recovery Efficiency %.
 */
export function computeStreakInsights(params: {
  user: Pick<
    UserProfile,
    | 'currentStreak'
    | 'streakDays'
    | 'longestStreak'
    | 'lastActiveDate'
    | 'streakHistory'
    | 'recoveredDates'
    | 'recoveryCount'
    | 'recoveryMonth'
    | 'streakBeforeBreak'
    | 'streakBrokenDate'
    | 'createdAt'
    | 'timezone'
  >;
  dateCounts?: Record<string, number>;
  recoveredDates?: string[];
  timeZone?: string;
  nowMs?: number;
}): StreakInsightsSummary {
  const nowMs = params.nowMs ?? Date.now();
  const tz = resolveValidTimezone(params.timeZone || params.user.timezone);
  const todayParts = getDatePartsInTimezone(nowMs, tz);

  const mergedDateCounts: Record<string, number> = { ...(params.dateCounts || {}) };
  const mergedRecovered = new Set<string>(
    [...(params.recoveredDates || []), ...(params.user.recoveredDates || [])].filter((d) =>
      isValidIsoDateKey(d)
    )
  );
  const historyMissed = new Set<string>();

  (params.user.streakHistory || []).forEach((entry) => {
    if (!entry?.date || !isValidIsoDateKey(entry.date)) return;
    if (entry.status === 'recovered') {
      mergedRecovered.add(entry.date);
    } else if (entry.completed || entry.status === 'maintained') {
      mergedDateCounts[entry.date] = Math.max(
        mergedDateCounts[entry.date] || 0,
        entry.activityCount || 1
      );
    } else if (entry.status === 'missed') {
      historyMissed.add(entry.date);
    }
  });

  if (isValidIsoDateKey(params.user.lastActiveDate)) {
    mergedDateCounts[params.user.lastActiveDate] = Math.max(
      mergedDateCounts[params.user.lastActiveDate] || 0,
      1
    );
  }

  const currentStreak = Math.max(
    0,
    Math.floor(Number(params.user.currentStreak ?? params.user.streakDays ?? 0) || 0)
  );

  // Count unique active dates across logs, streakHistory, recovered dates, and implied current streak
  const activeDateSet = new Set<string>();
  for (const [k, cnt] of Object.entries(mergedDateCounts)) {
    if (cnt > 0 && isValidIsoDateKey(k)) activeDateSet.add(k);
  }
  mergedRecovered.forEach((d) => activeDateSet.add(d));

  const streakAnchor = isValidIsoDateKey(params.user.lastActiveDate)
    ? params.user.lastActiveDate
    : currentStreak > 0
    ? todayParts.dateKey
    : '';
  if (currentStreak > 0 && isValidIsoDateKey(streakAnchor)) {
    for (let i = 0; i < currentStreak; i++) {
      activeDateSet.add(addDaysToDateKey(streakAnchor, -i));
    }
  }

  // Compute longest consecutive run from known active dates as well
  const sortedActive = Array.from(activeDateSet).sort();
  let computedLongest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const dateKey of sortedActive) {
    if (prev && diffCalendarDays(prev, dateKey) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > computedLongest) computedLongest = run;
    prev = dateKey;
  }

  const bestEverStreak = Math.max(
    computedLongest,
    currentStreak,
    Math.max(0, Math.floor(Number(params.user.longestStreak ?? 0) || 0)),
    Math.max(0, Math.floor(Number(params.user.streakBeforeBreak ?? 0) || 0))
  );

  const totalDaysActive = Math.max(activeDateSet.size, currentStreak);

  // Current month breakdown for recovery efficiency
  const monthData = buildStreakCalendarMonth({
    year: todayParts.year,
    month: todayParts.month,
    dateCounts: mergedDateCounts,
    recoveredDates: Array.from(mergedRecovered),
    missedDates: Array.from(historyMissed),
    timeZone: tz,
    authoritativeStreak: currentStreak,
    lastActiveDate: params.user.lastActiveDate,
    streakBrokenDate: params.user.streakBrokenDate,
    streakBeforeBreak: params.user.streakBeforeBreak,
    accountCreatedAtMs: params.user.createdAt,
    nowMs,
  });

  const monthlyRecoveryUsage = getMonthlyRecoveryUsage(
    {
      recoveryCount: params.user.recoveryCount ?? 0,
      recoveryMonth: params.user.recoveryMonth ?? '',
      timezone: tz,
    },
    nowMs
  );

  const monthlyRecoveredDays = Math.max(monthData.recoveredCount, monthlyRecoveryUsage.recoveryCount);
  const monthlyMissedDays = monthData.missedCount;
  const totalRecoverableGaps = monthlyRecoveredDays + monthlyMissedDays;

  let monthlyRecoveryEfficiencyPercent = 100;
  if (totalRecoverableGaps > 0) {
    monthlyRecoveryEfficiencyPercent = Math.round(
      (monthlyRecoveredDays / totalRecoverableGaps) * 100
    );
  } else if (monthData.maintainedCount === 0 && totalDaysActive === 0) {
    monthlyRecoveryEfficiencyPercent = 0;
  }

  return {
    bestEverStreak,
    totalDaysActive,
    monthlyRecoveryEfficiencyPercent,
    monthlyRecoveriesUsed: monthlyRecoveryUsage.recoveryCount,
    monthlyRecoveriesRemaining: monthlyRecoveryUsage.remaining,
    monthlyMaintainedDays: monthData.maintainedCount,
    monthlyRecoveredDays,
    monthlyMissedDays,
    hasMonthMisses: totalRecoverableGaps > 0,
  };
}

export interface StreakMilestoneItem {
  id: string;
  title: string;
  description: string;
  icon: 'flame' | 'sparkles' | 'crown' | 'shield' | 'zap' | 'trophy';
  accent: 'amber' | 'orange' | 'purple' | 'cyan' | 'emerald' | 'rose';
  unlocked: boolean;
  progressCurrent: number;
  progressTarget: number;
  progressPercent: number;
  metricLabel: string;
}

/**
 * Evaluates unlockable Streak Milestones driven by `streakHistory`, active days,
 * best streak, and recovery history.
 */
export function evaluateStreakMilestones(params: {
  user: Pick<
    UserProfile,
    | 'currentStreak'
    | 'streakDays'
    | 'longestStreak'
    | 'lastActiveDate'
    | 'streakHistory'
    | 'recoveredDates'
    | 'recoveryCount'
    | 'recoveryMonth'
    | 'streakBeforeBreak'
    | 'streakBrokenDate'
    | 'createdAt'
    | 'timezone'
  >;
  dateCounts?: Record<string, number>;
  recoveredDates?: string[];
  timeZone?: string;
  nowMs?: number;
}): StreakMilestoneItem[] {
  const insights = computeStreakInsights(params);

  const history = params.user.streakHistory || [];
  const historyCompletedDays = history.filter(
    (d) => d.completed || d.status === 'maintained' || d.status === 'recovered'
  ).length;
  const historyRecoveredDays = history.filter((d) => d.status === 'recovered').length;

  const uniqueRecoveredCount = new Set<string>([
    ...(params.recoveredDates || []).filter((d) => isValidIsoDateKey(d)),
    ...(params.user.recoveredDates || []).filter((d) => isValidIsoDateKey(d)),
    ...history.filter((d) => d.status === 'recovered' && isValidIsoDateKey(d.date)).map((d) => d.date),
  ]).size;

  const totalRecoveriesPerformed = Math.max(
    uniqueRecoveredCount,
    historyRecoveredDays,
    Math.max(0, Math.floor(Number(params.user.recoveryCount ?? 0) || 0))
  );

  const bestStreak = Math.max(
    insights.bestEverStreak,
    historyCompletedDays >= 7 ? 7 : 0
  );
  const totalActive = Math.max(insights.totalDaysActive, historyCompletedDays);

  const buildItem = (
    id: string,
    title: string,
    description: string,
    icon: StreakMilestoneItem['icon'],
    accent: StreakMilestoneItem['accent'],
    current: number,
    target: number,
    unit: string
  ): StreakMilestoneItem => {
    const safeCurrent = Math.max(0, Math.floor(current));
    const unlocked = safeCurrent >= target;
    const clamped = Math.min(safeCurrent, target);
    const progressPercent = Math.min(100, Math.round((clamped / target) * 100));
    return {
      id,
      title,
      description,
      icon,
      accent,
      unlocked,
      progressCurrent: clamped,
      progressTarget: target,
      progressPercent,
      metricLabel: unlocked ? `Earned · ${safeCurrent} ${unit}` : `${clamped}/${target} ${unit}`,
    };
  };

  return [
    buildItem(
      'first_flame',
      'First Flame',
      'Ignite your first active streak day in Aadesh AI.',
      'flame',
      'amber',
      totalActive,
      1,
      totalActive === 1 ? 'day' : 'days'
    ),
    buildItem(
      'three_day_spark',
      '3-Day Spark',
      'Build early momentum with 3 consecutive active days.',
      'sparkles',
      'orange',
      bestStreak,
      3,
      'days'
    ),
    buildItem(
      'seven_day_streak_master',
      '7-Day Streak Master',
      'Maintain a full 7-day consecutive activity streak.',
      'crown',
      'purple',
      bestStreak,
      7,
      'days'
    ),
    buildItem(
      'monthly_comeback_pro',
      'Monthly Comeback Pro',
      'Recover a missed day using a monthly protection shield.',
      'shield',
      'cyan',
      totalRecoveriesPerformed,
      1,
      totalRecoveriesPerformed === 1 ? 'recovery' : 'recoveries'
    ),
    buildItem(
      'fourteen_day_momentum',
      '14-Day Momentum',
      'Stay consistent across two consecutive weeks.',
      'zap',
      'emerald',
      bestStreak,
      14,
      'days'
    ),
    buildItem(
      'thirty_day_consistency_legend',
      '30-Day Consistency Legend',
      'Achieve a 30-day unbroken activity streak.',
      'trophy',
      'rose',
      bestStreak,
      30,
      'days'
    ),
  ];
}

export interface GlobalLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  avatarColor?: string;
  country?: string;
  countryFlag?: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: string;
  level?: number;
  updatedAt?: string;
}

export interface RankedLeaderboardEntry extends GlobalLeaderboardEntry {
  rank: number;
  isCurrentUser: boolean;
}

/**
 * Deterministically ranks active global streak leaderboard entries by longest current streak,
 * breaking ties by longest ever streak (desc), then earliest update timestamp (asc).
 */
export function rankLeaderboardEntries(
  entries: GlobalLeaderboardEntry[],
  currentUserId?: string,
  maxEntries: number = 10
): RankedLeaderboardEntry[] {
  const deduped = new Map<string, GlobalLeaderboardEntry>();
  for (const raw of entries) {
    if (!raw || !raw.userId) continue;
    const currentStreak = Math.max(0, Math.floor(Number(raw.currentStreak) || 0));
    if (currentStreak < 1) continue;
    const longestStreak = Math.max(currentStreak, Math.floor(Number(raw.longestStreak) || 0));
    const normalized: GlobalLeaderboardEntry = {
      userId: raw.userId,
      displayName: (raw.displayName || 'Explorer').trim().slice(0, 64) || 'Explorer',
      avatarUrl: raw.avatarUrl || '',
      avatarColor: raw.avatarColor || '#8b5cf6',
      country: raw.country || 'Global',
      countryFlag: raw.countryFlag || '🌐',
      currentStreak,
      longestStreak,
      lastActiveDate: raw.lastActiveDate || '',
      level: Math.max(1, Math.floor(Number(raw.level) || 1)),
      updatedAt: raw.updatedAt || '',
    };
    const existing = deduped.get(normalized.userId);
    if (
      !existing ||
      normalized.currentStreak > existing.currentStreak ||
      (normalized.currentStreak === existing.currentStreak &&
        (normalized.updatedAt || '') > (existing.updatedAt || ''))
    ) {
      deduped.set(normalized.userId, normalized);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      if (b.longestStreak !== a.longestStreak) return b.longestStreak - a.longestStreak;
      return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    })
    .slice(0, Math.max(1, maxEntries))
    .map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
      isCurrentUser: Boolean(currentUserId && entry.userId === currentUserId),
    }));
}

/**
 * Deterministically ranks Top N users by their all-time longest streak (`longestStreak >= 1`),
 * breaking ties by active currentStreak (desc), then earliest update timestamp (asc).
 */
export function rankLongestStreakLeaderboardEntries(
  entries: GlobalLeaderboardEntry[],
  currentUserId?: string,
  maxEntries: number = 10
): RankedLeaderboardEntry[] {
  const deduped = new Map<string, GlobalLeaderboardEntry>();
  for (const raw of entries) {
    if (!raw || !raw.userId) continue;
    const currentStreak = Math.max(0, Math.floor(Number(raw.currentStreak) || 0));
    const longestStreak = Math.max(currentStreak, Math.floor(Number(raw.longestStreak) || 0));
    if (longestStreak < 1) continue;
    const normalized: GlobalLeaderboardEntry = {
      userId: raw.userId,
      displayName: (raw.displayName || 'Explorer').trim().slice(0, 64) || 'Explorer',
      avatarUrl: raw.avatarUrl || '',
      avatarColor: raw.avatarColor || '#8b5cf6',
      country: raw.country || 'Global',
      countryFlag: raw.countryFlag || '🌐',
      currentStreak,
      longestStreak,
      lastActiveDate: raw.lastActiveDate || '',
      level: Math.max(1, Math.floor(Number(raw.level) || 1)),
      updatedAt: raw.updatedAt || '',
    };
    const existing = deduped.get(normalized.userId);
    if (
      !existing ||
      normalized.longestStreak > existing.longestStreak ||
      (normalized.longestStreak === existing.longestStreak &&
        normalized.currentStreak > existing.currentStreak) ||
      (normalized.longestStreak === existing.longestStreak &&
        normalized.currentStreak === existing.currentStreak &&
        (normalized.updatedAt || '') > (existing.updatedAt || ''))
    ) {
      deduped.set(normalized.userId, normalized);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      if (b.longestStreak !== a.longestStreak) return b.longestStreak - a.longestStreak;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    })
    .slice(0, Math.max(1, maxEntries))
    .map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
      isCurrentUser: Boolean(currentUserId && entry.userId === currentUserId),
    }));
}

/**
 * Selects the highest-impact newly earned streak milestone for the celebration pop-up card.
 */
export function resolveCelebratedMilestone(
  milestones: StreakMilestoneItem[],
  newlyEarnedIds: string[]
): StreakMilestoneItem | null {
  if (!newlyEarnedIds || newlyEarnedIds.length === 0) return null;
  const newlySet = new Set(newlyEarnedIds);
  const candidates = milestones.filter((m) => m.unlocked && newlySet.has(m.id));
  if (candidates.length === 0) return null;
  const priorityOrder = [
    'thirty_day_consistency_legend',
    'fourteen_day_momentum',
    'seven_day_streak_master',
    'monthly_comeback_pro',
    'three_day_spark',
    'first_flame',
  ];
  for (const id of priorityOrder) {
    const match = candidates.find((c) => c.id === id);
    if (match) return match;
  }
  return candidates[candidates.length - 1] || null;
}

// ---------------- STREAK GOAL & 24-HOUR DAILY MOTIVATION ----------------

export const DEFAULT_STREAK_GOAL_DAYS = 30;
export const MIN_STREAK_GOAL_DAYS = 1;
export const MAX_STREAK_GOAL_DAYS = 365;
export const STREAK_GOAL_PRESETS = [7, 14, 30, 60, 100, 365] as const;

export function clampStreakGoalDays(raw: unknown): number {
  const numeric = Math.floor(Number(raw));
  if (!Number.isFinite(numeric) || numeric < MIN_STREAK_GOAL_DAYS) {
    return DEFAULT_STREAK_GOAL_DAYS;
  }
  return Math.min(MAX_STREAK_GOAL_DAYS, Math.max(MIN_STREAK_GOAL_DAYS, numeric));
}

export interface StreakGoalProgress {
  currentStreak: number;
  goalDays: number;
  progressPercent: number;
  remainingDays: number;
  isCompleted: boolean;
  suggestedNextGoal: number | null;
}

export function computeStreakGoalProgress(
  currentStreak: number,
  goalDays: number = DEFAULT_STREAK_GOAL_DAYS
): StreakGoalProgress {
  const safeCurrent = Math.max(0, Math.floor(Number(currentStreak) || 0));
  const safeGoal = clampStreakGoalDays(goalDays);
  const progressPercent = Math.min(100, Math.round((safeCurrent / safeGoal) * 100));
  const remainingDays = Math.max(0, safeGoal - safeCurrent);
  const isCompleted = safeCurrent >= safeGoal;
  const suggestedNextGoal = isCompleted
    ? STREAK_GOAL_PRESETS.find((preset) => preset > safeGoal) ??
      (safeGoal < MAX_STREAK_GOAL_DAYS
        ? Math.min(MAX_STREAK_GOAL_DAYS, safeGoal + 30)
        : null)
    : null;

  return {
    currentStreak: safeCurrent,
    goalDays: safeGoal,
    progressPercent,
    remainingDays,
    isCompleted,
    suggestedNextGoal,
  };
}

export const DAILY_MOTIVATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface DailyMotivationQuote {
  id: string;
  text: string;
  author: string;
  category: 'Consistency' | 'Focus' | 'Growth' | 'Momentum' | 'Resilience';
}

export interface DailyMotivationState {
  quoteId: string;
  assignedAtMs: number;
  expiresAtMs: number;
}

export interface DailyMotivationResolution {
  isUnlocked: boolean;
  quote: DailyMotivationQuote | null;
  nextState: DailyMotivationState | null;
  didRotate: boolean;
  msUntilNextUpdate: number;
}

export const DAILY_MOTIVATION_QUOTES: DailyMotivationQuote[] = [
  {
    id: 'q-01',
    text: 'Success is the product of daily habits—not once-in-a-lifetime transformations.',
    author: 'James Clear',
    category: 'Consistency',
  },
  {
    id: 'q-02',
    text: 'Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.',
    author: 'John C. Maxwell',
    category: 'Consistency',
  },
  {
    id: 'q-03',
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
    category: 'Consistency',
  },
  {
    id: 'q-04',
    text: 'Momentum builds quietly: show up today, and tomorrow becomes easier to win.',
    author: 'Aadesh AI Daily',
    category: 'Momentum',
  },
  {
    id: 'q-05',
    text: 'It does not matter how slowly you go as long as you do not stop.',
    author: 'Confucius',
    category: 'Resilience',
  },
  {
    id: 'q-06',
    text: 'The secret of your future is hidden in your daily routine.',
    author: 'Mike Murdock',
    category: 'Consistency',
  },
  {
    id: 'q-07',
    text: 'Curiosity turns an ordinary day into a breakthrough. Keep asking sharp questions.',
    author: 'Aadesh AI Daily',
    category: 'Growth',
  },
  {
    id: 'q-08',
    text: 'Great works are performed not by strength, but by perseverance.',
    author: 'Samuel Johnson',
    category: 'Resilience',
  },
  {
    id: 'q-09',
    text: 'Focus on making today one percent sharper than yesterday—compounding handles the rest.',
    author: 'Aadesh AI Daily',
    category: 'Growth',
  },
  {
    id: 'q-10',
    text: 'Discipline is choosing between what you want now and what you want most.',
    author: 'Abraham Lincoln',
    category: 'Focus',
  },
  {
    id: 'q-11',
    text: 'A river cuts through rock not because of its power, but because of its persistence.',
    author: 'Jim Watkins',
    category: 'Resilience',
  },
  {
    id: 'q-12',
    text: 'Action is the foundational key to all success.',
    author: 'Pablo Picasso',
    category: 'Momentum',
  },
  {
    id: 'q-13',
    text: 'The expert in anything was once a beginner who refused to break the chain.',
    author: 'Helen Hayes',
    category: 'Growth',
  },
  {
    id: 'q-14',
    text: 'Energy and persistence conquer all things.',
    author: 'Benjamin Franklin',
    category: 'Momentum',
  },
  {
    id: 'q-15',
    text: 'Your direction matters far more than your speed—and showing up daily keeps your compass true.',
    author: 'Aadesh AI Daily',
    category: 'Focus',
  },
  {
    id: 'q-16',
    text: 'Well done is better than well said.',
    author: 'Benjamin Franklin',
    category: 'Momentum',
  },
  {
    id: 'q-17',
    text: 'Continuous improvement is better than delayed perfection.',
    author: 'Mark Twain',
    category: 'Growth',
  },
  {
    id: 'q-18',
    text: 'Every streak begins with a single decision to begin—and grows with every promise you keep to yourself.',
    author: 'Aadesh AI Daily',
    category: 'Consistency',
  },
  {
    id: 'q-19',
    text: 'Quality is never an accident; it is always the result of intelligent effort.',
    author: 'John Ruskin',
    category: 'Focus',
  },
  {
    id: 'q-20',
    text: 'Fall seven times, stand up eight—consistency beats intensity every time.',
    author: 'Japanese Proverb',
    category: 'Resilience',
  },
  {
    id: 'q-21',
    text: 'What you do every day matters more than what you do once in a while.',
    author: 'Gretchen Rubin',
    category: 'Consistency',
  },
  {
    id: 'q-22',
    text: 'Stay hungry for knowledge; every conversation leaves you wiser than before.',
    author: 'Aadesh AI Daily',
    category: 'Growth',
  },
  {
    id: 'q-23',
    text: 'Start where you are. Use what you have. Do what you can.',
    author: 'Arthur Ashe',
    category: 'Momentum',
  },
  {
    id: 'q-24',
    text: 'Starve your distractions and feed your focus—one steady day at a time.',
    author: 'Aadesh AI Daily',
    category: 'Focus',
  },
];

/**
 * Resolves the user's 24-hour Daily Motivation quote when they have an active streak (`currentStreak >= 1`).
 * - Returns locked (`isUnlocked: false`) when `currentStreak < 1`.
 * - Preserves the assigned quote for a full 24 hours (`expiresAtMs = assignedAtMs + 24h`).
 * - Selects a new random quote (avoiding repeating the immediately previous quote) once 24 hours pass.
 */
export function resolveDailyMotivationQuote(params: {
  currentStreak: number;
  existingState?: DailyMotivationState | null;
  nowMs?: number;
  randomFn?: () => number;
}): DailyMotivationResolution {
  const safeStreak = Math.max(0, Math.floor(Number(params.currentStreak) || 0));
  const nowMs = params.nowMs ?? Date.now();
  const existing = params.existingState || null;

  if (safeStreak < 1) {
    return {
      isUnlocked: false,
      quote: null,
      nextState: existing,
      didRotate: false,
      msUntilNextUpdate: 0,
    };
  }

  // Keep existing quote if still within its 24-hour window
  if (
    existing &&
    typeof existing.quoteId === 'string' &&
    typeof existing.expiresAtMs === 'number' &&
    Number.isFinite(existing.expiresAtMs) &&
    nowMs < existing.expiresAtMs
  ) {
    const matchedQuote = DAILY_MOTIVATION_QUOTES.find((q) => q.id === existing.quoteId);
    if (matchedQuote) {
      return {
        isUnlocked: true,
        quote: matchedQuote,
        nextState: existing,
        didRotate: false,
        msUntilNextUpdate: Math.max(0, existing.expiresAtMs - nowMs),
      };
    }
  }

  // 24 hours elapsed or no valid stored quote -> select a random quote (excluding previous when possible)
  const pool =
    existing?.quoteId && DAILY_MOTIVATION_QUOTES.length > 1
      ? DAILY_MOTIVATION_QUOTES.filter((q) => q.id !== existing.quoteId)
      : DAILY_MOTIVATION_QUOTES;

  const randVal = (params.randomFn ?? Math.random)();
  const safeRand = Number.isFinite(randVal) ? Math.min(0.999999, Math.max(0, randVal)) : 0;
  const chosenQuote = pool[Math.floor(safeRand * pool.length)] || DAILY_MOTIVATION_QUOTES[0];

  const nextState: DailyMotivationState = {
    quoteId: chosenQuote.id,
    assignedAtMs: nowMs,
    expiresAtMs: nowMs + DAILY_MOTIVATION_INTERVAL_MS,
  };

  return {
    isUnlocked: true,
    quote: chosenQuote,
    nextState,
    didRotate: true,
    msUntilNextUpdate: DAILY_MOTIVATION_INTERVAL_MS,
  };
}

export function formatCountdownHoursMinutes(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalMinutes = Math.ceil(safeMs / (60 * 1000));
  if (totalMinutes <= 1) return '<1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export interface StreakTrendPoint {
  period: string;
  label: string;
  activeDays: number;
  totalInteractions: number;
}

/**
 * Generates 3 months of activity trend data points for recharts LineChart visualization.
 */
export function generateStreakTrendData(
  dateCounts: Record<string, number>,
  timeZone: string = NEPAL_TIMEZONE,
  nowMs: number = Date.now()
): StreakTrendPoint[] {
  const tz = resolveValidTimezone(timeZone);
  const points: StreakTrendPoint[] = [];
  const counts = dateCounts || {};

  // Group into last 12 weeks (~3 months)
  for (let i = 11; i >= 0; i--) {
    const weekStartMs = nowMs - (i * 7 + 6) * 24 * 3600 * 1000;
    const weekEndMs = nowMs - i * 7 * 24 * 3600 * 1000;
    const startKey = getLocalDateKeyInTimezone(weekStartMs, tz);
    const endKey = getLocalDateKeyInTimezone(weekEndMs, tz);

    let activeDays = 0;
    let totalInteractions = 0;

    const cursor = new Date(weekStartMs);
    for (let d = 0; d < 7; d++) {
      const dateKey = getLocalDateKeyInTimezone(cursor.getTime(), tz);
      const count = counts[dateKey] || 0;
      if (count > 0) {
        activeDays += 1;
        totalInteractions += count;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const weekLabel = `W${12 - i}`;
    points.push({
      period: weekLabel,
      label: `Week ${12 - i} (${startKey.slice(5)} - ${endKey.slice(5)})`,
      activeDays,
      totalInteractions,
    });
  }

  return points;
}

export function processStreakFreeze(
  user: UserProfile,
  freezeCostXp: number = 150,
  nowMs: number = Date.now()
): { ok: boolean; reason?: 'insufficient_xp' | 'already_active'; updatedUser: UserProfile; xpSpent: number } {
  const currentXp = Math.max(0, user.xp || 0);
  if (currentXp < freezeCostXp) {
    return { ok: false, reason: 'insufficient_xp', updatedUser: user, xpSpent: 0 };
  }

  const tz = resolveEffectiveStreakTimezone(user.timezone);
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const monthKey = todayKey.slice(0, 7);
  const monthly = getMonthlyRecoveryUsage(
    {
      recoveryCount: user.recoveryCount ?? 0,
      recoveryMonth: user.recoveryMonth ?? monthKey,
      timezone: tz,
    },
    nowMs
  );

  const nextXp = currentXp - freezeCostXp;
  const currentStreak = Math.max(1, user.currentStreak || user.streakDays || 1);
  const longestStreak = Math.max(currentStreak, user.longestStreak || 1);

  const updatedUser: UserProfile = {
    ...user,
    xp: nextXp,
    currentStreak,
    streakDays: currentStreak,
    longestStreak,
    lastActiveDate: todayKey,
    timezone: tz,
    recoveryCount: Math.min(MAX_MONTHLY_STREAK_RECOVERIES, monthly.recoveryCount + 1),
    recoveryMonth: monthKey,
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  return { ok: true, updatedUser, xpSpent: freezeCostXp };
}

export type HeatmapIntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface StreakHeatmapDayEntry {
  date: string; // YYYY-MM-DD
  shortLabel: string; // e.g. "Nov 24"
  dayLabel: string; // Sun..Sat
  dayOfMonth: number;
  weekdayIndex: number; // 0 (Sun) .. 6 (Sat)
  status: 'maintained' | 'recovered' | 'inactive';
  count: number;
  intensity: HeatmapIntensityLevel;
  isToday: boolean;
}

export interface Last30DaysStreakHeatmapSummary {
  days: StreakHeatmapDayEntry[];
  leadingEmptySlots: number; // 0..6 weekday alignment for Sun..Sat grid
  activeDaysCount: number;
  maintainedDaysCount: number;
  recoveredDaysCount: number;
  inactiveDaysCount: number;
  consistencyRatePercent: number;
  recent7ActiveCount: number;
  recent7RatePercent: number;
  totalInteractions: number;
  peakDay: { date: string; shortLabel: string; count: number } | null;
  strongestWeekday: string | null;
  effectiveTimezone: string;
  startDateKey: string;
  endDateKey: string;
}

/**
 * Computes a 30-day trailing calendar heatmap & consistency analytics summary in the user's
 * effective IANA timezone (defaulting to Asia/Kathmandu).
 */
export function buildLast30DaysStreakHeatmap(params: {
  user?: Partial<UserProfile> | null;
  dateCounts?: Record<string, number>;
  recoveredDates?: string[];
  authoritativeStreak?: number;
  timeZone?: string;
  nowMs?: number;
}): Last30DaysStreakHeatmapSummary {
  const nowMs = params.nowMs ?? Date.now();
  const effectiveTimezone = resolveEffectiveStreakTimezone(
    params.timeZone || params.user?.timezone
  );
  const todayKey = getLocalDateKeyInTimezone(nowMs, effectiveTimezone);
  const startDateKey = addDaysToDateKey(todayKey, -29);

  // Merge Firestore counts, local streakHistory, and lastActiveDate
  const mergedCounts: Record<string, number> = { ...(params.dateCounts || {}) };
  (params.user?.streakHistory || []).forEach((item) => {
    if (
      item &&
      isValidIsoDateKey(item.date) &&
      (item.completed || item.status === 'maintained') &&
      item.status !== 'recovered'
    ) {
      mergedCounts[item.date] = Math.max(mergedCounts[item.date] || 0, item.activityCount || 1);
    }
  });
  if (isValidIsoDateKey(params.user?.lastActiveDate)) {
    mergedCounts[params.user!.lastActiveDate!] = Math.max(
      mergedCounts[params.user!.lastActiveDate!] || 0,
      1
    );
  }

  // Merge recovered dates from Firestore logs, profile array, and streakHistory
  const recoveredSet = new Set<string>(
    (params.recoveredDates || []).filter((d) => isValidIsoDateKey(d))
  );
  (params.user?.recoveredDates || []).forEach((d) => {
    if (isValidIsoDateKey(d)) recoveredSet.add(d);
  });
  (params.user?.streakHistory || []).forEach((item) => {
    if (item && item.status === 'recovered' && isValidIsoDateKey(item.date)) {
      recoveredSet.add(item.date);
    }
  });

  // Backfill contiguous streak window implied by authoritativeStreak anchored on lastActiveDate (or today)
  const streakLen = Math.max(
    0,
    Math.floor(
      params.authoritativeStreak ??
        params.user?.currentStreak ??
        params.user?.streakDays ??
        0
    )
  );
  const streakAnchor = isValidIsoDateKey(params.user?.lastActiveDate)
    ? params.user!.lastActiveDate!
    : streakLen > 0
    ? todayKey
    : '';
  const impliedActiveSet = new Set<string>();
  if (streakLen > 0 && isValidIsoDateKey(streakAnchor)) {
    const cappedLen = Math.min(streakLen, 60);
    for (let i = 0; i < cappedLen; i++) {
      const k = addDaysToDateKey(streakAnchor, -i);
      if (!recoveredSet.has(k)) {
        impliedActiveSet.add(k);
      }
    }
  }

  const monthShortNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const computeIntensity = (count: number, status: StreakHeatmapDayEntry['status']): HeatmapIntensityLevel => {
    if (status === 'inactive' && count <= 0) return 0;
    if (status === 'recovered' && count <= 1) return 1;
    if (count >= 11) return 4;
    if (count >= 6) return 3;
    if (count >= 3) return 2;
    return 1;
  };

  const days: StreakHeatmapDayEntry[] = [];
  let maintainedDaysCount = 0;
  let recoveredDaysCount = 0;
  let totalInteractions = 0;
  let peakDay: { date: string; shortLabel: string; count: number } | null = null;
  const weekdayActiveCounts: Record<string, number> = {};
  const weekdayTotals: Record<string, number> = {};

  for (let offset = 29; offset >= 0; offset--) {
    const dateKey = addDaysToDateKey(todayKey, -offset);
    const [yStr, mStr, dStr] = dateKey.split('-');
    const yearNum = Number(yStr);
    const monthNum = Number(mStr);
    const dayNum = Number(dStr);
    const weekdayIndex = new Date(Date.UTC(yearNum, monthNum - 1, dayNum)).getUTCDay();
    const dayLabel = getWeekdayForDateKey(dateKey);
    const shortLabel = `${monthShortNames[monthNum - 1] || mStr} ${dayNum}`;

    const rawCount = Math.max(0, Math.floor(Number(mergedCounts[dateKey] || 0)));
    const isRecovered = recoveredSet.has(dateKey);
    const isMaintained = !isRecovered && (rawCount > 0 || impliedActiveSet.has(dateKey));

    const status: StreakHeatmapDayEntry['status'] = isRecovered
      ? 'recovered'
      : isMaintained
      ? 'maintained'
      : 'inactive';

    const effectiveCount = rawCount > 0 ? rawCount : status === 'inactive' ? 0 : 1;
    const intensity = computeIntensity(effectiveCount, status);

    if (status === 'maintained') maintainedDaysCount += 1;
    if (status === 'recovered') recoveredDaysCount += 1;
    totalInteractions += effectiveCount;

    if (status !== 'inactive') {
      weekdayActiveCounts[dayLabel] = (weekdayActiveCounts[dayLabel] || 0) + 1;
      weekdayTotals[dayLabel] = (weekdayTotals[dayLabel] || 0) + effectiveCount;
      if (!peakDay || effectiveCount > peakDay.count || (effectiveCount === peakDay.count && dateKey > peakDay.date)) {
        peakDay = { date: dateKey, shortLabel, count: effectiveCount };
      }
    }

    days.push({
      date: dateKey,
      shortLabel,
      dayLabel,
      dayOfMonth: dayNum,
      weekdayIndex,
      status,
      count: effectiveCount,
      intensity,
      isToday: offset === 0,
    });
  }

  const activeDaysCount = maintainedDaysCount + recoveredDaysCount;
  const inactiveDaysCount = Math.max(0, 30 - activeDaysCount);
  const consistencyRatePercent = Math.round((activeDaysCount / 30) * 100);
  const recent7 = days.slice(-7);
  const recent7ActiveCount = recent7.filter((d) => d.status !== 'inactive').length;
  const recent7RatePercent = Math.round((recent7ActiveCount / 7) * 100);

  let strongestWeekday: string | null = null;
  let bestWeekdayScore = -1;
  Object.keys(weekdayActiveCounts).forEach((wd) => {
    const score = (weekdayActiveCounts[wd] || 0) * 1000 + (weekdayTotals[wd] || 0);
    if (score > bestWeekdayScore) {
      bestWeekdayScore = score;
      strongestWeekday = wd;
    }
  });

  return {
    days,
    leadingEmptySlots: days[0]?.weekdayIndex ?? 0,
    activeDaysCount,
    maintainedDaysCount,
    recoveredDaysCount,
    inactiveDaysCount,
    consistencyRatePercent,
    recent7ActiveCount,
    recent7RatePercent,
    totalInteractions,
    peakDay,
    strongestWeekday,
    effectiveTimezone,
    startDateKey,
    endDateKey: todayKey,
  };
}
