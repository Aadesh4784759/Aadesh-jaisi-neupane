import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  RefreshCw,
} from 'lucide-react';
import {
  AI_PROVIDER_METADATA,
  AIProviderId,
  FailoverEventRecord,
  buildFailoverCsv,
  formatFailoverLocalTimestamp,
} from '../utils/aiProviders';

export type FailoverProviderFilter =
  | 'all'
  | 'gemini_failed'
  | 'groq_failed'
  | 'openrouter_failed'
  | 'groq_fallback'
  | 'openrouter_fallback'
  | 'gemini'
  | 'groq'
  | 'openrouter';

export type FailoverSortField =
  | 'timestamp'
  | 'failedProvider'
  | 'reasonCode'
  | 'fallbackProvider'
  | 'success';

export type SortDirection = 'asc' | 'desc';

export interface FailoverActivityTabProps {
  events: FailoverEventRecord[];
  userTimezone?: string;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const PAGE_SIZE = 10;

export function filterFailoverEvents(
  events: FailoverEventRecord[],
  filter: FailoverProviderFilter
): FailoverEventRecord[] {
  if (filter === 'all') return events;
  switch (filter) {
    case 'gemini_failed':
      return events.filter((e) => e.failedProvider === 'gemini');
    case 'groq_failed':
      return events.filter((e) => e.failedProvider === 'groq');
    case 'openrouter_failed':
      return events.filter((e) => e.failedProvider === 'openrouter');
    case 'groq_fallback':
      return events.filter((e) => e.fallbackProvider === 'groq');
    case 'openrouter_fallback':
      return events.filter((e) => e.fallbackProvider === 'openrouter');
    case 'gemini':
    case 'groq':
    case 'openrouter':
      return events.filter(
        (e) => e.failedProvider === filter || e.fallbackProvider === filter
      );
    default:
      return events;
  }
}

export function sortFailoverEvents(
  events: FailoverEventRecord[],
  field: FailoverSortField,
  direction: SortDirection
): FailoverEventRecord[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...events].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'timestamp': {
        const ta = new Date(a.timestamp).getTime() || 0;
        const tb = new Date(b.timestamp).getTime() || 0;
        cmp = ta - tb;
        break;
      }
      case 'failedProvider':
        cmp = (a.failedProvider || '').localeCompare(b.failedProvider || '');
        break;
      case 'reasonCode':
        cmp = (a.reasonCode || '').localeCompare(b.reasonCode || '');
        break;
      case 'fallbackProvider':
        cmp = (a.fallbackProvider || '').localeCompare(b.fallbackProvider || '');
        break;
      case 'success':
        cmp = Number(a.success) - Number(b.success);
        break;
    }
    if (cmp === 0) {
      return (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) * dir;
    }
    return cmp * dir;
  });
}

function getProviderLabel(provider: AIProviderId | null | undefined): string {
  if (!provider) return 'None';
  return AI_PROVIDER_METADATA[provider]?.name || provider;
}

function formatUtcTimestamp(isoTimestamp: string): string {
  try {
    const d = new Date(isoTimestamp);
    if (Number.isNaN(d.getTime())) return isoTimestamp;
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return isoTimestamp;
  }
}

