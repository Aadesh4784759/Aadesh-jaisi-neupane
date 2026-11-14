import React from 'react';
import {
  X,
  Flame,
  Sparkles,
  Trophy,
  Target,
  Calendar,
  CheckCircle2,
  Award,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { UserProfile } from '../types';
import { computeLevelInfo } from '../utils/gamification';

interface GamificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

export const GamificationModal: React.FC<GamificationModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  if (!isOpen) return null;

  const levelInfo = computeLevelInfo(user.xp || 0);
  const goalPercent = Math.min(
    100,
    Math.round(((user.dailyGoalCurrent || 0) / (user.dailyGoalTarget || 5)) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-lg w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Flame className="w-6 h-6 fill-white text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <span>Activity Streak & Gamification</span>
              </h3>
              <p className="text-xs text-gray-400">
                Track your real daily momentum, XP points, and unlocked milestones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Main Streak & XP Scoreboard */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#090a0f] border border-amber-500/40 relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                  <span>Current Streak</span>
                </span>
                <span className="text-[10px] text-gray-400 font-normal">
                  Best: {user.longestStreak || 7}d
                </span>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {user.streakDays || 1}{' '}
                <span className="text-base font-semibold text-amber-300">Days</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Active today • Keep returning daily to build consecutive momentum
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#090a0f] border border-purple-500/40 relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between text-xs text-purple-300 font-bold mb-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Total XP</span>
                </span>
                <span className="text-[10px] bg-purple-950 text-purple-200 px-1.5 py-0.5 rounded font-mono">
                  Lvl {levelInfo.level}
                </span>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {(user.xp || 0).toLocaleString()}{' '}
                <span className="text-base font-semibold text-purple-300">XP</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {levelInfo.levelTitle}
              </p>
            </div>
          </div>

          {/* Level Progress Bar */}
          <div className="p-4 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Level {levelInfo.level}: {levelInfo.levelTitle}</span>
              </span>
              <span className="text-purple-300 font-semibold text-[11px]">
                {user.xp} / {levelInfo.nextLevelXp} XP ({levelInfo.progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#131520] overflow-hidden p-0.5 border border-white/5">
              <div
                style={{ width: `${levelInfo.progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-amber-400 transition-all duration-500 shadow-sm shadow-purple-500/50"
              />
            </div>
          </div>

          {/* 7-Day Streak History */}
          <div className="p-4 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  7-Day Streak History
                </h4>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active Streak Maintained</span>
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 pt-1">
              {(user.streakHistory || []).map((day, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-xl text-center flex flex-col items-center justify-between border transition-all ${
                    day.completed
                      ? 'bg-amber-950/40 border-amber-500/50 text-white shadow-sm'
                      : 'bg-[#131520]/60 border-[#232738] text-gray-500'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase">{day.dayLabel}</span>
                  <div className="my-1.5">
                    {day.completed ? (
                      <Flame className="w-5 h-5 fill-amber-500 text-amber-500 animate-pulse" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-gray-700 border-dashed" />
                    )}
                  </div>
                  <span className="text-[9px] text-gray-400 font-mono">
                    {day.date.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Learning Goal */}
          <div className="p-4 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-rose-400" />
                <span>Daily Learning Goal</span>
              </span>
              <span className="text-xs font-semibold text-rose-300">
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
              <span className="text-xs text-gray-400">
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
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-white truncate">
                        {badge.name}
                      </h5>
                      {badge.unlocked ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-500/30">
                          Unlocked
                        </span>
                      ) : (
                        <span className="text-[9px] text-gray-500">In Progress</span>
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
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#090a0f] flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Earn XP with every query and translation</span>
          </span>
          <button
            onClick={onClose}
            className="purple-glow-btn text-white font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
