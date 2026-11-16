import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  GitBranch,
  Target,
  ChevronDown,
  ChevronUp,
  Wrench,
  Sparkles,
  GripVertical,
  Clock,
  Flame,
  AlertCircle,
  Flag,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { AgentStepPlan, AgentTaskPriority } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentTaskHierarchyProps {
  goal: string;
  agentName: string;
  steps: AgentStepPlan[];
  isRunning?: boolean;
  expandedSteps: Record<number, boolean>;
  onToggleExpandStep: (stepNumber: number) => void;
  onReorderSteps?: (reorderedSteps: AgentStepPlan[]) => void;
}

function getPriorityMeta(priority?: AgentTaskPriority) {
  switch (priority) {
    case 'high':
      return {
        label: 'High',
        badgeClass: 'bg-rose-950/75 border-rose-400/50 text-rose-200',
        icon: <Flame className="w-2.5 h-2.5 text-rose-400 shrink-0" />,
      };
    case 'low':
      return {
        label: 'Low',
        badgeClass: 'bg-slate-900/80 border-slate-500/40 text-slate-300',
        icon: <Flag className="w-2.5 h-2.5 text-slate-400 shrink-0" />,
      };
    case 'medium':
    default:
      return {
        label: 'Medium',
        badgeClass: 'bg-amber-950/70 border-amber-400/45 text-amber-200',
        icon: <AlertCircle className="w-2.5 h-2.5 text-amber-400 shrink-0" />,
      };
  }
}

function resolveEstimatedMinutes(step: AgentStepPlan, index: number): number {
  if (typeof step.estimatedMinutes === 'number' && Number.isFinite(step.estimatedMinutes) && step.estimatedMinutes > 0) {
    return Math.round(step.estimatedMinutes);
  }
  if (step.estimatedTime) {
    const match = step.estimatedTime.match(/(\d+)/);
    if (match) {
      return Math.max(1, Number(match[1]));
    }
  }
  return index === 0 ? 1 : 2;
}

function formatEstimatedTime(step: AgentStepPlan, index: number): string {
  if (step.estimatedTime && step.estimatedTime.trim()) {
    return step.estimatedTime.trim();
  }
  const mins = resolveEstimatedMinutes(step, index);
  return `~${mins} min`;
}