export const FailoverActivityTab: React.FC<FailoverActivityTabProps> = ({
  events,
  userTimezone,
  onRefresh,
  isRefreshing = false,
}) => {
  const [providerFilter, setProviderFilter] = useState<FailoverProviderFilter>('all');
  const [sortField, setSortField] = useState<FailoverSortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const effectiveTimezone = useMemo(() => {
    if (userTimezone && userTimezone.trim()) return userTimezone.trim();
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, [userTimezone]);

  const filteredEvents = useMemo(
    () => filterFailoverEvents(events, providerFilter),
    [events, providerFilter]
  );

  const sortedEvents = useMemo(
    () => sortFailoverEvents(filteredEvents, sortField, sortDirection),
    [filteredEvents, sortField, sortDirection]
  );

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [providerFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedEvents.slice(start, start + PAGE_SIZE);
  }, [sortedEvents, currentPage]);

  const handleSort = (field: FailoverSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'timestamp' ? 'desc' : 'asc');
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = buildFailoverCsv(sortedEvents, effectiveTimezone);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aadesh-failover-activity-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderSortIcon = (field: FailoverSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-45 shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-sky-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-400 shrink-0" />
    );
  };

  const switchedCount = filteredEvents.filter((e) => e.success).length;
  const exhaustedCount = filteredEvents.filter((e) => !e.success).length;

  return (
    <div className="v2-neu-card rounded-3xl p-5 border border-purple-500/30 space-y-5">
      {/* Section Header + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-extrabold text-white">Failover Activity Log</h3>
            <span className="text-[11px] font-mono text-purple-200/80 px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 tabular-nums">
              {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
            </span>
          </div>
          <p className="text-xs text-purple-200/75 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Automatic provider switch events (Gemini → Groq → OpenRouter)</span>
            <span className="inline-flex items-center gap-1 text-sky-300 font-mono text-[11px]">
              <Clock className="w-3 h-3" />
              <span>Local timezone: {effectiveTimezone}</span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Provider Filter Dropdown */}
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl v2-neu-inset border border-white/10 text-xs text-gray-200">
            <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <select
              aria-label="Filter failover logs by provider"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as FailoverProviderFilter)}
              className="bg-transparent text-xs font-semibold text-white outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-white">All Providers (All Events)</option>
              <option value="gemini_failed" className="bg-slate-900 text-white">Gemini Failures Only</option>
              <option value="groq_failed" className="bg-slate-900 text-white">Groq Failures Only</option>
              <option value="openrouter_failed" className="bg-slate-900 text-white">OpenRouter Failures Only</option>
              <option value="groq_fallback" className="bg-slate-900 text-white">Groq Fallbacks Only</option>
              <option value="openrouter_fallback" className="bg-slate-900 text-white">OpenRouter Fallbacks Only</option>
              <option value="gemini" className="bg-slate-900 text-white">Google Gemini (All)</option>
              <option value="groq" className="bg-slate-900 text-white">Groq (All)</option>
              <option value="openrouter" className="bg-slate-900 text-white">OpenRouter (All)</option>
            </select>
          </label>

          {onRefresh && (
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-xs font-semibold text-gray-200 hover:text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={sortedEvents.length === 0}
            className="electric-purple-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Compact Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-2xl v2-neu-inset border border-white/10 flex items-center justify-between">
          <span className="text-purple-200/75">Filtered Events</span>
          <span className="text-base font-black text-white tabular-nums">{filteredEvents.length}</span>
        </div>
        <div className="p-3 rounded-2xl v2-neu-inset border border-emerald-500/25 flex items-center justify-between">
          <span className="text-emerald-200/80">Successful Failovers</span>
          <span className="text-base font-black text-emerald-300 tabular-nums">{switchedCount}</span>
        </div>
        <div className="p-3 rounded-2xl v2-neu-inset border border-rose-500/25 flex items-center justify-between">
          <span className="text-rose-200/80">All Providers Unavailable</span>
          <span className="text-base font-black text-rose-300 tabular-nums">{exhaustedCount}</span>
        </div>
      </div>

      {/* Sortable Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-black/30 text-purple-200/85 border-b border-white/10">
            <tr>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('timestamp')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>UTC Timestamp</span>
                  {renderSortIcon('timestamp')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('timestamp')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>Local Time</span>
                  {renderSortIcon('timestamp')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('failedProvider')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>Failed Provider</span>
                  {renderSortIcon('failedProvider')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('reasonCode')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>Reason Code</span>
                  {renderSortIcon('reasonCode')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('fallbackProvider')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>Fallback Provider</span>
                  {renderSortIcon('fallbackProvider')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('success')}
                  className="inline-flex items-center gap-1.5 font-bold hover:text-white cursor-pointer"
                >
                  <span>Outcome</span>
                  {renderSortIcon('success')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedEvents.map((ev) => (
              <tr key={ev.id} className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-3 font-mono text-[11px] text-gray-300 whitespace-nowrap tabular-nums">
                  {formatUtcTimestamp(ev.timestamp)}
                </td>
                <td className="py-3 px-3 text-[11px] text-sky-200 whitespace-nowrap tabular-nums">
                  {formatFailoverLocalTimestamp(ev.timestamp, effectiveTimezone)}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <div className="font-bold text-white">{getProviderLabel(ev.failedProvider)}</div>
                  {ev.failedModel && (
                    <div className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]">
                      {ev.failedModel}
                    </div>
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-500/40 font-mono text-[11px] font-bold text-amber-300">
                    {ev.reasonCode}
                  </span>
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <div className="font-bold text-white">{getProviderLabel(ev.fallbackProvider)}</div>
                  {ev.fallbackModel && (
                    <div className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]">
                      {ev.fallbackModel}
                    </div>
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  {ev.success ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Switched</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-950/60 border border-rose-500/40 text-[11px] font-bold text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>All Unavailable</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {paginatedEvents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 px-4 text-center text-gray-400">
                  {events.length === 0
                    ? 'No automatic provider failover events have occurred during current server uptime.'
                    : 'No failover events match the selected provider filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-purple-200/80">
        <div className="tabular-nums">
          {sortedEvents.length === 0
            ? 'Showing 0 events'
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                currentPage * PAGE_SIZE,
                sortedEvents.length
              )} of ${sortedEvents.length} events`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-xs font-semibold text-gray-200 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <span className="font-mono text-[11px] text-white tabular-nums px-1.5">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-xs font-semibold text-gray-200 disabled:opacity-40 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
