import { AIProviderId, normalizeAIProviderId, sanitizeProviderSecretText } from './aiProviders';
import { computeLevelInfo, NEPAL_TIMEZONE, resolveValidTimezone } from './gamification';

export type OwnerAuditAction =
  | 'profile_update'
  | 'streak_update'
  | 'status_change'
  | 'conversation_inspect'
  | 'country_timezone_update';

export interface OwnerManagedUser {
  uid: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  username?: string;
  nickname?: string;
  photoURL?: string;
  country?: string;
  countryCode?: string;
  countryFlag?: string;
  timezone: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  status: 'active' | 'suspended';
  disabled: boolean;
  role: 'user' | 'admin';
  provider: string;
  preferredLanguage: string;
  aiProvider: AIProviderId;
  aiModel?: string;
  aiResponseLanguage?: string;
  messageCount: number;
  conversationCount: number;
  lastMessageAt?: string | null;
  lastAiProviderUsed?: AIProviderId | null;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  recoveryCount: number;
  recoveryMonth?: string;
  streakBeforeBreak?: number;
  streakBrokenDate?: string;
  recoveredDates?: string[];
  xp: number;
  level: number;
  levelTitle?: string;
  authSynced: boolean;
  hasFirestoreProfile: boolean;
}

export interface OwnerAuditLogRecord {
  id: string;
  timestamp: string;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail?: string;
  action: OwnerAuditAction;
  reason: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
}

export interface UserTimelineEvent {
  id: string;
  type:
    | 'registration'
    | 'login'
    | 'message'
    | 'conversation'
    | 'streak'
    | 'profile_change'
    | 'status_change';
  timestamp: string;
  title: string;
  detail: string;
  provider?: string;
  dataAvailability?: 'available' | 'unavailable';
}

export interface OwnerProfileUpdateInput {
  displayName?: string;
  username?: string;
  nickname?: string;
  country?: string;
  countryCode?: string;
  countryFlag?: string;
  timezone?: string;
  photoURL?: string;
  preferredLanguage?: string;
  aiProvider?: AIProviderId;
  aiResponseLanguage?: string;
  status?: 'active' | 'suspended';
  reason: string;
  // Forbidden escalation/identity fields checked explicitly if passed
  uid?: string;
  userId?: string;
  role?: string;
}

export interface OwnerStreakUpdateInput {
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string;
  recoveryCount?: number;
  timezone?: string;
  resetToZero?: boolean;
  reason: string;
}

export interface CountryPresetOption {
  country: string;
  countryCode: string;
  countryFlag: string;
  timezone: string;
}

export const OWNER_COUNTRY_PRESETS: CountryPresetOption[] = [
  { country: 'Nepal', countryCode: 'NP', countryFlag: '🇳🇵', timezone: 'Asia/Kathmandu' },
  { country: 'India', countryCode: 'IN', countryFlag: '🇮🇳', timezone: 'Asia/Kolkata' },
  { country: 'United States', countryCode: 'US', countryFlag: '🇺🇸', timezone: 'America/New_York' },
  { country: 'United Kingdom', countryCode: 'GB', countryFlag: '🇬🇧', timezone: 'Europe/London' },
  { country: 'Australia', countryCode: 'AU', countryFlag: '🇦🇺', timezone: 'Australia/Sydney' },
  { country: 'Canada', countryCode: 'CA', countryFlag: '🇨🇦', timezone: 'America/Toronto' },
  { country: 'Japan', countryCode: 'JP', countryFlag: '🇯🇵', timezone: 'Asia/Tokyo' },
  { country: 'Germany', countryCode: 'DE', countryFlag: '🇩🇪', timezone: 'Europe/Berlin' },
  { country: 'United Arab Emirates', countryCode: 'AE', countryFlag: '🇦🇪', timezone: 'Asia/Dubai' },
  { country: 'Singapore', countryCode: 'SG', countryFlag: '🇸🇬', timezone: 'Asia/Singapore' },
  { country: 'Global', countryCode: 'GL', countryFlag: '🌐', timezone: 'UTC' },
];

export const SOLE_OWNER_EMAIL = 'aadeshjaisi6@gmail.com';

