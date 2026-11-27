import React, { useEffect, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  RefreshCw,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { UserProfile } from '../types';
import { RankedLeaderboardEntry } from '../utils/gamification';
import {
  GlobalLeaderboardErrorInfo,
  subscribeToLongestStreakLeaderboard,
  syncUserStreakLeaderboardEntry,
} from '../utils/firebase';

interface StreakLeaderboardProps {
  user: UserProfile;
  isActive: boolean;
  onCurrentUserRankChange?: (rank: number | null) => void;
}

function getInitials(name: string): string {
  const parts = String(name || 'A')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function renderRankIndicator(rank: number) {
  if (rank === 1) {
    return (
      <div
        aria-label="Rank 1"
        className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 text-black flex items-center justify-center shadow-[0_0_14px_rgba(251,191,36,0.45)] shrink-0"
      >
        <Crown className="w-4 h-4 fill-black/15" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        aria-label="Rank 2"
        className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-950 flex items-center justify-center shadow-[0_0_12px_rgba(203,213,225,0.3)] shrink-0"
      >
        <Medal className="w-4 h-4" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        aria-label="Rank 3"
        className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-600 via-orange-600 to-amber-800 text-amber-100 flex items-center justify-center shadow-[0_0_12px_rgba(217,119,6,0.3)] shrink-0"
      >
        <Medal className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div
      aria-label={`Rank ${rank}`}
      className="w-7 h-7 rounded-lg bg-[#141726] border border-white/10 text-gray-300 text-xs font-extrabold flex items-center justify-center tabular-nums shrink-0"
    >
      {rank}
    </div>
  );
}

export const StreakLeaderboard: React.FC<StreakLeaderboardProps> = ({
  user,
  isActive,
  onCurrentUserRankChange,
}) => {
  const [entries, setEntries] = useState<RankedLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorInfo, setErrorInfo] = useState<GlobalLeaderboardErrorInfo | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

  const userCurrentStreak = user.currentStreak ?? user.streakDays ?? 0;
  const userLongestStreak = Math.max(userCurrentStreak, user.longestStreak ?? 0);

  // Keep the authenticated user's PII-isolated leaderboard entry in sync whenever streak metrics update
  useEffect(() => {
    if (
      !isActive ||
      !user.isLoggedIn ||
      !user.id ||
      user.id === 'guest' ||
      user.id === 'unauthenticated' ||
      userLongestStreak < 1
    ) {
      return;
    }
    void syncUserStreakLeaderboardEntry(user);
  }, [
    isActive,
    user.isLoggedIn,
    user.id,
    user.name,
    user.nickname,
    user.avatarUrl,
    user.avatarColor,
    user.country,
    user.countryFlag,
    user.xp,
    userCurrentStreak,
    userLongestStreak,
    user.lastActiveDate,
  ]);

  // Real-time Firestore onSnapshot listener for Top 10 all-time longest streaks
  useEffect(() => {
    if (!isActive) return;

    if (!user.isLoggedIn || !user.id || user.id === 'guest' || user.id === 'unauthenticated') {
      setIsLoading(false);
      setEntries([]);
      setErrorInfo(null);
      onCurrentUserRankChange?.(null);
      return;
    }

    setIsLoading(true);
    setErrorInfo(null);

    const unsubscribe = subscribeToLongestStreakLeaderboard({
      currentUserId: user.id,
      maxEntries: 10,
      onData: (ranked) => {
        setEntries(ranked);
        setIsLoading(false);
        setErrorInfo(null);
        const me = ranked.find((item) => item.isCurrentUser);
        onCurrentUserRankChange?.(me ? me.rank : null);
      },
      onError: (err) => {
        setIsLoading(false);
        setErrorInfo(err);
        onCurrentUserRankChange?.(null);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [isActive, user.isLoggedIn, user.id, retryNonce, onCurrentUserRankChange]);

  const currentUserEntry = entries.find((entry) => entry.isCurrentUser);

  return (
    <section
      aria-label="Streak Leaderboard"
      className="rounded-2xl bg-[#090a0f]/95 border border-amber-500/35 p-4 sm:p-5 space-y-3.5 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <h4 className="text-xs sm:text-sm font-extrabold text-white">
            Streak Leaderboard
          </h4>
          {!errorInfo && user.isLoggedIn && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-400/35 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live</span>
            </span>
          )}
        </div>
        <span className="text-[10.5px] text-gray-400 flex items-center gap-1">
          <Award className="w-3 h-3 text-amber-400" aria-hidden="true" />
          <span>Top 10 longest streaks</span>
        </span>
      </div>

      {/* Signed-out prompt */}
      {!user.isLoggedIn ? (
        <div className="p-4 rounded-xl bg-[#101220] border border-white/10 text-center space-y-1.5">
          <Users className="w-5 h-5 text-amber-400 mx-auto" />
          <p className="text-xs font-semibold text-white">Sign in to view live streak records</p>
          <p className="text-[11px] text-gray-400">
            Authenticated accounts appear on the real-time Top 10 longest streak leaderboard.
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading streak leaderboard">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-12 rounded-xl bg-[#101220] border border-white/5 animate-pulse flex items-center justify-between px-3"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/10" />
                <div className="w-7 h-7 rounded-full bg-white/10" />
                <div className="space-y-1">
                  <div className="w-28 h-2.5 rounded bg-white/10" />
                  <div className="w-16 h-2 rounded bg-white/5" />
                </div>
              </div>
              <div className="w-14 h-5 rounded-lg bg-white/10" />
            </div>
          ))}
        </div>
      ) : errorInfo ? (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-amber-950/35 border border-amber-400/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-amber-200">
                {errorInfo.isPermissionError
                  ? 'Leaderboard rules pending deployment'
                  : 'Live streak leaderboard temporarily unavailable'}
              </p>
              <p className="text-[11px] text-amber-100/75 leading-snug">
                {errorInfo.isPermissionError
                  ? 'Deploy the updated Firestore security rules for the streak_leaderboard collection to enable real-time longest-streak rankings.'
                  : 'Check your network connection and retry to load the latest Top 10 longest streaks.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-bold cursor-pointer transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-4 rounded-xl bg-[#101220] border border-white/10 text-center space-y-1">
          <Trophy className="w-5 h-5 text-amber-400 mx-auto" />
          <p className="text-xs font-bold text-white">No streak records ranked yet</p>
          <p className="text-[11px] text-gray-400">
            Build your daily streak to set the #1 record on the Streak Leaderboard!
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const showPhoto =
              Boolean(entry.avatarUrl && entry.avatarUrl.startsWith('https://')) &&
              !failedAvatars[entry.userId];
            const isTopThree = entry.rank <= 3;

            return (
              <div
                key={entry.userId}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
                  entry.isCurrentUser
                    ? 'bg-amber-950/35 border-amber-400/60 shadow-[0_0_16px_rgba(251,191,36,0.18)]'
                    : isTopThree
                    ? 'bg-[#101220] border-amber-400/25'
                    : 'bg-[#101220]/75 border-white/8'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderRankIndicator(entry.rank)}

                  {showPhoto ? (
                    <img
                      src={entry.avatarUrl}
                      alt={entry.displayName}
                      onError={() =>
                        setFailedAvatars((prev) => ({ ...prev, [entry.userId]: true }))
                      }
                      className="w-8 h-8 rounded-full object-cover border border-white/15 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: entry.avatarColor || '#7c3aed' }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white border border-white/15 shrink-0"
                    >
                      {getInitials(entry.displayName)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {entry.displayName}
                      </span>
                      {entry.countryFlag && (
                        <span
                          className="text-xs leading-none shrink-0"
                          title={entry.country || undefined}
                        >
                          {entry.countryFlag}
                        </span>
                      )}
                      {entry.isCurrentUser && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 text-amber-200 shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 tabular-nums">
                      Current: {entry.currentStreak}d · Lvl {entry.level || 1}
                    </div>
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-black tabular-nums shrink-0 ${
                    entry.rank === 1
                      ? 'bg-amber-500/20 border-amber-400/55 text-amber-200'
                      : isTopThree
                      ? 'bg-orange-500/15 border-orange-400/40 text-orange-200'
                      : 'bg-[#151828] border-white/10 text-amber-300'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{entry.longestStreak}d</span>
                </div>
              </div>
            );
          })}

          {/* Subtle user rank summary footer */}
          <div className="pt-1.5 flex items-center justify-between text-[11px] text-gray-400">
            {currentUserEntry ? (
              <span className="text-amber-200 font-semibold">
                You hold #{currentUserEntry.rank} on the all-time Streak Leaderboard!
              </span>
            ) : userLongestStreak >= 1 ? (
              <span>
                Your longest streak:{' '}
                <strong className="text-amber-300 inline-flex items-center gap-0.5">
                  <Flame className="w-3 h-3 inline text-amber-400" />
                  {userLongestStreak}d
                </strong>{' '}
                — climb into the Top 10!
              </span>
            ) : (
              <span>Start a daily streak to set your personal record on the leaderboard.</span>
            )}
            <span className="text-[10px] text-gray-500 tabular-nums">
              Top {entries.length} Best Streaks
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
