import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  ShieldCheck,
  X as XIcon,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildStreakCalendarMonth,
  getDatePartsInTimezone,
  isStreakRecoveryEligible,
  NEPAL_TIMEZONE,
  resolveEffectiveStreakTimezone,
  StreakCalendarDayEntry,
} from '../utils/gamification';

type CalendarFilter = 'all' | 'maintained' | 'recovered' | 'missed';

interface StreakCalendarProps {
  user: UserProfile;
  dateCounts: Record<string, number>;
  recoveredDates: string[];
  logSource: 'firestore' | 'local';
  isSyncing?: boolean;
  onRecoverStreak?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function formatReadableDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(utcDate);
  } catch {
    return dateKey;
  }
}

export const StreakCalendar: React.FC<StreakCalendarProps> = ({
  user,
  dateCounts,
  recoveredDates,
  logSource,
  isSyncing = false,
  onRecoverStreak,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const tz = useMemo(
    () => resolveEffectiveStreakTimezone(user.timezone),
    [user.timezone]
  );
  const initialToday = useMemo(() => getDatePartsInTimezone(Date.now(), tz), [tz]);

  const [viewYear, setViewYear] = useState<number>(initialToday.year);
  const [viewMonth, setViewMonth] = useState<number>(initialToday.month);
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>('all');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(initialToday.dateKey);
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [tappedTooltipDateKey, setTappedTooltipDateKey] = useState<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Dismiss tap tooltip on outside click or Escape key
  useEffect(() => {
    if (!tappedTooltipDateKey) return;
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (
        gridContainerRef.current &&
        event.target instanceof Node &&
        !gridContainerRef.current.contains(event.target)
      ) {
        setTappedTooltipDateKey(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTappedTooltipDateKey(null);
        setHoveredDateKey(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tappedTooltipDateKey]);

  // Merge Firestore logs with local streakHistory so recent activity & recovered entries reflect immediately
  const mergedDateCounts = useMemo<Record<string, number>>(() => {
    const merged: Record<string, number> = { ...dateCounts };
    (user.streakHistory || []).forEach((day) => {
      if ((day.completed || day.status === 'maintained') && day.date && day.status !== 'recovered') {
        merged[day.date] = Math.max(merged[day.date] || 0, day.activityCount || 1);
      }
    });
    if (user.lastActiveDate) {
      merged[user.lastActiveDate] = Math.max(merged[user.lastActiveDate] || 0, 1);
    }
    return merged;
  }, [dateCounts, user.streakHistory, user.lastActiveDate]);

  const mergedRecoveredDates = useMemo<string[]>(() => {
    const historyRecovered = (user.streakHistory || [])
      .filter((day) => day.status === 'recovered' && Boolean(day.date))
      .map((day) => day.date);
    return Array.from(
      new Set([...(recoveredDates || []), ...(user.recoveredDates || []), ...historyRecovered])
    ).sort();
  }, [recoveredDates, user.recoveredDates, user.streakHistory]);

  const historyMissedDates = useMemo<string[]>(() => {
    return Array.from(
      new Set(
        (user.streakHistory || [])
          .filter((day) => (day.status === 'missed' || (!day.completed && day.status !== 'recovered')) && Boolean(day.date))
          .map((day) => day.date)
      )
    ).sort();
  }, [user.streakHistory]);

  const monthData = useMemo(() => {
    return buildStreakCalendarMonth({
      year: viewYear,
      month: viewMonth,
      dateCounts: mergedDateCounts,
      recoveredDates: mergedRecoveredDates,
      missedDates: historyMissedDates,
      timeZone: tz,
      authoritativeStreak: user.currentStreak ?? user.streakDays,
      lastActiveDate: user.lastActiveDate,
      streakBrokenDate: user.streakBrokenDate,
      streakBeforeBreak: user.streakBeforeBreak,
      accountCreatedAtMs: user.createdAt,
    });
  }, [
    viewYear,
    viewMonth,
    mergedDateCounts,
    mergedRecoveredDates,
    historyMissedDates,
    tz,
    user.currentStreak,
    user.streakDays,
    user.lastActiveDate,
    user.streakBrokenDate,
    user.streakBeforeBreak,
    user.createdAt,
  ]);

  const recoveryEligibility = useMemo(
    () => isStreakRecoveryEligible(user, Date.now(), tz),
    [user, tz]
  );

  // Keep selectedDateKey inside the viewed month when navigating months
  useEffect(() => {
    const existsInMonth = monthData.days.some((d) => d.date === selectedDateKey);
    if (!existsInMonth) {
      if (monthData.isCurrentMonth) {
        setSelectedDateKey(monthData.todayKey);
      } else {
        const lastNotable = [...monthData.days]
          .reverse()
          .find((d) => d.status === 'maintained' || d.status === 'recovered' || d.status === 'missed');
        setSelectedDateKey(lastNotable?.date || monthData.days[0]?.date || monthData.todayKey);
      }
    }
  }, [monthData, selectedDateKey]);

  const selectedDay: StreakCalendarDayEntry | undefined = useMemo(
    () => monthData.days.find((d) => d.date === selectedDateKey) || monthData.days[0],
    [monthData.days, selectedDateKey]
  );

  const canGoNext =
    viewYear < initialToday.year ||
    (viewYear === initialToday.year && viewMonth < initialToday.month);

  const handlePrevMonth = () => {
    setTappedTooltipDateKey(null);
    setHoveredDateKey(null);
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setTappedTooltipDateKey(null);
    setHoveredDateKey(null);
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    setTappedTooltipDateKey(null);
    setHoveredDateKey(null);
    setViewYear(initialToday.year);
    setViewMonth(initialToday.month);
    setSelectedDateKey(initialToday.dateKey);
  };

  const filterButtons: Array<{ id: CalendarFilter; label: string; count?: number }> = [
    { id: 'all', label: 'All' },
    { id: 'maintained', label: 'Maintained', count: monthData.maintainedCount },
    { id: 'recovered', label: 'Recovered', count: monthData.recoveredCount },
    { id: 'missed', label: 'Missed', count: monthData.missedCount },
  ];

  const getStatusCopy = (day: StreakCalendarDayEntry) => {
    switch (day.status) {
      case 'maintained':
        return {
          badge: 'Maintained',
          title: 'Streak Maintained',
          colorClass: 'text-amber-300',
          dotClass: 'bg-amber-400',
          detail:
            day.count > 1
              ? `${day.count} interactions logged (+1 day earned)`
              : 'App opened & daily streak earned (+1)',
        };
      case 'recovered':
        return {
          badge: 'Recovered',
          title: 'Streak Recovered',
          colorClass: 'text-cyan-300',
          dotClass: 'bg-cyan-400',
          detail: 'Missed day restored via monthly recovery (max 5/mo)',
        };
      case 'missed':
        return {
          badge: 'Missed',
          title: 'Streak Missed',
          colorClass: 'text-rose-300',
          dotClass: 'bg-rose-400',
          detail:
            day.isPartOfCurrentBreak && recoveryEligibility.eligible
              ? 'No app open — eligible for streak recovery'
              : 'No app open on this Nepal calendar day (reset to 0)',
        };
      case 'future':
        return {
          badge: 'Upcoming',
          title: 'Upcoming Date',
          colorClass: 'text-gray-400',
          dotClass: 'bg-gray-500',
          detail: 'Open the app on this Nepal day for +1 streak',
        };
      case 'inactive':
      default:
        return {
          badge: day.isToday ? 'Today · Pending' : 'Not Tracked',
          title: day.isToday ? 'Today · Awaiting Activity' : 'No Recorded Activity',
          colorClass: day.isToday ? 'text-purple-300' : 'text-gray-400',
          dotClass: day.isToday ? 'bg-purple-400' : 'bg-gray-500',
          detail: day.isToday
            ? 'Open app or chat today to mark maintained (+1)'
            : 'Before first tracked activity date',
        };
    }
  };

  const activeTooltipDate = hoveredDateKey || tappedTooltipDateKey;

  return (
    <section
      aria-label="Monthly Streak Calendar"
      className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 space-y-4 shadow-[0_12px_36px_rgba(6,4,18,0.55)]"
    >
      {/* Header Row: Title + Month Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span>Monthly Streak Calendar</span>
          </h4>
          <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>Past active days &amp; consistency overview</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-amber-200/90 font-medium">
              <Clock className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
              <span>
                {tz === NEPAL_TIMEZONE ? 'Nepal Time (UTC+5:45)' : `Local Time (${tz})`}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isSyncing
                ? 'Syncing logs...'
                : logSource === 'firestore'
                ? 'Firestore logs'
                : 'Local history'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {!monthData.isCurrentMonth && (
            <button
              type="button"
              onClick={handleJumpToday}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-purple-200 hover:text-white bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-9 h-9 rounded-xl bg-[#121422] hover:bg-purple-950/60 border border-white/10 hover:border-purple-400/45 text-gray-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[122px] text-center text-xs sm:text-sm font-bold text-white tabular-nums select-none">
            {monthData.monthLabel}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={!canGoNext}
            aria-label="Next month"
            className="w-9 h-9 rounded-xl bg-[#121422] hover:bg-purple-950/60 border border-white/10 hover:border-purple-400/45 text-gray-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quiet Unboxed Summary Metadata + Interactive Pattern Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-300 tabular-nums">
          <span className="text-amber-300 font-semibold">{monthData.maintainedCount} maintained</span>
          <span className="text-gray-600" aria-hidden="true">·</span>
          <span className="text-cyan-300 font-semibold">{monthData.recoveredCount} recovered</span>
          <span className="text-gray-600" aria-hidden="true">·</span>
          <span className="text-rose-300 font-semibold">{monthData.missedCount} missed</span>
          <span className="text-gray-600" aria-hidden="true">·</span>
          <span className="text-gray-300 font-medium">{monthData.consistencyPercent}% consistency</span>
        </div>

        {/* Interactive Pattern Filter Segmented Control */}
        <div
          role="group"
          aria-label="Filter calendar by streak status"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#121422] border border-white/10 self-start sm:self-auto"
        >
          {filterButtons.map((btn) => {
            const isActive = activeFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setActiveFilter(btn.id)}
                aria-pressed={isActive}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                  isActive
                    ? 'bg-purple-600/35 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 7-Column Calendar Month Grid */}
      <div ref={gridContainerRef} className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((dayName) => (
            <div
              key={dayName}
              className="text-[10px] font-bold uppercase tracking-wider text-gray-400 py-1 select-none"
            >
              {dayName}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 relative" role="grid" aria-label={monthData.monthLabel}>
          {Array.from({ length: monthData.leadingEmptySlots }).map((_, idx) => (
            <div key={`empty-${idx}`} aria-hidden="true" className="min-h-[46px] sm:min-h-[52px]" />
          ))}

          {monthData.days.map((day, idx) => {
            const isSelected = selectedDay?.date === day.date;
            const isTooltipVisible = activeTooltipDate === day.date;
            const matchesFilter =
              activeFilter === 'all' || day.status === activeFilter;

            const gridCellIndex = monthData.leadingEmptySlots + idx;
            const rowIndex = Math.floor(gridCellIndex / 7);
            const colIndex = gridCellIndex % 7;
            const placeBelow = rowIndex < 2;
            const horizontalPosClass =
              colIndex === 0
                ? 'left-0'
                : colIndex === 6
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2';
            const caretPosClass =
              colIndex === 0
                ? 'left-4'
                : colIndex === 6
                ? 'right-4'
                : 'left-1/2 -translate-x-1/2';

            const statusCopy = getStatusCopy(day);
            const tooltipId = `streak-cal-tooltip-${day.date}`;

            // Distinct visual states: solid color for maintained, faded color for missed, distinct icon + cyan ring for recovered
            const tileStyle = (() => {
              switch (day.status) {
                case 'maintained':
                  return 'bg-amber-500 border-amber-300 text-[#090a0f] hover:bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.34)]';
                case 'recovered':
                  return 'bg-cyan-500/20 border-cyan-400/80 text-cyan-50 hover:border-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.26)]';
                case 'missed':
                  return 'bg-rose-950/20 border-rose-500/20 text-rose-200/45 hover:border-rose-400/50 hover:text-rose-200/80';
                case 'future':
                  return 'bg-[#0b0d16]/50 border-white/[0.04] text-gray-600 hover:border-white/15';
                case 'inactive':
                default:
                  return day.isToday
                    ? 'bg-purple-950/40 border-purple-400/60 text-white hover:border-purple-300'
                    : 'bg-[#0c0e18]/70 border-white/[0.06] text-gray-500 hover:border-white/20';
              }
            })();

            return (
              <div
                key={day.date}
                className={`relative ${isTooltipVisible ? 'z-30' : isSelected ? 'z-10' : 'z-0'}`}
                onMouseEnter={() => setHoveredDateKey(day.date)}
                onMouseLeave={() =>
                  setHoveredDateKey((prev) => (prev === day.date ? null : prev))
                }
              >
                <motion.button
                  type="button"
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                  onFocus={() => setHoveredDateKey(day.date)}
                  onBlur={() =>
                    setHoveredDateKey((prev) => (prev === day.date ? null : prev))
                  }
                  onClick={() => {
                    setSelectedDateKey(day.date);
                    setTappedTooltipDateKey((prev) => (prev === day.date ? null : day.date));
                  }}
                  aria-pressed={isSelected}
                  aria-describedby={isTooltipVisible ? tooltipId : undefined}
                  aria-label={`${formatReadableDate(day.date)}: ${statusCopy.badge}`}
                  className={`relative w-full min-h-[46px] sm:min-h-[52px] rounded-xl border p-1.5 flex flex-col items-center justify-between transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${tileStyle} ${
                    day.isToday
                      ? day.status === 'maintained'
                        ? 'ring-2 ring-amber-200'
                        : 'ring-1 ring-purple-400/90'
                      : ''
                  } ${isSelected ? 'ring-2 ring-white/90' : ''} ${
                    matchesFilter
                      ? day.status === 'missed'
                        ? 'opacity-75 hover:opacity-100'
                        : 'opacity-100'
                      : 'opacity-20'
                  }`}
                >
                  <span className="text-[11px] font-mono font-extrabold tabular-nums leading-none">
                    {day.dayOfMonth}
                  </span>

                  <div className="flex items-center justify-center my-0.5" aria-hidden="true">
                    {day.status === 'maintained' && (
                      <Flame className="w-3.5 h-3.5 fill-[#090a0f] text-[#090a0f]" />
                    )}
                    {day.status === 'recovered' && (
                      <ShieldCheck className="w-4 h-4 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                    )}
                    {day.status === 'missed' && (
                      <XIcon className="w-3 h-3 text-rose-400/55" />
                    )}
                    {day.status === 'inactive' && day.isToday && (
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    )}
                    {(day.status === 'future' || (day.status === 'inactive' && !day.isToday)) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    )}
                  </div>

                  {/* Subtle activity intensity indicator for maintained days */}
                  <div className="h-1 flex items-center gap-0.5" aria-hidden="true">
                    {day.status === 'maintained' && day.count >= 2 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[#090a0f]/80" />
                        {day.count >= 4 && <span className="w-1 h-1 rounded-full bg-[#090a0f]/80" />}
                        {day.count >= 8 && <span className="w-1 h-1 rounded-full bg-[#090a0f]" />}
                      </>
                    )}
                  </div>
                </motion.button>

                {/* Interactive Hover / Tap Tooltip */}
                <AnimatePresence>
                  {isTooltipVisible && (
                    <motion.div
                      id={tooltipId}
                      role="tooltip"
                      initial={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: placeBelow ? -4 : 4, scale: 0.96 }
                      }
                      animate={
                        prefersReducedMotion
                          ? { opacity: 1 }
                          : { opacity: 1, y: 0, scale: 1 }
                      }
                      exit={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: placeBelow ? -3 : 3, scale: 0.97 }
                      }
                      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                      className={`pointer-events-none absolute z-40 w-44 sm:w-48 rounded-xl bg-[#0e101c]/95 border border-purple-400/45 shadow-[0_14px_34px_rgba(0,0,0,0.75)] backdrop-blur-md px-3 py-2 text-left ${
                        placeBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                      } ${horizontalPosClass}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute w-2.5 h-2.5 rotate-45 bg-[#0e101c] border-purple-400/45 ${caretPosClass} ${
                          placeBelow
                            ? '-top-1.5 border-l border-t'
                            : '-bottom-1.5 border-r border-b'
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-white">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusCopy.dotClass}`} />
                          <span className={statusCopy.colorClass}>{statusCopy.badge}</span>
                        </span>
                        {day.isToday && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-white mt-0.5 tabular-nums">
                        {formatReadableDate(day.date)}
                      </div>
                      <p className="text-[10px] text-gray-300/90 leading-snug mt-0.5">
                        {statusCopy.detail}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Inspector */}
      {selectedDay && (
        <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-white">{formatReadableDate(selectedDay.date)}</span>
              <span className="text-gray-600" aria-hidden="true">·</span>
              <span className={`font-semibold ${getStatusCopy(selectedDay).colorClass}`}>
                {getStatusCopy(selectedDay).badge}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              {getStatusCopy(selectedDay).detail}
            </p>
          </div>

          {selectedDay.isPartOfCurrentBreak && recoveryEligibility.eligible && onRecoverStreak && (
            <button
              type="button"
              onClick={onRecoverStreak}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-extrabold text-[11px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recover Streak</span>
            </button>
          )}
        </div>
      )}

      {/* Minimal Legend Row */}
      <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 border border-amber-300 inline-block" aria-hidden="true" />
            <span>Maintained</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
            <span>Recovered</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-950/35 border border-rose-500/30 opacity-75 inline-block" aria-hidden="true" />
            <span>Missed</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-purple-400/90 inline-block" aria-hidden="true" />
            <span>Today</span>
          </span>
        </div>

        <span className="text-[10.5px] text-gray-500 tabular-nums">
          {monthData.totalInteractions} logged · Tap or hover any day
        </span>
      </div>
    </section>
  );
};
