import React from 'react';
import {
  BarChart3,
  Globe,
  Mic,
  Image as ImageIcon,
  Clock,
  Flame,
  Languages,
  Sparkles,
  Download,
  Smile,
  Compass,
  Zap,
} from 'lucide-react';
import { EngagementMetrics } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface AnalyticsDashboardProps {
  metrics: EngagementMetrics;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ metrics }) => {
  // Compute Modality percentages
  const textQueries = Math.max(
    0,
    metrics.totalQueries - (metrics.totalVoiceQueries + metrics.totalImageQueries)
  );
  const totalModality = Math.max(1, metrics.totalQueries);

  const voicePercent = Math.round((metrics.totalVoiceQueries / totalModality) * 100);
  const imagePercent = Math.round((metrics.totalImageQueries / totalModality) * 100);
  const textPercent = Math.max(0, 100 - (voicePercent + imagePercent));

  // Language Breakdown sorted
  const totalLangUsage = Object.values(metrics.languageCounts).reduce((a, b) => a + b, 0) || 1;
  const sortedLanguages = Object.entries(metrics.languageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // Regional activity sorted
  const sortedRegions = Object.entries(metrics.regionalActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  // Peak hourly max
  const maxHourly = Math.max(...metrics.hourlyActivity, 1);

  // Sentiment total
  const totalSentiment =
    Object.values(metrics.sentimentCounts).reduce((a, b) => a + b, 0) || 1;

  // Export Analytics CSV
  const handleExportCSV = () => {
    let csv = 'Metric,Value\n';
    csv += `Total Queries,${metrics.totalQueries}\n`;
    csv += `Voice Queries,${metrics.totalVoiceQueries}\n`;
    csv += `Image Queries,${metrics.totalImageQueries}\n`;
    csv += `Translations Executed,${metrics.totalTranslations}\n`;
    csv += `Average Latency (ms),${metrics.avgLatencyMs}\n\n`;

    csv += 'Language Code,Queries\n';
    Object.entries(metrics.languageCounts).forEach(([code, count]) => {
      csv += `${code},${count}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aadesh-ai-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-28">
      {/* Top Banner */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            <span>Telemetry & Regional Intelligence</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">User Engagement Dashboard</h2>
          <p className="text-xs text-gray-400">
            Real-time analytics for multilingual query volume, speech adoption, vision queries, and global response latency.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="bg-[#131520] hover:bg-purple-900/40 border border-[#232738] hover:border-purple-500/40 text-purple-200 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Export Analytics CSV</span>
        </button>
      </div>

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* Card 1: Total Queries */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Total Queries</span>
            <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{metrics.totalQueries}</div>
          <div className="text-[11px] text-purple-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Across all multimodal channels</span>
          </div>
        </div>

        {/* Card 2: Voice Adoption */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-indigo-500/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Voice Interaction</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-900/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Mic className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{voicePercent}%</div>
          <div className="text-[11px] text-indigo-300">
            {metrics.totalVoiceQueries} hands-free speech queries
          </div>
        </div>

        {/* Card 3: Translations */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Translations</span>
            <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Languages className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{metrics.totalTranslations}</div>
          <div className="text-[11px] text-purple-300 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" />
            <span>Bilateral & chat translations</span>
          </div>
        </div>

        {/* Card 4: Avg Response Latency */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-emerald-500/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Average Latency</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{metrics.avgLatencyMs} ms</div>
          <div className="text-[11px] text-emerald-300">
            Real-time inference & translation speed
          </div>
        </div>
      </div>

      {/* TWO COLUMN ANALYTICS: Language Distribution + Modality Ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Breakdown */}
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Language Engagement Distribution</h3>
            </div>
            <span className="text-xs text-gray-400">Top 8 Languages</span>
          </div>

          <div className="space-y-3">
            {sortedLanguages.map(([code, count]) => {
              const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === code);
              const percentage = Math.round((count / totalLangUsage) * 100);
              return (
                <div key={code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-200 font-medium flex items-center gap-2">
                      <span>{langObj?.flag || '🌐'}</span>
                      <span>{langObj?.name || code.toUpperCase()}</span>
                      <span className="text-[10px] text-gray-400 font-normal">({langObj?.region})</span>
                    </span>
                    <span className="text-purple-300 font-semibold">{percentage}% ({count})</span>
                  </div>
                  <div className="w-full bg-[#090a0f] rounded-full h-2 overflow-hidden border border-white/5">
                    <div
                      style={{ width: `${percentage}%` }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modality Ratio & Visual Doughnut Breakdown */}
        <div className="glass-card rounded-2xl p-5 border border-indigo-500/30 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Interaction Modality Split</h3>
            </div>
            <span className="text-xs text-gray-400">Input Channels</span>
          </div>

          {/* Graphical Multi-segmented Progress Bar */}
          <div className="space-y-3">
            <div className="h-6 w-full bg-[#090a0f] rounded-xl overflow-hidden flex border border-white/10 p-0.5">
              <div
                style={{ width: `${textPercent}%` }}
                className="bg-purple-600 h-full rounded-l-lg transition-all"
                title={`Text: ${textPercent}%`}
              />
              <div
                style={{ width: `${voicePercent}%` }}
                className="bg-indigo-500 h-full transition-all"
                title={`Voice: ${voicePercent}%`}
              />
              <div
                style={{ width: `${imagePercent}%` }}
                className="bg-pink-500 h-full rounded-r-lg transition-all"
                title={`Vision: ${imagePercent}%`}
              />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="bg-[#090a0f] p-3 rounded-xl border border-purple-500/30 space-y-1 text-center">
                <span className="text-[10px] uppercase font-bold text-purple-400 block">Text Queries</span>
                <span className="text-lg font-black text-white">{textPercent}%</span>
                <span className="text-[10px] text-gray-400 block">{textQueries} msgs</span>
              </div>
              <div className="bg-[#090a0f] p-3 rounded-xl border border-indigo-500/30 space-y-1 text-center">
                <span className="text-[10px] uppercase font-bold text-indigo-400 block">Hands-Free Voice</span>
                <span className="text-lg font-black text-white">{voicePercent}%</span>
                <span className="text-[10px] text-gray-400 block">{metrics.totalVoiceQueries} audios</span>
              </div>
              <div className="bg-[#090a0f] p-3 rounded-xl border border-pink-500/30 space-y-1 text-center">
                <span className="text-[10px] uppercase font-bold text-pink-400 block">Vision / Photos</span>
                <span className="text-lg font-black text-white">{imagePercent}%</span>
                <span className="text-[10px] text-gray-400 block">{metrics.totalImageQueries} uploads</span>
              </div>
            </div>
          </div>

          {/* Sentiment Gauge */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-300 font-semibold flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                <span>User Sentiment & Satisfaction</span>
              </span>
              <span className="text-emerald-400 font-bold">
                {Math.round((metrics.sentimentCounts.positive / totalSentiment) * 100)}% Positive
              </span>
            </div>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-[#090a0f]">
              <div
                style={{ width: `${(metrics.sentimentCounts.positive / totalSentiment) * 100}%` }}
                className="bg-emerald-500"
              />
              <div
                style={{ width: `${(metrics.sentimentCounts.curious / totalSentiment) * 100}%` }}
                className="bg-purple-500"
              />
              <div
                style={{ width: `${(metrics.sentimentCounts.inquiry / totalSentiment) * 100}%` }}
                className="bg-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* REGIONAL GEOTAG ACTIVITY & 24-HOUR PEAK TIME */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Regional Activity Leaderboard */}
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Geographic Regional Hotspots</h3>
            </div>
            <span className="text-xs text-gray-400">Activity by City</span>
          </div>

          <div className="space-y-2.5">
            {sortedRegions.map(([name, count], idx) => (
              <div
                key={name}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#090a0f] border border-[#232738]"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-purple-900/40 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center">
                    0{idx + 1}
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-white">{name}</h5>
                    <p className="text-[10px] text-gray-400">Active Geotagged Queries</p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-purple-300">{count} events</span>
              </div>
            ))}
          </div>
        </div>

        {/* 24-Hour Activity Peak Bar Chart */}
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">24-Hour Peak Activity Distribution</h3>
            </div>
            <span className="text-xs text-gray-400">Hourly Queries</span>
          </div>

          {/* Bar Chart Bars */}
          <div className="h-40 flex items-end justify-between gap-1 pt-6 px-1">
            {metrics.hourlyActivity.map((count, hour) => {
              const heightPercent = Math.max(8, Math.round((count / maxHourly) * 100));
              const isCurrentHour = new Date().getHours() === hour;

              return (
                <div
                  key={hour}
                  className="flex-1 flex flex-col items-center group relative h-full justify-end"
                >
                  {/* Tooltip on hover */}
                  <div className="hidden group-hover:block absolute -top-7 whitespace-nowrap bg-[#131520] border border-purple-500/40 text-[9px] text-white px-1.5 py-0.5 rounded shadow z-10">
                    {hour}:00 - {count} queries
                  </div>

                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-sm transition-all duration-300 ${
                      isCurrentHour
                        ? 'bg-gradient-to-t from-purple-500 to-indigo-400 shadow-md shadow-purple-500/50'
                        : 'bg-purple-900/40 group-hover:bg-purple-600'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-[10px] text-gray-500 border-t border-white/5 pt-2">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00 (Noon)</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>
    </div>
  );
};
