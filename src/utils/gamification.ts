import { AchievementBadge, DailyStreakDay, UserProfile } from '../types';

export const INITIAL_BADGES: AchievementBadge[] = [
  {
    id: 'first_query',
    name: 'First Spark',
    icon: '🌟',
    description: 'Sent your first message to Aadesh AI Global Hub',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 7,
    category: 'xp',
  },
  {
    id: 'voice_explorer',
    name: 'Voice Pioneer',
    icon: '🎙️',
    description: 'Engaged with hands-free natural voice speech recognition',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 5,
    category: 'voice',
  },
  {
    id: 'vision_analyst',
    name: 'Vision Analyst',
    icon: '📸',
    description: 'Uploaded and analyzed visual photo context with AI',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 3,
    category: 'vision',
  },
  {
    id: 'streak_master',
    name: 'Consistent Explorer',
    icon: '🔥',
    description: 'Maintained a 7-day consecutive activity streak',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 1,
    category: 'streak',
  },
  {
    id: 'polyglot',
    name: 'Global Polyglot',
    icon: '🌐',
    description: 'Learned or translated across 3+ languages',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 2,
    category: 'multilingual',
  },
  {
    id: 'power_scholar',
    name: 'AI Grand Scholar',
    icon: '⚡',
    description: 'Surpassed 2,000 XP in learning and reasoning',
    unlocked: true,
    unlockedAt: Date.now() - 86400000 * 1,
    category: 'xp',
  },
];

export function generateStreakHistory(streakDays: number): DailyStreakDay[] {
  const result: DailyStreakDay[] = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = daysOfWeek[d.getDay()];
    // Mark as completed if within current streak window
    const completed = i < streakDays;
    result.push({
      date: dateStr,
      dayLabel,
      completed,
      activityCount: completed ? Math.floor(Math.random() * 3) + 2 : 0,
    });
  }

  return result;
}

export function computeLevelInfo(xp: number): { level: number; levelTitle: string; nextLevelXp: number; progressPercent: number } {
  if (xp >= 5000) {
    return { level: 5, levelTitle: 'Global AI Luminary', nextLevelXp: 10000, progressPercent: Math.min(100, Math.round(((xp - 5000) / 5000) * 100)) };
  }
  if (xp >= 2500) {
    return { level: 4, levelTitle: 'Grand AI Scholar', nextLevelXp: 5000, progressPercent: Math.min(100, Math.round(((xp - 2500) / 2500) * 100)) };
  }
  if (xp >= 1000) {
    return { level: 3, levelTitle: 'Multilingual Master', nextLevelXp: 2500, progressPercent: Math.min(100, Math.round(((xp - 1000) / 1500) * 100)) };
  }
  if (xp >= 400) {
    return { level: 2, levelTitle: 'Knowledge Seeker', nextLevelXp: 1000, progressPercent: Math.min(100, Math.round(((xp - 400) / 600) * 100)) };
  }
  return { level: 1, levelTitle: 'Curious Novice', nextLevelXp: 400, progressPercent: Math.min(100, Math.round((xp / 400) * 100)) };
}

export function recordGamificationActivity(
  user: UserProfile,
  activityType: 'chat' | 'voice' | 'image' | 'translation'
): { updatedUser: UserProfile; xpEarned: number; streakIncreased: boolean; newBadgeUnlocked?: AchievementBadge } {
  const todayStr = new Date().toISOString().slice(0, 10);
  const xpValues: Record<string, number> = {
    chat: 25,
    voice: 50,
    image: 40,
    translation: 30,
  };
  const xpEarned = xpValues[activityType] || 25;

  let streakDays = user.streakDays || 1;
  let streakIncreased = false;
  let dailyGoalCurrent = user.dailyGoalCurrent || 0;

  if (user.lastActiveDate !== todayStr) {
    // Check if yesterday was last active date
    if (user.lastActiveDate) {
      const last = new Date(user.lastActiveDate).getTime();
      const now = new Date(todayStr).getTime();
      const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streakDays += 1;
        streakIncreased = true;
      } else if (diffDays > 1) {
        streakDays = 1;
      }
    }
    dailyGoalCurrent = 1;
  } else {
    dailyGoalCurrent = Math.min(user.dailyGoalTarget || 5, dailyGoalCurrent + 1);
  }

  const newXp = (user.xp || 0) + xpEarned;
  const levelData = computeLevelInfo(newXp);
  const longestStreak = Math.max(user.longestStreak || 7, streakDays);

  // Update streak history for today
  const history = generateStreakHistory(streakDays);

  // Check badges
  let newBadgeUnlocked: AchievementBadge | undefined = undefined;
  const updatedBadges = user.badges.map((b) => {
    if (b.unlocked) return b;
    if (b.id === 'voice_explorer' && activityType === 'voice') {
      newBadgeUnlocked = { ...b, unlocked: true, unlockedAt: Date.now() };
      return newBadgeUnlocked;
    }
    if (b.id === 'vision_analyst' && activityType === 'image') {
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
