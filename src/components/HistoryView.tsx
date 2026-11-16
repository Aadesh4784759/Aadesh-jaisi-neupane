import React, { useMemo, useState } from 'react';
import {
  History,
  Search,
  MessageSquare,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Calendar,
  ArrowRight,
  Globe,
  Folder,
} from 'lucide-react';
import { ChatSession } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface HistoryViewProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onOpenSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  currentSessionId,
  onOpenSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...sessions]
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
      .filter((s) => {
        if (!q) return true;
        if (s.title.toLowerCase().includes(q)) return true;
        if ((s.category || '').toLowerCase().includes(q)) return true;
        return s.messages.some((m) => m.content.toLowerCase().includes(q));
      });
  }, [sessions, searchQuery]);

  const formatSessionDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const handleCommitRename = (id: string) => {
    const clean = editingTitle.trim();
    if (clean) {
      onRenameSession(id, clean);
    }
    setEditingId(null);
    setEditingTitle('');
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
            <History className="w-4 h-4 text-purple-400" />
            <span>Conversation Archive</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Chat History</h1>
          <p className="text-xs text-purple-200/75">
            Search, open, rename, or manage your saved conversations ({sessions.length} total).
          </p>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="purple-glow-btn min-h-[44px] px-4 py-2.5 rounded-2xl text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-purple-300/80 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations by title, folder, or message text..."
          aria-label="Search chat history"
          className="w-full min-h-[46px] pl-11 pr-10 py-2.5 rounded-2xl glass-card border border-purple-400/25 focus:border-purple-400 text-sm text-white placeholder-purple-300/50 outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear history search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-purple-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversation List */}
      {sortedAndFiltered.length === 0 ? (
        <div className="glass-card rounded-3xl p-8 text-center border border-purple-400/25 space-y-3">
          <MessageSquare className="w-10 h-10 text-purple-400/70 mx-auto" />
          <h2 className="text-base font-bold text-white">
            {searchQuery ? `No conversations matching "${searchQuery}"` : 'No saved conversations yet'}
          </h2>
          <p className="text-xs text-purple-200/70 max-w-sm mx-auto">
            {searchQuery
              ? 'Try another keyword or clear your search filter.'
              : 'Start a conversation with Aadesh AI and it will appear here automatically.'}
          </p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 rounded-xl bg-purple-600/30 border border-purple-400/40 text-purple-200 text-xs font-semibold cursor-pointer"
            >
              Clear Search
            </button>
          ) : (
            <button
              type="button"
              onClick={onNewChat}
              className="purple-glow-btn px-4 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Start Chatting</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAndFiltered.map((session) => {
            const isCurrent = session.id === currentSessionId;
            const isEditing = editingId === session.id;
            const isConfirmDelete = confirmDeleteId === session.id;
            const lastMsg = session.messages[session.messages.length - 1];
            const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === session.targetLanguage);

            return (
              <div
                key={session.id}
                className={`glass-card rounded-2xl p-4 border transition-all ${
                  isCurrent
                    ? 'border-purple-400/65 shadow-[0_0_24px_rgba(139,92,246,0.22)]'
                    : 'border-purple-400/20 hover:border-purple-400/45'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Title & Preview */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitRename(session.id);
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditingTitle('');
                            }
                          }}
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0b0818] border border-purple-400/60 text-sm text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCommitRename(session.id)}
                          aria-label="Save conversation name"
                          className="min-w-[38px] min-h-[38px] rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white flex items-center justify-center cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingTitle('');
                          }}
                          aria-label="Cancel rename"
                          className="min-w-[38px] min-h-[38px] rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenSession(session.id)}
                        className="text-left w-full group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-purple-200 transition-colors truncate max-w-full">
                            {session.title}
                          </h3>
                          {isCurrent && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/25 border border-purple-400/50 text-purple-200">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-purple-200/70 line-clamp-1 mt-0.5">
                          {lastMsg
                            ? `${lastMsg.role === 'user' ? 'You: ' : 'Aadesh AI: '}${lastMsg.content}`
                            : 'Empty conversation — tap to start chatting'}
                        </p>
                      </button>
                    )}

                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-purple-300/75 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-purple-400" />
                        <span>{formatSessionDate(session.updatedAt || session.createdAt)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-purple-400" />
                        <span>{session.messages.length} msgs</span>
                      </span>
                      {session.category && (
                        <span className="inline-flex items-center gap-1">
                          <Folder className="w-3 h-3 text-purple-400" />
                          <span>{session.category}</span>
                        </span>
                      )}
                      {langInfo && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3 h-3 text-purple-400" />
                          <span>
                            {langInfo.flag} {langInfo.name}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => onOpenSession(session.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-purple-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(session.id);
                        setEditingTitle(session.title);
                        setConfirmDeleteId(null);
                      }}
                      title="Rename conversation"
                      aria-label={`Rename ${session.title}`}
                      className="min-w-[40px] min-h-[40px] rounded-xl bg-white/5 hover:bg-purple-500/20 border border-white/10 text-purple-200 flex items-center justify-center cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {isConfirmDelete ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSession(session.id);
                            setConfirmDeleteId(null);
                          }}
                          className="min-h-[40px] px-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 text-gray-300 flex items-center justify-center cursor-pointer"
                          aria-label="Cancel delete"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(session.id)}
                        title="Delete conversation"
                        aria-label={`Delete ${session.title}`}
                        className="min-w-[40px] min-h-[40px] rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/40 text-purple-200 hover:text-rose-300 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
