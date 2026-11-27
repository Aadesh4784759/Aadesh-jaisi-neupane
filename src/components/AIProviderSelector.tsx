import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FlaskConical,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import {
  AI_PROVIDER_METADATA,
  AIModelOption,
  AIProviderId,
  AIProviderStatusInfo,
  getProviderSelectorOptionLabel,
  getProviderStatusLabel,
  getStaticCatalogForProvider,
  normalizeAIProviderId,
  normalizeProviderStatusInfo,
  ProviderConnectionState,
  resolveProviderHealthDisplay,
  resolveSafeModelForProvider,
} from '../utils/aiProviders';
import { AppSettings } from '../types';

interface AIProviderSelectorProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  providersStatus: Partial<Record<AIProviderId, AIProviderStatusInfo>> | null;
  isLoadingStatus?: boolean;
  testingProviderId?: AIProviderId | null;
  onRefreshStatus?: () => void;
  onTestProvider?: (
    providerId: AIProviderId,
    modelId?: string
  ) => Promise<{ ok: boolean; message: string; modelUsed?: string; latencyMs?: number }>;
  compact?: boolean;
}

const PROVIDER_ORDER: AIProviderId[] = ['gemini', 'groq', 'openrouter'];

function getStatusBadgeClasses(status: ProviderConnectionState): string {
  if (status === 'connected') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40';
  }
  if (status === 'configured') {
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40';
  }
  if (status === 'not_configured') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
  }
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40';
}

function getStatusDotClass(status: ProviderConnectionState): string {
  if (status === 'connected') {
    return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] animate-pulse';
  }
  if (status === 'configured') {
    return 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.65)]';
  }
  return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.85)] animate-pulse';
}

