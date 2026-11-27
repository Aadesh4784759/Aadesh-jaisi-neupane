import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  BrainCircuit,
  ListChecks,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';
import { AppSettings, ChatSession, EngagementMetrics, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import { getAuthHeaders } from '../utils/firebase';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AnalyticsDashboardProps {
  metrics: EngagementMetrics;
  sessions?: ChatSession[];
  user?: UserProfile;
  settings?: AppSettings;
  isOnline?: boolean;
}

type AnalysisMode = 'deep' | 'solver' | 'summary';

interface DeepAnalysisResult {
  headline: string;
  executiveSummary: string;
  steps: Array<{ stepNumber: number; title: string; detail: string }>;
  keyTakeaways: string[];
  detailedNotes: string;
  modelUsed?: string;
  latencyMs?: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  metrics,
  sessions = [],
  user,
  settings,
  isOnline = true,
}) => {
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('deep');
  const [analysisInput, setAnalysisInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DeepAnalysisResult | null>(null);
  const [showExpandedDetails, setShowExpandedDetails] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

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

  const handleLoadRecentConversation = () => {
    const recent = sessions[0];
    if (!recent || recent.messages.length === 0) {
      setAnalysisInput('Analyze how AI workflows can optimize daily productivity and multilingual communication.');
      return;
    }
    const snippet = recent.messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 320)}`)
      .join('\n');
    setAnalysisInput(`Analyze this conversation ("${recent.title}"):\n\n${snippet}`);
  };

  const handleRunDeepAnalysis = async () => {
    const trimmed = analysisInput.trim();
    if (!trimmed || isAnalyzing) return;
    if (!isOnline) {
      setAnalysisError('Deep Gemini analysis requires an internet connection.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setShowExpandedDetails(false);
    setAnalysisStage('Parsing problem & context...');

    const stageTimer1 = window.setTimeout(
      () => setAnalysisStage('Structuring step-by-step reasoning...'),
      950
    );
    const stageTimer2 = window.setTimeout(
      () => setAnalysisStage('Synthesizing executive takeaways...'),
      2100
    );

    const modeDirective =
      analysisMode === 'solver'
        ? 'Act as a step-by-step Problem Solver. Break down the exact root problem, solve each stage logically, and verify edge cases.'
        : analysisMode === 'summary'
        ? 'Act as an Executive Summarizer. Distill dense information into crisp cards, priorities, and clear action items.'
        : 'Act as a Deep Analytical Engine. Evaluate assumptions, trade-offs, risks, and multi-perspective reasoning.';

    const structuredPrompt = `${modeDirective}

Analyze the following input thoroughly and respond ONLY with a valid JSON object matching this exact schema (no markdown wrapping outside strings):
{
  "headline": "Short clear title",
  "executiveSummary": "Concise 2-3 sentence overview",
  "steps": [
    { "stepNumber": 1, "title": "Step Title", "detail": "Detailed reasoning for this step" }
  ],
  "keyTakeaways": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "detailedNotes": "Full expanded markdown technical breakdown, risks, or next steps"
}

USER INPUT:
${trimmed}`;

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const activeProvider = settings?.aiProvider || 'gemini';
      const activeModel =
        activeProvider === 'openrouter'
          ? settings?.openRouterModel || settings?.aiModel
          : settings?.aiModel;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentMessage: structuredPrompt,
          targetLanguage: settings?.defaultTargetLanguage || 'en',
          userLanguage: settings?.uiLanguage || 'en',
          responseMode: 'detailed',
          aiProvider: activeProvider,
          aiModel: activeModel,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Analysis failed (HTTP ${res.status})`);
      }

      const rawReply = String(data.reply || '').trim();
      let parsed: Partial<DeepAnalysisResult> = {};
      try {
        const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {}

      const steps =
        Array.isArray(parsed.steps) && parsed.steps.length > 0
          ? parsed.steps.map((st, idx) => ({
              stepNumber: Number(st.stepNumber) || idx + 1,
              title: String(st.title || `Step ${idx + 1}`),
              detail: String(st.detail || ''),
            }))
          : [
              {
                stepNumber: 1,
                title: 'Primary Analysis',
                detail: rawReply,
              },
            ];

      setAnalysisResult({
        headline: String(parsed.headline || 'Structured AI Analysis'),
        executiveSummary: String(
          parsed.executiveSummary || rawReply.slice(0, 260)
        ),
        steps,
        keyTakeaways: Array.isArray(parsed.keyTakeaways)
          ? parsed.keyTakeaways.map((k) => String(k))
          : [],
        detailedNotes: String(parsed.detailedNotes || rawReply),
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setAnalysisError(err?.message || 'Unable to run deep analysis right now.');
    } finally {
      window.clearTimeout(stageTimer1);
      window.clearTimeout(stageTimer2);
      setIsAnalyzing(false);
      setAnalysisStage('');
    }
  };

  const handleCopyAnalysis = () => {
    if (!analysisResult) return;
    const formatted = [
      `# ${analysisResult.headline}`,
      '',
      analysisResult.executiveSummary,
      '',
      '## Step-by-Step Reasoning',
      ...analysisResult.steps.map((s) => `${s.stepNumber}. ${s.title}: ${s.detail}`),
      '',
      '## Key Takeaways',
      ...analysisResult.keyTakeaways.map((t) => `- ${t}`),
      '',
      '## Detailed Breakdown',
      analysisResult.detailedNotes,
    ].join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedResult(true);
    window.setTimeout(() => setCopiedResult(false), 1800);
  };

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
    csv += `Daily Streak,${user?.streakDays || 0}\n`;

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
      <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span>Aadesh AI · Intelligence Workspace</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Deep Analysis &amp; Usage Studio</h1>
          <p className="text-xs text-purple-200/75">
            Step-by-step AI reasoning, structured problem solving, conversation metrics, and token telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="min-h-[42px] px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-600/30 to-sky-600/30 hover:from-purple-600/50 hover:to-sky-600/50 border border-sky-400/40 text-purple-100 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4 text-sky-300" />
          <span>Export CSV Report</span>
        </button>
      </div>

      {/* Interactive Deep Analysis & Step-by-Step Problem Solver */}
      <section className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-sky-400/30 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-500/25 to-purple-500/30 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Deep Analysis &amp; Problem Solver
              </h2>
              <p className="text-[11px] text-purple-200/75">
                Break down complex questions, code bugs, or decisions into organized step-by-step reasoning.
              </p>
            </div>
          </div>

          {/* Mode Pills */}
          <div className="flex flex-wrap items-center gap-1.5 v2-neu-inset p-1 rounded-2xl">
            {(
              [
                { id: 'deep', label: 'Deep Analysis' },
                { id: 'solver', label: 'Step-by-Step Solver' },
                { id: 'summary', label: 'Executive Summary' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAnalysisMode(mode.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  analysisMode === mode.id
                    ? 'electric-purple-btn text-white'
                    : 'text-purple-200/75 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            rows={3}
            value={analysisInput}
            onChange={(e) => setAnalysisInput(e.target.value)}
            placeholder="Paste a problem, architecture decision, text passage, math/code question, or conversation snippet to analyze step-by-step..."
            className="w-full v2-neu-inset rounded-2xl p-3.5 text-sm text-white placeholder-purple-300/45 outline-none focus:ring-2 focus:ring-sky-400/50 resize-y"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleLoadRecentConversation}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-purple-400/25 text-xs font-semibold text-purple-200 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
              <span>Import Latest Chat Context</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRunDeepAnalysis()}
              disabled={isAnalyzing || !analysisInput.trim()}
              className="electric-purple-btn px-5 py-2.5 rounded-2xl text-xs font-extrabold text-white flex items-center gap-2 cursor-pointer disabled:opacity-45"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{analysisStage || 'Analyzing...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run Gemini Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {analysisError && (
          <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}

        <AnimatePresence>
          {analysisResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-4 pt-2 border-t border-white/10"
            >
              {/* Result Summary Header Card */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-950/70 via-purple-950/60 to-sky-950/60 border border-sky-400/35 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {analysisResult.headline}
                  </h3>
                  <div className="flex items-center gap-2">
                    {analysisResult.modelUsed && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-400/35 text-sky-200">
                        {analysisResult.modelUsed}
                        {analysisResult.latencyMs ? ` · ${analysisResult.latencyMs}ms` : ''}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyAnalysis}
                      className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedResult ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-sky-300" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-purple-100/90 leading-relaxed">
                  {analysisResult.executiveSummary}
                </p>
              </div>

              {/* Step-by-Step Reasoning Cards */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Step-by-Step Reasoning ({analysisResult.steps.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysisResult.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="v2-neu-inset rounded-2xl p-3.5 border border-purple-400/20 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-500/30 to-purple-500/30 border border-sky-400/40 text-sky-200 text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                          {step.stepNumber}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-white">{step.title}</h4>
                      </div>
                      <p className="text-xs text-purple-100/80 leading-relaxed pl-8">
                        {step.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Takeaways */}
              {analysisResult.keyTakeaways.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {analysisResult.keyTakeaways.map((takeaway, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-purple-950/45 border border-purple-400/25 flex items-start gap-2 text-xs text-purple-100"
                    >
                      <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{takeaway}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Expandable Analysis Details */}
              <div className="rounded-2xl border border-purple-400/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExpandedDetails((prev) => !prev)}
                  className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 flex items-center justify-between text-xs font-bold text-purple-100 cursor-pointer"
                >
                  <span>Expand Detailed Breakdown &amp; Full Notes</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      showExpandedDetails ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {showExpandedDetails && (
                  <div className="p-4 bg-[#080614]/70 border-t border-white/10 text-xs sm:text-sm">
                    <MarkdownRenderer content={analysisResult.detailedNotes} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="v2-neu-card rounded-2xl p-4 border border-purple-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Conversations</span>
            <MessageSquare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.totalConversations}
          </div>
          <div className="text-[11px] text-purple-300/80 tabular-nums">
            {conversationInsights.totalMessages} msgs · avg {conversationInsights.avgSessionLength}/chat
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-sky-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Token Usage (Est.)</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.estimatedTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-sky-300/80 tabular-nums">
            {conversationInsights.totalWords.toLocaleString()} total words processed
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-indigo-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Response Latency</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {conversationInsights.avgModelLatency} ms
          </div>
          <div className="text-[11px] text-indigo-300/80 tabular-nums">
            {metrics.totalQueries} total Gemini queries
          </div>
        </div>

        <div className="v2-neu-card rounded-2xl p-4 border border-amber-400/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-200/75 font-medium">Daily Streak</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            🔥 {user?.streakDays || 0}d
          </div>
          <div className="text-[11px] text-amber-300/85 tabular-nums">
            {(user?.xp || 0).toLocaleString()} XP · Best {user?.longestStreak || 0}d
          </div>
        </div>
      </div>

      {/* AI Response Analysis & Daily Streak Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">AI Response &amp; Conversation Analysis</h2>
            </div>
            <span className="text-xs text-purple-300/75 tabular-nums">
              {conversationInsights.aiMessages} AI replies
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl v2-neu-inset text-center">
              <div className="text-[10px] font-bold uppercase text-purple-300">User Prompts</div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {conversationInsights.userMessages}
              </div>
            </div>
            <div className="p-3 rounded-2xl v2-neu-inset text-center">
              <div className="text-[10px] font-bold uppercase text-emerald-300 flex items-center justify-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Helpful</span>
              </div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {conversationInsights.thumbsUp}
              </div>
            </div>
            <div className="p-3 rounded-2xl v2-neu-inset text-center">
              <div className="text-[10px] font-bold uppercase text-sky-300 flex items-center justify-center gap-1">
                <Languages className="w-3 h-3" />
                <span>Translated</span>
              </div>
              <div className="text-lg font-black text-white mt-1 tabular-nums">
                {metrics.totalTranslations}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-purple-200/80">
              <span>Input Modality Split</span>
              <span className="tabular-nums">
                Text {textPercent}% · Voice {voicePercent}% · Vision {imagePercent}%
              </span>
            </div>
            <div className="h-3 w-full bg-[#090614] rounded-full overflow-hidden flex border border-white/10">
              <div style={{ width: `${textPercent}%` }} className="bg-purple-500 h-full" />
              <div style={{ width: `${voicePercent}%` }} className="bg-sky-400 h-full" />
              <div style={{ width: `${imagePercent}%` }} className="bg-indigo-400 h-full" />
            </div>
          </div>

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

        <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
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
                      ? 'bg-gradient-to-br from-purple-600/35 to-sky-600/30 border-sky-400/50 text-white'
                      : 'v2-neu-inset text-purple-300/60'
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
                        ? 'bg-gradient-to-t from-purple-500 to-sky-400 shadow-[0_0_12px_rgba(59,130,246,0.65)]'
                        : 'bg-purple-800/50 hover:bg-sky-400'
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

      {/* Language Breakdown & Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
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
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-sky-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
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
                className="flex items-center justify-between px-3 py-2 rounded-xl v2-neu-inset text-xs"
              >
                <span className="text-white font-semibold flex items-center gap-2">
                  <span className="text-sky-400 font-mono tabular-nums">0{idx + 1}</span>
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
