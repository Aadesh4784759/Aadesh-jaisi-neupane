import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  RefreshCw,
  Send,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Wand2,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  MessageSquarePlus,
} from 'lucide-react';
import {
  AppSettings,
  AutomationConversationTurn,
  AutomationExecuteResponse,
  AutomationRunLogItem,
  AutomationScheduleItem,
  AutomationSuggestionResponse,
  AutomationTaskOptionId,
  AutomationTone,
  UserProfile,
} from '../types';
import {
  deleteAutomationLogFromFirestore,
  deleteAutomationScheduleFromFirestore,
  getAuthHeaders,
  loadAutomationLogsFromFirestore,
  loadAutomationSchedulesFromFirestore,
  saveAutomationLogToFirestore,
  saveAutomationScheduleToFirestore,
} from '../utils/firebase';
import { buildApiUrl } from '../utils/apiConfig';
import {
  getStoredAutomationHistory,
  getStoredAutomationLogs,
  getStoredAutomationSchedules,
  saveStoredAutomationHistory,
  saveStoredAutomationLogs,
  saveStoredAutomationSchedules,
} from '../utils/storage';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  SensitiveActionConfirmation,
  SensitiveActionPayload,
} from './SensitiveActionConfirmation';
import {
  AutomationSchedulerPanel,
  computeNextRunTimestamp,
} from './AutomationSchedulerPanel';
import { AutomationActivityLog } from './AutomationActivityLog';

interface AutomationHubViewProps {
  user: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  onSendToChat: (content: string) => void;
}

interface AutomationOptionCard {
  id: AutomationTaskOptionId;
  emoji: string;
  title: string;
  subtitle: string;
  defaultPrompt: string;
  gradientClass: string;
  activeBorderClass: string;
  badgeClass: string;
}

const AUTOMATION_OPTIONS: AutomationOptionCard[] = [
  {
    id: 'emails',
    emoji: '📩',
    title: 'Emails',
    subtitle: 'Smart inbox triage, follow-ups & reply templates',
    defaultPrompt:
      'Build my 2026 email automation workflow with an inbox priority rule and a high-converting follow-up template.',
    gradientClass: 'from-sky-500/20 via-cyan-500/15 to-blue-600/20',
    activeBorderClass: 'border-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.28)]',
    badgeClass: 'bg-cyan-950/75 text-cyan-200 border-cyan-400/40',
  },
  {
    id: 'lead_generation',
    emoji: '🎯',
    title: 'Lead Generation',
    subtitle: 'ICP targeting, outreach hooks & lead scoring',
    defaultPrompt:
      'Create a targeted 2026 lead generation workflow with qualification criteria and a multi-touch outreach message.',
    gradientClass: 'from-amber-500/20 via-orange-500/15 to-rose-600/20',
    activeBorderClass: 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.28)]',
    badgeClass: 'bg-amber-950/75 text-amber-200 border-amber-400/40',
  },
  {
    id: 'content_creation',
    emoji: '✍️',
    title: 'Content Creation',
    subtitle: 'High-retention hooks, weekly calendars & repurposing',
    defaultPrompt:
      'Design a 2026 content creation system that turns one core idea into multi-platform posts with strong hooks.',
    gradientClass: 'from-purple-500/25 via-fuchsia-500/15 to-pink-600/20',
    activeBorderClass: 'border-fuchsia-400 shadow-[0_0_24px_rgba(232,121,249,0.28)]',
    badgeClass: 'bg-fuchsia-950/75 text-fuchsia-200 border-fuchsia-400/40',
  },
  {
    id: 'customer_support',
    emoji: '🤖',
    title: 'Customer Support',
    subtitle: 'Instant ticket triage, empathetic macros & escalations',
    defaultPrompt:
      'Build a customer support automation playbook with fast resolution macros and clear escalation triggers.',
    gradientClass: 'from-emerald-500/20 via-teal-500/15 to-cyan-600/20',
    activeBorderClass: 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.28)]',
    badgeClass: 'bg-emerald-950/75 text-emerald-200 border-emerald-400/40',
  },
  {
    id: 'business_reports',
    emoji: '📊',
    title: 'Business Reports',
    subtitle: 'Weekly KPI digests, anomaly alerts & executive briefs',
    defaultPrompt:
      'Generate an automated weekly business report structure highlighting KPIs, risks, and action recommendations.',
    gradientClass: 'from-indigo-500/25 via-violet-500/15 to-blue-600/20',
    activeBorderClass: 'border-indigo-400 shadow-[0_0_24px_rgba(129,140,248,0.28)]',
    badgeClass: 'bg-indigo-950/75 text-indigo-200 border-indigo-400/40',
  },
];

