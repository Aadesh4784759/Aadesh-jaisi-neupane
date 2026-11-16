import React, { useMemo, useState } from 'react';
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Trash2,
  MessageSquarePlus,
  RotateCcw,
} from 'lucide-react';
import { AutomationRunLogItem, AutomationRunStatus, AutomationTaskOptionId } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface AutomationActivityLogProps {
  logs: AutomationRunLogItem[];
  onDeleteLog: (logId: string) => void;
  onClearLogs: () => void;
  onSendToChat: (content: string) => void;
  onRetryLog?: (log: AutomationRunLogItem) => void;
}

const CATEGORY_NAMES: Record<AutomationTaskOptionId, string> = {
  emails: 'Emails',
  lead_generation: 'Lead Generation',
  content_creation: 'Content Creation',
  customer_support: 'Customer Support',
  business_reports: 'Business Reports',
};

const TRIGGER_LABELS: Record<AutomationRunLogItem['triggerType'], string> = {
  manual: 'Manual Run',
  scheduled: 'Scheduled Auto-Run',
  strategy_action: 'Strategy Run',
};

export const AutomationActivityLog: React.FC<AutomationActivityLogProps> = ({
  logs,
  onDeleteLog,
  onClearLogs,
  onSendToChat,
  onRetryLog,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | AutomationRunStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status === 'success').length;
    const failed = logs.filter((l) => l.status === 'failed').length;
    const running = logs.filter((l) => l.status === 'running').length;
    return { total, success, failed, running };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.taskTitle.toLowerCase().includes(q) ||
        item.statusMessage.toLowerCase().includes(q) ||
        item.outputSummary.toLowerCase().includes(q) ||
        (CATEGORY_NAMES[item.category] || '').toLowerCase().includes(q)
      );
    });
  }, [logs, statusFilter, searchQuery]);

  return (
    <section
      aria-label="Automation Activity Log"
      className="glass-card rounded-3xl p-4 sm:p-6 border border-white/12 space-y-4"
    >
      {/* Header + Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/35 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              Automation Activity Log
            </h3>
            <p className="text-xs text-gray-400 font-mono tabular-nums">
              {stats.total} runs <span aria-hidden="true">·</span>{' '}
              <span className="text-emerald-400">{stats.success} succeeded</span>{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="text-rose-400">{stats.failed} failed</span>
              {stats.running > 0 && (
                <>
                  {' '}
                  <span aria-hidden="true">·</span>{' '}
                  <span className="text-cyan-300">{stats.running} running</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-[#090a0f] border border-white/10"
            role="group"
            aria-label="Filter automation logs by status"
          >
            {(['all', 'success', 'failed', 'running'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-purple-600/45 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="px-3 py-1.5 rounded-xl bg-[#131520] hover:bg-rose-950/50 border border-white/10 hover:border-rose-500/40 text-xs font-semibold text-gray-300 hover:text-rose-300 cursor-pointer whitespace-nowrap"
            >
              Clear Log
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {logs.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search automation activity history by task, status, or result..."
            className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
          />
        </div>
      )}

      {/* Log Rows */}
      {filteredLogs.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#090a0f]/75 border border-dashed border-white/15 text-center space-y-1.5">
          <p className="text-xs sm:text-sm text-gray-300 font-semibold">
            {logs.length === 0
              ? 'No automation runs recorded for this account yet.'
              : 'No log entries match your current filter.'}
          </p>
          <p className="text-[11px] text-gray-400">
            Generate a strategy, execute a workflow, or trigger a scheduled task above to inspect real-time status updates and outcomes here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div
                key={log.id}
                className="rounded-2xl bg-[#090a0f]/85 border border-white/10 overflow-hidden transition-colors"
              >
                <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {log.status === 'success' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Success</span>
                        </span>
                      )}
                      {log.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Failed</span>
                        </span>
                      )}
                      {log.status === 'running' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Running</span>
                        </span>
                      )}

                      <span aria-hidden="true" className="text-gray-600">·</span>

                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {log.taskTitle}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                      <span>{CATEGORY_NAMES[log.category] || log.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{TRIGGER_LABELS[log.triggerType] || log.triggerType}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{log.tone} tone</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(log.startedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      {typeof log.latencyMs === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{log.latencyMs} ms</span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-gray-300 truncate">{log.statusMessage}</p>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {log.status === 'failed' && onRetryLog && (
                      <button
                        type="button"
                        onClick={() => onRetryLog(log)}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-400/40 text-[11px] font-semibold text-amber-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-gray-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLog(log.id)}
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-950/50 border border-white/10 hover:border-rose-500/40 text-gray-400 hover:text-rose-300 cursor-pointer"
                      aria-label={`Delete log ${log.taskTitle}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Deliverable / Error Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-white/10 bg-[#060810]/80 space-y-3">
                    {log.errorMessage && (
                      <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200">
                        <strong className="font-bold">Failure Detail:</strong> {log.errorMessage}
                      </div>
                    )}

                    {log.outputSummary ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-purple-300">
                            Execution Output {log.modelUsed ? `(${log.modelUsed})` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onSendToChat(
                                `### Automation Output: ${log.taskTitle}\n\n${log.outputSummary}`
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-400/40 text-[11px] font-semibold text-cyan-200 flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            <span>Send to Chat</span>
                          </button>
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#0d111d] border border-white/10 text-xs sm:text-sm text-gray-100 max-h-80 overflow-y-auto">
                          <MarkdownRenderer content={log.outputSummary} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        No output deliverable stored for this run.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