function formatShortSvgDuration(step: AgentStepPlan, index: number): string {
  const mins = resolveEstimatedMinutes(step, index);
  if (step.estimatedTime && /sec|s\b/i.test(step.estimatedTime)) {
    const num = step.estimatedTime.match(/\d+/)?.[0] || '30';
    return `~${num}s`;
  }
  return `~${mins}m`;
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

/* Crisp Vector SVG Status Node with Integrated Step Duration Tag */
const FlowchartSvgNode: React.FC<{
  status: AgentStepPlan['status'];
  stepNumber: number;
  durationShort: string;
  reducedMotion: boolean | null;
}> = ({ status, stepNumber, durationShort, reducedMotion }) => {
  const pillFill =
    status === 'completed'
      ? 'rgba(16, 185, 129, 0.14)'
      : status === 'running'
      ? 'rgba(34, 211, 238, 0.14)'
      : status === 'awaiting_approval'
      ? 'rgba(245, 158, 11, 0.16)'
      : status === 'denied' || status === 'failed'
      ? 'rgba(244, 63, 94, 0.14)'
      : 'rgba(148, 163, 184, 0.1)';
  const pillStroke =
    status === 'completed'
      ? 'rgba(52, 211, 153, 0.45)'
      : status === 'running'
      ? 'rgba(34, 211, 238, 0.5)'
      : status === 'awaiting_approval'
      ? 'rgba(251, 191, 36, 0.5)'
      : status === 'denied' || status === 'failed'
      ? 'rgba(251, 113, 133, 0.45)'
      : 'rgba(148, 163, 184, 0.35)';
  const pillText =
    status === 'completed'
      ? '#6ee7b7'
      : status === 'running'
      ? '#67e8f9'
      : status === 'awaiting_approval'
      ? '#fde68a'
      : status === 'denied' || status === 'failed'
      ? '#fda4af'
      : '#cbd5e1';

  return (
    <svg viewBox="0 0 88 36" className="w-[84px] h-9 shrink-0" aria-hidden="true">
      {status === 'completed' && (
        <>
          <circle
            cx="18"
            cy="18"
            r="14.5"
            fill="rgba(16, 185, 129, 0.16)"
            stroke="#34d399"
            strokeWidth="2"
          />
          <motion.path
            d="M11.5 18.5 L16 23 L25 13.5"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reducedMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeOut' }}
          />
        </>
      )}

      {status === 'running' && (
        <>
          <circle
            cx="18"
            cy="18"
            r="14.5"
            fill="rgba(34, 211, 238, 0.14)"
            stroke="rgba(34, 211, 238, 0.25)"
            strokeWidth="2"
          />
          <motion.circle
            cx="18"
            cy="18"
            r="14.5"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="32 60"
            animate={reducedMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '18px 18px' }}
          />
          <circle cx="18" cy="18" r="4.2" fill="#67e8f9" />
        </>
      )}

      {status === 'awaiting_approval' && (
        <>
          <circle
            cx="18"
            cy="18"
            r="14.5"
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
        </>
      )}

      {(status === 'denied' || status === 'failed') && (
        <>
          <circle
            cx="18"
            cy="18"
            r="14.5"
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
        </>
      )}

      {status === 'pending' && (
        <>
          <circle
            cx="18"
            cy="18"
            r="14.5"
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
        </>
      )}

      {/* Connector & Estimated Time Badge inside SVG flowchart */}
      <line x1="33" y1="18" x2="39" y2="18" stroke={pillStroke} strokeWidth="1.5" />
      <rect
        x="39"
        y="9"
        width="46"
        height="18"
        rx="6"
        fill={pillFill}
        stroke={pillStroke}
        strokeWidth="1.2"
      />
      <text
        x="62"
        y="21.5"
        textAnchor="middle"
        fill={pillText}
        fontSize="10"
        fontWeight="700"
        fontFamily="monospace"
      >
        {durationShort}
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
  onReorderSteps,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const overallPercent =
    totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : isRunning ? 10 : 0;
  const totalEstimatedMinutes = steps.reduce(
    (sum, s, idx) => sum + resolveEstimatedMinutes(s, idx),
    0
  );

  const canReorder = Boolean(onReorderSteps) && !isRunning && steps.length > 1;

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (!onReorderSteps || !canReorder) return;
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= steps.length) return;
    const updated = [...steps];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    const renumbered = updated.map((item, idx) => ({
      ...item,
      stepNumber: idx + 1,
    }));
    onReorderSteps(renumbered);
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (!canReorder) return;
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    if (!canReorder || draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== idx) {
      setDragOverIndex(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    if (!canReorder) return;
    e.preventDefault();
    const rawFrom = e.dataTransfer.getData('text/plain');
    const fromIdx = draggedIndex !== null ? draggedIndex : Number(rawFrom);
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < steps.length) {
      moveStep(fromIdx, targetIdx);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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
                Drag tasks to reprioritize • Priority levels, estimated durations &amp; live SVG status
              </p>
            </div>
          </div>

          <div className="text-right space-y-0.5">
            <div className="flex items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#090a0f] border border-cyan-500/30 text-[10px] font-mono font-semibold text-cyan-300 tabular-nums">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>Est. Total ~{totalEstimatedMinutes} min</span>
              </span>
              <span className="text-base sm:text-lg font-black font-mono tabular-nums text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-300 to-emerald-300">
                {overallPercent}%
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono tabular-nums">
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold">
          <div className="flex flex-wrap items-center gap-3">
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
          {canReorder && (
            <span className="text-purple-300/90 inline-flex items-center gap-1">
              <GripVertical className="w-3 h-3" />
              <span>Drag or use arrows to reorder sub-tasks</span>
            </span>
          )}
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
            const priorityMeta = getPriorityMeta(step.priority);
            const estimatedLabel = formatEstimatedTime(step, index);
            const durationShort = formatShortSvgDuration(step, index);
            const isExpanded = Boolean(expandedSteps[step.stepNumber]);
            const hasOutput = Boolean(step.output && step.output.trim().length > 0);
            const isDragging = draggedIndex === index;
            const isDropTarget = dragOverIndex === index && draggedIndex !== index;
            const stepIndentClass =
              index % 3 === 1 ? 'sm:ml-4' : index % 3 === 2 ? 'sm:ml-8' : '';

            return (
              <motion.div
                key={step.id || `hierarchy-step-${step.title}-${index}`}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0.1 : 0.25,
                  delay: prefersReducedMotion ? 0 : index * 0.04,
                }}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, index)}
                onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, index)}
                onDrop={(e) => handleDrop(e as unknown as React.DragEvent, index)}
                onDragEnd={handleDragEnd}
                className={`relative pl-4 sm:pl-5 ${stepIndentClass}`}
              >
                {/* SVG Connector Line to Stepped Node */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-7 w-4 sm:w-5 h-0.5 bg-gradient-to-r ${meta.connectorColor}`}
                />

                {/* Sub-Task Card with SVG Status Node, Priority Tag & Duration */}
                <div
                  className={`rounded-2xl bg-[#0b0d17]/90 border overflow-hidden transition-all ${
                    isDragging
                      ? 'opacity-55 scale-[0.99] border-cyan-400/70'
                      : isDropTarget
                      ? 'border-cyan-400 ring-2 ring-cyan-400/35'
                      : meta.cardBorder
                  }`}
                >
                  <div className="p-3 sm:p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {canReorder && (
                          <div className="flex flex-col items-center gap-0.5 pt-1 shrink-0">
                            <span
                              className="p-0.5 text-gray-500 hover:text-purple-300 cursor-grab active:cursor-grabbing"
                              title="Drag to reorder sub-task"
                              aria-label={`Drag Step ${step.stepNumber}`}
                            >
                              <GripVertical className="w-4 h-4" />
                            </span>
                            <div className="flex flex-col">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveStep(index, index - 1);
                                }}
                                className="p-0.5 text-gray-500 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
                                title="Move step up"
                                aria-label={`Move Step ${step.stepNumber} up`}
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={index === steps.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveStep(index, index + 1);
                                }}
                                className="p-0.5 text-gray-500 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
                                title="Move step down"
                                aria-label={`Move Step ${step.stepNumber} down`}
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => hasOutput && onToggleExpandStep(step.stepNumber)}
                          className={`flex items-start gap-2.5 min-w-0 flex-1 text-left ${
                            hasOutput ? 'cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          <FlowchartSvgNode
                            status={step.status}
                            stepNumber={step.stepNumber}
                            durationShort={durationShort}
                            reducedMotion={prefersReducedMotion}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-1.5 py-0.5 rounded whitespace-nowrap">
                                STEP {step.stepNumber}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 whitespace-nowrap tabular-nums bg-[#111526] border-cyan-500/30 text-cyan-200`}
                                title="Estimated task duration"
                              >
                                <Clock className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                <span>{estimatedLabel}</span>
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 whitespace-nowrap ${priorityMeta.badgeClass}`}
                              >
                                {priorityMeta.icon}
                                <span>{priorityMeta.label} Priority</span>
                              </span>
                              {step.toolName && (
                                <span className="text-[10px] font-semibold text-indigo-200 bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap">
                                  <Wrench className="w-2.5 h-2.5 shrink-0" />
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
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => hasOutput && onToggleExpandStep(step.stepNumber)}
                        className={`flex items-center gap-1.5 shrink-0 ${
                          hasOutput ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
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
                      </button>
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
                  </div>

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