const SECRET_PATTERN =
  /(AIza[0-9A-Za-z_-]{10,}|gsk_[0-9A-Za-z_-]{10,}|sk-or-(?:v1-)?[0-9A-Za-z_-]{10,}|sk-[0-9A-Za-z_-]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/i;

export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim() || tz.trim().length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidSafePhotoUrl(url: unknown): boolean {
  if (url === '') return true;
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.length > 1000) return false;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateOwnerReason(reason: unknown): { ok: boolean; clean: string; error?: string } {
  const clean = typeof reason === 'string' ? sanitizeProviderSecretText(reason.trim()) : '';
  if (clean.length < 3) {
    return {
      ok: false,
      clean: '',
      error: 'A clear audit reason (minimum 3 characters) is required for every owner modification.',
    };
  }
  if (clean.length > 500) {
    return {
      ok: false,
      clean: clean.slice(0, 500),
      error: 'Audit reason cannot exceed 500 characters.',
    };
  }
  if (SECRET_PATTERN.test(clean)) {
    return {
      ok: false,
      clean: '',
      error: 'Audit reason cannot contain secret keys or credentials.',
    };
  }
  return { ok: true, clean };
}

export function validateOwnerProfilePatch(
  input: OwnerProfileUpdateInput,
  current: Partial<OwnerManagedUser> & { uid: string; email?: string }
): {
  ok: boolean;
  error?: string;
  firestorePatch?: Record<string, unknown>;
  authPatch?: { displayName?: string; photoURL?: string | null; disabled?: boolean };
  leaderboardPatch?: Record<string, unknown>;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  reason?: string;
  auditAction?: OwnerAuditAction;
} {
  if (input.uid !== undefined && input.uid !== current.uid) {
    return { ok: false, error: 'Firebase UIDs cannot be modified directly.' };
  }
  if (input.userId !== undefined && input.userId !== current.uid) {
    return { ok: false, error: 'Firebase userId cannot be modified directly.' };
  }
  if (input.role !== undefined) {
    return { ok: false, error: 'Role changes are not permitted through the profile editor.' };
  }

  const reasonRes = validateOwnerReason(input.reason);
  if (!reasonRes.ok) {
    return { ok: false, error: reasonRes.error };
  }

  const targetEmailLower = String(current.email || '').trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const firestorePatch: Record<string, unknown> = {
    updatedAt: nowIso,
  };
  const authPatch: { displayName?: string; photoURL?: string | null; disabled?: boolean } = {};
  const leaderboardPatch: Record<string, unknown> = {};
  const beforeSnapshot: Record<string, unknown> = {};
  const afterSnapshot: Record<string, unknown> = {};

  let changedCountryOrTz = false;
  let changedStatus = false;
  let hasFieldChange = false;

  if (input.displayName !== undefined) {
    const cleanName = String(input.displayName).trim();
    if (!cleanName || cleanName.length > 100) {
      return { ok: false, error: 'Display name must be between 1 and 100 characters.' };
    }
    if (SECRET_PATTERN.test(cleanName)) {
      return { ok: false, error: 'Display name cannot contain secret credentials.' };
    }
    beforeSnapshot.displayName = current.displayName || '';
    afterSnapshot.displayName = cleanName;
    firestorePatch.displayName = cleanName;
    authPatch.displayName = cleanName;
    leaderboardPatch.displayName = cleanName.slice(0, 64);
    hasFieldChange = true;
  }

  if (input.username !== undefined) {
    const cleanUsername = String(input.username).trim();
    if (cleanUsername.length > 64) {
      return { ok: false, error: 'Username cannot exceed 64 characters.' };
    }
    if (SECRET_PATTERN.test(cleanUsername)) {
      return { ok: false, error: 'Username cannot contain secret credentials.' };
    }
    beforeSnapshot.username = current.username || '';
    afterSnapshot.username = cleanUsername;
    firestorePatch.username = cleanUsername;
    hasFieldChange = true;
  }

  if (input.nickname !== undefined) {
    const cleanNick = String(input.nickname).trim();
    if (cleanNick.length > 64) {
      return { ok: false, error: 'Nickname cannot exceed 64 characters.' };
    }
    if (SECRET_PATTERN.test(cleanNick)) {
      return { ok: false, error: 'Nickname cannot contain secret credentials.' };
    }
    beforeSnapshot.nickname = current.nickname || '';
    afterSnapshot.nickname = cleanNick;
    firestorePatch.nickname = cleanNick;
    hasFieldChange = true;
  }

  if (input.photoURL !== undefined) {
    const cleanPhoto = String(input.photoURL).trim();
    if (!isValidSafePhotoUrl(cleanPhoto)) {
      return { ok: false, error: 'Photo URL must be an http/https URL (max 1000 characters) or empty.' };
    }
    beforeSnapshot.photoURL = current.photoURL || '';
    afterSnapshot.photoURL = cleanPhoto;
    firestorePatch.photoURL = cleanPhoto;
    authPatch.photoURL = cleanPhoto || null;
    leaderboardPatch.avatarUrl = cleanPhoto;
    hasFieldChange = true;
  }

  if (input.country !== undefined) {
    const cleanCountry = String(input.country).trim();
    if (!cleanCountry || cleanCountry.length > 80) {
      return { ok: false, error: 'Country must be between 1 and 80 characters.' };
    }
    beforeSnapshot.country = current.country || '';
    afterSnapshot.country = cleanCountry;
    firestorePatch.country = cleanCountry;
    firestorePatch.countryDetectionMethod = 'manual';
    firestorePatch.isManualCountry = true;
    leaderboardPatch.country = cleanCountry;
    changedCountryOrTz = true;
    hasFieldChange = true;
  }

  if (input.countryCode !== undefined) {
    const cleanCode = String(input.countryCode).trim().toUpperCase();
    if (cleanCode.length > 10) {
      return { ok: false, error: 'Country code cannot exceed 10 characters.' };
    }
    beforeSnapshot.countryCode = current.countryCode || '';
    afterSnapshot.countryCode = cleanCode;
    firestorePatch.countryCode = cleanCode;
    changedCountryOrTz = true;
    hasFieldChange = true;
  }

  if (input.countryFlag !== undefined) {
    const cleanFlag = String(input.countryFlag).trim();
    if (cleanFlag.length > 16) {
      return { ok: false, error: 'Country flag cannot exceed 16 characters.' };
    }
    beforeSnapshot.countryFlag = current.countryFlag || '';
    afterSnapshot.countryFlag = cleanFlag;
    firestorePatch.countryFlag = cleanFlag;
    leaderboardPatch.countryFlag = cleanFlag;
    changedCountryOrTz = true;
    hasFieldChange = true;
  }

  if (input.timezone !== undefined) {
    const cleanTz = String(input.timezone).trim();
    if (!isValidIanaTimezone(cleanTz)) {
      return { ok: false, error: `Invalid IANA timezone "${cleanTz}".` };
    }
    beforeSnapshot.timezone = current.timezone || NEPAL_TIMEZONE;
    afterSnapshot.timezone = cleanTz;
    firestorePatch.timezone = cleanTz;
    changedCountryOrTz = true;
    hasFieldChange = true;
  }

  if (input.preferredLanguage !== undefined) {
    const cleanLang = String(input.preferredLanguage).trim();
    if (!cleanLang || cleanLang.length > 20) {
      return { ok: false, error: 'Preferred language code must be 1–20 characters.' };
    }
    beforeSnapshot.preferredLanguage = current.preferredLanguage || 'en';
    afterSnapshot.preferredLanguage = cleanLang;
    firestorePatch.preferredLanguage = cleanLang;
    hasFieldChange = true;
  }

  if (input.aiProvider !== undefined) {
    const normProvider = normalizeAIProviderId(input.aiProvider);
    beforeSnapshot.aiProvider = current.aiProvider || 'gemini';
    afterSnapshot.aiProvider = normProvider;
    firestorePatch.aiProvider = normProvider;
    hasFieldChange = true;
  }

  if (input.aiResponseLanguage !== undefined) {
    const cleanRespLang = String(input.aiResponseLanguage).trim();
    if (!cleanRespLang || cleanRespLang.length > 20) {
      return { ok: false, error: 'AI response language code must be 1–20 characters.' };
    }
    beforeSnapshot.aiResponseLanguage = current.aiResponseLanguage || 'en';
    afterSnapshot.aiResponseLanguage = cleanRespLang;
    firestorePatch.aiResponseLanguage = cleanRespLang;
    hasFieldChange = true;
  }

  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'suspended') {
      return { ok: false, error: 'Account status must be either "active" or "suspended".' };
    }
    if (targetEmailLower === SOLE_OWNER_EMAIL && input.status === 'suspended') {
      return { ok: false, error: 'Sole owner account cannot be suspended.' };
    }
    beforeSnapshot.status = current.status || 'active';
    afterSnapshot.status = input.status;
    firestorePatch.status = input.status;
    authPatch.disabled = input.status === 'suspended';
    changedStatus = true;
    hasFieldChange = true;
  }

  if (!hasFieldChange) {
    return { ok: false, error: 'No permitted profile fields were provided to update.' };
  }

  const auditAction: OwnerAuditAction = changedStatus
    ? 'status_change'
    : changedCountryOrTz && Object.keys(afterSnapshot).every((k) =>
        ['country', 'countryCode', 'countryFlag', 'timezone'].includes(k)
      )
    ? 'country_timezone_update'
    : 'profile_update';

  return {
    ok: true,
    firestorePatch,
    authPatch,
    leaderboardPatch,
    beforeSnapshot,
    afterSnapshot,
    reason: reasonRes.clean,
    auditAction,
  };
}

