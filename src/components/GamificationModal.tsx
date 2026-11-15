import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  X,
  Flame,
  Sparkles,
  Trophy,
  Target,
  Award,
  Zap,
} from 'lucide-react';
import { UserProfile } from '../types';
import { CalculatedStreakSummary, computeLevelInfo } from '../utils/gamification';
import { DailyStreakTracker } from './DailyStreakTracker';

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
  const prefersReducedMotion = useReducedMotion();
  const [liveStreakSummary, setLiveStreakSummary] = useState<CalculatedStreakSummary | null>(null);

  if (!isOpen) return null;

  const levelInfo = computeLevelInfo(user.xp || 0);
  const goalPercent = Math.min(
    100,
    Math.round(((user.dailyGoalCurrent || 0) / (user.dailyGoalTarget || 5)) * 100)
  );
  const consecutiveDays = liveStreakSummary?.consecutiveDays ?? user.streakDays ?? 1;
  const bestStreak = liveStreakSummary?.longestStreak ?? user.longestStreak ?? 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.12 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card rounded-3xl max-w-2xl w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-transparent">
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
                  <span>{consecutiveDays}d Golden Streak</span>
                </motion.span>
              </h3>
              <p className="text-xs text-gray-400">
                Track your consecutive interaction days from Firestore logs, XP points, and milestones
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
          {/* Glowing Gamified DailyStreakTracker (Firestore Logs + Badge + Weekly Master Progress Bar + 30-Day Calendar Grid) */}
          <DailyStreakTracker
            user={user}
            onStreakCalculated={setLiveStreakSummary}
          />

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
              <div className="text-3xl font-black text-white tracking-tight">
                {consecutiveDays}{' '}
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
      </motion.div>
    </div>
  );
};
