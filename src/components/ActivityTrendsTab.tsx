import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Activity,
  Clock,
  Download,
  Languages,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import { ChatSession, EngagementMetrics, UserProfile } from '../types';
import {
  buildActivityTrendsCsv,
  buildLast30DaysActivityTrends,
  UserAnalyticsEventRecord,
} from '../utils/activityTrends';

interface ActivityTrendsTabProps {
  sessions: ChatSession[];
  metrics: EngagementMetrics;
  user?: UserProfile;
  analyticsEvents: UserAnalyticsEventRecord[];
  isLoadingEvents?: boolean;
}

type TrendWindowDays = 7 | 14 | 30;

export const ActivityTrendsTab: React.FC<ActivityTrendsTabProps> = ({
  sessions,
  metrics,
  user,
  analyticsEvents,
  isLoadingEvents = false,
}) => {
  const [windowDays, setWindowDays] = useState<TrendWindowDays>(30);

  const trends = useMemo(
    () =>
      buildLast30DaysActivityTrends({
        sessions,
        analyticsEvents,
        metrics,
        timeZone: user?.timezone,
        daysCount: windowDays,
      }),
    [sessions, analyticsEvents, metrics, user?.timezone, windowDays]
  );

  const handleDownloadTrendsCsv = () => {
    const csv = buildActivityTrendsCsv(trends.days);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aadesh-ai-activity-trends-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5" aria-label="Activity Trends">
      {/* Toolbar Header */}
      <div className="v2-neu-card rounded-3xl p-4 sm:p-5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-white">
            <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{windowDays}-Day Activity &amp; Performance Trends</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-purple-200/75">
            <span>Timezone: {trends.timeZone}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{trends.summary.activeDays} active days in window</span>
            <span aria-hidden="true">·</span>
            <span>Real conversation &amp; telemetry history</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Trend window range"
            className="flex items-center gap-1 p-1 v2-neu-inset rounded-xl border border-white/10"
          >
            {([30, 14, 7] as const).map((daysOption) => (
              <button
                key={daysOption}
                type="button"
                onClick={() => setWindowDays(daysOption)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  windowDays === daysOption
                    ? 'electric-purple-btn text-white'
                    : 'text-purple-200/75 hover:text-white'
                }`}
              >
                {daysOption} Days
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleDownloadTrendsCsv}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-bold text-purple-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-300" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 4-Column Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="v2-neu-card rounded-2xl p-4 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Messages ({windowDays}d)</span>
            <MessageSquare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {trends.summary.totalMessages.toLocaleString()}
          </div>
          <div className="text-[11px] text-purple-200/70 tabular-nums">
            {trends.summary.totalUserMessages} sent · {trends.summary.totalAiMessages} AI replies
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Avg Response Time</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {trends.summary.overallAvgResponseMs > 0
              ? `${trends.summary.overallAvgResponseMs.toLocaleString()} ms`
              : '0 ms'}
          </div>
          <div className="text-[11px] text-indigo-300/80 tabular-nums">
            Across {trends.summary.totalTimedResponses} timed responses
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Translation Usage</span>
            <Languages className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {trends.summary.totalTranslations.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-300/80 tabular-nums">
            {trends.summary.translationRatePercent}% of message volume
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Peak Active Day</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {trends.summary.peakDayMessages > 0 ? trends.summary.peakDayLabel : 'No activity'}
          </div>
          <div className="text-[11px] text-amber-300/85 tabular-nums">
            {trends.summary.peakDayMessages} messages recorded
          </div>
        </div>
      </div>

      {isLoadingEvents && (
        <div className="v2-neu-card rounded-2xl p-4 border border-white/10 space-y-2 animate-pulse">
          <div className="h-4 w-48 rounded bg-white/10" />
          <div className="h-32 w-full rounded bg-white/5" />
        </div>
      )}

      {!isLoadingEvents && !trends.hasAnyActivity && (
        <div className="v2-neu-card rounded-2xl p-5 border border-white/10 text-xs text-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            No conversation messages, latency samples, or translations have been recorded during the last {windowDays} days yet. Send a message or translate text to populate daily trends.
          </span>
          <span className="font-mono text-[11px] text-sky-300 tabular-nums shrink-0">
            0 events / {windowDays}d
          </span>
        </div>
      )}

      {/* Chart 1: Daily Message Counts & Translation Usage */}
      <section className="v2-neu-card rounded-3xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Daily Message Counts &amp; Translation Usage
            </h2>
            <p className="text-[11px] text-purple-200/70">
              Combined daily chat activity compared against translated messages and tool translations.
            </p>
          </div>
          <span className="text-xs text-sky-300 font-semibold tabular-nums">
            Last {windowDays} days
          </span>
        </div>

        <div className="h-72 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trends.days} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Bar
                dataKey="messages"
                name="Daily Messages"
                fill="#38bdf8"
                radius={[6, 6, 0, 0]}
                maxBarSize={24}
              />
              <Line
                type="monotone"
                dataKey="translations"
                name="Translations Used"
                stroke="#34d399"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#34d399' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Chart 2: Average Response Time (ms) Over Last 30 Days */}
      <section className="v2-neu-card rounded-3xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Average AI Response Time (ms)
            </h2>
            <p className="text-[11px] text-purple-200/70">
              Mean generation latency per active day measured across recorded AI replies.
            </p>
          </div>
          <span className="text-xs text-purple-200/80 font-mono tabular-nums">
            Mean: {trends.summary.overallAvgResponseMs} ms
          </span>
        </div>

        <div className="h-64 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends.days} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="trendLatencyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                unit=" ms"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                }}
                formatter={(value: unknown) => [`${Number(value || 0).toLocaleString()} ms`, 'Avg Response Time']}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Area
                type="monotone"
                dataKey="avgResponseMs"
                name="Average Response Time (ms)"
                stroke="#a78bfa"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#trendLatencyFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};