export function validateAndComputeOwnerStreakUpdate(
  input: OwnerStreakUpdateInput,
  current: {
    currentStreak?: number;
    longestStreak?: number;
    lastActiveDate?: string;
    recoveryCount?: number;
    timezone?: string;
    xp?: number;
  }
): {
  ok: boolean;
  error?: string;
  firestorePatch?: Record<string, unknown>;
  leaderboardPatch?: Record<string, unknown>;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  reason?: string;
} {
  const reasonRes = validateOwnerReason(input.reason);
  if (!reasonRes.ok) {
    return { ok: false, error: reasonRes.error };
  }

  const prevCurrent = Math.max(0, Math.floor(Number(current.currentStreak ?? 0) || 0));
  const prevLongest = Math.max(prevCurrent, Math.floor(Number(current.longestStreak ?? 0) || 0));
  const prevRecovery = Math.min(5, Math.max(0, Math.floor(Number(current.recoveryCount ?? 0) || 0)));
  const prevDate = String(current.lastActiveDate || '');
  const prevTz = resolveValidTimezone(current.timezone || NEPAL_TIMEZONE);

  let nextTz = prevTz;
  if (input.timezone !== undefined) {
    if (!isValidIanaTimezone(input.timezone)) {
      return { ok: false, error: `Invalid IANA timezone "${input.timezone}".` };
    }
    nextTz = input.timezone.trim();
  }

  let nextCurrent = prevCurrent;
  let nextLongest = prevLongest;
  let nextDate = prevDate;
  let nextRecovery = prevRecovery;

  if (input.resetToZero) {
    nextCurrent = 0;
  } else if (input.currentStreak !== undefined) {
    const n = Number(input.currentStreak);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      return { ok: false, error: 'Current streak must be an integer between 0 and 10,000.' };
    }
    nextCurrent = n;
  }

  if (input.longestStreak !== undefined) {
    const n = Number(input.longestStreak);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      return { ok: false, error: 'Longest streak must be an integer between 0 and 10,000.' };
    }
    nextLongest = Math.max(n, nextCurrent);
  } else {
    nextLongest = Math.max(prevLongest, nextCurrent);
  }

  if (input.lastActiveDate !== undefined) {
    const cleanDate = String(input.lastActiveDate).trim();
    if (cleanDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return { ok: false, error: 'Last active date must use YYYY-MM-DD format (or empty).' };
    }
    nextDate = cleanDate;
  }

  if (input.recoveryCount !== undefined) {
    const n = Number(input.recoveryCount);
    if (!Number.isInteger(n) || n < 0 || n > 5) {
      return { ok: false, error: 'Recovery count must be an integer between 0 and 5.' };
    }
    nextRecovery = n;
  }

  const nowIso = new Date().toISOString();
  const levelInfo = computeLevelInfo(Math.max(0, Number(current.xp ?? 0) || 0));

  const firestorePatch: Record<string, unknown> = {
    currentStreak: nextCurrent,
    streakDays: nextCurrent,
    longestStreak: nextLongest,
    lastActiveDate: nextDate,
    recoveryCount: nextRecovery,
    timezone: nextTz,
    updatedAt: nowIso,
    ...(input.resetToZero ? { streakBeforeBreak: 0, streakBrokenDate: '' } : {}),
  };

  const leaderboardPatch: Record<string, unknown> = {
    currentStreak: nextCurrent,
    longestStreak: nextLongest,
    lastActiveDate: nextDate,
    level: levelInfo.level,
    updatedAt: nowIso,
  };

  return {
    ok: true,
    firestorePatch,
    leaderboardPatch,
    beforeSnapshot: {
      currentStreak: prevCurrent,
      longestStreak: prevLongest,
      lastActiveDate: prevDate,
      recoveryCount: prevRecovery,
      timezone: prevTz,
    },
    afterSnapshot: {
      currentStreak: nextCurrent,
      longestStreak: nextLongest,
      lastActiveDate: nextDate,
      recoveryCount: nextRecovery,
      timezone: nextTz,
    },
    reason: reasonRes.clean,
  };
}