const TONE_OPTIONS: Array<{ id: AutomationTone; label: string; hint: string }> = [
  { id: 'professional', label: 'Professional', hint: 'Executive & structured' },
  { id: 'friendly', label: 'Friendly', hint: 'Warm & approachable' },
  { id: 'creative', label: 'Creative', hint: 'Original & storytelling' },
  { id: 'concise', label: 'Concise', hint: 'Direct & ultra-short' },
];

export const AutomationHubView: React.FC<AutomationHubViewProps> = ({
  user,
  settings,
  isOnline,
  onSendToChat,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [selectedCategory, setSelectedCategory] = useState<AutomationTaskOptionId>('emails');
  const [tone, setTone] = useState<AutomationTone>('professional');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<AutomationConversationTurn[]>(() =>
    getStoredAutomationHistory(user.id)
  );
  const [schedules, setSchedules] = useState<AutomationScheduleItem[]>(() =>
    getStoredAutomationSchedules(user.id)
  );
  const [logs, setLogs] = useState<AutomationRunLogItem[]>(() =>
    getStoredAutomationLogs(user.id)
  );
  const [executingScheduleId, setExecutingScheduleId] = useState<string | null>(null);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [pendingNextAction, setPendingNextAction] = useState<SensitiveActionPayload | null>(null);
  const [pendingActionResponse, setPendingActionResponse] =
    useState<AutomationSuggestionResponse | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setHistory(getStoredAutomationHistory(user.id));
    setSchedules(getStoredAutomationSchedules(user.id));
    setLogs(getStoredAutomationLogs(user.id));

    if (!user.id || !user.isLoggedIn) return;

    Promise.all([
      loadAutomationSchedulesFromFirestore(user.id).catch(() => []),
      loadAutomationLogsFromFirestore(user.id).catch(() => []),
    ]).then(([cloudSchedules, cloudLogs]) => {
      if (isCancelled) return;
      if (cloudSchedules.length > 0) {
        const localScheds = getStoredAutomationSchedules(user.id);
        const map = new Map<string, AutomationScheduleItem>();
        for (const s of localScheds) map.set(s.id, s);
        for (const cs of cloudSchedules) {
          const existing = map.get(cs.id);
          if (!existing || cs.updatedAt > existing.updatedAt) {
            map.set(cs.id, cs);
          }
        }
        const mergedScheds = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        setSchedules(mergedScheds);
        saveStoredAutomationSchedules(mergedScheds, user.id);
      }
      if (cloudLogs.length > 0) {
        const localLogs = getStoredAutomationLogs(user.id);
        const logMap = new Map<string, AutomationRunLogItem>();
        for (const l of localLogs) logMap.set(l.id, l);
        for (const cl of cloudLogs) {
          const existing = logMap.get(cl.id);
          if (!existing || (cl.completedAt || cl.startedAt) >= (existing.completedAt || existing.startedAt)) {
            logMap.set(cl.id, cl);
          }
        }
        const mergedLogs = Array.from(logMap.values())
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, 60);
        setLogs(mergedLogs);
        saveStoredAutomationLogs(mergedLogs, user.id);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [user.id, user.isLoggedIn]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3200);
  };

  const upsertLogEntry = (entry: AutomationRunLogItem) => {
    setLogs((prev) => {
      const exists = prev.some((item) => item.id === entry.id);
      const next = exists
        ? prev.map((item) => (item.id === entry.id ? entry : item))
        : [entry, ...prev];
      const sorted = next.sort((a, b) => b.startedAt - a.startedAt).slice(0, 60);
      saveStoredAutomationLogs(sorted, user.id);
      return sorted;
    });
    if (user.isLoggedIn) {
      saveAutomationLogToFirestore(user.id, entry).catch(() => {});
    }
  };

  const upsertScheduleItem = (item: AutomationScheduleItem) => {
    setSchedules((prev) => {
      const exists = prev.some((s) => s.id === item.id);
      const next = exists ? prev.map((s) => (s.id === item.id ? item : s)) : [item, ...prev];
      saveStoredAutomationSchedules(next, user.id);
      return next;
    });
    if (user.isLoggedIn) {
      saveAutomationScheduleToFirestore(user.id, item).catch(() => {});
    }
  };

  const executeScheduledAutomation = async (
    sched: AutomationScheduleItem,
    triggerType: 'manual' | 'scheduled'
  ) => {
    if (!isOnline) {
      showToast('Connect to the internet to run automated workflows.');
      return;
    }
    if (executingScheduleId === sched.id) return;

    setExecutingScheduleId(sched.id);
    const startedAt = Date.now();
    const logId = `autolog-${startedAt}-${Math.random().toString(36).slice(2, 6)}`;

    const runningLog: AutomationRunLogItem = {
      id: logId,
      userId: user.id,
      scheduleId: sched.id,
      taskTitle: sched.title,
      category: sched.category,
      tone: sched.tone,
      triggerType,
      status: 'running',
      statusMessage: `Executing ${sched.frequency} automation workflow via backend...`,
      outputSummary: '',
      startedAt,
    };
    upsertLogEntry(runningLog);

    upsertScheduleItem({
      ...sched,
      lastStatus: 'running',
      updatedAt: startedAt,
    });

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });

      const res = await fetch(buildApiUrl('/api/automation/execute'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scheduleId: sched.id,
          taskTitle: sched.title,
          category: sched.category,
          tone: sched.tone,
          prompt: sched.prompt,
          frequency: sched.frequency,
          triggerType,
          targetLanguage: sched.targetLanguage || settings.defaultTargetLanguage || 'en',
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<AutomationExecuteResponse>;
      const completedAt = Date.now();

      if (!res.ok || !data.ok) {
        const errMsg = data.error || `Backend execution failed (${res.status})`;
        upsertLogEntry({
          ...runningLog,
          status: 'failed',
          statusMessage: `Run failed after ${completedAt - startedAt} ms`,
          errorMessage: errMsg,
          outputSummary: '',
          latencyMs: data.latencyMs || completedAt - startedAt,
          completedAt,
        });
        upsertScheduleItem({
          ...sched,
          lastStatus: 'failed',
          lastRunAt: completedAt,
          runCount: sched.runCount + 1,
          nextRunAt: computeNextRunTimestamp(
            sched.frequency,
            sched.timeOfDay,
            sched.dayOfWeek,
            completedAt + 1000
          ),
          updatedAt: completedAt,
        });
        showToast(`Automation run failed: ${errMsg}`);
        return;
      }

      const highlightsBlock =
        Array.isArray(data.highlights) && data.highlights.length > 0
          ? `\n\n**Key Outcomes:**\n${data.highlights.map((h) => `- ${h}`).join('\n')}`
          : '';
      const fullDeliverable = `#### ${data.executionHeadline || sched.title}\n\n${
        data.deliverableContent || ''
      }${highlightsBlock}${
        data.nextScheduledNote ? `\n\n> *Next Run Note:* ${data.nextScheduledNote}` : ''
      }`;

      upsertLogEntry({
        ...runningLog,
        status: 'success',
        statusMessage: data.nextScheduledNote || 'Completed scheduled automation workflow.',
        outputSummary: fullDeliverable.slice(0, 4000),
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs || completedAt - startedAt,
        completedAt,
      });

      upsertScheduleItem({
        ...sched,
        lastStatus: 'success',
        lastRunAt: completedAt,
        runCount: sched.runCount + 1,
        nextRunAt: computeNextRunTimestamp(
          sched.frequency,
          sched.timeOfDay,
          sched.dayOfWeek,
          completedAt + 1000
        ),
        updatedAt: completedAt,
      });

      showToast(`Completed "${sched.title}" and logged result.`);
    } catch (err: any) {
      const completedAt = Date.now();
      const errMsg = err?.message || 'Unexpected error executing scheduled automation.';
      upsertLogEntry({
        ...runningLog,
        status: 'failed',
        statusMessage: 'Execution interrupted by network or server error.',
        errorMessage: errMsg,
        latencyMs: completedAt - startedAt,
        completedAt,
      });
      upsertScheduleItem({
        ...sched,
        lastStatus: 'failed',
        lastRunAt: completedAt,
        updatedAt: completedAt,
      });
      showToast(`Execution error: ${errMsg}`);
    } finally {
      setExecutingScheduleId(null);
    }
  };

  // Automatic due-schedule polling (checks every 60s without blocking UI)
  useEffect(() => {
    if (!isOnline || !user.isLoggedIn || executingScheduleId) return;
    const now = Date.now();
    const dueSchedule = schedules.find((s) => s.enabled && s.nextRunAt <= now);
    if (dueSchedule) {
      void executeScheduledAutomation(dueSchedule, 'scheduled');
      return;
    }

    const timer = window.setInterval(() => {
      const checkNow = Date.now();
      const nextDue = schedules.find((s) => s.enabled && s.nextRunAt <= checkNow);
      if (nextDue) {
        void executeScheduledAutomation(nextDue, 'scheduled');
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, [schedules, isOnline, user.isLoggedIn, executingScheduleId]);

  const activeOption =
    AUTOMATION_OPTIONS.find((o) => o.id === selectedCategory) || AUTOMATION_OPTIONS[0];

  const categoryTurns = history.filter((turn) => turn.category === selectedCategory);
  const latestTurn = categoryTurns[categoryTurns.length - 1] || null;

  const runAutomationSuggestion = async (params: {
    category: AutomationTaskOptionId;
    tone: AutomationTone;
    promptText?: string;
    isRegenerate?: boolean;
  }) => {
    if (isLoading) return;
    if (!isOnline) {
      setErrorMessage('AI Automation Hub requires an active internet connection.');
      return;
    }

    const optionMeta =
      AUTOMATION_OPTIONS.find((o) => o.id === params.category) || AUTOMATION_OPTIONS[0];
    const resolvedPrompt =
      (params.promptText ?? customPrompt).trim() ||
      (params.isRegenerate && latestTurn ? latestTurn.userPrompt : optionMeta.defaultPrompt);

    setIsLoading(true);
    setErrorMessage(null);

    const startedAt = Date.now();
    const logId = `autolog-${startedAt}-${Math.random().toString(36).slice(2, 6)}`;
    const runningStrategyLog: AutomationRunLogItem = {
      id: logId,
      userId: user.id,
      taskTitle: `${optionMeta.title} Strategy Generation`,
      category: params.category,
      tone: params.tone,
      triggerType: 'strategy_action',
      status: 'running',
      statusMessage: `Generating ${params.tone} ${optionMeta.title.toLowerCase()} recommendations...`,
      outputSummary: '',
      startedAt,
    };
    upsertLogEntry(runningStrategyLog);

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });

      const contextSlice = history
        .filter((t) => t.category === params.category)
        .slice(-5)
        .map((t) => ({
          tone: t.tone,
          userPrompt: t.userPrompt,
          assistantMessage: t.response.assistantMessage,
        }));

      const res = await fetch(buildApiUrl('/api/automation/suggest'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category: params.category,
          tone: params.tone,
          userContext: resolvedPrompt,
          conversationHistory: contextSlice,
          targetLanguage: settings.defaultTargetLanguage || settings.uiLanguage || 'en',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to generate automation suggestions (${res.status})`);
      }

      const typedResp = data as AutomationSuggestionResponse;
      const newTurn: AutomationConversationTurn = {
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: params.category,
        tone: params.tone,
        userPrompt: resolvedPrompt,
        response: typedResp,
        createdAt: Date.now(),
      };

      const nextHistory = [...history, newTurn];
      setHistory(nextHistory);
      saveStoredAutomationHistory(nextHistory, user.id);
      if (params.promptText === undefined && !params.isRegenerate) {
        setCustomPrompt('');
      }

      const completedAt = Date.now();
      upsertLogEntry({
        ...runningStrategyLog,
        taskTitle: typedResp.headline || `${optionMeta.title} Strategy`,
        status: 'success',
        statusMessage: `Generated ${params.tone} strategy + 3 smart follow-up replies.`,
        outputSummary: typedResp.assistantMessage.slice(0, 4000),
        modelUsed: typedResp.modelUsed,
        latencyMs: typedResp.latencyMs || completedAt - startedAt,
        completedAt,
      });
    } catch (err: any) {
      const errMsg = err?.message || 'Unable to generate automation recommendations right now.';
      setErrorMessage(errMsg);
      const completedAt = Date.now();
      upsertLogEntry({
        ...runningStrategyLog,
        status: 'failed',
        statusMessage: 'Automation strategy generation failed.',
        errorMessage: errMsg,
        latencyMs: completedAt - startedAt,
        completedAt,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = (optionId: AutomationTaskOptionId) => {
    setSelectedCategory(optionId);
    setErrorMessage(null);
    const hasExisting = history.some((t) => t.category === optionId);
    if (!hasExisting && isOnline) {
      void runAutomationSuggestion({
        category: optionId,
        tone,
        promptText:
          AUTOMATION_OPTIONS.find((o) => o.id === optionId)?.defaultPrompt || '',
      });
    }
  };

  const handleClearCategoryThread = () => {
    const remaining = history.filter((t) => t.category !== selectedCategory);
    setHistory(remaining);
    saveStoredAutomationHistory(remaining, user.id);
    showToast(`Cleared ${activeOption.title} automation context.`);
  };

  const handleReviewRecommendedAction = (resp: AutomationSuggestionResponse) => {
    setPendingActionResponse(resp);
    setPendingNextAction({
      title: resp.recommendedNextAction.title,
      operationType:
        resp.recommendedNextAction.integrationStatus === 'requires_oauth'
          ? `External Service Authorization (${resp.recommendedNextAction.requiredService})`
          : 'Workspace Workflow Dispatch',
      target: resp.recommendedNextAction.requiredService,
      description:
        resp.recommendedNextAction.integrationStatus === 'requires_oauth'
          ? `${resp.recommendedNextAction.rationale}\n\nNote: Live external dispatch requires authorizing ${resp.recommendedNextAction.requiredService}. Confirming now moves this ready-to-use blueprint and draft into your Aadesh AI Chat workspace.`
          : resp.recommendedNextAction.rationale,
      payloadPreview: resp.actionPlan.slice(0, 3).join('\n'),
    });
  };

  const handleConfirmRecommendedAction = () => {
    if (!pendingActionResponse) {
      setPendingNextAction(null);
      return;
    }
    const resp = pendingActionResponse;
    setPendingNextAction(null);
    setPendingActionResponse(null);
    onSendToChat(
      `### ${activeOption.emoji} ${activeOption.title}: ${resp.headline}\n\n**Next Action:** ${resp.recommendedNextAction.title}\n\n${resp.assistantMessage}`
    );
    showToast('Dispatched automation workflow draft to Aadesh AI Chat.');
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 pb-28 w-full">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Hero Prompt Header */}
        <section className="glass-card rounded-3xl p-5 sm:p-7 border border-purple-500/35 shadow-2xl space-y-5">
          <div className="space-y-2 text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/75 border border-purple-400/40 text-[11px] font-bold text-purple-200 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Aadesh AI Intelligent Automation Hub</span>
            </span>
            <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white leading-snug">
              🤯 You can automate ONLY ONE task for the rest of 2026. Which one are you choosing?
            </h2>
            <p className="text-xs sm:text-sm text-gray-300">
              Pick one focus pillar below to unlock context-aware automation strategies, custom drafts, tone control, smart follow-up replies, and your best next action.
            </p>
          </div>

          {/* 5 Colorful Interactive Automation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {AUTOMATION_OPTIONS.map((option) => {
              const isSelected = selectedCategory === option.id;
              return (
                <motion.button
                  key={option.id}
                  type="button"
                  whileHover={prefersReducedMotion ? undefined : { y: -3 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                  onClick={() => handleSelectOption(option.id)}
                  aria-pressed={isSelected}
                  className={`text-left p-4 rounded-2xl border bg-gradient-to-br transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    option.gradientClass
                  } ${
                    isSelected
                      ? option.activeBorderClass
                      : 'border-white/15 hover:border-white/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        isSelected ? option.badgeClass : 'bg-black/30 text-gray-300 border-white/10'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Choose'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-white">{option.title}</div>
                    <p className="text-[11px] text-gray-300/90 mt-1 leading-snug">
                      {option.subtitle}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Customization, Tone Selector & Prompt Controls */}
        <section className="glass-card rounded-3xl p-4 sm:p-6 border border-white/12 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{activeOption.emoji}</span>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  {activeOption.title} Automation Studio
                </h3>
                <p className="text-[11px] text-gray-400">
                  Maintains conversation context • Switch tones or tailor instructions anytime
                </p>
              </div>
            </div>

            {/* Tone Switcher */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Select AI Tone">
              {TONE_OPTIONS.map((toneOpt) => {
                const active = tone === toneOpt.id;
                return (
                  <button
                    key={toneOpt.id}
                    type="button"
                    onClick={() => setTone(toneOpt.id)}
                    title={toneOpt.hint}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-purple-600/45 border-purple-400 text-white shadow'
                        : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:text-white hover:border-white/25'
                    }`}
                  >
                    {toneOpt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Context Input + Generate / Regenerate */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAutomationSuggestion({
                category: selectedCategory,
                tone,
              });
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`Customize ${activeOption.title.toLowerCase()} goal (e.g., audience, product, SLA, KPI)...`}
              className="flex-1 bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isLoading}
                className="purple-glow-btn px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 whitespace-nowrap"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{categoryTurns.length > 0 ? 'Refine Plan' : 'Generate Plan'}</span>
                  </>
                )}
              </button>

              {latestTurn && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    void runAutomationSuggestion({
                      category: selectedCategory,
                      tone,
                      isRegenerate: true,
                    })
                  }
                  className="px-3 py-2.5 rounded-xl bg-[#131520] hover:bg-purple-900/35 border border-[#232738] hover:border-purple-500/40 text-xs font-semibold text-purple-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  title="Regenerate with selected tone"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Regenerate</span>
                </button>
              )}

              {categoryTurns.length > 0 && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleClearCategoryThread}
                  className="p-2.5 rounded-xl bg-[#131520] hover:bg-rose-950/50 border border-[#232738] hover:border-rose-500/40 text-gray-400 hover:text-rose-300 cursor-pointer"
                  title="Reset conversation context for this pillar"
                  aria-label="Reset automation conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Loading Shimmer Animation */}
          {isLoading && (
            <div className="p-5 rounded-2xl bg-[#090a0f]/90 border border-purple-500/30 space-y-3 animate-pulse">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                <Wand2 className="w-4 h-4 animate-spin" />
                <span>
                  Crafting {tone} {activeOption.title.toLowerCase()} recommendations &amp; smart replies...
                </span>
              </div>
              <div className="h-3.5 w-2/3 rounded bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-5/6 rounded bg-white/5" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <div className="h-8 rounded-xl bg-purple-900/30 border border-purple-500/20" />
                <div className="h-8 rounded-xl bg-purple-900/30 border border-purple-500/20" />
                <div className="h-8 rounded-xl bg-purple-900/30 border border-purple-500/20" />
              </div>
            </div>
          )}

          {/* Conversation History Feed for Active Automation Category */}
          {categoryTurns.length === 0 && !isLoading ? (
            <div className="p-6 rounded-2xl bg-[#090a0f]/75 border border-dashed border-white/15 text-center space-y-3">
              <p className="text-xs sm:text-sm text-gray-300">
                Ready to design your 2026 <strong className="text-white">{activeOption.title}</strong> workflow in{' '}
                <strong className="text-purple-300 capitalize">{tone}</strong> tone.
              </p>
              <button
                type="button"
                onClick={() =>
                  void runAutomationSuggestion({
                    category: selectedCategory,
                    tone,
                    promptText: activeOption.defaultPrompt,
                  })
                }
                className="purple-glow-btn px-4 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate {activeOption.title} Strategy &amp; Smart Replies</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {categoryTurns.map((turn, idx) => {
                const isLatest = idx === categoryTurns.length - 1;
                const resp = turn.response;
                return (
                  <div
                    key={turn.id}
                    className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
                      isLatest
                        ? 'bg-[#0b0e1a]/95 border-purple-500/40 shadow-xl'
                        : 'bg-[#090a0f]/70 border-white/10 opacity-90'
                    }`}
                  >
                    {/* Turn Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-950/80 border border-purple-400/40 text-purple-200">
                            {turn.tone} Tone
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {new Date(turn.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-extrabold text-white mt-1">
                          {resp.headline}
                        </h4>
                        <p className="text-[11px] text-gray-400 truncate">
                          Goal: {turn.userPrompt}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(resp.assistantMessage);
                            setCopiedTurnId(turn.id);
                            window.setTimeout(() => setCopiedTurnId(null), 2000);
                          }}
                          className="p-2 rounded-xl bg-[#131520] hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white cursor-pointer"
                          title="Copy AI recommendation"
                        >
                          {copiedTurnId === turn.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSendToChat(
                              `### ${activeOption.emoji} ${resp.headline}\n\n${resp.assistantMessage}`
                            )
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-400/40 text-cyan-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>Send to Chat</span>
                        </button>
                      </div>
                    </div>

                    {/* Human-Like Context-Aware AI Draft / Response */}
                    <div className="text-xs sm:text-sm text-gray-100 leading-relaxed">
                      <MarkdownRenderer content={resp.assistantMessage} />
                    </div>

                    {/* Actionable Step Checklist + Best Next Action Recommendation */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                      {resp.actionPlan && resp.actionPlan.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-[#101424] border border-white/10 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                            Actionable Implementation Steps
                          </div>
                          <ul className="space-y-1.5">
                            {resp.actionPlan.map((stepText, stepIdx) => (
                              <li
                                key={`${turn.id}-step-${stepIdx}`}
                                className="text-xs text-gray-200 flex items-start gap-2"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <span>{stepText}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {resp.recommendedNextAction && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-[#101626] to-cyan-950/45 border border-emerald-400/35 flex flex-col justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Recommended Best Next Action</span>
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-black/40 border border-white/15 text-cyan-200">
                                {resp.recommendedNextAction.integrationStatus === 'requires_oauth'
                                  ? `Needs: ${resp.recommendedNextAction.requiredService}`
                                  : 'Ready Now'}
                              </span>
                            </div>
                            <h5 className="text-xs sm:text-sm font-bold text-white">
                              {resp.recommendedNextAction.title}
                            </h5>
                            <p className="text-[11px] text-gray-300 leading-snug">
                              {resp.recommendedNextAction.rationale}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleReviewRecommendedAction(resp)}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/45 border border-emerald-400/50 text-emerald-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <span>Execute / Stage Next Action</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 3 Context-Aware Smart Reply Suggestions */}
                    {isLatest && resp.smartReplies && resp.smartReplies.length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />
                          <span>3 Smart Reply Suggestions (Continue with Context)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {resp.smartReplies.slice(0, 3).map((reply, rIdx) => (
                            <button
                              key={`${turn.id}-reply-${rIdx}`}
                              type="button"
                              disabled={isLoading}
                              onClick={() =>
                                void runAutomationSuggestion({
                                  category: selectedCategory,
                                  tone,
                                  promptText: reply,
                                })
                              }
                              className="px-3 py-1.5 rounded-xl bg-[#13172b] hover:bg-purple-600/35 border border-purple-500/35 hover:border-purple-400 text-xs font-semibold text-purple-100 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recurring Task Scheduler */}
        <AutomationSchedulerPanel
          userId={user.id}
          selectedCategory={selectedCategory}
          activeTone={tone}
          targetLanguage={settings.defaultTargetLanguage || settings.uiLanguage || 'en'}
          schedules={schedules}
          executingScheduleId={executingScheduleId}
          isOnline={isOnline}
          onCreateSchedule={(newSched) => {
            upsertScheduleItem(newSched);
            showToast(`Scheduled "${newSched.title}" (${newSched.frequency}).`);
          }}
          onToggleSchedule={(scheduleId) => {
            const target = schedules.find((s) => s.id === scheduleId);
            if (!target) return;
            const toggled: AutomationScheduleItem = {
              ...target,
              enabled: !target.enabled,
              nextRunAt: !target.enabled
                ? computeNextRunTimestamp(target.frequency, target.timeOfDay, target.dayOfWeek)
                : target.nextRunAt,
              updatedAt: Date.now(),
            };
            upsertScheduleItem(toggled);
            showToast(`${toggled.enabled ? 'Activated' : 'Paused'} "${toggled.title}".`);
          }}
          onDeleteSchedule={(scheduleId) => {
            const remaining = schedules.filter((s) => s.id !== scheduleId);
            setSchedules(remaining);
            saveStoredAutomationSchedules(remaining, user.id);
            if (user.isLoggedIn) {
              deleteAutomationScheduleFromFirestore(user.id, scheduleId).catch(() => {});
            }
            showToast('Deleted recurring schedule.');
          }}
          onExecuteSchedule={(sched, triggerType) => {
            void executeScheduledAutomation(sched, triggerType);
          }}
        />

        {/* Automation Activity Log */}
        <AutomationActivityLog
          logs={logs}
          onDeleteLog={(logId) => {
            const remaining = logs.filter((l) => l.id !== logId);
            setLogs(remaining);
            saveStoredAutomationLogs(remaining, user.id);
            if (user.isLoggedIn) {
              deleteAutomationLogFromFirestore(user.id, logId).catch(() => {});
            }
          }}
          onClearLogs={() => {
            const toDelete = logs.slice();
            setLogs([]);
            saveStoredAutomationLogs([], user.id);
            if (user.isLoggedIn) {
              toDelete.forEach((l) => {
                deleteAutomationLogFromFirestore(user.id, l.id).catch(() => {});
              });
            }
            showToast('Cleared automation activity log.');
          }}
          onSendToChat={onSendToChat}
          onRetryLog={(failedLog) => {
            const matchingSched = failedLog.scheduleId
              ? schedules.find((s) => s.id === failedLog.scheduleId)
              : undefined;
            if (matchingSched) {
              void executeScheduledAutomation(matchingSched, 'manual');
            } else {
              void runAutomationSuggestion({
                category: failedLog.category,
                tone: failedLog.tone,
              });
            }
          }}
        />
      </div>

      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-50 px-4 py-2.5 rounded-xl bg-emerald-950/95 border border-emerald-400/50 text-emerald-200 text-xs font-semibold shadow-2xl">
          {toastMessage}
        </div>
      )}

      <SensitiveActionConfirmation
        action={pendingNextAction}
        onConfirm={handleConfirmRecommendedAction}
        onDeny={() => {
          setPendingNextAction(null);
          setPendingActionResponse(null);
          showToast('Cancelled recommended action.');
        }}
        confirmLabel="Confirm & Stage in Chat"
        denyLabel="Cancel"
      />
    </div>
  );
};
