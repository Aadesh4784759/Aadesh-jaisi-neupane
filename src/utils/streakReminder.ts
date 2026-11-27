import {
  formatCountdownHoursMinutes,
  getDatePartsInTimezone,
  NEPAL_TIMEZONE,
  resolveEffectiveStreakTimezone,
} from './gamification';

export const NEPAL_REMINDER_HOUR = 20; // Default 8:00 PM (20:00)
export const NEPAL_REMINDER_MINUTE = 0;
export const DEFAULT_STREAK_REMINDER_TIME = '20:00';

export interface ParsedReminderTime {
  hour: number;
  minute: number;
  normalized: string; // HH:mm
  label12h: string; // e.g. "8:00 PM"
}

/**
 * Safely parses a user-selected 24-hour "HH:mm" time string (defaulting to "20:00").
 */
export function parseReminderTime(timeStr?: string): ParsedReminderTime {
  let hour = NEPAL_REMINDER_HOUR;
  let minute = NEPAL_REMINDER_MINUTE;

  if (typeof timeStr === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(m) && m >= 0 && m <= 59) {
        hour = h;
        minute = m;
      }
    }
  }

  const normalized = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const displayHour12 = hour % 12 || 12;
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const label12h = `${displayHour12}:${String(minute).padStart(2, '0')} ${amPm}`;
  return { hour, minute, normalized, label12h };
}

export interface NepalTimeClockParts {
  dateKey: string; // YYYY-MM-DD in target timezone
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

/**
 * Extracts calendar date and 24-hour clock components in the target IANA timezone.
 */
export function getClockPartsInTimezone(
  nowMs: number = Date.now(),
  timeZone: string = NEPAL_TIMEZONE
): NepalTimeClockParts {
  const effectiveTz = resolveEffectiveStreakTimezone(timeZone);
  const dateParts = getDatePartsInTimezone(nowMs, effectiveTz);
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: effectiveTz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const second = Number(parts.find((p) => p.type === 'second')?.value ?? '0');
    return {
      dateKey: dateParts.dateKey,
      hour: Number.isFinite(hour) ? hour % 24 : 0,
      minute: Number.isFinite(minute) ? minute % 60 : 0,
      second: Number.isFinite(second) ? second % 60 : 0,
    };
  } catch {
    // UTC+5:45 deterministic fallback for Asia/Kathmandu
    const nptDate = new Date(nowMs + (5 * 60 + 45) * 60 * 1000);
    return {
      dateKey: dateParts.dateKey,
      hour: nptDate.getUTCHours(),
      minute: nptDate.getUTCMinutes(),
      second: nptDate.getUTCSeconds(),
    };
  }
}

/**
 * Extracts exact Nepal Time (Asia/Kathmandu, UTC+5:45) calendar date and 24-hour clock components.
 */
export function getNepalClockParts(nowMs: number = Date.now()): NepalTimeClockParts {
  return getClockPartsInTimezone(nowMs, NEPAL_TIMEZONE);
}

/**
 * Computes milliseconds remaining until the next daily streak reminder check time.
 */
export function getMsUntilNextNepalReminder(
  nowMs: number = Date.now(),
  preferredTime?: string,
  timeZone: string = NEPAL_TIMEZONE
): number {
  const clock = getClockPartsInTimezone(nowMs, timeZone);
  const target = parseReminderTime(preferredTime);
  const currentSecOfDay = clock.hour * 3600 + clock.minute * 60 + clock.second;
  const targetSecOfDay = target.hour * 3600 + target.minute * 60;
  const diffSec =
    currentSecOfDay < targetSecOfDay
      ? targetSecOfDay - currentSecOfDay
      : 24 * 3600 - currentSecOfDay + targetSecOfDay;
  return Math.max(1000, diffSec * 1000);
}

export interface StreakReminderEvaluation {
  shouldNotifyNow: boolean;
  reason:
    | 'disabled'
    | 'already_active_today'
    | 'already_notified_today'
    | 'before_8pm_npt'
    | 'due_now';
  nepalDateKey: string;
  nepalTimeLabel: string;
  preferredTime: string;
  preferredTimeLabel: string;
  effectiveTimezone: string;
  msUntilNextReminder: number;
  countdownLabel: string;
}

/**
 * Pure evaluator for the customizable daily streak reminder rule:
 * Triggers a local push notification if reminders are enabled, the local clock in the user's
 * streak timezone (defaulting to Asia/Kathmandu) has reached their preferred reminder time
 * (default 8:00 PM / 20:00), the user has NOT recorded activity today, and they haven't already
 * been reminded today.
 */
