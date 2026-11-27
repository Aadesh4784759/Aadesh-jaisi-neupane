import React, { useMemo, useState } from 'react';
import { CalendarDays, Flame, ShieldCheck, Sparkles, TrendingUp, Activity } from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildLast30DaysStreakHeatmap,
  HeatmapIntensityLevel,
  StreakHeatmapDayEntry,
} from '../utils/gamification';

interface StreakAnalyticsCardProps {
  user: UserProfile;
  dateCounts: Record<string, number>;
  recoveredDates: string[];
  authoritativeStreak?: number;
  timeZone?: string;
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MAINTAINED_CELL_CLASSES: Record<HeatmapIntensityLevel, string> = {
  0: 'bg-[#121422] border-white/10 text-gray-500 hover:border-white/25',
  1: 'bg-amber-900/45 border-amber-500/45 text-amber-200 hover:border-amber-400/75',
  2: 'bg-amber-700/60 border-amber-400/60 text-amber-100 hover:border-amber-300/85',
  3: 'bg-orange-500/75 border-amber-300/80 text-white shadow-[0_0_12px_rgba(249,115,22,0.28)]',
  4: 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 border-amber-200 text-white font-black shadow-[0_0_16px_rgba(251,191,36,0.45)]',
};

export const StreakAnalyticsCard: React.FC<StreakAnalyticsCardProps> = ({
  user,
  dateCounts,
  recoveredDates,
  authoritativeStreak,
  timeZone,
}) => {
  const heatmap = useMemo(
    () =>
      buildLast30DaysStreakHeatmap({
        user,
        dateCounts,
        recoveredDates,
        authoritativeStreak,
        timeZone: timeZone || user.timezone,
      }),
    [user, dateCounts, recoveredDates, authoritativeStreak, timeZone]
  );

  const [inspectedDateKey, setInspectedDateKey] = useState<string | null>(null);

  const inspectedDay: StreakHeatmapDayEntry | undefined = useMemo(() => {
    if (inspectedDateKey) {
      const found = heatmap.days.find((d) => d.date === inspectedDateKey);
      if (found) return found;
    }
    return heatmap.days[heatmap.days.length - 1];
  }, [heatmap.days, inspectedDateKey]);

  const leadingBlanks = useMemo(
    () => Array.from({ length: heatmap.leadingEmptySlots }, (_, i) => i),
    [heatmap.leadingEmptySlots]
  );

  return (
    <section
      aria-label="Streak Analytics"
      className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 space-y-4 shadow-[0_10px_30px_rgba(6,4,18,0.45)]"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/25 to-purple-500/25 border border-amber-400/40 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-amber-300" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2 flex-wrap">
              <span>Streak Analytics</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200">
                Last 30 Days
              </span>
            </h4>
            <p className="text-[11px] text-gray-400 truncate">
              30-day calendar heatmap · {heatmap.startDateKey.slice(5)} to {heatmap.endDateKey.slice(5)} ({heatmap.effectiveTimezone})
            </p>
          </div>
        </div>

        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/45 text-amber-200 tabular-nums shrink-0">
          {heatmap.consistencyRatePercent}% Consistency
        </span>
      </div>

      {/* Quick Consistency Summary Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-[#101220] border border-amber-400/25">
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
            <span>Active (30d)</span>
          </div>
          <div className="text-sm sm:text-base font-black text-white tabular-nums mt-0.5">
            {heatmap.activeDaysCount}
            <span className="text-[11px] font-semibold text-gray-400"> / 30d</span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#101220] border border-purple-400/25">
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-purple-400 shrink-0" aria-hidden="true" />
            <span>Last 7 Days</span>
          </div>
          <div className="text-sm sm:text-base font-black text-white tabular-nums mt-0.5">
            {heatmap.recent7RatePercent}%
            <span className="text-[11px] font-semibold text-purple-300/90">
              {' '}({heatmap.recent7ActiveCount}/7)
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#101220] border border-cyan-400/25">
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" aria-hidden="true" />
            <span>Top Pattern</span>
          </div>
          <div className="text-xs sm:text-sm font-extrabold text-white truncate mt-1 tabular-nums">
            {heatmap.peakDay
              ? `${heatmap.peakDay.shortLabel} (${heatmap.peakDay.count}x)`
              : 'No logs yet'}
          </div>
        </div>
      </div>

      {/* 30-Day Calendar Heatmap Grid (Sun-Sat Alignment) */}
      <div className="p-3 rounded-xl bg-[#0d0f1b] border border-white/10 space-y-2.5">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAY_HEADERS.map((wd) => (
            <div
              key={wd}
              className={`text-[10px] font-bold uppercase tracking-wider ${
                heatmap.strongestWeekday === wd ? 'text-amber-300' : 'text-gray-500'
              }`}
            >
              {wd}
            </div>
          ))}
        </div>

        <div
          role="grid"
          aria-label="Last 30 days streak calendar heatmap"
          className="grid grid-cols-7 gap-1.5"
        >
          {leadingBlanks.map((blankIdx) => (
            <div
              key={`blank-${blankIdx}`}
              aria-hidden="true"
              className="h-9 sm:h-10 rounded-lg bg-transparent"
            />
          ))}

          {heatmap.days.map((day) => {
            const isSelected = inspectedDay?.date === day.date;
            const cellStyle =
              day.status === 'recovered'
                ? 'bg-cyan-500/35 border-cyan-400/75 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                : MAINTAINED_CELL_CLASSES[day.intensity];

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setInspectedDateKey(day.date)}
                onMouseEnter={() => setInspectedDateKey(day.date)}
                aria-label={`${day.shortLabel} (${day.dayLabel}): ${
                  day.status === 'recovered'
                    ? 'Recovered streak day'
                    : day.status === 'maintained'
                    ? `${day.count} active interactions`
                    : 'No streak activity'
                }`}
                aria-pressed={isSelected}
                title={`${day.shortLabel} (${day.dayLabel}) · ${
                  day.status === 'recovered'
                    ? 'Recovered'
                    : day.status === 'maintained'
                    ? `${day.count} ${day.count === 1 ? 'action' : 'actions'}`
                    : 'Inactive'
                }`}
                className={`relative h-9 sm:h-10 rounded-lg border text-[11px] font-bold tabular-nums flex flex-col items-center justify-center transition-all cursor-pointer ${cellStyle} ${
                  isSelected
                    ? 'ring-2 ring-purple-300 ring-offset-1 ring-offset-[#0d0f1b] scale-[1.03]'
                    : day.isToday
                    ? 'ring-1 ring-white/60'
                    : ''
                }`}
              >
                <span className="leading-none">{day.dayOfMonth}</span>
                {day.status === 'recovered' ? (
                  <ShieldCheck className="w-2.5 h-2.5 text-cyan-200 mt-0.5" aria-hidden="true" />
                ) : day.count > 1 ? (
                  <span className="text-[8.5px] leading-none opacity-85 mt-0.5">
                    {day.count}x
                  </span>
                ) : null}
                {day.isToday && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Details & Heatmap Legend */}
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {inspectedDay && (
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays className="w-3.5 h-3.5 text-purple-300 shrink-0" aria-hidden="true" />
              <span className="font-bold text-white">
                {inspectedDay.shortLabel} ({inspectedDay.dayLabel})
                {inspectedDay.isToday ? ' · Today' : ''}:
              </span>
              <span
                className={
                  inspectedDay.status === 'recovered'
                    ? 'text-cyan-300 font-semibold'
                    : inspectedDay.status === 'maintained'
                    ? 'text-amber-300 font-semibold'
                    : 'text-gray-400'
                }
              >
                {inspectedDay.status === 'recovered'
                  ? `Recovered (${inspectedDay.count} ${inspectedDay.count === 1 ? 'action' : 'actions'})`
                  : inspectedDay.status === 'maintained'
                  ? `Active · ${inspectedDay.count} ${inspectedDay.count === 1 ? 'interaction' : 'interactions'}`
                  : 'No activity recorded'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0">
            <span>Less</span>
            <span className="w-3 h-3 rounded bg-[#121422] border border-white/15" title="0 actions" />
            <span className="w-3 h-3 rounded bg-amber-900/50 border border-amber-500/45" title="1–2 actions" />
            <span className="w-3 h-3 rounded bg-amber-700/65 border border-amber-400/60" title="3–5 actions" />
            <span className="w-3 h-3 rounded bg-orange-500/80 border border-amber-300/80" title="6–10 actions" />
            <span className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-rose-500 border border-amber-200" title="11+ actions" />
            <span>More</span>
            <span className="mx-1 text-gray-600">|</span>
            <span className="w-3 h-3 rounded bg-cyan-500/40 border border-cyan-400/75" title="Recovered day" />
            <span className="text-cyan-300">Recovered</span>
          </div>
        </div>
      </div>

      {heatmap.strongestWeekday && (
        <p className="text-[11px] text-gray-400 leading-snug">
          Most consistent day of the week over the past 30 days:{' '}
          <span className="text-amber-300 font-bold">{heatmap.strongestWeekday}</span> ·{' '}
          <span className="text-purple-200 font-semibold tabular-nums">
            {heatmap.totalInteractions} total interactions
          </span>{' '}
          logged.
        </p>
      )}
    </section>
  );
};
