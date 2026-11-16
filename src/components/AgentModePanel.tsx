import React, { useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  Bot,
  Play,
  Sparkles,
  ShieldAlert,
  Send,
  Download,
  BookmarkPlus,
  ListTodo,
  Mail,
  ExternalLink,
  Check,
  Loader2,
  Ban,
} from 'lucide-react';
import { AgentPersonaId, AgentProposedAction, AgentStepPlan, AgentTaskPriority, AppSettings } from '../types';
import { getAuthHeaders } from '../utils/firebase';
import { AgentProgressBar } from './AgentProgressBar';
import { AgentTaskHierarchy } from './AgentTaskHierarchy';
import {
  SensitiveActionConfirmation,
  SensitiveActionPayload,
} from './SensitiveActionConfirmation';

interface AgentModePanelProps {
  settings: AppSettings;
  isOnline: boolean;
  onSendOutputToChat: (content: string) => void;
}

const AGENT_PERSONAS: Array<{ id: AgentPersonaId; label: string; desc: string }> = [
  { id: 'research', label: 'Research Agent', desc: 'Investigation & source checklists' },
  { id: 'coding', label: 'Coding Agent', desc: 'Architecture & implementation steps' },
  { id: 'study', label: 'Study Agent', desc: 'Mastery plans & recall drills' },
  { id: 'productivity', label: 'Productivity Agent', desc: 'Task breakdown & sprints' },
  { id: 'writing', label: 'Writing Agent', desc: 'Outlines, drafts & refinement' },
  { id: 'translation', label: 'Translation Agent', desc: 'Multilingual & Nepali workflows' },
];

