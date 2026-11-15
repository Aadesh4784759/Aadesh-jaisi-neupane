import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  GitBranch,
  Target,
  ChevronDown,
  ChevronUp,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { AgentStepPlan } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentTaskHierarchyProps {
  goal: string;
  agentName: string;
  steps: AgentStepPlan[];
  isRunning?: boolean;
  expandedSteps: Record<number, boolean>;
  onToggleExpandStep: (stepNumber: number) => void;
}

function getStatusMeta(status: AgentStepPlan['status']) {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        badgeClass: 'bg-emerald-950/75 border-emerald-400/50 text-emerald-300',
        cardBorder: 'border-emerald-500/45 shadow-[0_0_18px_rgba(16,185,129,0.14)]',
        connectorColor: 'from-emerald-400 to-cyan-400',
        progressPercent: 100,
        barClass: 'bg-gradient-to-r from-emerald-500 to-teal-400',
      };
    case 'running':
      return {
        label: 'In-Progress',
        badgeClass: 'bg-cyan-950/80 border-cyan-400/60 text-cyan-200',
        cardBorder: 'border-cyan-400/60 shadow-[0_0_22px_rgba(34,211,238,0.2)]',
        connectorColor: 'from-cyan-400 to-purple-500',
        progressPercent: 65,
        barClass: 'bg-gradient-to-r from-purple-500 via-indigo-400 to-cyan-400',
      };
    case 'awaiting_approval':
      return {
        label: 'Waiting (Approval)',
        badgeClass: 'bg-amber-950/80 border-amber-400/60 text-amber-200',
        cardBorder: 'border-amber-400/65 shadow-[0_0_22px_rgba(251,191,36,0.22)]',
        connectorColor: 'from-amber-400 to-amber-500/40',
        progressPercent: 50,
        barClass: 'bg-gradient-to-r from-amber-500 to-orange-400',
      };
    case 'denied':
      return {
        label: 'Denied',
        badgeClass: 'bg-rose-950/80 border-rose-500/50 text-rose-200',
        cardBorder: 'border-rose-500/50',
        connectorColor: 'from-rose-500 to-rose-500/30',
        progressPercent: 100,
        barClass: 'bg-gradient-to-r from-rose-600 to-amber-500',
      };
    case 'failed':
      return {
        label: 'Failed',
        badgeClass: 'bg-rose-950/80 border-rose-500/50 text-rose-200',
        cardBorder: 'border-rose-500/50',
        connectorColor: 'from-rose-500 to-rose-500/30',
        progressPercent: 100,
        barClass: 'bg-gradient-to-r from-rose-600 to-rose-400',
      };
    case 'pending':
    default:
      return {
        label: 'Waiting',
        badgeClass: 'bg-[#131520] border-white/15 text-gray-400',
        cardBorder: 'border-white/10',
        connectorColor: 'from-white/20 to-white/10',
        progressPercent: 0,
        barClass: 'bg-gray-600',
      };
  }
}

