import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Eye,
  Flame,
  Globe,
  History,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { buildApiUrl } from '../utils/apiConfig';
import { getCurrentIdToken } from '../utils/firebase';
import {
  formatOwnerTimestamps,
  isValidSafePhotoUrl,
  OWNER_COUNTRY_PRESETS,
  OwnerAuditLogRecord,
  OwnerManagedUser,
  SOLE_OWNER_EMAIL,
  UserTimelineEvent,
} from '../utils/ownerAdmin';
import type { AIProviderId } from '../utils/aiProviders';

export type OwnerControlSection =
  | 'directory'
  | 'editor'
  | 'streaks'
  | 'messages'
  | 'timeline'
  | 'audit';

interface OwnerConversationSummary {
  id: string;
  title: string;
  language: string;
  messageCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface OwnerConversationMessage {
  id: string;
  role: 'user' | 'model' | 'participant';
  senderName?: string;
  content: string;
  translation?: string;
  translationLanguage?: string;
  provider?: AIProviderId;
  modelUsed?: string;
  timestamp: string;
}

interface OwnerUserDetailResponse {
  user: OwnerManagedUser;
  conversations: OwnerConversationSummary[];
  analyticsEvents: Array<{
    id: string;
    eventType: string;
    language?: string;
    latencyMs?: number;
    dateKey: string;
    timestamp: string;
  }>;
  auditLogs: OwnerAuditLogRecord[];
  timeline: UserTimelineEvent[];
}

interface OwnerControlPanelProps {
  section: OwnerControlSection;
  users: OwnerManagedUser[];
  auditLogs: OwnerAuditLogRecord[];
  loading: boolean;
  adminSdkError: { code?: string; message: string } | null;
  selectedUid: string | null;
  ownerTimezone?: string;
  onSelectUid: (uid: string) => void;
  onSwitchSection: (section: OwnerControlSection, uid?: string) => void;
  onRefreshAll: () => Promise<void>;
  onUserUpdated: (updatedUser: OwnerManagedUser, newLog?: OwnerAuditLogRecord) => void;
  onAuditLogAdded: (newLog: OwnerAuditLogRecord) => void;
}

type SortField =
  | 'createdAt'
  | 'lastLoginAt'
  | 'lastActiveAt'
  | 'currentStreak'
  | 'messageCount'
  | 'displayName';

export const OwnerControlPanel: React.FC<OwnerControlPanelProps> = ({
  section,
  users,
  auditLogs,
  loading,
  adminSdkError,
  selectedUid,
  ownerTimezone,
  onSelectUid,
  onSwitchSection,
  onRefreshAll,
  onUserUpdated,
  onAuditLogAdded,
}) => {
  // Directory state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Selected user detail cache (for timeline / messages)
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<OwnerUserDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Profile editor form state
  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUid) || users[0] || null,
    [users, selectedUid]
  );

  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCountryCode, setEditCountryCode] = useState('');
  const [editCountryFlag, setEditCountryFlag] = useState('');
  const [editTimezone, setEditTimezone] = useState('Asia/Kathmandu');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editPreferredLang, setEditPreferredLang] = useState('en');
  const [editAiProvider, setEditAiProvider] = useState<AIProviderId>('gemini');
  const [editAiRespLang, setEditAiRespLang] = useState('en');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editReason, setEditReason] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Streak manager form state
  const [streakCurrent, setStreakCurrent] = useState<number>(0);
  const [streakLongest, setStreakLongest] = useState<number>(0);
  const [streakLastDate, setStreakLastDate] = useState('');
  const [streakRecoveryCount, setStreakRecoveryCount] = useState<number>(0);
  const [streakTimezone, setStreakTimezone] = useState('Asia/Kathmandu');
  const [streakReason, setStreakReason] = useState('');
  const [savingStreak, setSavingStreak] = useState(false);
  const [streakNotice, setStreakNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Messages / conversation audit state
  const [inspectReason, setInspectReason] = useState('Support assistance review');
  const [inspectConfirmed, setInspectConfirmed] = useState(false);
  const [inspectedConvId, setInspectedConvId] = useState<string | null>(null);
  const [inspectedMessages, setInspectedMessages] = useState<OwnerConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Timeline filter state
  const [timelineFilter, setTimelineFilter] = useState<string>('all');

  // Audit log filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Populate editor & streak state cleanly whenever selectedUser changes or section opens
  const syncFormsFromUser = (u: OwnerManagedUser) => {
    setEditDisplayName(u.displayName || '');
    setEditUsername(u.username || '');
    setEditNickname(u.nickname || '');
    setEditCountry(u.country || '');
    setEditCountryCode(u.countryCode || '');
    setEditCountryFlag(u.countryFlag || '');
    setEditTimezone(u.timezone || 'Asia/Kathmandu');
    setEditPhotoUrl(u.photoURL || '');
    setEditPreferredLang(u.preferredLanguage || 'en');
    setEditAiProvider(u.aiProvider || 'gemini');
    setEditAiRespLang(u.aiResponseLanguage || u.preferredLanguage || 'en');
    setEditStatus(u.status);
    setEditReason('');
    setProfileNotice(null);

    setStreakCurrent(u.currentStreak);
    setStreakLongest(u.longestStreak);
    setStreakLastDate(u.lastActiveDate || '');
    setStreakRecoveryCount(u.recoveryCount);
    setStreakTimezone(u.timezone || 'Asia/Kathmandu');
    setStreakReason('');
    setStreakNotice(null);
  };

  const loadUserDetail = async (uid: string) => {
    if (!uid) return;
    setDetailLoading(true);
    setDetailError(null);
    setInspectedConvId(null);
    setInspectedMessages([]);
    try {
      const token = await getCurrentIdToken();
      if (!token) throw new Error('Owner session token unavailable.');
      const res = await fetch(buildApiUrl(`/api/admin/owner/users/${encodeURIComponent(uid)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load user details.');
      }
      setDetailData(data);
    } catch (err: any) {
      setDetailError(err?.message || 'Unable to load user timeline and conversations.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedUser) return;
    syncFormsFromUser(selectedUser);
    if (section === 'messages' || section === 'timeline') {
      void loadUserDetail(selectedUser.uid);
    }
  }, [selectedUser?.uid, section]);

  const handleSelectUserAndOpen = (u: OwnerManagedUser, targetSection: OwnerControlSection) => {
    onSelectUid(u.uid);
    syncFormsFromUser(u);
    onSwitchSection(targetSection, u.uid);
    if (targetSection === 'messages' || targetSection === 'timeline') {
      void loadUserDetail(u.uid);
    }
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard?.writeText(uid).catch(() => {});
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 1800);
  };

  // Directory filtering & sorting
  const distinctCountries = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.country) set.add(u.country);
    });
    return Array.from(set).sort();
  }, [users]);

  const distinctProviders = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.provider) set.add(u.provider);
    });
    return Array.from(set).sort();
  }, [users]);

  const filteredDirectoryUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (countryFilter !== 'all' && (u.country || '') !== countryFilter) return false;
      if (providerFilter !== 'all' && (u.provider || '') !== providerFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (u.country || '').toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'displayName') {
        cmp = a.displayName.localeCompare(b.displayName);
      } else if (sortField === 'currentStreak') {
        cmp = a.currentStreak - b.currentStreak;
      } else if (sortField === 'messageCount') {
        cmp = a.messageCount - b.messageCount;
      } else if (sortField === 'lastLoginAt') {
        cmp =
          (a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0) -
          (b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0);
      } else if (sortField === 'lastActiveAt') {
        cmp =
          (a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0) -
          (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0);
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [users, searchQuery, statusFilter, countryFilter, providerFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredDirectoryUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = filteredDirectoryUsers.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleApplyCountryPreset = (countryName: string) => {
    const preset = OWNER_COUNTRY_PRESETS.find((c) => c.country === countryName);
    if (!preset) return;
    setEditCountry(preset.country);
    setEditCountryCode(preset.countryCode);
    setEditCountryFlag(preset.countryFlag);
    setEditTimezone(preset.timezone);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      const token = await getCurrentIdToken();
      if (!token) throw new Error('Owner authentication token missing.');

      const res = await fetch(
        buildApiUrl(`/api/admin/owner/users/${encodeURIComponent(selectedUser.uid)}/profile`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            displayName: editDisplayName,
            username: editUsername,
            nickname: editNickname,
            country: editCountry || undefined,
            countryCode: editCountryCode || undefined,
            countryFlag: editCountryFlag || undefined,
            timezone: editTimezone,
            photoURL: editPhotoUrl,
            preferredLanguage: editPreferredLang,
            aiProvider: editAiProvider,
            aiResponseLanguage: editAiRespLang,
            status: editStatus,
            reason: editReason,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update user profile.');
      }

      onUserUpdated(data.user, data.auditLog);
      setEditReason('');
      setProfileNotice({
        type: 'ok',
        text: `Updated ${data.user.displayName}'s profile and wrote an immutable audit entry.`,
      });
    } catch (err: any) {
      setProfileNotice({
        type: 'err',
        text: err?.message || 'Profile update failed.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const submitStreakMutation = async (payload: Record<string, unknown>) => {
    if (!selectedUser) return;
    setSavingStreak(true);
    setStreakNotice(null);
    try {
      const token = await getCurrentIdToken();
      if (!token) throw new Error('Owner authentication token missing.');

      const res = await fetch(
        buildApiUrl(`/api/admin/owner/users/${encodeURIComponent(selectedUser.uid)}/streak`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update user streak.');
      }

      onUserUpdated(data.user, data.auditLog);
      syncFormsFromUser(data.user);
      setStreakNotice({
        type: 'ok',
        text: `Streak updated to ${data.user.currentStreak} days (Best: ${data.user.longestStreak}) and logged to audit trail.`,
      });
    } catch (err: any) {
      setStreakNotice({
        type: 'err',
        text: err?.message || 'Streak update failed.',
      });
    } finally {
      setSavingStreak(false);
    }
  };

  const handleSaveStreak = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitStreakMutation({
      currentStreak: Number(streakCurrent),
      longestStreak: Number(streakLongest),
      lastActiveDate: streakLastDate.trim(),
      recoveryCount: Number(streakRecoveryCount),
      timezone: streakTimezone.trim(),
      reason: streakReason,
    });
  };

  const handleResetStreakToZero = async () => {
    await submitStreakMutation({
      resetToZero: true,
      longestStreak: Number(streakLongest),
      timezone: streakTimezone.trim(),
      reason: streakReason || 'Owner reset current streak to 0',
    });
  };

  const handleInspectConversation = async (convId: string) => {
    if (!selectedUser || !inspectConfirmed) return;
    setLoadingMessages(true);
    setMessagesError(null);
    setInspectedConvId(convId);
    try {
      const token = await getCurrentIdToken();
      if (!token) throw new Error('Owner token unavailable.');
      const url = buildApiUrl(
        `/api/admin/owner/users/${encodeURIComponent(selectedUser.uid)}/conversations/${encodeURIComponent(
          convId
        )}/messages?reason=${encodeURIComponent(inspectReason.trim() || 'Support review')}`
      );
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load conversation messages.');
      }
      setInspectedMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.auditLog) {
        onAuditLogAdded(data.auditLog);
      }
    } catch (err: any) {
      setMessagesError(err?.message || 'Unable to inspect conversation.');
    } finally {
      setLoadingMessages(false);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditActionFilter !== 'all' && log.action !== auditActionFilter) return false;
      if (!q) return true;
      return (
        log.targetUid.toLowerCase().includes(q) ||
        (log.targetEmail || '').toLowerCase().includes(q) ||
        log.reason.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, auditActionFilter, auditSearch]);

  const filteredTimeline = useMemo(() => {
    const raw = detailData?.timeline || [];
    if (timelineFilter === 'all') return raw;
    return raw.filter((item) => item.type === timelineFilter);
  }, [detailData, timelineFilter]);

  if (adminSdkError) {
    return (
      <div className="v2-neu-card rounded-3xl p-6 border border-amber-500/40 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-white">
              Server-Side Firebase Admin Access Needs Setup
            </h3>
            <p className="text-xs text-amber-100/90 leading-relaxed">{adminSdkError.message}</p>
            <p className="text-[11px] text-gray-300">
              Project: <span className="font-mono text-sky-300">aadesh-ai-global</span> · Grant{' '}
              <span className="font-mono text-amber-200">Cloud Datastore User</span> and{' '}
              <span className="font-mono text-amber-200">Firebase Authentication Admin</span> in Google
              Cloud IAM, then click Retry.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefreshAll}
          className="electric-purple-btn px-4 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Retry Firebase Admin Sync</span>
        </button>
      </div>
    );
  }

  // User Selector Header shared by Editor / Streaks / Messages / Timeline
  const renderUserPickerHeader = (title: string, subtitle: string) => (
    <div className="v2-neu-card rounded-3xl p-4 sm:p-5 border border-purple-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h3 className="text-base font-bold text-white">{title}</h3>
        <p className="text-xs text-purple-200/75">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Select User"
          value={selectedUser?.uid || ''}
          onChange={(e) => {
            const found = users.find((u) => u.uid === e.target.value);
            if (found) {
              onSelectUid(found.uid);
              syncFormsFromUser(found);
              if (section === 'messages' || section === 'timeline') {
                void loadUserDetail(found.uid);
              }
            }
          }}
          className="v2-neu-inset border border-white/15 focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-white bg-slate-950/90 min-w-[240px]"
        >
          {users.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.countryFlag ? `${u.countryFlag} ` : ''}
              {u.displayName} ({u.email || u.uid})
            </option>
          ))}
        </select>

        {selectedUser && (section === 'messages' || section === 'timeline') && (
          <button
            type="button"
            onClick={() => loadUserDetail(selectedUser.uid)}
            disabled={detailLoading}
            className="px-3 py-2 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-xs font-semibold text-sky-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${detailLoading ? 'animate-spin' : ''}`} />
            <span>Sync User Activity</span>
          </button>
        )}
      </div>
    </div>
  );

  // ---------------- 1. REGISTERED USER DIRECTORY ----------------
  if (section === 'directory') {
    return (
      <div className="space-y-4">
        <div className="v2-neu-card rounded-3xl p-4 sm:p-5 border border-purple-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>Registered User Directory ({filteredDirectoryUsers.length})</span>
              </h3>
              <p className="text-xs text-purple-200/75">
                Live merged directory from Firebase Authentication and Firestore user profiles.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={loading}
              className="electric-purple-btn px-3.5 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer self-start"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync Auth &amp; Firestore</span>
            </button>
          </div>

          {/* Search, Filters & Sorting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, username, nickname, email, UID..."
                className="w-full v2-neu-inset border border-white/10 focus:border-sky-400 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <select
              aria-label="Filter by Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'active' | 'suspended');
                setPage(1);
              }}
              className="v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-xs text-white bg-slate-950/90"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>

            <select
              aria-label="Filter by Country"
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                setPage(1);
              }}
              className="v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-xs text-white bg-slate-950/90"
            >
              <option value="all">All Countries</option>
              {distinctCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Auth Provider"
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setPage(1);
              }}
              className="v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-xs text-white bg-slate-950/90"
            >
              <option value="all">All Providers</option>
              {distinctProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Sort users by"
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="flex-1 v2-neu-inset border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white bg-slate-950/90"
              >
                <option value="createdAt">Registered Date</option>
                <option value="lastLoginAt">Last Login</option>
                <option value="lastActiveAt">Last Activity</option>
                <option value="currentStreak">Current Streak</option>
                <option value="messageCount">Messages</option>
                <option value="displayName">Display Name</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="p-2 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-sky-300 cursor-pointer"
                title={`Sort order: ${sortDir.toUpperCase()}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Directory Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[980px]">
              <thead className="text-purple-200/75 border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-3">Account &amp; Firebase UID</th>
                  <th className="py-2.5 pr-3">Country / Timezone</th>
                  <th className="py-2.5 pr-3">Registered (UTC &amp; Local)</th>
                  <th className="py-2.5 pr-3">Last Login &amp; Activity</th>
                  <th className="py-2.5 pr-3">Streak &amp; Usage</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 text-right">Owner Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pagedUsers.map((u) => {
                  const regFmt = formatOwnerTimestamps(u.createdAt, u.timezone);
                  const loginFmt = formatOwnerTimestamps(u.lastLoginAt, u.timezone);
                  const activeFmt = formatOwnerTimestamps(u.lastActiveAt, u.timezone);
                  return (
                    <tr key={u.uid} className="hover:bg-white/5 align-top">
                      <td className="py-3 pr-3">
                        <div className="flex items-start gap-2.5">
                          {u.photoURL && isValidSafePhotoUrl(u.photoURL) ? (
                            <img
                              src={u.photoURL}
                              alt={u.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-purple-900/70 border border-purple-400/30 flex items-center justify-center text-white font-bold shrink-0">
                              {u.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white">{u.displayName}</span>
                              {u.email.toLowerCase() === SOLE_OWNER_EMAIL && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                                  SOLE OWNER
                                </span>
                              )}
                            </div>
                            {(u.username || u.nickname) && (
                              <div className="text-[11px] text-purple-200/80">
                                {u.username ? `@${u.username}` : ''}
                                {u.username && u.nickname ? ' · ' : ''}
                                {u.nickname ? `"${u.nickname}"` : ''}
                              </div>
                            )}
                            <div className="text-[11px] text-sky-200/90 break-all">
                              {u.email || 'No email'} {u.emailVerified ? '✓' : '(unverified)'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
                              <span className="truncate max-w-[165px]">{u.uid}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyUid(u.uid)}
                                className="text-gray-400 hover:text-sky-300 cursor-pointer"
                                title="Copy Firebase UID"
                              >
                                {copiedUid === u.uid ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          {u.countryFlag ? `${u.countryFlag} ` : '🌐 '}
                          {u.country || 'Unspecified'}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">{u.timezone}</div>
                        <div className="text-[10px] text-purple-300/70">{u.provider}</div>
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap tabular-nums">
                        <div className="text-white">{regFmt.local}</div>
                        <div className="text-[10px] text-gray-400">{regFmt.utc}</div>
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap tabular-nums space-y-1">
                        <div>
                          <span className="text-[10px] text-gray-400">Login: </span>
                          <span className={loginFmt.available ? 'text-emerald-200' : 'text-gray-500 italic'}>
                            {loginFmt.available ? loginFmt.local : 'Unavailable'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400">Active: </span>
                          <span className={activeFmt.available ? 'text-sky-200' : 'text-gray-500 italic'}>
                            {activeFmt.available ? activeFmt.local : 'No recent activity'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap tabular-nums">
                        <div className="text-amber-300 font-bold">
                          🔥 {u.currentStreak}d (Best {u.longestStreak}d)
                        </div>
                        <div className="text-[10px] text-gray-300">
                          {u.conversationCount} chats · {u.messageCount} events/msgs
                        </div>
                        <div className="text-[10px] text-purple-300">AI: {u.aiProvider}</div>
                      </td>

                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.status === 'suspended'
                              ? 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSelectUserAndOpen(u, 'editor')}
                            className="p-1.5 rounded-lg v2-neu-inset border border-white/10 hover:border-sky-400/50 text-sky-200 cursor-pointer"
                            title="Edit Profile & Country"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectUserAndOpen(u, 'streaks')}
                            className="p-1.5 rounded-lg v2-neu-inset border border-white/10 hover:border-amber-400/50 text-amber-300 cursor-pointer"
                            title="Manage Streak"
                          >
                            <Flame className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectUserAndOpen(u, 'messages')}
                            className="p-1.5 rounded-lg v2-neu-inset border border-white/10 hover:border-purple-400/50 text-purple-200 cursor-pointer"
                            title="Messages & Conversations"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectUserAndOpen(u, 'timeline')}
                            className="p-1.5 rounded-lg v2-neu-inset border border-white/10 hover:border-emerald-400/50 text-emerald-300 cursor-pointer"
                            title="View Full Timeline"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No users match the active directory filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="v2-neu-inset border border-white/10 rounded-lg px-2 py-1 text-xs text-white bg-slate-950/90"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="tabular-nums text-gray-400">
                Showing {pagedUsers.length} of {filteredDirectoryUsers.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg v2-neu-inset border border-white/10 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="tabular-nums">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg v2-neu-inset border border-white/10 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 2. USER PROFILE EDITOR ----------------
  if (section === 'editor') {
    return (
      <div className="space-y-4">
        {renderUserPickerHeader(
          'User Profile, Country & Account Controls',
          'Authenticated server-side updates via Firebase Admin SDK with mandatory immutable audit logging.'
        )}

        {selectedUser && (
          <form
            onSubmit={handleSaveProfile}
            className="v2-neu-card rounded-3xl p-5 border border-purple-500/30 space-y-5"
          >
            {/* Immutable Identity Read-only Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl v2-neu-inset border border-white/10 text-xs">
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Immutable Firebase UID</div>
                <div className="font-mono text-sky-300 break-all">{selectedUser.uid}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Verified Email</div>
                <div className="text-white break-all">{selectedUser.email || 'Unavailable'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Auth Provider &amp; Sync</div>
                <div className="text-emerald-300">
                  {selectedUser.provider} · {selectedUser.authSynced ? 'Firebase Auth Synced' : 'Firestore Only'}
                </div>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Display Name *</span>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full v2-neu-inset border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Username</span>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="handle_name"
                  className="w-full v2-neu-inset border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Nickname</span>
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="Preferred greeting name"
                  className="w-full v2-neu-inset border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="font-bold text-purple-200">Profile Photo URL (http/https)</span>
                <input
                  type="url"
                  value={editPhotoUrl}
                  onChange={(e) => setEditPhotoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full v2-neu-inset border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Account Standing</span>
                <select
                  value={editStatus}
                  disabled={selectedUser.email.toLowerCase() === SOLE_OWNER_EMAIL}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                  className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white bg-slate-950/90 disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </div>

            {/* Country & Timezone Controls */}
            <div className="p-4 rounded-2xl v2-neu-inset border border-sky-500/20 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Country, Flag &amp; IANA Timezone Controls</span>
                </span>
                <select
                  aria-label="Country Preset"
                  value=""
                  onChange={(e) => handleApplyCountryPreset(e.target.value)}
                  className="v2-neu-inset border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white bg-slate-950/90"
                >
                  <option value="" disabled>
                    Quick Country Preset...
                  </option>
                  {OWNER_COUNTRY_PRESETS.map((c) => (
                    <option key={c.countryCode} value={c.country}>
                      {c.countryFlag} {c.country} ({c.timezone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-300">Country Name</span>
                  <input
                    type="text"
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    placeholder="Nepal"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-300">Country Code</span>
                  <input
                    type="text"
                    value={editCountryCode}
                    onChange={(e) => setEditCountryCode(e.target.value)}
                    placeholder="NP"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-300">Country Flag</span>
                  <input
                    type="text"
                    value={editCountryFlag}
                    onChange={(e) => setEditCountryFlag(e.target.value)}
                    placeholder="🇳🇵"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-300">IANA Timezone</span>
                  <input
                    type="text"
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    placeholder="Asia/Kathmandu"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Permitted Profile Preferences */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Preferred UI Language</span>
                <input
                  type="text"
                  value={editPreferredLang}
                  onChange={(e) => setEditPreferredLang(e.target.value)}
                  className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">Preferred AI Provider</span>
                <select
                  value={editAiProvider}
                  onChange={(e) => setEditAiProvider(e.target.value as AIProviderId)}
                  className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white bg-slate-950/90"
                >
                  <option value="gemini">Google Gemini (Default)</option>
                  <option value="groq">Groq</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-purple-200">AI Response Language</span>
                <input
                  type="text"
                  value={editAiRespLang}
                  onChange={(e) => setEditAiRespLang(e.target.value)}
                  className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                />
              </label>
            </div>

            {/* Mandatory Audit Reason */}
            <label className="block space-y-1.5 text-xs">
              <span className="font-bold text-amber-300">Mandatory Audit Reason *</span>
              <input
                type="text"
                required
                minLength={3}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g., User requested country & display name correction via support"
                className="w-full v2-neu-inset border border-amber-500/30 focus:border-amber-400 rounded-xl px-3 py-2.5 text-white outline-none"
              />
            </label>

            {profileNotice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  profileNotice.type === 'ok'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {profileNotice.type === 'ok' ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{profileNotice.text}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => syncFormsFromUser(selectedUser)}
                className="px-4 py-2.5 rounded-xl v2-neu-inset border border-white/10 text-xs font-semibold text-gray-300 hover:text-white cursor-pointer"
              >
                Revert Unsaved Edits
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="electric-purple-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{savingProfile ? 'Saving & Logging...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // ---------------- 3. ADVANCED STREAK MANAGER ----------------
  if (section === 'streaks') {
    return (
      <div className="space-y-4">
        {renderUserPickerHeader(
          'Advanced Streak & Timezone Manager',
          'Adjust active/longest streaks, sync streak_leaderboard, correct last active dates, and log every adjustment.'
        )}

        {selectedUser && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleSaveStreak}
              className="lg:col-span-8 v2-neu-card rounded-3xl p-5 border border-amber-500/30 space-y-5"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-2xl v2-neu-inset border border-white/10">
                  <div className="text-[10px] text-gray-400">Current Streak</div>
                  <div className="text-xl font-black text-amber-300 tabular-nums">
                    {selectedUser.currentStreak}d
                  </div>
                </div>
                <div className="p-3 rounded-2xl v2-neu-inset border border-white/10">
                  <div className="text-[10px] text-gray-400">Longest Streak</div>
                  <div className="text-xl font-black text-sky-300 tabular-nums">
                    {selectedUser.longestStreak}d
                  </div>
                </div>
                <div className="p-3 rounded-2xl v2-neu-inset border border-white/10">
                  <div className="text-[10px] text-gray-400">Recoveries Used</div>
                  <div className="text-xl font-black text-purple-300 tabular-nums">
                    {selectedUser.recoveryCount}/5
                  </div>
                </div>
                <div className="p-3 rounded-2xl v2-neu-inset border border-white/10">
                  <div className="text-[10px] text-gray-400">XP / Level</div>
                  <div className="text-xl font-black text-emerald-300 tabular-nums">
                    Lv {selectedUser.level}
                  </div>
                </div>
              </div>

              {/* Quick Streak Presets */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-300 font-semibold">Quick Set Current Streak:</span>
                {[7, 30, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setStreakCurrent(preset);
                      setStreakLongest((prev) => Math.max(prev, preset));
                    }}
                    className="px-2.5 py-1 rounded-lg v2-neu-inset border border-amber-500/30 text-amber-200 hover:border-amber-400 cursor-pointer tabular-nums"
                  >
                    Set {preset}d
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setStreakTimezone('Asia/Kathmandu')}
                  className="px-2.5 py-1 rounded-lg v2-neu-inset border border-sky-500/30 text-sky-200 hover:border-sky-400 cursor-pointer"
                >
                  Use Asia/Kathmandu
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <label className="space-y-1.5">
                  <span className="font-bold text-purple-200">Current Streak (0–10,000)</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={streakCurrent}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setStreakCurrent(val);
                      if (val > streakLongest) setStreakLongest(val);
                    }}
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white tabular-nums outline-none"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="font-bold text-purple-200">Longest Streak (0–10,000)</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={streakLongest}
                    onChange={(e) => setStreakLongest(Number(e.target.value))}
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white tabular-nums outline-none"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="font-bold text-purple-200">Last Active Date (YYYY-MM-DD)</span>
                  <input
                    type="text"
                    value={streakLastDate}
                    onChange={(e) => setStreakLastDate(e.target.value)}
                    placeholder="2026-11-28"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="font-bold text-purple-200">Monthly Recoveries Used (0–5)</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={streakRecoveryCount}
                    onChange={(e) => setStreakRecoveryCount(Number(e.target.value))}
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white tabular-nums outline-none"
                  />
                </label>

                <label className="space-y-1.5 sm:col-span-2">
                  <span className="font-bold text-purple-200">Streak Timezone (IANA)</span>
                  <input
                    type="text"
                    value={streakTimezone}
                    onChange={(e) => setStreakTimezone(e.target.value)}
                    placeholder="Asia/Kathmandu"
                    className="w-full v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white font-mono outline-none"
                  />
                </label>
              </div>

              <label className="block space-y-1.5 text-xs">
                <span className="font-bold text-amber-300">Mandatory Audit Reason *</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={streakReason}
                  onChange={(e) => setStreakReason(e.target.value)}
                  placeholder="e.g., Verified timezone rollout offset recovery (+100 milestone)"
                  className="w-full v2-neu-inset border border-amber-500/30 rounded-xl px-3 py-2.5 text-white outline-none"
                />
              </label>

              {streakNotice && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    streakNotice.type === 'ok'
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  {streakNotice.type === 'ok' ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{streakNotice.text}</span>
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  disabled={savingStreak || streakReason.trim().length < 3}
                  onClick={handleResetStreakToZero}
                  className="px-4 py-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-bold text-rose-200 hover:bg-rose-900/60 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Enter a mandatory reason first to enable Reset to 0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Current Streak to 0</span>
                </button>

                <button
                  type="submit"
                  disabled={savingStreak}
                  className="electric-purple-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Award className="w-4 h-4" />
                  <span>{savingStreak ? 'Updating Streak...' : 'Apply Streak Adjustment'}</span>
                </button>
              </div>
            </form>

            {/* Streak History Card */}
            <div className="lg:col-span-4 v2-neu-card rounded-3xl p-5 border border-purple-500/30 space-y-3 text-xs">
              <h4 className="font-bold text-white flex items-center gap-2 border-b border-white/10 pb-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Streak History &amp; Recoveries</span>
              </h4>
              <div className="space-y-1.5 text-gray-300">
                <div>
                  <span className="text-gray-400">Active Timezone: </span>
                  <span className="font-mono text-sky-300">{selectedUser.timezone}</span>
                </div>
                <div>
                  <span className="text-gray-400">Recovery Month: </span>
                  <span className="font-mono text-white">{selectedUser.recoveryMonth || 'None'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Streak Before Break: </span>
                  <span className="text-white tabular-nums">{selectedUser.streakBeforeBreak ?? 0}d</span>
                </div>
                <div>
                  <span className="text-gray-400">Broken Date: </span>
                  <span className="font-mono text-white">{selectedUser.streakBrokenDate || 'None'}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="font-semibold text-purple-200">
                  Recovered Gap Dates ({selectedUser.recoveredDates?.length || 0})
                </div>
                {selectedUser.recoveredDates && selectedUser.recoveredDates.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUser.recoveredDates.map((d) => (
                      <span
                        key={d}
                        className="px-2 py-0.5 rounded bg-sky-950/70 border border-sky-500/40 font-mono text-[10px] text-sky-200"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No streak freeze recoveries recorded.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- 4. MESSAGES & CONVERSATION ACTIVITY ----------------
  if (section === 'messages') {
    const activeUser = detailData?.user || selectedUser;
    const conversations = detailData?.conversations || [];

    return (
      <div className="space-y-4">
        {renderUserPickerHeader(
          'Message & Conversation Activity',
          'Review conversation metrics, AI provider footprint, and audited support-only message inspection.'
        )}

        {activeUser && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="v2-neu-card rounded-2xl p-4 border border-purple-500/30">
              <div className="text-gray-400">Total Conversations</div>
              <div className="text-2xl font-black text-white tabular-nums">
                {activeUser.conversationCount}
              </div>
            </div>
            <div className="v2-neu-card rounded-2xl p-4 border border-sky-500/30">
              <div className="text-gray-400">Messages / Usage Events</div>
              <div className="text-2xl font-black text-white tabular-nums">
                {activeUser.messageCount}
              </div>
            </div>
            <div className="v2-neu-card rounded-2xl p-4 border border-amber-500/30">
              <div className="text-gray-400">Configured AI Provider</div>
              <div className="text-lg font-black text-amber-300 uppercase">
                {activeUser.aiProvider}
              </div>
              <div className="text-[10px] text-gray-400 truncate">
                {activeUser.aiModel || 'Default model'}
              </div>
            </div>
            <div className="v2-neu-card rounded-2xl p-4 border border-emerald-500/30">
              <div className="text-gray-400">Last Activity</div>
              <div className="text-xs font-bold text-emerald-200 mt-1">
                {formatOwnerTimestamps(activeUser.lastActiveAt, activeUser.timezone).local}
              </div>
              <div className="text-[10px] text-gray-400">
                {formatOwnerTimestamps(activeUser.lastActiveAt, activeUser.timezone).utc}
              </div>
            </div>
          </div>
        )}

        {detailError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
            {detailError}
          </div>
        )}

        {/* Audited Support Inspection Gate */}
        <div className="v2-neu-card rounded-3xl p-4 border border-amber-500/30 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <Lock className="w-4 h-4" />
            <span>Audited Support-Only Conversation Inspection</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <input
              type="text"
              value={inspectReason}
              onChange={(e) => setInspectReason(e.target.value)}
              placeholder="Audit reason for viewing message content..."
              className="v2-neu-inset border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
            />
            <label className="flex items-center gap-2 text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={inspectConfirmed}
                onChange={(e) => setInspectConfirmed(e.target.checked)}
                className="accent-amber-400"
              />
              <span>Confirm support-only review (writes immutable audit log)</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
          <div className="lg:col-span-5 v2-neu-card rounded-3xl p-4 border border-purple-500/30 space-y-2.5 max-h-[460px] overflow-y-auto">
            <div className="font-bold text-white border-b border-white/10 pb-2">
              Synced Conversations ({conversations.length})
            </div>
            {detailLoading ? (
              <div className="py-6 text-center text-sky-300">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="py-6 text-center text-gray-500 italic">
                No synced conversations found for this user.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  disabled={!inspectConfirmed || inspectReason.trim().length < 3}
                  onClick={() => handleInspectConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-2xl border transition-colors cursor-pointer disabled:opacity-45 ${
                    inspectedConvId === conv.id
                      ? 'bg-sky-500/15 border-sky-400 text-white'
                      : 'v2-neu-inset border-white/10 text-gray-200 hover:border-sky-400/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">{conv.title}</span>
                    <span className="text-[10px] text-sky-300 shrink-0 uppercase">
                      {conv.language}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span>{conv.messageCount} messages</span>
                    <span>
                      {conv.updatedAt
                        ? formatOwnerTimestamps(conv.updatedAt, activeUser?.timezone).local
                        : 'No date'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-7 v2-neu-card rounded-3xl p-4 border border-purple-500/30 space-y-3 max-h-[460px] overflow-y-auto">
            <div className="font-bold text-white border-b border-white/10 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-400" />
                <span>Inspected Messages</span>
              </span>
              {inspectedConvId && (
                <span className="font-mono text-[10px] text-gray-400">{inspectedConvId}</span>
              )}
            </div>

            {messagesError && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200">
                {messagesError}
              </div>
            )}

            {loadingMessages ? (
              <div className="py-8 text-center text-sky-300">Loading messages &amp; writing audit log...</div>
            ) : inspectedMessages.length === 0 ? (
              <div className="py-8 text-center text-gray-500 italic">
                Check the support confirmation above and select a conversation to inspect.
              </div>
            ) : (
              inspectedMessages.map((msg) => {
                const ts = formatOwnerTimestamps(msg.timestamp, activeUser?.timezone);
                return (
                  <div
                    key={msg.id}
                    className="p-3 rounded-2xl v2-neu-inset border border-white/10 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold uppercase text-sky-300">{msg.role}</span>
                        {msg.provider && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-400/30 text-purple-200 font-semibold">
                            {msg.provider}
                            {msg.modelUsed ? ` · ${msg.modelUsed}` : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 tabular-nums">
                        {ts.local} ({ts.utc})
                      </span>
                    </div>
                    <p className="text-gray-100 whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 5. USER ACTIVITY TIMELINE ----------------
  if (section === 'timeline') {
    const activeUser = detailData?.user || selectedUser;
    return (
      <div className="space-y-4">
        {renderUserPickerHeader(
          'User Activity Timeline',
          'Unified chronological history of registration, Auth sign-ins, conversations, streaks, and owner audit actions.'
        )}

        <div className="v2-neu-card rounded-3xl p-5 border border-purple-500/30 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2 text-white font-bold">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>
                Chronological Events ({filteredTimeline.length}) · Display TZ:{' '}
                <span className="font-mono text-sky-300">{activeUser?.timezone || 'Asia/Kathmandu'}</span>
              </span>
            </div>

            <select
              aria-label="Filter timeline events"
              value={timelineFilter}
              onChange={(e) => setTimelineFilter(e.target.value)}
              className="v2-neu-inset border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white bg-slate-950/90"
            >
              <option value="all">All Event Types</option>
              <option value="registration">Registration</option>
              <option value="login">Auth Sign-In</option>
              <option value="streak">Streaks &amp; Recoveries</option>
              <option value="conversation">Conversations</option>
              <option value="message">Usage Activity</option>
              <option value="profile_change">Owner Profile Changes</option>
              <option value="status_change">Account Status Changes</option>
            </select>
          </div>

          {detailLoading ? (
            <div className="py-8 text-center text-sky-300">Building chronological user timeline...</div>
          ) : filteredTimeline.length === 0 ? (
            <div className="py-8 text-center text-gray-500 italic">
              No timeline events recorded for the selected filter.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredTimeline.map((ev) => {
                const fmt = formatOwnerTimestamps(ev.timestamp, activeUser?.timezone);
                return (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-2xl v2-neu-inset border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      ev.dataAvailability === 'unavailable'
                        ? 'border-gray-500/30 opacity-85'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-400/30 text-[10px] font-bold uppercase text-purple-200">
                          {ev.type.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-white">{ev.title}</span>
                      </div>
                      <p className="text-gray-300">{ev.detail}</p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-sky-200 font-semibold">{fmt.local}</div>
                      <div className="text-[10px] text-gray-400">{fmt.utc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- 6. SECURITY & AUDIT LOGS ----------------
  return (
    <div className="v2-neu-card rounded-3xl p-5 border border-purple-500/30 space-y-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Immutable Security &amp; Owner Audit Trail ({filteredAuditLogs.length})</span>
          </h3>
          <p className="text-purple-200/75">
            Append-only Firestore record of every profile edit, streak update, status change, and conversation review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Filter by UID, email, reason..."
            className="v2-neu-inset border border-white/10 rounded-xl px-3 py-1.5 text-white outline-none"
          />
          <select
            aria-label="Filter by audit action"
            value={auditActionFilter}
            onChange={(e) => setAuditActionFilter(e.target.value)}
            className="v2-neu-inset border border-white/10 rounded-xl px-3 py-1.5 text-white bg-slate-950/90"
          >
            <option value="all">All Actions</option>
            <option value="profile_update">Profile Updates</option>
            <option value="country_timezone_update">Country / Timezone</option>
            <option value="streak_update">Streak Updates</option>
            <option value="status_change">Status Changes</option>
            <option value="conversation_inspect">Conversation Inspections</option>
          </select>
          <button
            type="button"
            onClick={onRefreshAll}
            className="px-3 py-1.5 rounded-xl v2-neu-inset border border-white/10 hover:border-sky-400/40 text-sky-200 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
        {filteredAuditLogs.map((log) => {
          const ts = formatOwnerTimestamps(log.timestamp, ownerTimezone);
          return (
            <div
              key={log.id}
              className="p-3.5 rounded-2xl v2-neu-inset border border-white/10 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase">
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <span className="font-bold text-white">
                    Target: {log.targetEmail || log.targetUid}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400">({log.targetUid})</span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="text-sky-200 font-semibold">{ts.local}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{ts.utc}</span>
                </div>
              </div>

              <div className="text-gray-200">
                <span className="text-gray-400">Reason: </span>
                {log.reason}
              </div>

              <div className="text-[11px] text-gray-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Actor: <span className="text-emerald-300 font-semibold">{log.actorEmail}</span>
                </span>
                {(log.beforeSnapshot || log.afterSnapshot) && (
                  <span className="font-mono text-[10px] text-purple-200/80 break-all">
                    {log.beforeSnapshot ? `Before: ${JSON.stringify(log.beforeSnapshot)}` : ''}{' '}
                    {log.afterSnapshot ? `→ After: ${JSON.stringify(log.afterSnapshot)}` : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {filteredAuditLogs.length === 0 && (
          <div className="py-10 text-center text-gray-500 italic">
            No audit log entries found yet.
          </div>
        )}
      </div>
    </div>
  );
};
