import React, { useMemo } from 'react';
import {
  BarChart3,
  Globe,
  Mic,
  Clock,
  Flame,
  Languages,
  Sparkles,
  Download,
  Smile,
  Compass,
  Zap,
  MessageSquare,
  ThumbsUp,
  Cpu,
} from 'lucide-react';
import { ChatSession, EngagementMetrics, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface AnalyticsDashboardProps {
  metrics: EngagementMetrics;
  sessions?: ChatSession[];
  user?: UserProfile;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  metrics,
  sessions = [],
  user,
}) => {
  // Compute real conversation, token, feedback, and latency stats from sessions
  const conversationInsights = useMemo(() => {
    let totalMessages = 0;
    let userMessages = 0;
    let aiMessages = 0;
    let totalChars = 0;
    let totalWords = 0;
    let thumbsUp = 0;
    let thumbsDown = 0;
    let latencySum = 0;
    let latencyCount = 0;
    const categoryCounts: Record<string, number> = {};

    for (const s of sessions) {
      const cat = s.category || 'General';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      for (const m of s.messages) {
        totalMessages += 1;
        if (m.role === 'user') userMessages += 1;
        else if (m.role === 'model') aiMessages += 1;
        const text = `${m.content || ''} ${m.translation || ''}`.trim();
        totalChars += text.length;
        if (text) {
          totalWords += text.split(/\s+/).filter(Boolean).length;
        }
        if (m.feedback === 'up') thumbsUp += 1;
        if (m.feedback === 'down') thumbsDown += 1;
        if (typeof m.latencyMs === 'number' && m.latencyMs > 0) {
          latencySum += m.latencyMs;
          latencyCount += 1;
        }
      }
    }

    const estimatedTokens = Math.ceil(totalChars / 4);
    const avgSessionLength = sessions.length > 0 ? (totalMessages / sessions.length).toFixed(1) : '0';
    const avgModelLatency =
      latencyCount > 0 ? Math.round(latencySum / latencyCount) : metrics.avgLatencyMs;
    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      totalConversations: sessions.length,
      totalMessages,
      userMessages,
      aiMessages,
      totalWords,
      estimatedTokens,
      thumbsUp,
      thumbsDown,
      avgSessionLength,
      avgModelLatency,
      topCategories,
    };
  }, [sessions, metrics.avgLatencyMs]);

  const textQueries = Math.max(
    0,
    metrics.totalQueries - (metrics.totalVoiceQueries + metrics.totalImageQueries)
  );
  const totalModality = Math.max(1, metrics.totalQueries);
  const voicePercent = Math.round((metrics.totalVoiceQueries / totalModality) * 100);
  const imagePercent = Math.round((metrics.totalImageQueries / totalModality) * 100);
  const textPercent = Math.max(0, 100 - (voicePercent + imagePercent));

  const totalLangUsage = Object.values(metrics.languageCounts).reduce((a, b) => a + b, 0) || 1;
  const sortedLanguages = Object.entries(metrics.languageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const sortedRegions = Object.entries(metrics.regionalActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const maxHourly = Math.max(...metrics.hourlyActivity, 1);
  const totalSentiment =
    Object.values(metrics.sentimentCounts).reduce((a, b) => a + b, 0) || 1;

  const handleExportCSV = () => {
    let csv = 'Metric,Value\n';
    csv += `Total Conversations,${conversationInsights.totalConversations}\n`;
    csv += `Total Messages,${conversationInsights.totalMessages}\n`;
    csv += `Estimated Tokens,${conversationInsights.estimatedTokens}\n`;
    csv += `Total Words,${conversationInsights.totalWords}\n`;
    csv += `Total Queries,${metrics.totalQueries}\n`;
    csv += `Voice Queries,${metrics.totalVoiceQueries}\n`;
    csv += `Image Queries,${metrics.totalImageQueries}\n`;
    csv += `Translations Executed,${metrics.totalTranslations}\n`;
    csv += `Average Latency (ms),${conversationInsights.avgModelLatency}\n`;
    csv += `Daily Streak,${user?.streakDays || 1}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aadesh-ai-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {/* Top Banner */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span>AI &amp; Usage Intelligence</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Analysis Dashboard</h1>
          <p className="text-xs text-purple-200/75">
            AI response analysis, conversation insights, usage statistics, daily activity, and token estimates.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="min-h-[42px] px-4 py-2 rounded-2xl bg-purple-600/25 hover:bg-purple-600/45 border border-purple-400/40 text-purple-100 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV Report</span>
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card rounded-2xl p-4 border border-purple-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Conversations</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.totalConversations}
          </div>
          <div className="text-[11px] text-purple-300/80 tabular-nums">
            {conversationInsights.totalMessages} msgs · avg {conversationInsights.avgSessionLength}/chat
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-violet-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Token Usage (Est.)</span>
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.estimatedTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-violet-300/80 tabular-nums">
            {conversationInsights.totalWords.toLocaleString()} total words processed
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-fuchsia-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Response Latency</span>
            <Clock className="w-4 h-4 text-fuchsia-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.avgModelLatency} ms
          </div>
          <div className="text-[11px] text-fuchsia-300/80 tabular-nums">
            {metrics.totalQueries} total Gemini queries
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-amber-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Daily Streak</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            🔥 {user?.streakDays || 1}d
          </div>
          <div className="text-[11px] text-amber-300/85 tabular-nums">
            {(user?.xp || 0).toLocaleString()} XP · Best {user?.longestStreak || 1}d
          </div>
        </div>
      </div>

      {/* AI Response Analysis & Daily Streak Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AI Response & Conversation Breakdown */}
        <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">AI Response &amp; Conversation Analysis</h2>
            </div>
            <span className="text-xs text-purple-300/75 tabular-nums">
              {conversationInsights.aiMessages} AI replies
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-white/10 text-center">
              <div className="text-[10px] font-bold uppercase text-purple-300">User Prompts</div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {conversationInsights.userMessages}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-white/10 text-center">
              <div className="text-[10px] font-bold uppercase text-emerald-300 flex items-center justify-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Helpful</span>
              </div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {conversationInsights.thumbsUp}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-white/10 text-center">
              <div className="text-[10px] font-bold uppercase text-violet-300 flex items-center justify-center gap-1">
                <Languages className="w-3 h-3" />
                <span>Translated</span>
              </div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {metrics.totalTranslations}
              </div>
            </div>
          </div>

          {/* Modality Bar */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-purple-200/80">
              <span>Input Modality Split</span>
              <span className="tabular-nums">
                Text {textPercent}% · Voice {voicePercent}% · Vision {imagePercent}%
              </span>
            </div>
            <div className="h-3 w-full bg-[#090614] rounded-full overflow-hidden flex border border-white/10">
              <div style={{ width: `${textPercent}%` }} className="bg-purple-500 h-full" />
              <div style={{ width: `${voicePercent}%` }} className="bg-violet-400 h-full" />
              <div style={{ width: `${imagePercent}%` }} className="bg-fuchsia-400 h-full" />
            </div>
          </div>

          {/* Sentiment */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="text-purple-200 flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-amber-400" />
              <span>Positive Sentiment Rate</span>
            </span>
            <span className="font-bold text-emerald-300 tabular-nums">
              {Math.round((metrics.sentimentCounts.positive / totalSentiment) * 100)}%
            </span>
          </div>
        </div>

        {/* Daily Activity & Streak History */}
        <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">Daily Activity &amp; Peak Hours</h2>
            </div>
            <span className="text-xs text-purple-300/75">24h usage</span>
          </div>

          {user?.streakHistory && user.streakHistory.length > 0 && (
            <div className="grid grid-cols-7 gap-1.5">
              {user.streakHistory.slice(-7).map((day) => (
                <div
                  key={day.date}
                  className={`p-2 rounded-xl border text-center ${
                    day.completed
                      ? 'bg-purple-600/35 border-purple-400/50 text-white'
                      : 'bg-[#0b0818]/75 border-white/10 text-purple-300/60'
                  }`}
                >
                  <div className="text-[10px] font-bold">{day.dayLabel}</div>
                  <div className="text-xs font-black mt-0.5 tabular-nums">
                    {day.completed ? '🔥' : '·'} {day.activityCount}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 24-Hour Peak Chart */}
          <div className="h-28 flex items-end justify-between gap-1 pt-2">
            {metrics.hourlyActivity.map((count, hour) => {
              const heightPercent = Math.max(8, Math.round((count / maxHourly) * 100));
              const isCurrentHour = new Date().getHours() === hour;
              return (
                <div
                  key={hour}
                  title={`${hour}:00 — ${count} queries`}
                  className="flex-1 h-full flex items-end"
                >
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-sm transition-all ${
                      isCurrentHour
                        ? 'bg-gradient-to-t from-purple-500 to-fuchsia-400 shadow-[0_0_12px_rgba(168,85,247,0.6)]'
                        : 'bg-purple-800/50 hover:bg-purple-500'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-purple-300/65 border-t border-white/5 pt-2 tabular-nums">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>

      {/* Language Breakdown & Conversation Categories / Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">Language Usage</h2>
            </div>
            <span className="text-xs text-purple-300/75">Top Languages</span>
          </div>

          <div className="space-y-2.5">
            {sortedLanguages.map(([code, count]) => {
              const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === code);
              const pct = Math.round((count / totalLangUsage) * 100);
              return (
                <div key={code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-100 font-medium flex items-center gap-2">
                      <span>{langObj?.flag || '🌐'}</span>
                      <span>{langObj?.name || code.toUpperCase()}</span>
                    </span>
                    <span className="text-purple-300 font-semibold tabular-nums">
                      {pct}% ({count})
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#090614] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">Topics &amp; Regional Insights</h2>
            </div>
            <span className="text-xs text-purple-300/75">
              <Mic className="w-3.5 h-3.5 inline mr-1" />
              {metrics.totalVoiceQueries} voice
            </span>
          </div>

          <div className="space-y-2">
            {sortedRegions.map(([region, count], idx) => (
              <div
                key={region}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0b0818]/75 border border-white/10 text-xs"
              >
                <span className="text-white font-semibold flex items-center gap-2">
                  <span className="text-purple-400 font-mono tabular-nums">0{idx + 1}</span>
                  <span>{region}</span>
                </span>
                <span className="text-purple-300 font-semibold tabular-nums">{count} events</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
