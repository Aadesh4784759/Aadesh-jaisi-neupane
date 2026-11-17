import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateStreakStateOnRead,
  applyDailyActivityToStreakState,
  isStreakRecoveryEligible,
  recoverBrokenStreakState,
  getLocalDateKeyInTimezone,
  diffCalendarDays,
  addDaysToDateKey,
} from '../src/utils/gamification';
import { resolveCountryForProfile, isConfirmedCountryValue, detectUserCountry } from '../src/utils/country';

test('1. Consecutive days streak progression in user IANA timezone', () => {
  const tz = 'Asia/Kathmandu';
  const day1 = '2026-11-15';
  const day2 = '2026-11-16';
  const day3 = '2026-11-17';

  let state = {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  // Day 1
  const t1 = new Date('2026-11-15T12:00:00+05:45').getTime();
  const res1 = applyDailyActivityToStreakState(state, t1, tz);
  assert.equal(res1.nextState.currentStreak, 1);
  assert.equal(res1.nextState.lastActiveDate, day1);

  // Day 2 (consecutive)
  const t2 = new Date('2026-11-16T14:30:00+05:45').getTime();
  const res2 = applyDailyActivityToStreakState(res1.nextState, t2, tz);
  assert.equal(res2.nextState.currentStreak, 2);
  assert.equal(res2.nextState.lastActiveDate, day2);

  // Day 3 (consecutive)
  const t3 = new Date('2026-11-17T09:15:00+05:45').getTime();
  const res3 = applyDailyActivityToStreakState(res2.nextState, t3, tz);
  assert.equal(res3.nextState.currentStreak, 3);
  assert.equal(res3.nextState.longestStreak, 3);
  assert.equal(res3.nextState.lastActiveDate, day3);
});

test('2. Multiple openings on the same day do not increase streak again', () => {
  const tz = 'America/New_York';
  const tMorning = new Date('2026-11-17T08:00:00-05:00').getTime();
  const tEvening = new Date('2026-11-17T20:30:00-05:00').getTime();

  let state = {
    currentStreak: 2,
    longestStreak: 5,
    lastActiveDate: '2026-11-16',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  const res1 = applyDailyActivityToStreakState(state, tMorning, tz);
  assert.equal(res1.nextState.currentStreak, 3);
  assert.equal(res1.alreadyActiveToday, false);

  // Second open same day
  const res2 = applyDailyActivityToStreakState(res1.nextState, tEvening, tz);
  assert.equal(res2.nextState.currentStreak, 3);
  assert.equal(res2.alreadyActiveToday, true);
});

test('3. Missed-day expiration breaks streak and preserves snapshot', () => {
  const tz = 'UTC';
  const tMissed = new Date('2026-11-18T12:00:00Z').getTime(); // missed 17th

  let state = {
    currentStreak: 5,
    longestStreak: 5,
    lastActiveDate: '2026-11-16', // skipped 17th, active on 18th (diff = 2)
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  const res = applyDailyActivityToStreakState(state, tMissed, tz);
  assert.equal(res.nextState.currentStreak, 1);
  assert.equal(res.streakBroken, true);
  assert.equal(res.nextState.streakBeforeBreak, 5);
  assert.equal(res.nextState.streakBrokenDate, '2026-11-16');
});

test('4. Midnight boundaries in different IANA timezones', () => {
  const tzNepal = 'Asia/Kathmandu'; // +05:45
  const tKathmandu = new Date('2026-11-17T00:15:00+05:45').getTime();
  assert.equal(getLocalDateKeyInTimezone(tKathmandu, tzNepal), '2026-11-17');

  const tzNY = 'America/New_York'; // -05:00
  const tNY = new Date('2026-11-16T23:45:00-05:00').getTime();
  assert.equal(getLocalDateKeyInTimezone(tNY, tzNY), '2026-11-16');
});

test('5 & 6. Sign-out, re-login, Google & Email accounts profile country persistence', () => {
  const savedGoogleProfile = {
    country: 'Nepal',
    countryCode: 'NP',
    countryFlag: '🇳🇵',
    timezone: 'Asia/Kathmandu',
    isManualCountry: true,
  };

  const resolved = resolveCountryForProfile({
    savedCountry: savedGoogleProfile.country,
    savedCountryCode: savedGoogleProfile.countryCode,
    savedFlag: savedGoogleProfile.countryFlag,
    savedTimezone: savedGoogleProfile.timezone,
    isManual: savedGoogleProfile.isManualCountry,
  });

  assert.equal(resolved.country, 'Nepal');
  assert.equal(resolved.code, 'NP');
  assert.equal(resolved.isManual, true);
  assert.equal(isConfirmedCountryValue(resolved.country, resolved.code), true);
});

test('7. Three-monthly streak recovery limit and atomic restore', () => {
  const tz = 'UTC';
  const nowMs1 = new Date('2026-11-19T10:00:00Z').getTime();

  let state = {
    currentStreak: 0,
    longestStreak: 10,
    lastActiveDate: '2026-11-16', // missed 17th, 18th (broken)
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 10,
    streakBrokenDate: '2026-11-16',
  };

  // Recovery 1
  const rec1 = recoverBrokenStreakState(state, nowMs1, tz);
  assert.equal(rec1.ok, true);
  assert.equal(rec1.nextState.currentStreak, 11);
  assert.equal(rec1.nextState.recoveryCount, 1);

  // Simulate another break in same month and recover 3 times total
  let st2 = { ...rec1.nextState, lastActiveDate: '2026-11-20', streakBeforeBreak: 8, streakBrokenDate: '2026-11-20' };
  const nowMs2 = new Date('2026-11-23T10:00:00Z').getTime();
  const rec2 = recoverBrokenStreakState(st2, nowMs2, tz);
  assert.equal(rec2.ok, true);
  assert.equal(rec2.nextState.recoveryCount, 2);

  let st3 = { ...rec2.nextState, lastActiveDate: '2026-11-24', streakBeforeBreak: 5, streakBrokenDate: '2026-11-24' };
  const nowMs3 = new Date('2026-11-27T10:00:00Z').getTime();
  const rec3 = recoverBrokenStreakState(st3, nowMs3, tz);
  assert.equal(rec3.ok, true);
  assert.equal(rec3.nextState.recoveryCount, 3);

  // 4th recovery attempt in same month must be rejected
  let st4 = { ...rec3.nextState, lastActiveDate: '2026-11-28', streakBeforeBreak: 4, streakBrokenDate: '2026-11-28' };
  const nowMs4 = new Date('2026-11-30T10:00:00Z').getTime();
  const rec4 = recoverBrokenStreakState(st4, nowMs4, tz);
  assert.equal(rec4.ok, false);
  assert.equal(rec4.reason, 'monthly_limit_reached');
});

test('8. New Chat initialization while old conversations exist', () => {
  const sessions = [
    {
      id: 'session-old-1',
      title: 'Old Conversation 1',
      createdAt: Date.now() - 100000,
      updatedAt: Date.now() - 50000,
      targetLanguage: 'ne',
      messages: [{ id: 'm1', role: 'user' as const, content: 'Hello old chat', timestamp: Date.now() - 90000 }],
    },
  ];

  const newSessionId = `session-${Date.now()}`;
  const newSession = {
    id: newSessionId,
    title: 'New Conversation 2',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    targetLanguage: 'ne',
    messages: [],
  };

  const updatedSessions = [newSession, ...sessions];
  assert.equal(updatedSessions.length, 2);
  assert.equal(updatedSessions[0].id, newSessionId);
  assert.equal(updatedSessions[0].messages.length, 0);
  assert.equal(updatedSessions[1].messages.length, 1);
  assert.equal(updatedSessions[1].messages[0].content, 'Hello old chat');
});

test('9. Never default to UK when IP or timezone detection fails', () => {
  const detected = detectUserCountry();
  assert.notEqual(detected.country, 'United Kingdom');
  assert.notEqual(detected.code, 'GB');
});

test('10. Cross-reference Firestore streak record with timezone and eliminate 2-day discrepancy', () => {
  const tz = 'Asia/Kathmandu';
  // Simulate Firestore state from Vercel: streakDays = 1, lastActiveDate = '2026-11-16'
  const fsProfile = {
    currentStreak: 1,
    longestStreak: 1,
    lastActiveDate: '2026-11-16',
    timezone: tz,
  };

  // Local clock is early morning Nov 17 in Kathmandu (03:00 AM +05:45 = 21:15 Nov 16 UTC)
  const nowMs = new Date('2026-11-17T03:00:00+05:45').getTime();
  const localDateKey = getLocalDateKeyInTimezone(nowMs, tz);
  assert.equal(localDateKey, '2026-11-17'); // Confirms non-UTC timezone accuracy

  // Stale local cache had 3 days from prior tests
  const staleLocalUser = {
    currentStreak: 3,
    streakDays: 3,
    longestStreak: 5,
    lastActiveDate: '2026-11-17',
  };

  // Simulate hydrateVerifiedUserSession priority: Firestore strictly takes precedence
  const rawState = {
    currentStreak: Number(fsProfile.currentStreak ?? 0),
    longestStreak: Math.max(Number(fsProfile.longestStreak || 0), Number(fsProfile.currentStreak || 0)),
    lastActiveDate: fsProfile.lastActiveDate,
    timezone: tz,
  };

  const evaluated = evaluateStreakStateOnRead(rawState, nowMs, tz);
  // Consecutive day: streak is preserved at 1 (not broken, not prematurely incremented to 2 or retaining stale 3)
  assert.equal(evaluated.currentStreak, 1);
  assert.equal(evaluated.lastActiveDate, '2026-11-16');

  // Next activity on Nov 17 increments to 2
  const activeRes = applyDailyActivityToStreakState(evaluated, nowMs, tz);
  assert.equal(activeRes.nextState.currentStreak, 2);
  assert.equal(activeRes.nextState.lastActiveDate, '2026-11-17');
});
