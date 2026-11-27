import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  FlaskConical,
  Globe,
  RefreshCw,
  Server,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AIConnectionHealth, AppSettings } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import {
  AI_PROVIDER_METADATA,
  AIProviderId,
  AIProviderStatusInfo,
  normalizeAIProviderId,
  normalizeProviderStatusInfo,
} from '../utils/aiProviders';

export type StatusLightTone = 'green' | 'yellow' | 'red' | 'grey';

export interface StatusIndicatorStyle {
  tone: StatusLightTone;
  label: string;
  textClass: string;
  dotClass: string;
  badgeClass: string;
}

export const SLOW_RESPONSE_THRESHOLD_MS = 2500;

export function getStatusLightClasses(tone: StatusLightTone): {
  textClass: string;
  dotClass: string;
  badgeClass: string;
} {
  switch (tone) {
    case 'green':
      return {
        textClass: 'text-emerald-300',
        dotClass:
          'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse transition-all duration-300',
        badgeClass:
          'bg-emerald-500/15 text-emerald-200 border-emerald-400/45 shadow-[0_0_14px_rgba(16,185,129,0.22)]',
      };
    case 'yellow':
      return {
        textClass: 'text-amber-300',
        dotClass:
          'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse transition-all duration-300',
        badgeClass:
          'bg-amber-500/15 text-amber-200 border-amber-400/45 shadow-[0_0_14px_rgba(245,158,11,0.22)]',
      };
    case 'red':
      return {
        textClass: 'text-rose-300',
        dotClass:
          'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-pulse transition-all duration-300',
        badgeClass:
          'bg-rose-500/15 text-rose-200 border-rose-400/45 shadow-[0_0_14px_rgba(244,63,94,0.22)]',
      };
    case 'grey':
    default:
      return {
        textClass: 'text-slate-300',
        dotClass:
          'bg-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.65)] transition-all duration-300',
        badgeClass:
          'bg-slate-500/15 text-slate-200 border-slate-400/40 shadow-[0_0_10px_rgba(148,163,184,0.16)]',
      };
  }
}

export interface LiveAIMonitoringSnapshot {
  activeProvider: AIProviderId;
  providerName: string;
  currentModel: string;
  effectiveOnline: boolean;
  isChecking: boolean;
  isTestingActive: boolean;
  measuredLatency: number | null;
  lastConnectedTimestamp: number | null;
  networkIndicator: StatusIndicatorStyle;
  backendIndicator: StatusIndicatorStyle;
  providerIndicator: StatusIndicatorStyle;
  selectedResponseLanguage: string;
  actualGenerationStatus: 'Verified' | 'Failed' | 'Testing AI...' | 'Not Tested';
  lastErrorText: string | null;
}

