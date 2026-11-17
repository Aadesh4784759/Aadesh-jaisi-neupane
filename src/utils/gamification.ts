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

function toIsoDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateStreakHistory(
  streakDays: number,
  dateCounts?: Record<string, number>
): DailyStreakDay[] {
  const result: DailyStreakDay[] = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const safeStreak = Math.max(0, Math.floor(streakDays || 0));

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = toIsoDateKey(d);
    const dayLabel = daysOfWeek[d.getDay()];
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
  lastActiveDate?: string
): number {
  const cleanSaved = Math.max(0, Math.floor(savedStreakDays || 0));
  if (!lastActiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastActiveDate)) {
    return cleanSaved;
  }
  const todayStr = toIsoDateKey(new Date());
  if (lastActiveDate === todayStr) return Math.max(1, cleanSaved);

  const lastTime = new Date(`${lastActiveDate}T00:00:00`).getTime();
  const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
  const diffDays = Math.round((todayTime - lastTime) / (1000 * 60 * 60 * 24));

  // If user was active yesterday, streak is still alive today awaiting next activity; if >1 day missed, streak resets to 0
  if (diffDays <= 1) return cleanSaved;
  return 0;
}

export function recordGamificationActivity(
  user: UserProfile,
  activityType: 'chat' | 'voice' | 'image' | 'translation'
): {
  updatedUser: UserProfile;
  xpEarned: number;
  streakIncreased: boolean;
  newBadgeUnlocked?: AchievementBadge;
} {
  const todayStr = toIsoDateKey(new Date());
  const xpValues: Record<string, number> = {
    chat: 25,
    voice: 50,
    image: 40,
    translation: 30,
  };
  const xpEarned = xpValues[activityType] || 25;

  let streakDays = Math.max(0, Math.floor(user.streakDays || 0));
  let streakIncreased = false;
  let dailyGoalCurrent = user.dailyGoalCurrent || 0;

  if (user.lastActiveDate !== todayStr) {
    if (user.lastActiveDate && /^\d{4}-\d{2}-\d{2}$/.test(user.lastActiveDate)) {
      const last = new Date(`${user.lastActiveDate}T00:00:00`).getTime();
      const now = new Date(`${todayStr}T00:00:00`).getTime();
      const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streakDays = Math.max(1, streakDays) + 1;
        streakIncreased = true;
      } else {
        // Missed more than 1 day or first tracked day: reset/start at 1
        streakDays = 1;
        streakIncreased = true;
      }
    } else {
      streakDays = 1;
      streakIncreased = true;
    }
    dailyGoalCurrent = 1;
  } else {
    if (streakDays === 0) {
      streakDays = 1;
      streakIncreased = true;
    }
    dailyGoalCurrent = Math.min(user.dailyGoalTarget || 5, dailyGoalCurrent + 1);
  }

  const newXp = (user.xp || 0) + xpEarned;
  const levelData = computeLevelInfo(newXp);
  const longestStreak = Math.max(user.longestStreak || 0, streakDays);

  const prevCounts: Record<string, number> = {};
  (user.streakHistory || []).forEach((h) => {
    if (h.completed && h.date) prevCounts[h.date] = Math.max(1, h.activityCount || 1);
  });
  prevCounts[todayStr] = (prevCounts[todayStr] || 0) + 1;

  const history = generateStreakHistory(streakDays, prevCounts);

  const baseBadges = Array.isArray(user.badges) && user.badges.length > 0 ? user.badges : INITIAL_BADGES;
  let newBadgeUnlocked: AchievementBadge | undefined = undefined;
  const updatedBadges = baseBadges.map((b) => {
    if (b.unlocked) return b;
    if (b.id === 'first_query') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'voice_explorer' && activityType === 'voice') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'vision_analyst' && activityType === 'image') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'polyglot' && activityType === 'translation') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'streak_master' && streakDays >= 7) {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'power_scholar' && newXp >= 2000) {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    return b;
  });

  const updatedUser: UserProfile = {
    ...user,
    xp: newXp,
    streakDays,
    longestStreak,
    level: levelData.level,
    levelTitle: levelData.levelTitle,
    dailyGoalCurrent,
    lastActiveDate: todayStr,
    streakHistory: history,
    badges: updatedBadges,
  };

  return { updatedUser, xpEarned, streakIncreased, newBadgeUnlocked };
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
  daysToShow: number = 14
): CalculatedStreakSummary {
  const now = new Date();
  const todayLocalKey = toIsoDateKey(now);
  const todayUtcKey = now.toISOString().slice(0, 10);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayLocalKey = toIsoDateKey(yesterday);
  const yesterdayUtcKey = yesterday.toISOString().slice(0, 10);

  const normalizedCounts: Record<string, number> = { ...dateCounts };
  if (normalizedCounts[todayUtcKey] && !normalizedCounts[todayLocalKey]) {
    normalizedCounts[todayLocalKey] = normalizedCounts[todayUtcKey];
  }
  if (normalizedCounts[yesterdayUtcKey] && !normalizedCounts[yesterdayLocalKey]) {
    normalizedCounts[yesterdayLocalKey] = normalizedCounts[yesterdayUtcKey];
  }

  const activeKeys = Object.keys(normalizedCounts)
    .filter((k) => (normalizedCounts[k] || 0) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();

  // Compute current consecutive streak walking backwards from today (or yesterday if awaiting today's interaction)
  let consecutiveDays = 0;
  if (activeKeys.length > 0) {
    const startDate = new Date(now);
    if (!normalizedCounts[todayLocalKey] && normalizedCounts[yesterdayLocalKey]) {
      startDate.setDate(now.getDate() - 1);
    }
    if (normalizedCounts[toIsoDateKey(startDate)] > 0) {
      const cursor = new Date(startDate);
      while (normalizedCounts[toIsoDateKey(cursor)] > 0) {
        consecutiveDays += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }
  }

  // Only fall back to saved streak when there are genuinely no logged date keys yet;
  // when logs exist and yesterday+today were missed, consecutiveDays legitimately resets to 0.
  const effectiveConsecutive = activeKeys.length > 0 ? consecutiveDays : Math.max(0, fallbackStreakDays);

  let computedLongest = consecutiveDays;
  let run = 0;
  let prevTime: number | null = null;
  for (const key of activeKeys) {
    const t = new Date(`${key}T00:00:00Z`).getTime();
    if (prevTime !== null && Math.round((t - prevTime) / 86400000) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > computedLongest) computedLongest = run;
    prevTime = t;
  }

  const longestStreak = Math.max(computedLongest, effectiveConsecutive, Math.max(0, fallbackLongestStreak));

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const calendarGrid: StreakCalendarCell[] = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const localKey = toIsoDateKey(d);
    const utcKey = d.toISOString().slice(0, 10);
    const count = normalizedCounts[localKey] || normalizedCounts[utcKey] || 0;
    const completed = count > 0 || (activeKeys.length === 0 && effectiveConsecutive > 0 && i < effectiveConsecutive);
    calendarGrid.push({
      date: localKey,
      dayLabel: daysOfWeek[d.getDay()],
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