function getTroubleshootingTip(errorMsg?: string): string {
  const msg = (errorMsg || '').toLowerCase();
  if (msg.includes('api_key') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('invalid')) {
    return 'Action: Check server environment variables (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY) and ensure keys are valid and unexpired.';
  }
  if (msg.includes('rate_limit') || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
    return 'Action: Rate limit exceeded. Wait 30-60 seconds or switch to another supported model.';
  }
  if (msg.includes('credit') || msg.includes('balance') || msg.includes('402') || msg.includes('insufficient')) {
    return 'Action: Insufficient credits or balance on OpenRouter/Groq. Switch to a free model or replenish credits.';
  }
  if (msg.includes('thinking') || msg.includes('unsupported') || msg.includes('reasoning')) {
    return 'Action: The selected model does not support thinking/reasoning parameters. Choose a standard chat model.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Action: Request timed out. Check your internet connection or try again later.';
  }
  if (msg.includes('not_configured') || msg.includes('missing')) {
    return 'Action: Provider API key is missing from server environment variables.';
  }
  return 'Action: Verify API credentials in server environment, check model ID validity, or run connection test again.';
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  settings,
  onUpdateSettings,
  providersStatus,
  isLoadingStatus = false,
  testingProviderId = null,
  onRefreshStatus,
  onTestProvider,
}) => {
  const activeProvider: AIProviderId = normalizeAIProviderId(settings.aiProvider);
  const [cardTestFeedbacks, setCardTestFeedbacks] = useState<
    Partial<Record<AIProviderId, { ok: boolean; message: string }>>
  >({});

  const getProviderStatus = (id: AIProviderId): AIProviderStatusInfo => {
    return normalizeProviderStatusInfo(id, providersStatus?.[id]);
  };

  const handleUseThisAi = (pid: AIProviderId) => {
    const info = getProviderStatus(pid);
    const catalog =
      Array.isArray(info.models) && info.models.length > 0
        ? info.models
        : getStaticCatalogForProvider(pid);
    const currentOpenRouterSelection =
      pid === 'openrouter' ? settings.openRouterModel : undefined;
    const safeResolved = resolveSafeModelForProvider(
      pid,
      catalog,
      currentOpenRouterSelection || info.defaultModel,
      { allowPaidExplicit: Boolean(currentOpenRouterSelection) }
    );
    onUpdateSettings({
      aiProvider: pid,
      aiModel: safeResolved.modelId,
      ...(pid === 'openrouter' ? { openRouterModel: safeResolved.modelId } : {}),
    });
  };

  const handleTestSpecificProvider = async (pid: AIProviderId) => {
    if (!onTestProvider || testingProviderId) return;
    const info = getProviderStatus(pid);
    const catalog =
      Array.isArray(info.models) && info.models.length > 0
        ? info.models
        : getStaticCatalogForProvider(pid);
    const resolved = resolveSafeModelForProvider(pid, catalog, pid === 'openrouter' ? settings.openRouterModel : settings.aiModel, {
      allowPaidExplicit: true,
    });

    setCardTestFeedbacks((prev) => ({ ...prev, [pid]: undefined }));
    const result = await onTestProvider(pid, resolved.modelId);
    setCardTestFeedbacks((prev) => ({
      ...prev,
      [pid]: { ok: result.ok, message: result.message },
    }));
  };

  return (
    <div className="space-y-5">
      {/* Dashboard Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[var(--theme-primary)]" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              AI Provider Dashboard
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure multi-AI providers, choose models, inspect error logs, and run real AI generation tests. Google Gemini is default.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefreshStatus && (
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={isLoadingStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
              <span>{isLoadingStatus ? 'Refreshing...' : 'Refresh Status'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Real Measured Provider Response Time Comparison */}
      <div
        aria-label="Provider Response Time Comparison"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs"
      >
        {PROVIDER_ORDER.map((pid) => {
          const info = getProviderStatus(pid);
          const meta = AI_PROVIDER_METADATA[pid];
          const isCurrent = pid === activeProvider;
          const measuredMs = typeof info.latencyMs === 'number' && info.latencyMs > 0 ? info.latencyMs : null;
          const compareHealth = resolveProviderHealthDisplay(info, {
            isTesting: testingProviderId === pid,
            isRefreshing: isLoadingStatus,
          });
          return (
            <div
              key={`latency-compare-${pid}`}
              title={compareHealth.tooltip}
              className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                isCurrent
                  ? 'border-purple-500/60 bg-purple-500/10'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40'
              }`}
            >
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{meta.shortName}</span>
                  <span
                    role="status"
                    aria-label={compareHealth.tooltip}
                    className={`w-2 h-2 rounded-full shrink-0 ${compareHealth.dotClass}`}
                  />
                  <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-300 tabular-nums shrink-0">
                    {measuredMs !== null ? `${measuredMs}ms` : 'Untested'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {info.activeModel || meta.defaultModel}
                </div>
              </div>
              <span className={`text-[10px] font-bold shrink-0 ${compareHealth.textClass}`}>
                {compareHealth.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Professional AI Provider Cards Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROVIDER_ORDER.map((pid) => {
          const info = getProviderStatus(pid);
          const meta = AI_PROVIDER_METADATA[pid];
          const isCurrent = pid === activeProvider;
          const isTestingThis = testingProviderId === pid;
          const feedback = cardTestFeedbacks[pid];
          const keyStatus = info.configured ? 'Configured' : 'Missing';
          const apiConnectionStatus =
            info.status === 'connected'
              ? 'Connected'
              : info.status === 'configured'
              ? 'Connected (Untested)'
              : info.status === 'not_configured'
              ? 'Disconnected'
              : 'Error';
          const realGenerationStatus = info.generationVerified
            ? 'Verified'
            : info.status === 'error'
            ? 'Failed'
            : 'Untested';

          const troubleshootingTip = getTroubleshootingTip(info.error || feedback?.message);
          const healthDisplay = resolveProviderHealthDisplay(info, {
            isTesting: isTestingThis,
            isRefreshing: isLoadingStatus,
          });
          const compactLatencyText =
            typeof info.latencyMs === 'number' && info.latencyMs > 0
              ? `${info.latencyMs}ms`
              : 'Untested';

          return (
            <div
              key={`provider-card-${pid}`}
              className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all relative overflow-hidden ${
                isCurrent
                  ? 'border-purple-500/90 bg-purple-950/20 shadow-[0_8px_30px_rgba(139,92,246,0.22)] dark:bg-purple-950/35 ring-2 ring-purple-500/40'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50'
              }`}
            >
              {/* Top Card Header */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div
                      className="flex flex-wrap items-center gap-1.5 min-w-0"
                      title={healthDisplay.tooltip}
                    >
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                        {meta.name}
                      </h4>
                      <span
                        role="status"
                        aria-label={healthDisplay.tooltip}
                        title={healthDisplay.tooltip}
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDisplay.dotClass}`}
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                        {compactLatencyText}
                      </span>
                    </div>
                    <div
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] tabular-nums"
                      title={healthDisplay.tooltip}
                    >
                      <span className={`font-bold ${healthDisplay.textClass}`}>
                        {healthDisplay.label}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        {healthDisplay.timestampText}
                      </span>
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md animate-pulse shrink-0">
                      ACTIVE
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUseThisAi(pid)}
                      className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-extrabold shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Use this AI
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {meta.description}
                </p>
              </div>

              {/* Detailed Provider Metrics (1 to 8) */}
              <div className="space-y-2 text-xs border-t border-b border-slate-200/70 dark:border-slate-800/80 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">API Key Status</span>
                  <span className={`font-bold ${info.configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {keyStatus} ({meta.envVarName})
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">API Connection</span>
                  <span className={`font-bold ${info.status === 'connected' || info.status === 'configured' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {apiConnectionStatus}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Real AI Generation</span>
                  <span className={`font-bold ${info.generationVerified ? 'text-emerald-600 dark:text-emerald-400' : info.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {realGenerationStatus}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 relative group/model">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 cursor-help">
                    <span>Active Model</span>
                    <HelpCircle className="w-3 h-3 text-slate-400" />
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]" title={info.activeModel || info.defaultModel}>
                    {info.activeModel || info.defaultModel}
                  </span>
                  <div className="absolute left-0 bottom-full mb-2 w-72 p-2.5 rounded-xl bg-slate-900 text-white text-[10.5px] shadow-2xl border border-slate-700 opacity-0 group-hover/model:opacity-100 transition-opacity pointer-events-none z-30">
                    <p className="font-bold text-purple-300 mb-1">Model Capabilities &amp; Thinking Compatibility:</p>
                    <p className="leading-relaxed">
                      {pid === 'gemini'
                        ? 'Google Gemini model. Supports advanced reasoning and thinking levels (thinkingConfig: MINIMAL/MEDIUM). Fully compatible.'
                        : pid === 'groq'
                        ? 'Groq ultra-fast LPU inference model. Uses standard OpenAI chat completion spec. Thinking parameters are automatically omitted for full compatibility.'
                        : 'OpenRouter model catalog. Uses standard OpenAI-compatible API spec. Thinking parameters are omitted to prevent unsupported model errors.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Currently Running</span>
                  <span className={`font-extrabold ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`}>
                    {isCurrent ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Last Test &amp; Latency</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">
                    {typeof info.latencyMs === 'number' && info.latencyMs > 0 ? `${info.latencyMs} ms` : 'Not tested'}
                  </span>
                </div>

                {/* Model Selector per Provider */}
                {(() => {
                  const catalog =
                    Array.isArray(info.models) && info.models.length > 0
                      ? info.models
                      : getStaticCatalogForProvider(pid);
                  const currentSelectedModel =
                    pid === 'openrouter'
                      ? settings.openRouterModel || (isCurrent ? settings.aiModel : info.activeModel)
                      : isCurrent
                      ? settings.aiModel || info.activeModel
                      : info.activeModel;
                  const resolvedSel = resolveSafeModelForProvider(pid, catalog, currentSelectedModel, {
                    allowPaidExplicit: true,
                  });
                  return (
                    <label className="block pt-1 space-y-1">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Select Model
                      </span>
                      <select
                        aria-label={`Select model for ${meta.name}`}
                        value={resolvedSel.modelId}
                        onChange={(e) => {
                          const nextModel = e.target.value;
                          onUpdateSettings({
                            ...(pid === 'openrouter' ? { openRouterModel: nextModel } : {}),
                            ...(isCurrent ? { aiModel: nextModel } : {}),
                          });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-purple-500 cursor-pointer"
                      >
                        {catalog.map((m) => (
                          <option key={`${pid}-opt-${m.id}`} value={m.id}>
                            {m.name} {m.isFree === false ? '(Paid)' : '(Free)'}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })()}
              </div>

              {/* Error Log Section (Last 3 Failed Tests/Calls) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>Error Log</span>
                  <span className="tabular-nums">
                    {info.errorLog && info.errorLog.length > 0 ? `${info.errorLog.length} recent` : '0 errors'}
                  </span>
                </div>
                {info.errorLog && info.errorLog.length > 0 ? (
                  <ul className="space-y-1.5">
                    {info.errorLog.slice(0, 3).map((errEntry, idx) => {
                      const entryTip = getTroubleshootingTip(errEntry.message);
                      return (
                        <li
                          key={`${pid}-errlog-${errEntry.timestamp}-${idx}`}
                          title={`${errEntry.message}\n${entryTip}`}
                          className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[10.5px] text-rose-800 dark:text-rose-200 flex items-start gap-1.5"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 break-words font-medium">{errEntry.message}</p>
                            <div className="text-[9.5px] font-mono opacity-75 flex items-center justify-between gap-2 mt-0.5">
                              <span className="truncate">{errEntry.model}</span>
                              <span className="shrink-0 tabular-nums">
                                {new Date(errEntry.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    No recent errors recorded.
                  </p>
                )}
              </div>

              {/* Error Details & Detailed Hoverable Troubleshooting Tooltip */}
              <div className="space-y-2.5">
                {info.error && !feedback && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200 leading-snug relative group">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{info.error}</span>
                      <div className="relative shrink-0 cursor-help">
                        <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2.5 rounded-xl bg-slate-900 text-white text-[10.5px] shadow-2xl border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                          <p className="font-bold text-amber-300 mb-1">Troubleshooting Tip:</p>
                          <p className="leading-relaxed">{troubleshootingTip}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {feedback && (
                  <div
                    className={`p-2.5 rounded-xl border text-[11px] leading-snug flex items-start gap-1.5 relative group ${
                      feedback.ok
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {feedback.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span>{feedback.message}</span>
                      {!feedback.ok && (
                        <div className="mt-1 text-[10px] text-rose-300 font-semibold underline cursor-help">
                          Hover for troubleshooting steps
                        </div>
                      )}
                    </div>
                    {!feedback.ok && (
                      <div className="absolute right-2 top-2 group/tip cursor-help">
                        <HelpCircle className="w-4 h-4 text-rose-400" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2.5 rounded-xl bg-slate-900 text-white text-[10.5px] shadow-2xl border border-slate-700 opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-30">
                          <p className="font-bold text-rose-300 mb-1">Troubleshooting Tip:</p>
                          <p className="leading-relaxed">{troubleshootingTip}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {onTestProvider && (
                  <button
                    type="button"
                    onClick={() => void handleTestSpecificProvider(pid)}
                    disabled={Boolean(testingProviderId)}
                    className="w-full py-2 px-3 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-xs font-extrabold text-sky-700 dark:text-sky-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FlaskConical className={`w-3.5 h-3.5 ${isTestingThis ? 'animate-pulse' : ''}`} />
                    <span>{isTestingThis ? 'Testing Real Generation...' : 'Test Connection'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