export function buildLiveAIMonitoringSnapshot(params: {
  aiHealth?: AIConnectionHealth;
  providersStatus?: Partial<Record<AIProviderId, AIProviderStatusInfo>> | null;
  settings?: Partial<AppSettings>;
  isNetworkOnline: boolean;
  isRefreshing?: boolean;
  testingProviderId?: AIProviderId | null;
}): LiveAIMonitoringSnapshot {
  const {
    aiHealth,
    providersStatus = null,
    settings,
    isNetworkOnline,
    isRefreshing = false,
    testingProviderId = null,
  } = params;

  const activeProvider: AIProviderId = normalizeAIProviderId(
    settings?.aiProvider || aiHealth?.activeProvider
  );
  const providerMeta = AI_PROVIDER_METADATA[activeProvider];
  const mergedProviders = providersStatus || aiHealth?.providers || {};
  const activeStatus = normalizeProviderStatusInfo(activeProvider, mergedProviders[activeProvider]);

  const currentModel =
    (activeProvider === 'openrouter' ? settings?.openRouterModel : undefined) ||
    settings?.aiModel ||
    activeStatus.activeModel ||
    aiHealth?.model ||
    providerMeta.defaultModel;

  const isTestingActive = testingProviderId === activeProvider;
  const isChecking = Boolean(isRefreshing || isTestingActive || aiHealth?.state === 'connecting');
  const effectiveOnline = Boolean(isNetworkOnline && !settings?.offlineModeForce);
  const backendReachable = Boolean(effectiveOnline && aiHealth?.backendConnected);

  const measuredLatency =
    typeof activeStatus.latencyMs === 'number' && activeStatus.latencyMs > 0
      ? activeStatus.latencyMs
      : typeof aiHealth?.latencyMs === 'number' && aiHealth.latencyMs > 0
      ? aiHealth.latencyMs
      : null;

  const isSlowResponse = measuredLatency !== null && measuredLatency >= SLOW_RESPONSE_THRESHOLD_MS;

  const statusLastTestedMs = activeStatus.lastTestedAt
    ? new Date(activeStatus.lastTestedAt).getTime()
    : null;
  const lastConnectedTimestamp =
    activeStatus.generationVerified && statusLastTestedMs && !Number.isNaN(statusLastTestedMs)
      ? statusLastTestedMs
      : aiHealth?.lastConnectedAt && aiHealth.activeProvider === activeProvider
      ? aiHealth.lastConnectedAt
      : activeStatus.generationVerified
      ? aiHealth?.lastConnectedAt || null
      : null;

  // 1. Internet Network Light
  const networkTone: StatusLightTone = effectiveOnline ? 'green' : 'red';
  const networkIndicator: StatusIndicatorStyle = {
    tone: networkTone,
    label: effectiveOnline
      ? 'Online'
      : settings?.offlineModeForce
      ? 'Offline (Manual)'
      : 'Offline',
    ...getStatusLightClasses(networkTone),
  };

  // 2. Backend API Light
  let backendTone: StatusLightTone = 'red';
  let backendLabel = 'Unreachable';
  if (!effectiveOnline) {
    backendTone = 'red';
    backendLabel = 'Unreachable';
  } else if (isChecking && !aiHealth?.checkedAt) {
    backendTone = 'yellow';
    backendLabel = 'Checking...';
  } else if (backendReachable) {
    if (isSlowResponse) {
      backendTone = 'yellow';
      backendLabel = 'Reachable (Slow)';
    } else {
      backendTone = 'green';
      backendLabel = 'Reachable';
    }
  } else if (isChecking) {
    backendTone = 'yellow';
    backendLabel = 'Checking...';
  }
  const backendIndicator: StatusIndicatorStyle = {
    tone: backendTone,
    label: backendLabel,
    ...getStatusLightClasses(backendTone),
  };

  // 3. AI Provider API Light
  let providerTone: StatusLightTone = 'grey';
  let providerLabel = 'Not Tested';

  if (!effectiveOnline || !backendReachable) {
    providerTone = 'red';
    providerLabel = 'Disconnected';
  } else if (isChecking) {
    providerTone = 'yellow';
    providerLabel = isTestingActive ? 'Testing AI...' : 'Checking...';
  } else if (!activeStatus.configured) {
    providerTone = 'red';
    providerLabel = 'Disconnected (Not Configured)';
  } else if (activeStatus.status === 'error' || (aiHealth?.state === 'error' && aiHealth.activeProvider === activeProvider)) {
    providerTone = 'red';
    providerLabel = 'Failed';
  } else if (
    activeStatus.status === 'connected' &&
    activeStatus.generationVerified
  ) {
    if (isSlowResponse) {
      providerTone = 'yellow';
      providerLabel = 'Connected (Slow response)';
    } else {
      providerTone = 'green';
      providerLabel = 'Connected';
    }
  } else if (activeStatus.status === 'configured') {
    providerTone = 'grey';
    providerLabel = 'Not Tested';
  } else {
    providerTone = 'grey';
    providerLabel = 'Unknown';
  }

  const providerIndicator: StatusIndicatorStyle = {
    tone: providerTone,
    label: providerLabel,
    ...getStatusLightClasses(providerTone),
  };

  const lastErrorText =
    activeStatus.status === 'error' || !activeStatus.configured || (aiHealth?.state === 'error' && aiHealth.activeProvider === activeProvider)
      ? activeStatus.error || aiHealth?.error || null
      : null;

  const rawLangCode = String(
    settings?.aiResponseLanguage || settings?.defaultTargetLanguage || 'en'
  ).trim() || 'en';
  const matchedLang = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === rawLangCode.toLowerCase()
  );
  const selectedResponseLanguage = matchedLang
    ? `${matchedLang.name} (${matchedLang.code})`
    : rawLangCode;

  const actualGenerationStatus: 'Verified' | 'Failed' | 'Testing AI...' | 'Not Tested' =
    isTestingActive
      ? 'Testing AI...'
      : activeStatus.generationVerified
      ? 'Verified'
      : activeStatus.status === 'error' ||
        !activeStatus.configured ||
        (aiHealth?.state === 'error' && aiHealth.activeProvider === activeProvider)
      ? 'Failed'
      : 'Not Tested';

  return {
    activeProvider,
    providerName: providerMeta.name,
    currentModel,
    effectiveOnline,
    isChecking,
    isTestingActive,
    measuredLatency,
    lastConnectedTimestamp,
    networkIndicator,
    backendIndicator,
    providerIndicator,
    selectedResponseLanguage,
    actualGenerationStatus,
    lastErrorText,
  };
}

