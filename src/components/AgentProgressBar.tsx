import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Loader2, Sparkles, Cpu, AlertCircle } from 'lucide-react';
import { AgentStepPlan } from '../types';

interface AgentProgressBarProps {
  steps: AgentStepPlan[];
  agentName?: string;
  isRunning?: boolean;
  hasError?: boolean;
  className?: string;
}

export const AgentProgressBar: React.FC<AgentProgressBarProps> = ({
  steps,
  agentName = 'AI Agent Execution Chain',
  isRunning = false,
  hasError = false,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const prevCompletedRef = useRef(0);

  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const runningStep = steps.find((s) => s.status === 'running');
  const awaitingStep = steps.find((s) => s.status === 'awaiting_approval');
  const deniedStep = steps.find((s) => s.status === 'denied');
  const percentage =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : isRunning ? 12 : 0;

  // Trigger glow burst each time a step completes
  useEffect(() => {
    if (completedSteps > prevCompletedRef.current) {
      setPulseTrigger((c) => c + 1);
    }
    prevCompletedRef.current = completedSteps;
  }, [completedSteps]);

  const isComplete = totalSteps > 0 && completedSteps === totalSteps && !isRunning;

  return (
    <div
      className={`glass-card rounded-2xl p-4 border ${
        hasError || deniedStep
          ? 'border-rose-500/45 shadow-[0_0_24px_rgba(244,63,94,0.18)]'
          : awaitingStep
          ? 'border-amber-400/55 shadow-[0_0_26px_rgba(251,191,36,0.22)]'
          : isComplete
          ? 'border-emerald-400/50 shadow-[0_0_28px_rgba(16,185,129,0.22)]'
          : 'border-cyan-500/40 shadow-[0_0_26px_rgba(34,211,238,0.18)]'
      } space-y-3 relative overflow-hidden ${className}`}
      role="region"
      aria-label="AI Agent Multi-Step Task Execution Progress"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
              hasError || deniedStep
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-300'
                : awaitingStep
                ? 'bg-amber-950/70 border-amber-500/45 text-amber-300'
                : isComplete
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
            }`}
          >
            {hasError || deniedStep ? (
              <AlertCircle className="w-4 h-4" />
            ) : isComplete ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Cpu className={`w-4 h-4 ${isRunning && !prefersReducedMotion ? 'animate-pulse' : ''}`} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-extrabold text-white truncate flex items-center gap-1.5">
              <span>{agentName}</span>
              {awaitingStep ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-400/50 text-amber-200 font-semibold shrink-0">
                  Paused • Confirm/Deny
                </span>
              ) : isRunning ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-400/40 text-cyan-200 font-semibold inline-flex items-center gap-1 shrink-0">
                  <Loader2 className={`w-3 h-3 ${!prefersReducedMotion ? 'animate-spin' : ''}`} />
                  <span>In-Progress</span>
                </span>
              ) : null}
              {isComplete && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-400/40 text-emerald-200 font-semibold inline-flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  <span>Chain Complete</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 truncate">
              {deniedStep
                ? `Action denied at Step ${deniedStep.stepNumber}: ${deniedStep.title}`
                : hasError
                ? 'Execution interrupted — review step details below'
                : awaitingStep
                ? `Paused at Step ${awaitingStep.stepNumber}: awaiting your Confirm or Deny decision`
                : runningStep
                ? `In-Progress Step ${runningStep.stepNumber}: ${runningStep.title}`
                : isComplete
                ? `All ${totalSteps} workflow steps completed successfully`
                : totalSteps > 0
                ? `${completedSteps} of ${totalSteps} steps completed`
                : 'Planning multi-step execution chain...'}
            </p>
          </div>
        </div>

        {/* Completion Percentage Readout */}
        <div className="text-right shrink-0">
          <div className="text-lg sm:text-xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-300 to-emerald-300">
            {percentage}%
          </div>
          <div className="text-[10px] text-gray-400 font-mono">
            {totalSteps > 0 ? `${completedSteps}/${totalSteps} steps` : 'Initializing'}
          </div>
        </div>
      </div>

      {/* Main Progress Track with Glowing Completion Animation */}
      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full h-3 rounded-full bg-[#090a0f] border border-white/10 overflow-hidden p-0.5 relative"
      >
        <motion.div
          key={`bar-glow-${pulseTrigger}`}
          initial={false}
          animate={{
            width: `${Math.max(percentage, totalSteps === 0 && isRunning ? 15 : 0)}%`,
            boxShadow: prefersReducedMotion
              ? 'none'
              : isComplete
              ? '0 0 18px rgba(16,185,129,0.75)'
              : [
                  '0 0 10px rgba(34,211,238,0.45)',
                  '0 0 26px rgba(56,189,248,0.95)',
                  '0 0 14px rgba(139,92,246,0.65)',
                ],
          }}
          transition={{
            width: { duration: prefersReducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] },
            boxShadow: { duration: 0.7, ease: 'easeOut' },
          }}
          className={`h-full rounded-full relative overflow-hidden ${
            hasError
              ? 'bg-gradient-to-r from-rose-500 to-amber-500'
              : isComplete
              ? 'bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400'
              : 'bg-gradient-to-r from-purple-500 via-indigo-400 to-cyan-400'
          }`}
        >
          {/* Glowing Shimmer Sweep as steps complete */}
          {!prefersReducedMotion && (isRunning || pulseTrigger > 0) && (
            <motion.div
              key={`shimmer-${pulseTrigger}`}
              initial={{ x: '-100%', opacity: 0.9 }}
              animate={{ x: '220%', opacity: 0 }}
              transition={{ duration: 0.95, ease: 'easeInOut' }}
              className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
            />
          )}
        </motion.div>
      </div>

      {/* Multi-Step Chain Nodes */}
      {steps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 pt-0.5">
          {steps.map((step) => {
            const done = step.status === 'completed';
            const active = step.status === 'running';
            const failed = step.status === 'failed';
            return (
              <motion.div
                key={step.stepNumber}
                animate={
                  done && !prefersReducedMotion
                    ? { scale: [1, 1.03, 1] }
                    : undefined
                }
                transition={{ duration: 0.35 }}
                className={`px-2 py-1.5 rounded-xl border text-[10px] flex items-center gap-1.5 min-w-0 transition-colors ${
                  failed
                    ? 'bg-rose-950/55 border-rose-500/50 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                    : done
                    ? 'bg-emerald-950/45 border-emerald-500/45 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : active
                    ? 'bg-cyan-950/55 border-cyan-400/60 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'bg-[#090a0f]/70 border-white/5 text-gray-500'
                }`}
                title={`${step.stepNumber}. ${step.title} (${step.status})`}
              >
                {failed ? (
                  <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                ) : done ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : active ? (
                  <Loader2 className={`w-3 h-3 text-cyan-300 shrink-0 ${!prefersReducedMotion ? 'animate-spin' : ''}`} />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-gray-600 text-[8px] flex items-center justify-center shrink-0">
                    {step.stepNumber}
                  </span>
                )}
                <span className="truncate font-semibold">{step.title}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