/* Crisp Vector SVG Status Node for Waiting, In-Progress, Completed, Paused, and Denied states */
const FlowchartSvgNode: React.FC<{
  status: AgentStepPlan['status'];
  stepNumber: number;
  reducedMotion: boolean | null;
}> = ({ status, stepNumber, reducedMotion }) => {
  if (status === 'completed') {
    return (
      <svg
        viewBox="0 0 36 36"
        className="w-8 h-8 shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="rgba(16, 185, 129, 0.16)"
          stroke="#34d399"
          strokeWidth="2"
        />
        <motion.path
          d="M11.5 18.5 L16 23 L25 13.5"
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reducedMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeOut' }}
        />
      </svg>
    );
  }

  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 36 36"
        className="w-8 h-8 shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="rgba(34, 211, 238, 0.14)"
          stroke="rgba(34, 211, 238, 0.25)"
          strokeWidth="2"
        />
        <motion.circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="34 62"
          animate={reducedMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '18px 18px' }}
        />
        <circle cx="18" cy="18" r="4.5" fill="#67e8f9" />
      </svg>
    );
  }

  if (status === 'awaiting_approval') {
    return (
      <svg
        viewBox="0 0 36 36"
        className="w-8 h-8 shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="rgba(245, 158, 11, 0.18)"
          stroke="#fbbf24"
          strokeWidth="2"
        />
        <path
          d="M18 11 V19 M18 23.5 V24.5"
          stroke="#fde68a"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === 'denied' || status === 'failed') {
    return (
      <svg
        viewBox="0 0 36 36"
        className="w-8 h-8 shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="rgba(244, 63, 94, 0.16)"
          stroke="#fb7185"
          strokeWidth="2"
        />
        <path
          d="M13 13 L23 23 M23 13 L13 23"
          stroke="#fda4af"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Waiting state SVG node
  return (
    <svg
      viewBox="0 0 36 36"
      className="w-8 h-8 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="rgba(148, 163, 184, 0.08)"
        stroke="#475569"
        strokeWidth="1.8"
        strokeDasharray="4 3"
      />
      <text
        x="18"
        y="22"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="11"
        fontWeight="700"
        fontFamily="monospace"
      >
        {stepNumber}
      </text>
    </svg>
  );
};

export const AgentTaskHierarchy: React.FC<AgentTaskHierarchyProps> = ({
  goal,
  agentName,
  steps,
  isRunning = false,
  expandedSteps,
  onToggleExpandStep,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (steps.length === 0) return null;

  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const overallPercent =
    totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : isRunning ? 10 : 0;

  return (
    <div
      className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/35 space-y-4"
      role="region"
      aria-label="Agent Task Hierarchy Flowchart"
    >
      {/* Header & Overall Workflow Percentage Progress Bar */}
      <div className="space-y-3 pb-3 border-b border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-600/25 border border-purple-400/40 text-purple-300">
              <GitBranch className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                <span>Agent Task Hierarchy</span>
                {overallPercent === 100 && !isRunning && (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </h3>
              <p className="text-[11px] text-gray-400">
                Stepped flowchart with live SVG sub-task states &amp; overall workflow completion
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-base sm:text-lg font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-300 to-emerald-300">
              {overallPercent}%
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              {completedCount} / {totalSteps} Sub-Tasks Completed
            </div>
          </div>
        </div>

        {/* Overall Percentage-Based Workflow Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={overallPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall AI Agent workflow completion"
          className="w-full h-2.5 rounded-full bg-[#090a0f] border border-white/10 overflow-hidden p-0.5"
        >
          <motion.div
            initial={false}
            animate={{ width: `${Math.max(overallPercent, isRunning ? 8 : 0)}%` }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full ${
              overallPercent === 100
                ? 'bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.65)]'
                : 'bg-gradient-to-r from-purple-500 via-indigo-400 to-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.6)]'
            }`}
          />
        </div>

        {/* Legend for SVG Node States */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold">
          <span className="inline-flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full border border-dashed border-gray-400" />
            Waiting
          </span>
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            In-Progress
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Completed
          </span>
        </div>
      </div>

      {/* Root Task Node */}
      <div className="relative">
        <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-950/75 via-indigo-950/70 to-cyan-950/50 border border-purple-400/40 flex items-start gap-3 shadow-md">
          <div className="w-8 h-8 rounded-xl bg-purple-600/35 border border-purple-400/50 flex items-center justify-center text-purple-200 shrink-0 mt-0.5">
            <Target className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300">
              Active Root Objective • {agentName}
            </span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5 break-words">
              {goal || 'Active Agent Workflow'}
            </p>
          </div>
        </div>

        {/* Stepped Sub-Task Flowchart */}
        <div className="mt-2.5 space-y-2.5 pl-3 sm:pl-5 border-l-2 border-purple-500/35 ml-4">
          {steps.map((step, index) => {
            const meta = getStatusMeta(step.status);
            const isExpanded = Boolean(expandedSteps[step.stepNumber]);
            const hasOutput = Boolean(step.output && step.output.trim().length > 0);
            const stepIndentClass =
              index % 3 === 1 ? 'sm:ml-4' : index % 3 === 2 ? 'sm:ml-8' : '';

            return (
              <motion.div
                key={`hierarchy-step-${step.stepNumber}-${index}`}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0.1 : 0.25,
                  delay: prefersReducedMotion ? 0 : index * 0.04,
                }}
                className={`relative pl-4 sm:pl-5 ${stepIndentClass}`}
              >
                {/* SVG Connector Line to Stepped Node */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-7 w-4 sm:w-5 h-0.5 bg-gradient-to-r ${meta.connectorColor}`}
                />

                {/* Sub-Task Card with SVG Status Node */}
                <div
                  className={`rounded-2xl bg-[#0b0d17]/90 border ${meta.cardBorder} overflow-hidden transition-all`}
                >
                  <button
                    type="button"
                    onClick={() => hasOutput && onToggleExpandStep(step.stepNumber)}
                    className={`w-full p-3 sm:p-3.5 text-left space-y-2 ${
                      hasOutput ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <FlowchartSvgNode
                          status={step.status}
                          stepNumber={step.stepNumber}
                          reducedMotion={prefersReducedMotion}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-1.5 py-0.5 rounded">
                              STEP {step.stepNumber}
                            </span>
                            {step.toolName && (
                              <span className="text-[10px] font-semibold text-cyan-200 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <Wrench className="w-2.5 h-2.5" />
                                <span>{step.toolName}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-white mt-1">
                            {step.title}
                          </h4>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                            {step.detail}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                        {hasOutput && (
                          <span className="text-gray-400">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sub-Task Step Bar */}
                    <div className="w-full h-1 rounded-full bg-[#151828] overflow-hidden">
                      <motion.div
                        initial={false}
                        animate={{ width: `${meta.progressPercent}%` }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
                        className={`h-full rounded-full ${meta.barClass}`}
                      />
                    </div>
                  </button>

                  {isExpanded && hasOutput && step.output && (
                    <div className="px-4 pb-4 pt-2.5 border-t border-white/10 text-xs text-gray-200 bg-[#080a12]/70">
                      <MarkdownRenderer content={step.output} />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