export function formatLiveConnectionTimestamp(ts: number | null | undefined): string {
  if (!ts) return 'Not yet verified';
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

interface LiveAIControlCenterProps {
  aiHealth?: AIConnectionHealth;
  providersStatus?: Partial<Record<AIProviderId, AIProviderStatusInfo>> | null;
  settings: AppSettings;
  isNetworkOnline: boolean;
  isRefreshing?: boolean;
  testingProviderId?: AIProviderId | null;
  onRefreshStatus?: () => void;
  onTestProvider?: (
    providerId: AIProviderId,
    modelId?: string
  ) => Promise<{ ok: boolean; message: string; modelUsed?: string; latencyMs?: number }>;
  compact?: boolean;
}

export const LiveAIControlCenter: React.FC<LiveAIControlCenterProps> = ({
  aiHealth,
  providersStatus = null,
  settings,
  isNetworkOnline,
  isRefreshing = false,
  testingProviderId = null,
  onRefreshStatus,
  onTestProvider,
  compact = false,
}) => {
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const snapshot = buildLiveAIMonitoringSnapshot({
    aiHealth,
    providersStatus,
    settings,
    isNetworkOnline,
    isRefreshing,
    testingProviderId,
  });

  const activeErrorMessage = (!testResult?.ok && testResult?.message) || snapshot.lastErrorText;

  const handleRunTest = async () => {
    if (!onTestProvider || testingProviderId) return;
    setTestResult(null);
    const res = await onTestProvider(snapshot.activeProvider, snapshot.currentModel);
    setTestResult({ ok: res.ok, message: res.message });
  };

  return (
    <section
      aria-label="Live AI Control Center"
      className={`v2-neu-card rounded-3xl border border-purple-400/35 space-y-4 transition-all ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shrink-0">
            <Activity className="w-4.5 h-4.5 text-purple-200" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Live AI Control Center
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${snapshot.providerIndicator.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${snapshot.providerIndicator.dotClass}`} />
                <span>{snapshot.providerIndicator.label}</span>
              </span>
            </div>
            <p className="text-[11px] text-purple-200/75 truncate">
              Real-time monitoring dashboard · Configure providers in Settings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onRefreshStatus && (
            <button
              type="button"
              onClick={() => {
                setTestResult(null);
                onRefreshStatus();
              }}
              disabled={snapshot.isChecking}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl v2-neu-inset border border-white/15 hover:border-purple-400/50 text-xs font-bold text-purple-100 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-55 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-sky-300 ${snapshot.isChecking ? 'animate-spin' : ''}`}
              />
              <span>{snapshot.isChecking ? 'Refreshing...' : 'Refresh Status'}</span>
            </button>
          )}
          {onTestProvider && (
            <button
              type="button"
              onClick={() => void handleRunTest()}
              disabled={Boolean(testingProviderId) || !snapshot.effectiveOnline}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl electric-purple-btn text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-55 transition-all"
            >
              <FlaskConical
                className={`w-3.5 h-3.5 ${snapshot.isTestingActive ? 'animate-pulse' : ''}`}
              />
              <span>{snapshot.isTestingActive ? 'Testing AI...' : 'Test Connection'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-Time Telemetry Metrics (Exact 7 Monitoring Items) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {/* 1. Internet Network */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
              {snapshot.effectiveOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Internet Network</span>
            </span>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${snapshot.networkIndicator.dotClass}`} />
          </div>
          <div className={`text-sm font-extrabold ${snapshot.networkIndicator.textClass}`}>
            {snapshot.networkIndicator.label}
          </div>
        </div>

        {/* 2. Backend API */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-purple-300" />
              <span>Backend API</span>
            </span>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${snapshot.backendIndicator.dotClass}`} />
          </div>
          <div className={`text-sm font-extrabold ${snapshot.backendIndicator.textClass}`}>
            {snapshot.backendIndicator.label}
          </div>
        </div>

        {/* 3. AI Provider API */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-300" />
              <span>AI Provider API</span>
            </span>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${snapshot.providerIndicator.dotClass}`} />
          </div>
          <div className={`text-sm font-extrabold truncate ${snapshot.providerIndicator.textClass}`}>
            {snapshot.providerIndicator.label}
          </div>
        </div>

        {/* 4. Current Provider */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>Current Provider</span>
          </span>
          <div className="text-sm font-extrabold text-white truncate">
            {snapshot.providerName}
          </div>
        </div>

        {/* 5. Current Model */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>Current Model</span>
          </span>
          <div
            className="text-xs font-bold font-mono text-sky-300 truncate pt-0.5"
            title={snapshot.currentModel}
          >
            {snapshot.currentModel}
          </div>
        </div>

        {/* 6. API Connection Latency */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>API Connection Latency</span>
          </span>
          <div className="text-sm font-black font-mono text-white tabular-nums">
            {snapshot.measuredLatency !== null ? `${snapshot.measuredLatency} ms` : 'Not tested'}
          </div>
        </div>

        {/* 7. Last Successful Connection */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-300" />
            <span>Last Successful Connection</span>
          </span>
          <div className="text-xs font-semibold text-purple-100 tabular-nums truncate">
            {formatLiveConnectionTimestamp(snapshot.lastConnectedTimestamp)}
          </div>
        </div>

        {/* 8. Selected Response Language */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-300" />
            <span>Selected Response Language</span>
          </span>
          <div className="text-xs font-bold text-white truncate">
            {snapshot.selectedResponseLanguage}
          </div>
        </div>

        {/* 9. Actual AI Generation Status */}
        <div className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-purple-200/70 flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5 text-amber-300" />
            <span>Actual AI Generation Status</span>
          </span>
          <div
            className={`text-sm font-extrabold ${
              snapshot.actualGenerationStatus === 'Verified'
                ? 'text-emerald-300'
                : snapshot.actualGenerationStatus === 'Failed'
                ? 'text-rose-300'
                : snapshot.actualGenerationStatus === 'Testing AI...'
                ? 'text-amber-300'
                : 'text-slate-300'
            }`}
          >
            {snapshot.actualGenerationStatus}
          </div>
        </div>
      </div>

      {/* Live Test Feedback / Useful Error Alert */}
      {testResult?.ok && (
        <div
          role="status"
          className="p-3 rounded-2xl bg-emerald-950/45 border border-emerald-400/40 text-xs text-emerald-200 flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{testResult.message}</span>
        </div>
      )}

      {activeErrorMessage && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-rose-950/45 border border-rose-400/40 text-xs text-rose-200 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <div className="font-bold text-rose-300">Last API Error</div>
            <p className="break-words leading-relaxed">{activeErrorMessage}</p>
          </div>
        </div>
      )}
    </section>
  );
};
