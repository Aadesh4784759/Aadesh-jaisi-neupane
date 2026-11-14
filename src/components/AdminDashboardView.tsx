import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  MessageSquare,
  Activity,
  UserCheck,
  Ban,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Lock,
  Calendar,
  Cpu,
  Megaphone,
  Check,
} from 'lucide-react';
import {
  AdminConversationSummary,
  AdminUserRecord,
  ChatMessage,
  UserProfile,
} from '../types';
import {
  fetchAdminAnalyticsEvents,
  fetchAdminConversationMessages,
  fetchAdminConversationsForUser,
  fetchAdminUsersFromFirestore,
  getCurrentIdToken,
  updateAdminSettingsInFirestore,
  updateAdminUserStatusInFirestore,
} from '../utils/firebase';
import { OWNER_ADMIN_EMAIL } from '../utils/storage';

interface AdminDashboardViewProps {
  currentUser: UserProfile;
  onOpenAuth: () => void;
}

interface ServerStatusPayload {
  aiConfigured: boolean;
  primaryModel: string;
  fallbackModels: string[];
  supportedLanguagesCount: number;
  uptimeSeconds: number;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  onOpenAuth,
}) => {
  const [verifying, setVerifying] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatusPayload | null>(null);

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<
    Array<{ id: string; userId: string; eventType: string; language?: string; dateKey: string; timestamp: string }>
  >([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [userConversations, setUserConversations] = useState<AdminConversationSummary[]>([]);
  const [selectedConvMessages, setSelectedConvMessages] = useState<ChatMessage[]>([]);
  const [selectedConvTitle, setSelectedConvTitle] = useState<string>('');
  const [loadingSubData, setLoadingSubData] = useState(false);

  const [announcement, setAnnouncement] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const loadOwnerDashboard = async () => {
    setVerifying(true);
    setAuthError(null);
    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        setAuthorized(false);
        setAuthError('Sign in with your verified owner Google account to access the Admin Dashboard.');
        setVerifying(false);
        return;
      }

      // Server-side cryptographic Firebase token verification against OWNER_ADMIN_EMAIL
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();

      if (!res.ok || !data.authorized) {
        setAuthorized(false);
        setAuthError(data.error || 'Access denied: Owner privileges required.');
        setVerifying(false);
        return;
      }

      setAuthorized(true);
      setServerStatus(data.serverStatus || null);

      const [userList, events] = await Promise.all([
        fetchAdminUsersFromFirestore(),
        fetchAdminAnalyticsEvents(),
      ]);
      setUsers(userList);
      setAnalyticsEvents(events);
    } catch (err: any) {
      setAuthorized(false);
      setAuthError(err?.message || 'Failed to verify owner authorization.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    loadOwnerDashboard();
  }, [currentUser.id, currentUser.email, currentUser.isLoggedIn]);

  const handleSelectUserForAudit = async (userRecord: AdminUserRecord) => {
    setSelectedUser(userRecord);
    setSelectedConvMessages([]);
    setSelectedConvTitle('');
    setLoadingSubData(true);
    try {
      const convs = await fetchAdminConversationsForUser(
        userRecord.userId,
        userRecord.displayName,
        userRecord.email
      );
      setUserConversations(convs);
    } catch (err: any) {
      setAuthError(err?.message || 'Could not load user conversations.');
    } finally {
      setLoadingSubData(false);
    }
  };

  const handleInspectConversation = async (conv: AdminConversationSummary) => {
    setSelectedConvTitle(conv.title);
    setLoadingSubData(true);
    try {
      const msgs = await fetchAdminConversationMessages(conv.userId, conv.id);
      setSelectedConvMessages(msgs);
    } catch (err: any) {
      setAuthError(err?.message || 'Could not load messages.');
    } finally {
      setLoadingSubData(false);
    }
  };

  const handleToggleUserStatus = async (userRecord: AdminUserRecord) => {
    const nextStatus = userRecord.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateAdminUserStatusInFirestore(userRecord.userId, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.userId === userRecord.userId ? { ...u, status: nextStatus } : u))
      );
      if (selectedUser?.userId === userRecord.userId) {
        setSelectedUser({ ...userRecord, status: nextStatus });
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to update account status.');
    }
  };

  const handleSaveGlobalBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAnnouncement(true);
    try {
      await updateAdminSettingsInFirestore({
        platformName: 'Aadesh AI Global Hub',
        maintenanceMode,
        announcement: announcement.trim(),
      });
      setSaveToast('Platform announcement updated across live sessions.');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to save platform settings.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  if (verifying) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
        <p className="text-sm text-gray-300 font-semibold">
          Verifying server-side owner credentials...
        </p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 pb-32">
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-rose-500/40 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white">Owner-Only Admin Dashboard</h2>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            {authError || `Restricted exclusively to verified platform owner (${OWNER_ADMIN_EMAIL}).`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={onOpenAuth}
              className="purple-glow-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
            >
              Sign In as Owner
            </button>
            <button
              onClick={loadOwnerDashboard}
              className="px-4 py-2.5 rounded-xl bg-[#131520] border border-[#232738] text-xs font-semibold text-gray-300 hover:text-white cursor-pointer"
            >
              Re-verify Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Compute Stats
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status !== 'suspended').length;
  const totalConversations = users.reduce((sum, u) => sum + (u.conversationCount || 0), 0);
  const totalMessages = users.reduce((sum, u) => sum + (u.messageCount || 0), 0) + analyticsEvents.length;

  // Daily Registrations (last 7 days)
  const dailyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().slice(0, 10)] = 0;
  }
  users.forEach((u) => {
    const key = String(u.createdAt || '').slice(0, 10);
    if (dailyMap[key] !== undefined) {
      dailyMap[key] += 1;
    }
  });
  const dailyRegEntries = Object.entries(dailyMap);
  const maxDailyReg = Math.max(1, ...dailyRegEntries.map(([, v]) => v));

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      u.userId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-32 w-full">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-bold mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Verified Owner Admin Control · {OWNER_ADMIN_EMAIL}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Platform Admin & User Operations</h2>
          <p className="text-xs text-gray-400">
            Real-time Firestore accounts, daily registrations, usage telemetry, and server health.
          </p>
        </div>

        <button
          onClick={loadOwnerDashboard}
          className="px-4 py-2 rounded-xl bg-[#131520] hover:bg-purple-900/40 border border-[#232738] text-purple-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {authError && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{authError}</span>
        </div>
      )}

      {saveToast && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Registered Users</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{totalUsers}</div>
          <div className="text-[11px] text-purple-300">Firestore authenticated profiles</div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-emerald-500/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Active Users</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{activeUsers}</div>
          <div className="text-[11px] text-emerald-300">
            {totalUsers > 0 ? `${Math.round((activeUsers / totalUsers) * 100)}% active standing` : 'Ready'}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-indigo-500/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Conversations Tracked</span>
            <MessageSquare className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">{totalConversations}</div>
          <div className="text-[11px] text-indigo-300">{totalMessages} total messages & events</div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-amber-500/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Gemini Engine Status</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-white truncate">
            {serverStatus?.primaryModel || 'gemini-4-hydrogen'}
          </div>
          <div className="text-[11px] text-amber-300">
            {serverStatus?.aiConfigured ? 'API Ready' : 'Key Missing'} · {serverStatus?.supportedLanguagesCount || 19} languages
          </div>
        </div>
      </div>

      {/* Daily Registrations + Owner Broadcast Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>Daily User Registrations (7 Days)</span>
            </h3>
            <span className="text-xs text-gray-400">Firestore Timeline</span>
          </div>

          <div className="h-36 flex items-end justify-between gap-2 pt-4">
            {dailyRegEntries.map(([dateKey, count]) => {
              const pct = Math.max(10, Math.round((count / maxDailyReg) * 100));
              return (
                <div key={dateKey} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-bold text-purple-300">{count}</span>
                  <div
                    style={{ height: `${pct}%` }}
                    className="w-full max-w-[36px] rounded-t-lg bg-gradient-to-t from-purple-600 to-indigo-400"
                  />
                  <span className="text-[10px] text-gray-400">{dateKey.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSaveGlobalBanner}
          className="glass-card rounded-2xl p-5 border border-purple-500/30 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-400" />
              <span>Global Announcement & Controls</span>
            </h3>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="accent-purple-500"
              />
              <span>Maintenance Notice</span>
            </label>
          </div>

          <textarea
            rows={3}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="Optional notice banner shown to active platform visitors..."
            className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl p-3 text-xs text-white outline-none resize-none"
          />

          <button
            type="submit"
            disabled={savingAnnouncement}
            className="purple-glow-btn px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          >
            {savingAnnouncement ? 'Publishing...' : 'Publish Platform Notice'}
          </button>
        </form>
      </div>

      {/* User Management & Authorized Conversation Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Users Table */}
        <div className="lg:col-span-7 glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span>Registered Accounts ({filteredUsers.length})</span>
            </h3>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, email, UID..."
                className="w-full bg-[#090a0f] border border-[#232738] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-gray-400 border-b border-white/10">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Registered</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((u) => (
                  <tr
                    key={u.userId}
                    className={`hover:bg-white/5 ${
                      selectedUser?.userId === u.userId ? 'bg-purple-950/35' : ''
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.displayName} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-purple-900/70 flex items-center justify-center text-white font-bold">
                            {u.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate max-w-[140px]">{u.displayName}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[160px]">
                            {u.email || u.userId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-400 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-3">
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
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleSelectUserForAudit(u)}
                        className="px-2 py-1 rounded-lg bg-[#131520] hover:bg-purple-900/50 border border-purple-500/30 text-purple-200 cursor-pointer"
                        title="Inspect user conversations"
                      >
                        <Eye className="w-3.5 h-3.5 inline" />
                      </button>
                      {u.email?.toLowerCase() !== OWNER_ADMIN_EMAIL && (
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className={`px-2 py-1 rounded-lg border cursor-pointer ${
                            u.status === 'suspended'
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                          }`}
                          title={u.status === 'suspended' ? 'Restore user' : 'Suspend user'}
                        >
                          <Ban className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      No matching registered users found in Firestore yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Authorized Conversation & Message Overview */}
        <div className="lg:col-span-5 glass-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <div className="border-b border-white/10 pb-2.5">
            <h3 className="text-sm font-bold text-white">Authorized Conversation Audit</h3>
            <p className="text-[11px] text-gray-400">
              {selectedUser
                ? `Inspecting ${selectedUser.displayName} (${selectedUser.email || selectedUser.userId})`
                : 'Select a user from the table to inspect conversation logs.'}
            </p>
          </div>

          {loadingSubData && (
            <div className="py-6 text-center text-xs text-purple-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading encrypted records...</span>
            </div>
          )}

          {selectedUser && !loadingSubData && (
            <div className="space-y-3">
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {userConversations.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No synced conversations for this user.</p>
                ) : (
                  userConversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleInspectConversation(c)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer ${
                        selectedConvTitle === c.title
                          ? 'bg-purple-900/40 border-purple-400 text-white'
                          : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
                      }`}
                    >
                      <span className="truncate font-semibold">{c.title}</span>
                      <span className="text-[10px] text-purple-300 shrink-0 ml-2">
                        {c.language?.toUpperCase()}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedConvMessages.length > 0 && (
                <div className="border-t border-white/10 pt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                  <div className="text-[11px] font-bold text-purple-300">Messages: {selectedConvTitle}</div>
                  {selectedConvMessages.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-[#090a0f] border border-[#232738] text-xs space-y-1"
                    >
                      <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase">
                        <span>{m.role}</span>
                        <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-gray-200 whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
