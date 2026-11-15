import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ShieldAlert, X, Ban, Check, Terminal } from 'lucide-react';

export interface SensitiveActionPayload {
  title: string;
  operationType: string;
  target: string;
  description: string;
  payloadPreview?: string;
}

interface SensitiveActionConfirmationProps {
  action: SensitiveActionPayload | null;
  onConfirm: () => void;
  onDeny: () => void;
  confirmLabel?: string;
  denyLabel?: string;
}

export const SensitiveActionConfirmation: React.FC<SensitiveActionConfirmationProps> = ({
  action,
  onConfirm,
  onDeny,
  confirmLabel = 'Confirm',
  denyLabel = 'Deny',
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {action && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sensitive-action-modal-title"
          aria-describedby="sensitive-action-modal-desc"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: prefersReducedMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card rounded-2xl max-w-md w-full p-5 border border-amber-400/60 shadow-[0_0_40px_rgba(251,191,36,0.22)] space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/55 flex items-center justify-center text-amber-300 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>Execution Paused • Sensitive Action</span>
                  </span>
                  <h4 id="sensitive-action-modal-title" className="text-sm font-black text-white mt-0.5">
                    {action.title}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={onDeny}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Deny sensitive action"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Intended Action & Payload Details */}
            <div className="p-3.5 rounded-xl bg-[#090a0f] border border-white/10 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-2 border-b border-white/10">
                <span className="text-gray-400 font-medium">{action.operationType}</span>
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-cyan-300 truncate max-w-[230px]">
                  <Terminal className="w-3 h-3 shrink-0" />
                  <span className="truncate">{action.target}</span>
                </span>
              </div>

              <p id="sensitive-action-modal-desc" className="text-gray-200 leading-relaxed">
                {action.description}
              </p>

              {action.payloadPreview && (
                <pre className="p-2.5 rounded-lg bg-[#131520] border border-white/5 text-[11px] text-purple-200 whitespace-pre-wrap break-words font-mono max-h-36 overflow-y-auto">
                  {action.payloadPreview}
                </pre>
              )}
            </div>

            {/* Explicit Confirm / Deny Controls */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onDeny}
                className="px-4 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/50 text-xs font-bold text-rose-200 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{denyLabel}</span>
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="purple-glow-btn px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{confirmLabel}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
