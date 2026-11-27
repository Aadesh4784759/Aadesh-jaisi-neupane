import React, { useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Clock,
  Edit3,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AIMemoryItem, AppSettings, MemoryCategory, UserProfile } from '../types';
import {
  POWER_MEMORY_CATEGORIES,
  containsSecretOrCredential,
  formatMemoryUpdatedTimestamp,
  getLastMemoryUpdatedAt,
} from '../utils/powerMemory';

interface PowerMemorySectionProps {
  user: UserProfile;
  settings: AppSettings;
  memories: AIMemoryItem[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onAddMemory: (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
  }) => { ok: boolean; error?: string };
  onUpdateMemory: (id: string, patch: { category?: MemoryCategory; content?: string }) => {
    ok: boolean;
    error?: string;
  };
  onToggleMemoryApproved: (id: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearAllMemories: () => Promise<void> | void;
}

export const PowerMemorySection: React.FC<PowerMemorySectionProps> = ({
  user,
  settings,
  memories,
  onUpdateSettings,
  onAddMemory,
  onUpdateMemory,
  onToggleMemoryApproved,
  onDeleteMemory,
  onClearAllMemories,
}) => {
  const shouldReduceMotion = useReducedMotion() || Boolean(settings.reducedAnimations);
  const [selectedCategory, setSelectedCategory] = useState<'all' | MemoryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [newContent, setNewContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<MemoryCategory>('preference');
  const [editingContent, setEditingContent] = useState('');

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const isConsentAgreed = settings.memoryConsent === 'agreed';
  const isMemoryEnabled = isConsentAgreed && settings.aiMemoryEnabled !== false;
  const isSmartAutoEnabled = isMemoryEnabled && settings.smartMemoryAutoSave !== false;

  const lastUpdatedTs = useMemo(() => getLastMemoryUpdatedAt(memories), [memories]);
  const lastUpdatedText = useMemo(() => formatMemoryUpdatedTimestamp(lastUpdatedTs), [lastUpdatedTs]);

  const activeMemoriesCount = useMemo(
    () => memories.filter((m) => m.approved).length,
    [memories]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: memories.length };
    for (const m of memories) {
      counts[m.category] = (counts[m.category] || 0) + 1;
    }
    return counts;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return memories.filter((m) => {
      if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;
      if (q && !m.content.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [memories, selectedCategory, searchQuery]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const handleTogglePowerMemory = () => {
    const nextEnabled = !isMemoryEnabled;
    onUpdateSettings({
      aiMemoryEnabled: nextEnabled,
      memoryConsent: nextEnabled ? 'agreed' : 'disagreed',
    });
    showStatus(nextEnabled ? 'Power Memory enabled.' : 'Power Memory paused.');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = newContent.trim();
    if (!trimmed) {
      setFormError('Enter a preference, goal, project, or fact to save.');
      return;
    }
    if (containsSecretOrCredential(trimmed)) {
      setFormError('Passwords, API keys, and credentials are never allowed in Power Memory.');
      return;
    }
    const result = onAddMemory({
      category: newCategory,
      content: trimmed,
      source: 'manual',
    });
    if (!result.ok) {
      setFormError(result.error || 'Unable to save this memory.');
      return;
    }
    setNewContent('');
    showStatus('Saved to Power Memory.');
  };

  const handleSaveEdit = (id: string) => {
    setFormError(null);
    const trimmed = editingContent.trim();
    if (!trimmed) {
      setFormError('Memory text cannot be empty.');
      return;
    }
    if (containsSecretOrCredential(trimmed)) {
      setFormError('Secrets or credentials cannot be stored in Power Memory.');
      return;
    }
    const res = onUpdateMemory(id, {
      category: editingCategory,
      content: trimmed,
    });
    if (!res.ok) {
      setFormError(res.error || 'Could not update memory.');
      return;
    }
    setEditingId(null);
    setEditingContent('');
    showStatus('Memory updated.');
  };

  const handleConfirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      await onClearAllMemories();
      setConfirmClearOpen(false);
      setEditingId(null);
      showStatus('All saved Power Memories cleared.');
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-label="Power Memory Management"
      className="relative overflow-hidden rounded-3xl p-5 border border-violet-300/30 bg-gradient-to-br from-[#1d123b]/85 via-[#241648]/80 to-[#191033]/90 backdrop-blur-xl shadow-[0_16px_48px_rgba(109,40,217,0.22)] space-y-4"
    >
      {/* Subtle lavender ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-violet-500/20 blur-3xl"
      />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-violet-200/15 pb-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/35 to-fuchsia-500/25 border border-violet-300/40 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(167,139,250,0.3)]">
            <Brain className="w-5 h-5 text-violet-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
              Power Memory
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-violet-200/75 tabular-nums mt-0.5">
              <span>
                {activeMemoriesCount} active / {memories.length} saved
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-violet-300/80" />
                <span>Last updated: {lastUpdatedText}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{user.isLoggedIn ? 'Cloud Firestore Synced' : 'Local Session Only'}</span>
            </div>
          </div>
        </div>

        {/* Enable / Disable & Clear Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={isMemoryEnabled}
            onClick={handleTogglePowerMemory}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              isMemoryEnabled
                ? 'bg-violet-500/25 border-violet-300/50 text-white hover:bg-violet-500/35'
                : 'bg-white/5 border-white/15 text-violet-200/75 hover:text-white'
            }`}
          >
            <span>{isMemoryEnabled ? 'Power Memory ON' : 'Power Memory OFF'}</span>
            <span
              className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                isMemoryEnabled ? 'bg-emerald-400 justify-end' : 'bg-white/20 justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow" />
            </span>
          </button>

          {memories.length > 0 && !confirmClearOpen && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Memory</span>
            </button>
          )}
        </div>
      </div>

      {/* Two-step inline Clear All confirmation */}
      <AnimatePresence>
        {confirmClearOpen && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-400/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-2 text-rose-100">
              <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Clear all {memories.length} Power Memories?</div>
                <p className="text-[11px] text-rose-200/80">
                  This permanently removes all saved memories from this device and your Cloud Firestore account.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => setConfirmClearOpen(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => void handleConfirmClearAll()}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                {isClearingAll ? 'Clearing...' : 'Confirm Clear All'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status & Error Alerts */}
      {statusMessage && (
        <div
          role="status"
          className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs text-emerald-200 font-semibold flex items-center gap-2"
        >
          <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-xs text-rose-200 font-semibold flex items-center gap-2"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-300 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Consent / Enable Prompt when disabled */}
      {!isConsentAgreed ? (
        <div className="p-4 rounded-2xl bg-violet-950/55 border border-violet-300/25 space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-bold text-white">
                {settings.memoryConsent === 'disagreed'
                  ? 'Power Memory is Currently Disabled'
                  : 'Enable ChatGPT-Style Persistent Power Memory?'}
              </div>
              <p className="text-xs text-violet-200/80 leading-relaxed">
                With your permission, Aadesh AI remembers your name, goals, ongoing projects, interests, and humor style across chats—stored privately under your Firebase UID. Sensitive details always ask permission first, and secrets are never stored.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onUpdateSettings({
                  memoryConsent: 'agreed',
                  aiMemoryEnabled: true,
                  smartMemoryAutoSave: true,
                });
                showStatus('Power Memory enabled.');
              }}
              className="electric-purple-btn min-h-[38px] px-4 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Enable Power Memory</span>
            </button>
            {settings.memoryConsent !== 'disagreed' && (
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ memoryConsent: 'disagreed', aiMemoryEnabled: false })
                }
                className="min-h-[38px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-violet-200 cursor-pointer"
              >
                Keep Disabled
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Smart Memory & Privacy Control Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ smartMemoryAutoSave: !isSmartAutoEnabled })
              }
              className="p-3 rounded-2xl bg-violet-950/45 border border-violet-300/20 hover:border-violet-300/40 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  <span>Smart Auto-Memory</span>
                </div>
                <p className="text-[11px] text-violet-200/70 mt-0.5">
                  Detects helpful non-sensitive preferences, goals &amp; projects automatically.
                </p>
              </div>
              <span
                className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                  isSmartAutoEnabled ? 'bg-violet-400 justify-end' : 'bg-white/15 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow" />
              </span>
            </button>

            <div className="p-3 rounded-2xl bg-violet-950/45 border border-violet-300/20 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>Chat Commands Supported</span>
                </div>
                <p className="text-[11px] text-violet-200/70 mt-0.5">
                  Say &ldquo;Remember this&rdquo;, &ldquo;Save this memory&rdquo;, or &ldquo;Forget this&rdquo; anytime.
                </p>
              </div>
            </div>
          </div>

          {/* Add New Memory Form */}
          <form onSubmit={handleAddSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <select
              aria-label="New memory category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              className="sm:col-span-3 min-h-[42px] px-3 py-2 rounded-xl bg-[#130c2a]/90 border border-violet-300/30 text-xs text-white outline-none focus:border-violet-300 cursor-pointer"
            >
              {POWER_MEMORY_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Memory details"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g., Call me Sagar, I enjoy witty sci-fi analogies and TypeScript projects..."
              className="sm:col-span-7 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#130c2a]/90 border border-violet-300/30 text-xs text-white placeholder-violet-300/45 outline-none focus:border-violet-300"
            />
            <button
              type="submit"
              className="sm:col-span-2 electric-purple-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Save</span>
            </button>
          </form>

          {/* Category Filter Bar + Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-violet-500/35 text-white border border-violet-300/50'
                    : 'bg-white/5 text-violet-200/75 hover:text-white border border-transparent'
                }`}
              >
                All ({categoryCounts.all || 0})
              </button>
              {POWER_MEMORY_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.id] || 0;
                if (count === 0 && selectedCategory !== cat.id) return null;
                return (
                  <button
                    key={`filter-${cat.id}`}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat.id
                        ? 'bg-violet-500/35 text-white border border-violet-300/50'
                        : 'bg-white/5 text-violet-200/75 hover:text-white border border-transparent'
                    }`}
                  >
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {memories.length > 0 && (
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-violet-300/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search saved memories"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search memories..."
                  className="w-full min-h-[36px] pl-8 pr-3 py-1.5 rounded-xl bg-[#130c2a]/85 border border-violet-300/25 text-xs text-white placeholder-violet-300/45 outline-none focus:border-violet-300"
                />
              </div>
            )}
          </div>

          {/* Saved Memories List */}
          {filteredMemories.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-[#130c2a]/60 border border-violet-300/15 text-xs text-violet-200/75">
              {memories.length === 0
                ? 'No Power Memories saved yet. Add one above or tell Aadesh AI "Remember this..." during chat.'
                : 'No memories match the active filter or search.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {filteredMemories.map((mem) => {
                  const isEditing = editingId === mem.id;
                  const catMeta =
                    POWER_MEMORY_CATEGORIES.find((c) => c.id === mem.category) ||
                    POWER_MEMORY_CATEGORIES[POWER_MEMORY_CATEGORIES.length - 1];
                  return (
                    <motion.div
                      key={mem.id}
                      layout={!shouldReduceMotion}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="p-3.5 rounded-2xl bg-[#130c2a]/70 border border-violet-300/20 hover:border-violet-300/35 transition-colors space-y-2"
                    >
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <select
                            aria-label="Edit memory category"
                            value={editingCategory}
                            onChange={(e) => setEditingCategory(e.target.value as MemoryCategory)}
                            className="sm:col-span-3 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#0e0820] border border-violet-300/35 text-xs text-white outline-none"
                          >
                            {POWER_MEMORY_CATEGORIES.map((cat) => (
                              <option key={`edit-${cat.id}`} value={cat.id}>
                                {cat.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            aria-label="Edit memory content"
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="sm:col-span-6 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0e0820] border border-sky-400/45 text-xs text-white outline-none"
                          />
                          <div className="sm:col-span-3 flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(mem.id)}
                              className="min-h-[36px] px-3 py-1 rounded-xl electric-purple-btn text-xs font-bold text-white cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel editing memory"
                              onClick={() => {
                                setEditingId(null);
                                setEditingContent('');
                              }}
                              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-white/10 text-xs text-violet-100 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            {/* Clean unboxed metadata row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-violet-300/85 tabular-nums">
                              <span className="font-bold text-violet-200">{catMeta.label}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {mem.source === 'smart_auto'
                                  ? 'Smart Auto'
                                  : mem.source === 'command'
                                  ? 'Chat Command'
                                  : 'Manual'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className={mem.approved ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
                                {mem.approved ? 'Active in AI' : 'Paused'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Updated {formatMemoryUpdatedTimestamp(mem.updatedAt)}</span>
                            </div>
                            <p className="text-xs sm:text-[13px] text-white/95 leading-relaxed break-words">
                              {mem.content}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              title={mem.approved ? 'Pause this memory in future chats' : 'Include this memory in future chats'}
                              aria-label={mem.approved ? 'Pause memory' : 'Activate memory'}
                              onClick={() => onToggleMemoryApproved(mem.id)}
                              className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-violet-100 inline-flex items-center gap-1 cursor-pointer"
                            >
                              {mem.approved ? (
                                <>
                                  <PauseCircle className="w-3.5 h-3.5 text-amber-300" />
                                  <span>Pause</span>
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="w-3.5 h-3.5 text-emerald-300" />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              title="Edit memory"
                              aria-label="Edit memory"
                              onClick={() => {
                                setEditingId(mem.id);
                                setEditingCategory(mem.category);
                                setEditingContent(mem.content);
                              }}
                              className="min-h-[34px] w-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-violet-200 hover:text-white flex items-center justify-center cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete memory"
                              aria-label="Delete memory"
                              onClick={() => {
                                onDeleteMemory(mem.id);
                                showStatus('Memory deleted.');
                              }}
                              className="min-h-[34px] w-8 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
};