export function buildUserActivityTimeline(params: {
  user: OwnerManagedUser;
  conversations?: Array<{
    id: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
    messageCount?: number;
  }>;
  analyticsEvents?: Array<{
    id: string;
    eventType: string;
    language?: string;
    timestamp: string;
  }>;
  auditLogs?: OwnerAuditLogRecord[];
}): UserTimelineEvent[] {
  const { user, conversations = [], analyticsEvents = [], auditLogs = [] } = params;
  const events: UserTimelineEvent[] = [];

  if (user.createdAt) {
    events.push({
      id: `reg-${user.uid}`,
      type: 'registration',
      timestamp: user.createdAt,
      title: 'Account Registered',
      detail: `Registered via ${user.provider || 'firebase'} (${user.email || user.uid})`,
      provider: user.provider,
      dataAvailability: 'available',
    });
  }

  if (user.lastLoginAt) {
    events.push({
      id: `login-last-${user.uid}`,
      type: 'login',
      timestamp: user.lastLoginAt,
      title: 'Last Firebase Authentication Sign-In',
      detail: 'Most recent verified sign-in recorded by Firebase Authentication (earlier historical logins are not stored separately by Firebase Auth).',
      provider: user.provider,
      dataAvailability: 'available',
    });
  } else {
    events.push({
      id: `login-unavailable-${user.uid}`,
      type: 'login',
      timestamp: user.createdAt || new Date().toISOString(),
      title: 'Login Timestamp Unavailable',
      detail: user.authSynced
        ? 'Firebase Authentication returned no sign-in timestamp for this user.'
        : 'Firebase Authentication metadata unavailable (Firestore-only profile record).',
      dataAvailability: 'unavailable',
    });
  }

  if (user.lastActiveDate || user.currentStreak > 0) {
    events.push({
      id: `streak-state-${user.uid}`,
      type: 'streak',
      timestamp: user.lastActiveAt || user.createdAt || new Date().toISOString(),
      title: `Streak Standing: ${user.currentStreak} days (Best: ${user.longestStreak} days)`,
      detail: `Last active date: ${user.lastActiveDate || 'None'} · Timezone: ${user.timezone} · Recoveries used: ${user.recoveryCount}/5`,
      dataAvailability: 'available',
    });
  }

  if (Array.isArray(user.recoveredDates)) {
    for (const dateKey of user.recoveredDates.slice(-15)) {
      events.push({
        id: `streak-rec-${dateKey}`,
        type: 'streak',
        timestamp: `${dateKey}T12:00:00.000Z`,
        title: `Streak Recovered (${dateKey})`,
        detail: `Recovered gap date in ${user.timezone}`,
        dataAvailability: 'available',
      });
    }
  }

  for (const conv of conversations.slice(0, 25)) {
    const ts = conv.updatedAt || conv.createdAt;
    if (ts) {
      events.push({
        id: `conv-${conv.id}`,
        type: 'conversation',
        timestamp: ts,
        title: `Conversation: ${conv.title || 'Untitled Conversation'}`,
        detail: `${conv.messageCount ?? 0} messages tracked`,
        dataAvailability: 'available',
      });
    }
  }

  for (const ev of analyticsEvents.slice(0, 40)) {
    events.push({
      id: `msg-ev-${ev.id}`,
      type: 'message',
      timestamp: ev.timestamp,
      title: `Activity: ${ev.eventType}`,
      detail: ev.language ? `Language: ${ev.language}` : 'Recorded activity event',
      dataAvailability: 'available',
    });
  }

  for (const log of auditLogs) {
    events.push({
      id: `audit-${log.id}`,
      type: log.action === 'status_change' ? 'status_change' : log.action === 'streak_update' ? 'streak' : 'profile_change',
      timestamp: log.timestamp,
      title: `Owner Action: ${log.action.replace(/_/g, ' ')}`,
      detail: `By ${log.actorEmail} · Reason: ${log.reason}`,
      dataAvailability: 'available',
    });
  }

  return events.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime() || 0;
    const tb = new Date(b.timestamp).getTime() || 0;
    return tb - ta;
  });
}

export function formatOwnerTimestamps(
  isoOrMs: string | number | null | undefined,
  userTimezone?: string
): { utc: string; local: string; available: boolean } {
  if (!isoOrMs) {
    return { utc: 'Unavailable', local: 'Unavailable', available: false };
  }
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) {
    return { utc: 'Unavailable', local: 'Unavailable', available: false };
  }
  const tz = resolveValidTimezone(userTimezone || NEPAL_TIMEZONE);
  let local = d.toISOString();
  try {
    local = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(d);
  } catch {
    local = d.toUTCString();
  }
  return {
    utc: d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    local,
    available: true,
  };
}
