import React from 'react';
import { Flame, Sparkles, Target, Trophy } from 'lucide-react';
import { UserProfile } from '../types';
import { computeLevelInfo } from '../utils/gamification';

interface GamificationWidgetProps {
  user: UserProfile;
  onClick: () => void;
  className?: string;
}

export const GamificationWidget: React.FC<GamificationWidgetProps> = ({
  user,
  onClick,
  className = '',
}) => {
  const levelInfo = computeLevelInfo(user.xp || 0);
  const currentGoal = user.dailyGoalCurrent || 0;
  const targetGoal = user.dailyGoalTarget || 5;
  const goalPercent = Math.min(100, Math.round((currentGoal / targetGoal) * 100));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 sm:gap-3 bg-[#131520]/90 hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/50 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer group shadow-sm ${className}`}
      title="View Activity Streak, XP Points, and Daily Learning Goals"
    >
      {/* 1. Daily Activity Streak */}
      <div className="flex items-center gap-1.5 text-amber-400 font-extrabold group-hover:scale-105 transition-transform">
        <Flame className="w-4 h-4 fill-amber-500/30 text-amber-500 animate-pulse" />
        <span className="tracking-tight">{user.streakDays || 1} Days</span>
      </div>

      <span className="text-gray-600 font-light select-none">|</span>

      {/* 2. XP Points & Level Badge */}
      <div className="flex items-center gap-1.5 text-purple-300 font-extrabold group-hover:scale-105 transition-transform">
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
        <span className="tracking-tight">{(user.xp || 0).toLocaleString()} XP</span>
      </div>

      <span className="w-px h-3.5 bg-gray-700 hidden md:block" />

      {/* 3. Daily Goals Mini Progress Indicator */}
      <div className="hidden lg:flex items-center gap-1.5 text-gray-300 font-medium">
        <Target className="w-3.5 h-3.5 text-rose-400" />
        <span className="text-[11px] font-mono text-gray-200">
          {currentGoal}/{targetGoal}
        </span>
        {/* Micro progress bar */}
        <div className="w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-white/5">
          <div
            style={{ width: `${goalPercent}%` }}
            className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full transition-all duration-300"
          />
        </div>
      </div>
    </button>
  );
};
