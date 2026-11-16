import React, { useState } from 'react';
import {
  CalendarClock,
  Play,
  Pause,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Repeat,
} from 'lucide-react';
import {
  AutomationScheduleFrequency,
  AutomationScheduleItem,
  AutomationTaskOptionId,
  AutomationTone,
} from '../types';

export interface AutomationSchedulerPanelProps {
  userId: string;
  selectedCategory: AutomationTaskOptionId;
  activeTone: AutomationTone;
  targetLanguage: string;
  schedules: AutomationScheduleItem[];
  executingScheduleId: string | null;
  isOnline: boolean;
  onCreateSchedule: (schedule: AutomationScheduleItem) => void;
  onToggleSchedule: (scheduleId: string) => void;
  onDeleteSchedule: (scheduleId: string) => void;
  onExecuteSchedule: (schedule: AutomationScheduleItem, triggerType: 'manual' | 'scheduled') => void;
}

const CATEGORY_LABELS: Record<AutomationTaskOptionId, string> = {
  emails: '📩 Emails',
  lead_generation: '🎯 Lead Generation',
  content_creation: '✍️ Content Creation',
  customer_support: '🤖 Customer Support',
  business_reports: '📊 Business Reports',
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const QUICK_TEMPLATES: Array<{
  title: string;
  category: AutomationTaskOptionId;
  frequency: AutomationScheduleFrequency;
  timeOfDay: string;
  dayOfWeek?: string;
  tone: AutomationTone;
  prompt: string;
}> = [
  {
    title: 'Weekly Executive Business Report',
    category: 'business_reports',
    frequency: 'weekly',
    dayOfWeek: 'Monday',
    timeOfDay: '08:30',
    tone: 'professional',
    prompt:
      'Synthesize weekly KPIs, revenue pipeline trends, operational bottlenecks, and top 3 executive priorities for the week ahead.',
  },
  {
    title: 'Daily Warm Lead Follow-Up Sequence',
    category: 'lead_generation',
    frequency: 'daily',
    timeOfDay: '09:30',
    tone: 'friendly',
    prompt:
      'Generate prioritized daily outreach follow-up messages tailored to warm leads who have not replied within 48 hours.',
  },
  {
    title: 'Daily Inbox Triage & Priority Drafts',
    category: 'emails',
    frequency: 'daily',
    timeOfDay: '09:00',
    tone: 'concise',
    prompt:
      'Create urgent-vs-normal email triage rules and high-converting concise reply templates for key stakeholder threads.',
  },
];

export function computeNextRunTimestamp(
  frequency: AutomationScheduleFrequency,
  timeOfDay: string,
  dayOfWeek?: string,
  fromMs: number = Date.now()
): number {
  const [hhRaw, mmRaw] = (timeOfDay || '09:00').split(':');
  const hours = Math.min(23, Math.max(0, Number(hhRaw) || 9));
  const minutes = Math.min(59, Math.max(0, Number(mmRaw) || 0));

  const candidate = new Date(fromMs);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes, 0, 0);

  if (frequency === 'daily') {
    if (candidate.getTime() <= fromMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  if (frequency === 'weekly') {
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const targetDay = dayMap[dayOfWeek || 'Monday'] ?? 1;
    const currentDay = candidate.getDay();
    let diff = (targetDay - currentDay + 7) % 7;
    if (diff === 0 && candidate.getTime() <= fromMs) {
      diff = 7;
    }
    candidate.setDate(candidate.getDate() + diff);
    return candidate.getTime();
  }

  // monthly
  if (candidate.getTime() <= fromMs) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate.getTime();
}

export const AutomationSchedulerPanel: React.FC<AutomationSchedulerPanelProps> = ({
  userId,
  selectedCategory,
  activeTone,
  targetLanguage,
  schedules,
  executingScheduleId,
  isOnline,
  onCreateSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  onExecuteSchedule,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AutomationTaskOptionId>(selectedCategory);
  const [frequency, setFrequency] = useState<AutomationScheduleFrequency>('weekly');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [tone, setTone] = useState<AutomationTone>(activeTone);
  const [prompt, setPrompt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleApplyPreset = (preset: (typeof QUICK_TEMPLATES)[number]) => {
    setShowForm(true);
    setTitle(preset.title);
    setCategory(preset.category);
    setFrequency(preset.frequency);
    setTimeOfDay(preset.timeOfDay);
    if (preset.dayOfWeek) setDayOfWeek(preset.dayOfWeek);
    setTone(preset.tone);
    setPrompt(preset.prompt);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanPrompt = prompt.trim();
    if (!cleanTitle) {
      setFormError('Please provide a clear title for the recurring task.');
      return;
    }
    if (!cleanPrompt) {
      setFormError('Please provide task instructions so the backend can execute it.');
      return;
    }

    const now = Date.now();
    const nextRunAt = computeNextRunTimestamp(frequency, timeOfDay, dayOfWeek, now);
    const newSchedule: AutomationScheduleItem = {
      id: `sched-${now}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      title: cleanTitle.slice(0, 200),
      category,
      frequency,
      timeOfDay,
      ...(frequency === 'weekly' ? { dayOfWeek } : {}),
      prompt: cleanPrompt.slice(0, 2000),
      tone,
      targetLanguage: targetLanguage || 'en',
      enabled: true,
      nextRunAt,
      lastStatus: 'idle',
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    onCreateSchedule(newSchedule);
    setTitle('');
    setPrompt('');
    setFormError(null);
    setShowForm(false);
  };

  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <section
      aria-label="Recurring Automation Scheduler"
      className="glass-card rounded-3xl p-4 sm:p-6 border border-white/12 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/35 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              Recurring Task Scheduler
            </h3>
            <p className="text-xs text-gray-400">
              <span className="tabular-nums">{activeCount}</span> active{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="tabular-nums">{schedules.length}</span> total saved to your account
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCategory(selectedCategory);
            setTone(activeTone);
            setShowForm((prev) => !prev);
            setFormError(null);
          }}
          className="px-4 py-2 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/40 border border-cyan-400/50 text-xs font-bold text-cyan-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{showForm ? 'Close Scheduler' : 'Schedule Recurring Task'}</span>
        </button>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 mr-1">Quick Templates:</span>
        {QUICK_TEMPLATES.map((preset) => (
          <button
            key={preset.title}
            type="button"
            onClick={() => handleApplyPreset(preset)}
            className="px-3 py-1.5 rounded-lg bg-[#090a0f] hover:bg-purple-950/40 border border-white/10 hover:border-purple-400/40 text-[11px] font-semibold text-gray-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            + {preset.title}
          </button>
        ))}
      </div>

      {/* Create Schedule Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-2xl bg-[#090a0f]/90 border border-cyan-500/35 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="sched-title" className="text-[11px] font-semibold text-gray-300">
                Task Name
              </label>
              <input
                id="sched-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Weekly KPI Business Report"
                className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="sched-category" className="text-[11px] font-semibold text-gray-300">
                Automation Category
              </label>
              <select
                id="sched-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AutomationTaskOptionId)}
                className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="sched-frequency" className="text-[11px] font-semibold text-gray-300">
                Cadence
              </label>
              <select
                id="sched-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as AutomationScheduleFrequency)}
                className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {frequency === 'weekly' && (
                <div className="space-y-1">
                  <label htmlFor="sched-day" className="text-[11px] font-semibold text-gray-300">
                    Day of Week
                  </label>
                  <select
                    id="sched-day"
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={`space-y-1 ${frequency !== 'weekly' ? 'col-span-2' : ''}`}>
                <label htmlFor="sched-time" className="text-[11px] font-semibold text-gray-300">
                  Run Time
                </label>
                <input
                  id="sched-time"
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="sched-tone" className="text-[11px] font-semibold text-gray-300">
                Output Tone
              </label>
              <select
                id="sched-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as AutomationTone)}
                className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none capitalize"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="creative">Creative</option>
                <option value="concise">Concise</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="sched-prompt" className="text-[11px] font-semibold text-gray-300">
              Automated Execution Instructions
            </label>
            <textarea
              id="sched-prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what Aadesh AI should generate or prepare on every scheduled run..."
              className="w-full bg-[#111424] border border-[#232738] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-gray-500 outline-none resize-y"
            />
          </div>

          {formError && (
            <div className="text-xs text-rose-300 font-medium">{formError}</div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="purple-glow-btn px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer whitespace-nowrap"
            >
              Save Schedule
            </button>
          </div>
        </form>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#090a0f]/75 border border-dashed border-white/15 text-center space-y-2.5">
          <p className="text-xs sm:text-sm text-gray-300">
            No recurring automation tasks scheduled yet. Create daily lead follow-ups, weekly KPI reports, or inbox digests linked to your account.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/40 border border-cyan-400/50 text-xs font-bold text-cyan-100 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Schedule</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {schedules.map((sched) => {
            const isRunning = executingScheduleId === sched.id || sched.lastStatus === 'running';
            return (
              <div
                key={sched.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-[#090a0f]/85 border border-white/10 hover:border-white/20 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      {sched.title}
                    </span>
                    {sched.lastStatus === 'success' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Last Run Succeeded</span>
                      </span>
                    )}
                    {sched.lastStatus === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Last Run Failed</span>
                      </span>
                    )}
                    {isRunning && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Running</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                    <span>{CATEGORY_LABELS[sched.category] || sched.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 capitalize text-gray-300">
                      <Repeat className="w-3 h-3 text-cyan-400" />
                      {sched.frequency}
                      {sched.frequency === 'weekly' && sched.dayOfWeek ? ` (${sched.dayOfWeek})` : ''} at{' '}
                      <span className="font-mono tabular-nums">{sched.timeOfDay}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{sched.tone} tone</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-gray-300">
                      <Clock className="w-3 h-3 text-purple-400" />
                      Next:{' '}
                      {sched.enabled
                        ? new Date(sched.nextRunAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Paused'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{sched.runCount} runs</span>
                  </div>

                  <p className="text-[11px] text-gray-400 truncate max-w-2xl">
                    {sched.prompt}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isRunning || !isOnline}
                    onClick={() => onExecuteSchedule(sched, 'manual')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/45 text-xs font-bold text-emerald-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                    title="Execute this scheduled automation now via backend"
                  >
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{isRunning ? 'Running...' : 'Run Now'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleSchedule(sched.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      sched.enabled
                        ? 'bg-purple-950/50 border-purple-400/45 text-purple-200 hover:bg-purple-900/60'
                        : 'bg-white/5 border-white/15 text-gray-300 hover:text-white'
                    }`}
                    title={sched.enabled ? 'Pause recurring schedule' : 'Resume recurring schedule'}
                  >
                    {sched.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{sched.enabled ? 'Active' : 'Paused'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteSchedule(sched.id)}
                    className="p-2 rounded-xl bg-[#131520] hover:bg-rose-950/50 border border-white/10 hover:border-rose-500/40 text-gray-400 hover:text-rose-300 cursor-pointer"
                    title="Delete schedule"
                    aria-label={`Delete ${sched.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
