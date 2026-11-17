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

export const MAX_MONTHLY_STREAK_RECOVERIES = 3;

export interface PersistentStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD in user's saved IANA timezone
  timezone: string; // IANA timezone identifier e.g. 'Asia/Kathmandu'
  recoveryCount: number; // 0..3 used in recoveryMonth
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

  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const validBrowser = tryTz(browserTz);
    if (validBrowser) return validBrowser;
  } catch {
    // Non-fatal fallback
  }

  return 'UTC';
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
      restorableStreak: evaluated.streakBeforeBreak + 1,
      recoveryCount: monthly.recoveryCount,
      recoveriesRemaining: 0,
      recoveryMonth: monthly.recoveryMonth,
    };
  }

  return {
    eligible: true,
    restorableStreak: evaluated.streakBeforeBreak + 1,
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

  // Restores broken streak plus today as one continuous active day without duplicating today's count
  const restoredStreak = evaluated.streakBeforeBreak + 1;
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
  timeZone?: string,
  nowMs: number = Date.now()
): DailyStreakDay[] {
  const result: DailyStreakDay[] = [];
  const tz = resolveValidTimezone(timeZone);
  const todayKey = getLocalDateKeyInTimezone(nowMs, tz);
  const safeStreak = Math.max(0, Math.floor(streakDays || 0));

  for (let i = 6; i >= 0; i--) {
    const dateStr = addDaysToDateKey(todayKey, -i);
    const dayLabel = getWeekdayForDateKey(dateStr);
    const recordedCount = dateCounts?.[dateStr] || 0;
    const completed = recordedCount > 0 || (safeStreak > 0 && i < safeStreak);
    result.push({
      date: dateStr,
      dayLabel,
      completed,
      activityCount: recordedCount > 0 ? recordedCount : completed ? 1 : 0,
    });
  }

  return result;
}

export function computeLevelInfo(xp: number): {
  level: number;
  levelTitle: string;
  nextLevelXp: number;
  progressPercent: number;
} {
  if (xp >= 5000) {
    return {
      level: 5,
      levelTitle: 'Global AI Luminary',
      nextLevelXp: 10000,
      progressPercent: Math.min(100, Math.round(((xp - 5000) / 5000) * 100)),
    };
  }
  if (xp >= 2500) {
    return {
      level: 4,
      levelTitle: 'Grand AI Scholar',
      nextLevelXp: 5000,
      progressPercent: Math.min(100, Math.round(((xp - 2500) / 2500) * 100)),
    };
  }
  if (xp >= 1000) {
    return {
      level: 3,
      levelTitle: 'Multilingual Master',
      nextLevelXp: 2500,
      progressPercent: Math.min(100, Math.round(((xp - 1000) / 1500) * 100)),
    };
  }
  if (xp >= 400) {
    return {
      level: 2,
      levelTitle: 'Knowledge Seeker',
      nextLevelXp: 1000,
      progressPercent: Math.min(100, Math.round(((xp - 400) / 600) * 100)),
    };
  }
  return {
    level: 1,
    levelTitle: 'Curious Novice',
    nextLevelXp: 400,
    progressPercent: Math.min(100, Math.round((xp / 400) * 100)),
  };
}

export function evaluateCurrentStreakOnLoad(
  savedStreakDays: number,
  lastActiveDate?: string,
  timeZone?: string,
  nowMs: number = Date.now()
): number {
  const cleanSaved = Math.max(0, Math.floor(savedStreakDays || 0));
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
  options?: { nowMs?: number; skipStreakIncrement?: boolean }
): {
  updatedUser: UserProfile;
  xpEarned: number;
  streakIncreased: boolean;
  newBadgeUnlocked?: AchievementBadge;
} {
  const nowMs = options?.nowMs ?? Date.now();
  const tz = resolveValidTimezone(user.timezone);
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

  const newXp = (user.xp || 0) + xpEarned;
  const levelData = computeLevelInfo(newXp);

  const prevCounts: Record<string, number> = {};
  (user.streakHistory || []).forEach((h) => {
    if (h.completed && h.date) prevCounts[h.date] = Math.max(1, h.activityCount || 1);
  });
  prevCounts[todayStr] = (prevCounts[todayStr] || 0) + 1;

  const history = generateStreakHistory(streakDays, prevCounts, tz, nowMs);

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
    timezone: nextStreakState.timezone,
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
    xpEarned,
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