export function evaluateNepalEveningReminder(params: {
  enabled: boolean;
  lastActiveDate?: string;
  lastNotifiedDateKey?: string;
  nowMs?: number;
  preferredTime?: string;
  timeZone?: string;
}): StreakReminderEvaluation {
  const nowMs = params.nowMs ?? Date.now();
  const effectiveTimezone = resolveEffectiveStreakTimezone(params.timeZone);
  const parsedTime = parseReminderTime(params.preferredTime);
  const clock = getClockPartsInTimezone(nowMs, effectiveTimezone);
  const msUntilNextReminder = getMsUntilNextNepalReminder(
    nowMs,
    parsedTime.normalized,
    effectiveTimezone
  );
  const countdownLabel = formatCountdownHoursMinutes(msUntilNextReminder);
  const displayHour12 = clock.hour % 12 || 12;
  const amPm = clock.hour >= 12 ? 'PM' : 'AM';
  const tzBadge = effectiveTimezone === NEPAL_TIMEZONE ? 'NPT' : effectiveTimezone;
  const nepalTimeLabel = `${displayHour12}:${String(clock.minute).padStart(2, '0')} ${amPm} ${tzBadge}`;

  if (!params.enabled) {
    return {
      shouldNotifyNow: false,
      reason: 'disabled',
      nepalDateKey: clock.dateKey,
      nepalTimeLabel,
      preferredTime: parsedTime.normalized,
      preferredTimeLabel: parsedTime.label12h,
      effectiveTimezone,
      msUntilNextReminder,
      countdownLabel,
    };
  }

  if (params.lastActiveDate === clock.dateKey) {
    return {
      shouldNotifyNow: false,
      reason: 'already_active_today',
      nepalDateKey: clock.dateKey,
      nepalTimeLabel,
      preferredTime: parsedTime.normalized,
      preferredTimeLabel: parsedTime.label12h,
      effectiveTimezone,
      msUntilNextReminder,
      countdownLabel,
    };
  }

  if (params.lastNotifiedDateKey === clock.dateKey) {
    return {
      shouldNotifyNow: false,
      reason: 'already_notified_today',
      nepalDateKey: clock.dateKey,
      nepalTimeLabel,
      preferredTime: parsedTime.normalized,
      preferredTimeLabel: parsedTime.label12h,
      effectiveTimezone,
      msUntilNextReminder,
      countdownLabel,
    };
  }

  const reachedTargetTime =
    clock.hour > parsedTime.hour ||
    (clock.hour === parsedTime.hour && clock.minute >= parsedTime.minute);

  if (!reachedTargetTime) {
    return {
      shouldNotifyNow: false,
      reason: 'before_8pm_npt',
      nepalDateKey: clock.dateKey,
      nepalTimeLabel,
      preferredTime: parsedTime.normalized,
      preferredTimeLabel: parsedTime.label12h,
      effectiveTimezone,
      msUntilNextReminder,
      countdownLabel,
    };
  }

  return {
    shouldNotifyNow: true,
    reason: 'due_now',
    nepalDateKey: clock.dateKey,
    nepalTimeLabel,
    preferredTime: parsedTime.normalized,
    preferredTimeLabel: parsedTime.label12h,
    effectiveTimezone,
    msUntilNextReminder,
    countdownLabel,
  };
}

export type BrowserNotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestStreakReminderPermission(): Promise<BrowserNotificationPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export async function triggerLocalStreakNotification(params: {
  currentStreak: number;
  userName?: string;
  isTest?: boolean;
  preferredTime?: string;
  timeZone?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const streak = Math.max(0, Math.floor(params.currentStreak || 0));
  const greeting = params.userName ? `${params.userName.split(/\s+/)[0]}, ` : '';
  const parsedTime = parseReminderTime(params.preferredTime);
  const effectiveTz = resolveEffectiveStreakTimezone(params.timeZone);
  const tzLabel = effectiveTz === NEPAL_TIMEZONE ? 'Nepal Time' : effectiveTz;

  const title = params.isTest
    ? `Aadesh AI • ${parsedTime.label12h} Daily Streak Reminder Ready`
    : streak > 0
    ? `Keep your ${streak}-day Aadesh AI streak alive!`
    : 'Check in to Aadesh AI to start your streak!';

  const body = params.isTest
    ? `Notifications are active! If you haven't opened Aadesh AI by ${parsedTime.label12h} (${tzLabel}), we'll remind you to protect your ${streak}d streak.`
    : streak > 0
    ? `${greeting}it's past your ${parsedTime.label12h} (${tzLabel}) reminder. Open Aadesh AI before midnight to keep your ${streak}-day streak glowing!`
    : `${greeting}it's past your ${parsedTime.label12h} (${tzLabel}) reminder. Open Aadesh AI today to earn +1 daily streak and XP.`;

  const options: NotificationOptions = {
    body,
    tag: params.isTest ? 'aadesh-streak-reminder-test' : 'aadesh-streak-reminder-npt',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  };

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fall back to direct window Notification below
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