export const AgentModePanel: React.FC<AgentModePanelProps> = ({
  settings,
  isOnline,
  onSendOutputToChat,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [persona, setPersona] = useState<AgentPersonaId>('research');
  const [goalInput, setGoalInput] = useState('');
  const [activeGoal, setActiveGoal] = useState('');
  const [agentName, setAgentName] = useState('Aadesh AI Agent');
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState<AgentStepPlan[]>([]);
  const [proposedActions, setProposedActions] = useState<AgentProposedAction[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [pendingSensitiveAction, setPendingSensitiveAction] =
    useState<SensitiveActionPayload | null>(null);
  const [pendingApprovalAction, setPendingApprovalAction] = useState<AgentProposedAction | null>(
    null
  );
  const [actionToast, setActionToast] = useState<string | null>(null);

  const sensitiveResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const showToast = (msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(null), 3000);
  };

  // Pauses Agent execution flow until user clicks Confirm or Deny
  const requestSensitiveConfirmation = (
    payload: SensitiveActionPayload
  ): Promise<boolean> => {
    setPendingSensitiveAction(payload);
    return new Promise((resolve) => {
      sensitiveResolverRef.current = resolve;
    });
  };

  const handleSensitiveDecision = (confirmed: boolean) => {
    const resolver = sensitiveResolverRef.current;
    sensitiveResolverRef.current = null;
    setPendingSensitiveAction(null);
    resolver?.(confirmed);
  };

  const handleRunAgent = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const goal = goalInput.trim();
    if (!goal || isExecuting) return;

    if (!isOnline) {
      setErrorMessage('AI Agent Mode requires an active network connection.');
      return;
    }

    const activePersonaLabel =
      AGENT_PERSONAS.find((p) => p.id === persona)?.label || 'Aadesh AI Agent';

    setErrorMessage(null);
    setSummary('');
    setProposedActions([]);
    setActiveGoal(goal);
    setIsExecuting(true);
    setAgentName(activePersonaLabel);

    setSteps([
      {
        id: 'init-step-1',
        stepNumber: 1,
        title: 'Analyze Goal & Task Hierarchy',
        detail: 'Parsing user objectives and preparing agent plan...',
        toolName: 'Goal Parser',
        priority: 'high',
        estimatedMinutes: 1,
        estimatedTime: '~1 min',
        status: 'running',
      },
      {
        id: 'init-step-2',
        stepNumber: 2,
        title: 'Authorize External Gemini Agent API Call',
        detail: 'Waiting for user Confirm/Deny before calling /api/agent',
        toolName: 'POST /api/agent',
        priority: 'high',
        estimatedMinutes: 1,
        estimatedTime: '~30s',
        isSensitive: true,
        status: 'pending',
      },
      {
        id: 'init-step-3',
        stepNumber: 3,
        title: 'Execute Multi-Step Reasoning Chain',
        detail: 'Synthesizing step-by-step outputs and deliverables...',
        toolName: 'Gemini Reasoning Tool',
        priority: 'medium',
        estimatedMinutes: 3,
        estimatedTime: '~3 min',
        status: 'pending',
      },
      {
        id: 'init-step-4',
        stepNumber: 4,
        title: 'Stage Follow-Up Sensitive Actions',
        detail: 'Preparing guarded follow-up actions for user review...',
        toolName: 'Action Guard',
        priority: 'low',
        estimatedMinutes: 2,
        estimatedTime: '~2 min',
        status: 'pending',
      },
    ]);

    await new Promise((r) => setTimeout(r, prefersReducedMotion ? 50 : 280));

    // Pause at Step 2 and show SensitiveActionConfirmation
    setSteps((prev) =>
      prev.map((st) =>
        st.stepNumber === 1
          ? { ...st, status: 'completed' }
          : st.stepNumber === 2
          ? { ...st, status: 'awaiting_approval' }
          : st
      )
    );

    const confirmed = await requestSensitiveConfirmation({
      title: 'Authorize External AI Agent API Request',
      operationType: 'External API Call',
      target: 'POST /api/agent',
      description:
        'Aadesh AI Agent is requesting permission to send your goal prompt to the Gemini backend API to generate and execute the multi-step plan.',
      payloadPreview: `Persona: ${activePersonaLabel}\nGoal: "${goal}"`,
    });

    if (!confirmed) {
      setSteps((prev) =>
        prev.map((st) =>
          st.stepNumber === 2
            ? {
                ...st,
                status: 'denied',
                detail: 'Execution paused & cancelled: user clicked Deny before API dispatch.',
              }
            : st
        )
      );
      setIsExecuting(false);
      showToast('Sensitive Action denied — API request cancelled.');
      return;
    }

    setSteps((prev) =>
      prev.map((st) => (st.stepNumber === 2 ? { ...st, status: 'running' } : st))
    );

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
        ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
      });

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentType: persona,
          goal,
          customApiKey: settings.customGeminiApiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Agent execution request failed');
      }

      const serverSteps: AgentStepPlan[] = Array.isArray(data.steps)
        ? data.steps.map((s: any, idx: number) => {
            const rawPriority = String(s.priority || '').toLowerCase();
            const priority: AgentTaskPriority =
              rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low'
                ? rawPriority
                : idx === 0
                ? 'high'
                : idx === 1
                ? 'medium'
                : 'low';
            const estMins = Number(s.estimatedMinutes) || (idx === 0 ? 2 : 3);
            return {
              id: s.id || `step-${Date.now()}-${idx + 1}`,
              stepNumber: s.stepNumber || idx + 1,
              title: s.title || `Step ${idx + 1}`,
              detail: s.detail || '',
              output: s.output || '',
              toolName: s.toolName || (idx === 0 ? 'Gemini Planner' : 'Agent Subtask'),
              priority,
              estimatedMinutes: estMins,
              estimatedTime: s.estimatedTime || `~${estMins} min`,
              status: 'pending' as const,
            };
          })
        : [];

      setAgentName(data.agentName || activePersonaLabel);
      setSummary(data.summary || '');
      setProposedActions(Array.isArray(data.proposedActions) ? data.proposedActions : []);

      // Step-by-step animated chain progression across AgentTaskHierarchy & AgentProgressBar
      for (let i = 0; i < serverSteps.length; i++) {
        setSteps(
          serverSteps.map((st, idx) => ({
            ...st,
            status: idx < i ? 'completed' : idx === i ? 'running' : 'pending',
          }))
        );
        await new Promise((r) => setTimeout(r, prefersReducedMotion ? 80 : 420));
        setSteps(
          serverSteps.map((st, idx) => ({
            ...st,
            status: idx <= i ? 'completed' : 'pending',
          }))
        );
        setExpandedSteps((prev) => ({ ...prev, [serverSteps[i].stepNumber]: i === 0 }));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to execute AI Agent workflow.');
      setSteps((prev) =>
        prev.map((st) => (st.status === 'running' ? { ...st, status: 'failed' } : st))
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const executeApprovedAction = (action: AgentProposedAction) => {
    setProposedActions((prev) =>
      prev.map((a) =>
        a.id === action.id ? { ...a, approved: true, denied: false, executed: true } : a
      )
    );

    if (action.type === 'download_file') {
      const content = action.payload?.content || summary || action.description;
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${action.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Confirmed & downloaded "${action.title}"`);
    } else if (action.type === 'draft_email') {
      const text = `Subject: ${action.payload?.subject || action.title}\n\n${action.payload?.content || action.description}`;
      navigator.clipboard?.writeText(text).catch(() => {});
      showToast('Confirmed & copied email draft to clipboard.');
    } else if (action.type === 'open_url' && action.payload?.url) {
      showToast(`Confirmed external target: ${action.payload.url}`);
    } else {
      onSendOutputToChat(
        `[Confirmed Sensitive Agent Action: ${action.title}]\n\n${action.payload?.content || action.description}`
      );
      showToast(`Confirmed & dispatched "${action.title}" to chat`);
    }
    setPendingApprovalAction(null);
  };

  const denyProposedAction = (action: AgentProposedAction) => {
    setProposedActions((prev) =>
      prev.map((a) =>
        a.id === action.id ? { ...a, approved: false, denied: true, executed: false } : a
      )
    );
    setPendingApprovalAction(null);
    showToast(`Denied action "${action.title}"`);
  };

  const getActionIcon = (type: AgentProposedAction['type']) => {
    switch (type) {
      case 'save_memory':
        return <BookmarkPlus className="w-4 h-4 text-purple-300" />;
      case 'create_task':
        return <ListTodo className="w-4 h-4 text-emerald-300" />;
      case 'draft_email':
        return <Mail className="w-4 h-4 text-cyan-300" />;
      case 'download_file':
        return <Download className="w-4 h-4 text-amber-300" />;
      default:
        return <ExternalLink className="w-4 h-4 text-indigo-300" />;
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full">
      {/* Agent Header & Goal Form */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-cyan-500/35 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <span>AI Agent Mode</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-400/40 text-cyan-200 uppercase font-bold">
                  Task Hierarchy &amp; Consent Guard
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">
                Pauses on sensitive actions for Confirm/Deny consent and visualizes sub-tasks as an SVG flowchart
              </p>
            </div>
          </div>
        </div>

        {/* Agent Persona Chips */}
        <div className="flex flex-wrap gap-1.5">
          {AGENT_PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersona(p.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
                persona === p.id
                  ? 'bg-cyan-600/30 border-cyan-400 text-cyan-100 shadow-sm'
                  : 'bg-[#090a0f]/70 border-white/10 text-gray-400 hover:text-white'
              }`}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Goal Input Bar */}
        <form onSubmit={handleRunAgent} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="Describe a complex goal for the agent to plan and execute..."
            className="flex-1 bg-[#090a0f] border border-[#232738] focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
          />
          <button
            type="submit"
            disabled={!goalInput.trim() || isExecuting}
            className="purple-glow-btn px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing Chain...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Run Agent Chain</span>
              </>
            )}
          </button>
        </form>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Overall Multi-Step Progress Bar */}
      {steps.length > 0 && (
        <AgentProgressBar
          steps={steps}
          agentName={agentName}
          isRunning={isExecuting}
          hasError={Boolean(errorMessage)}
        />
      )}

      {/* Executive Summary + Send to Chat */}
      {summary && (
        <div className="glass-card rounded-2xl p-4 border border-purple-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Agent Summary</span>
            </span>
            <button
              type="button"
              onClick={() =>
                onSendOutputToChat(
                  `### ${agentName} Report\n\n${summary}\n\n${steps
                    .map((s) => `**Step ${s.stepNumber}: ${s.title}**\n${s.output || s.detail}`)
                    .join('\n\n')}`
                )
              }
              className="text-[11px] font-semibold text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Send Report to Chat</span>
            </button>
          </div>
          <p className="text-xs text-gray-200 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* AgentTaskHierarchy Visual Stepped SVG Flowchart */}
      {steps.length > 0 && (
        <AgentTaskHierarchy
          goal={activeGoal}
          agentName={agentName}
          steps={steps}
          isRunning={isExecuting}
          expandedSteps={expandedSteps}
          onToggleExpandStep={(stepNum) =>
            setExpandedSteps((prev) => ({
              ...prev,
              [stepNum]: !prev[stepNum],
            }))
          }
          onReorderSteps={(reorderedSteps) => {
            setSteps(reorderedSteps);
            showToast('Updated sub-task execution order.');
          }}
        />
      )}

      {/* Proposed Sensitive Actions Requiring Confirm / Deny */}
      {proposedActions.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border border-amber-500/40 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Sensitive Tool Actions (Confirm / Deny Required)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {proposedActions.map((act) => (
              <div
                key={act.id}
                className="p-3 rounded-xl bg-[#090a0f]/80 border border-white/10 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-white/5 shrink-0">{getActionIcon(act.type)}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{act.title}</div>
                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{act.description}</p>
                  </div>
                </div>
                {act.executed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmed &amp; Executed</span>
                  </span>
                ) : act.denied ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300">
                    <Ban className="w-3.5 h-3.5" />
                    <span>Denied by User</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingApprovalAction(act)}
                    className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Review Sensitive Action
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {actionToast && (
        <div className="fixed bottom-20 right-4 z-50 px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-400/50 text-emerald-200 text-xs font-semibold shadow-xl">
          {actionToast}
        </div>
      )}

      {/* SensitiveActionConfirmation Modal for API / Execution Interruption */}
      <SensitiveActionConfirmation
        action={pendingSensitiveAction}
        onConfirm={() => handleSensitiveDecision(true)}
        onDeny={() => handleSensitiveDecision(false)}
        confirmLabel="Confirm & Proceed"
        denyLabel="Deny"
      />

      {/* SensitiveActionConfirmation Modal for Proposed Follow-Up Tool Actions */}
      <SensitiveActionConfirmation
        action={
          pendingApprovalAction
            ? {
                title: pendingApprovalAction.title,
                operationType: `Tool Action • ${pendingApprovalAction.type}`,
                target: pendingApprovalAction.payload?.url || pendingApprovalAction.type,
                description: pendingApprovalAction.description,
                payloadPreview: pendingApprovalAction.payload?.content
                  ? pendingApprovalAction.payload.content.slice(0, 260)
                  : undefined,
              }
            : null
        }
        onConfirm={() => pendingApprovalAction && executeApprovedAction(pendingApprovalAction)}
        onDeny={() => pendingApprovalAction && denyProposedAction(pendingApprovalAction)}
        confirmLabel="Confirm"
        denyLabel="Deny"
      />
    </div>
  );
};
