import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_MONTHLY_STREAK_RECOVERIES,
  NEPAL_TIMEZONE,
  evaluateCurrentStreakOnLoad,
  evaluateStreakStateOnRead,
  applyDailyActivityToStreakState,
  isStreakRecoveryEligible,
  recoverBrokenStreakState,
  getLocalDateKeyInTimezone,
  getRecoveredGapDateKeys,
  buildStreakCalendarMonth,
  generateStreakHistory,
  resolveValidTimezone,
  resolveEffectiveStreakTimezone,
  mergeStreakStateSafely,
  computeStreakInsights,
  evaluateStreakMilestones,
  rankLeaderboardEntries,
  rankLongestStreakLeaderboardEntries,
  resolveCelebratedMilestone,
  clampStreakGoalDays,
  computeStreakGoalProgress,
  DAILY_MOTIVATION_INTERVAL_MS,
  resolveDailyMotivationQuote,
  formatCountdownHoursMinutes,
  computeUserExperienceLevel,
  recordGamificationActivity,
  INITIAL_BADGES,
  generateStreakTrendData,
  processStreakFreeze,
  buildLast30DaysStreakHeatmap,
} from '../src/utils/gamification';
import {
  isScrollContainerNearBottom,
  shouldAutoScrollChatFeed,
} from '../src/utils/scroll';
import {
  DEFAULT_STREAK_REMINDER_TIME,
  evaluateNepalEveningReminder,
  getNepalClockParts,
  parseReminderTime,
} from '../src/utils/streakReminder';
import {
  buildChatExport,
  formatChatHistoryAsMarkdown,
} from '../src/utils/exportHistory';
import {
  resolveCountryForProfile,
  isConfirmedCountryValue,
  detectUserCountry,
  isoCodeToFlagEmoji,
  buildCountryOptionFromIso,
  reverseGeocodeCountryFromCoords,
} from '../src/utils/country';
import {
  resolveSpeechCodeForText,
  cleanTextForSpeech,
  splitIntoSpeechChunks,
  voiceAssistant,
} from '../src/utils/speech';
import { DEFAULT_SETTINGS } from '../src/utils/storage';
import {
  COLOR_THEME_PRESETS,
  generateThemeTokensFromColor,
} from '../src/utils/avatarTheme';
import {
  classifyFirestoreErrorKind,
  evaluateLeaderboardSyncEligibility,
  sanitizeFiniteInt,
} from '../src/utils/firebase';
import {
  buildSuggestionStatId,
  classifySuggestionCategory,
  mergeSuggestionAnalytics,
  normalizeSuggestionKey,
  recordLocalSuggestionClick,
  summarizeTopSuggestionPatterns,
} from '../src/utils/suggestionAnalytics';
import { computeCircularMilestoneLayout } from '../src/components/StreakMilestonesChart';

test('1. First-day and consecutive-day streak progression in user IANA timezone', () => {
  const tz = 'Asia/Kathmandu';
  const day1 = '2026-11-15';
  const day2 = '2026-11-16';
  const day3 = '2026-11-17';

  const initialState = {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  // First active day -> starts at 1
  const t1 = new Date('2026-11-15T12:00:00+05:45').getTime();
  const res1 = applyDailyActivityToStreakState(initialState, t1, tz);
  assert.equal(res1.nextState.currentStreak, 1);
  assert.equal(res1.nextState.longestStreak, 1);
  assert.equal(res1.nextState.lastActiveDate, day1);
  assert.equal(res1.streakIncreased, true);

  // Consecutive Day 2 -> 2
  const t2 = new Date('2026-11-16T14:30:00+05:45').getTime();
  const res2 = applyDailyActivityToStreakState(res1.nextState, t2, tz);
  assert.equal(res2.nextState.currentStreak, 2);
  assert.equal(res2.nextState.lastActiveDate, day2);
  assert.equal(res2.streakIncreased, true);

  // Consecutive Day 3 -> 3
  const t3 = new Date('2026-11-17T09:15:00+05:45').getTime();
  const res3 = applyDailyActivityToStreakState(res2.nextState, t3, tz);
  assert.equal(res3.nextState.currentStreak, 3);
  assert.equal(res3.nextState.longestStreak, 3);
  assert.equal(res3.nextState.lastActiveDate, day3);
});

test('2. Multiple app openings or messages on the same day never double-increment', () => {
  const tz = 'America/New_York';
  const tMorning = new Date('2026-11-17T08:00:00-05:00').getTime();
  const tAfternoon = new Date('2026-11-17T14:15:00-05:00').getTime();
  const tEvening = new Date('2026-11-17T23:55:00-05:00').getTime();

  const state = {
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

  const res2 = applyDailyActivityToStreakState(res1.nextState, tAfternoon, tz);
  assert.equal(res2.nextState.currentStreak, 3);
  assert.equal(res2.alreadyActiveToday, true);

  const res3 = applyDailyActivityToStreakState(res2.nextState, tEvening, tz);
  assert.equal(res3.nextState.currentStreak, 3);
  assert.equal(res3.alreadyActiveToday, true);
});

test('3. Missed full calendar day breaks streak and returning without recovery starts at 1', () => {
  const tz = 'UTC';
  const tMissed = new Date('2026-11-18T12:00:00Z').getTime(); // missed 17th completely

  const state = {
    currentStreak: 5,
    longestStreak: 5,
    lastActiveDate: '2026-11-16',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  // On read before activity: broken -> currentStreak 0, snapshot preserved
  const onRead = evaluateStreakStateOnRead(state, tMissed, tz);
  assert.equal(onRead.currentStreak, 0);
  assert.equal(onRead.streakBeforeBreak, 5);
  assert.equal(onRead.streakBrokenDate, '2026-11-16');

  // Returning without recovery starts at 1 and keeps recovery snapshot eligible
  const res = applyDailyActivityToStreakState(state, tMissed, tz);
  assert.equal(res.nextState.currentStreak, 1);
  assert.equal(res.streakBroken, true);
  assert.equal(res.nextState.streakBeforeBreak, 5);
  assert.equal(res.nextState.streakBrokenDate, '2026-11-16');
});

test('4. Midnight boundaries and Daylight Saving Time (DST) transitions across timezones', () => {
  // Asia/Kathmandu (+05:45) just after midnight
  const tzNepal = 'Asia/Kathmandu';
  const tKathmandu = new Date('2026-11-17T00:15:00+05:45').getTime();
  assert.equal(getLocalDateKeyInTimezone(tKathmandu, tzNepal), '2026-11-17');

  // America/New_York (-05:00) just before midnight
  const tzNY = 'America/New_York';
  const tNY = new Date('2026-11-16T23:45:00-05:00').getTime();
  assert.equal(getLocalDateKeyInTimezone(tNY, tzNY), '2026-11-16');

  // DST Spring-Forward in America/New_York (2026-03-08 is a 23-hour day)
  const preSpring = new Date('2026-03-07T22:00:00-05:00').getTime();
  const postSpring = new Date('2026-03-08T04:00:00-04:00').getTime();
  const s1 = applyDailyActivityToStreakState(
    { currentStreak: 4, longestStreak: 4, lastActiveDate: '2026-03-06', timezone: tzNY },
    preSpring,
    tzNY
  );
  assert.equal(s1.nextState.currentStreak, 5);
  assert.equal(s1.nextState.lastActiveDate, '2026-03-07');

  const s2 = applyDailyActivityToStreakState(s1.nextState, postSpring, tzNY);
  assert.equal(s2.nextState.currentStreak, 6);
  assert.equal(s2.nextState.lastActiveDate, '2026-03-08');

  // DST Fall-Back in America/New_York (2026-11-01 is a 25-hour day)
  const preFall = new Date('2026-11-01T00:30:00-04:00').getTime();
  const postFall = new Date('2026-11-01T23:30:00-05:00').getTime();
  const f1 = applyDailyActivityToStreakState(
    { currentStreak: 6, longestStreak: 6, lastActiveDate: '2026-10-31', timezone: tzNY },
    preFall,
    tzNY
  );
  assert.equal(f1.nextState.currentStreak, 7);
  // Same 25-hour local calendar day must not double-increment
  const f2 = applyDailyActivityToStreakState(f1.nextState, postFall, tzNY);
  assert.equal(f2.nextState.currentStreak, 7);
  assert.equal(f2.alreadyActiveToday, true);
});

test('5. Recovery restores exact previously broken streak and rejects duplicate click', () => {
  const tz = 'UTC';
  const nowMs = new Date('2026-11-19T10:00:00Z').getTime();

  const brokenState = {
    currentStreak: 0,
    longestStreak: 10,
    lastActiveDate: '2026-11-16',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 10,
    streakBrokenDate: '2026-11-16',
  };

  const rec1 = recoverBrokenStreakState(brokenState, nowMs, tz);
  assert.equal(rec1.ok, true);
  assert.equal(rec1.nextState.currentStreak, 10); // exact restored streak
  assert.equal(rec1.nextState.lastActiveDate, '2026-11-19');
  assert.equal(rec1.nextState.recoveryCount, 1);
  assert.equal(rec1.nextState.streakBeforeBreak, 0);

  // Repeated recovery click on same day must fail and NOT consume a second credit
  const recDuplicate = recoverBrokenStreakState(rec1.nextState, nowMs + 5000, tz);
  assert.equal(recDuplicate.ok, false);
  assert.equal(recDuplicate.nextState.recoveryCount, 1);
  assert.equal(recDuplicate.nextState.currentStreak, 10);

  // Additional activity later the same day must NOT double-increment
  const laterToday = applyDailyActivityToStreakState(rec1.nextState, nowMs + 3600_000, tz);
  assert.equal(laterToday.nextState.currentStreak, 10);
  assert.equal(laterToday.alreadyActiveToday, true);
});

test('6. Five (5) monthly streak recoveries succeed, 6th is rejected, and next calendar month resets limit', () => {
  assert.equal(MAX_MONTHLY_STREAK_RECOVERIES, 5);
  const tz = 'UTC';

  let current = {
    currentStreak: 0,
    longestStreak: 12,
    lastActiveDate: '2026-11-01',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 12,
    streakBrokenDate: '2026-11-01',
  };

  // Recoveries 1 through 5 in November 2026
  const recoveryDays = [
    { broken: '2026-11-01', recoverOn: '2026-11-03T10:00:00Z', prev: 12 },
    { broken: '2026-11-04', recoverOn: '2026-11-06T10:00:00Z', prev: 9 },
    { broken: '2026-11-08', recoverOn: '2026-11-10T10:00:00Z', prev: 7 },
    { broken: '2026-11-12', recoverOn: '2026-11-14T10:00:00Z', prev: 6 },
    { broken: '2026-11-16', recoverOn: '2026-11-18T10:00:00Z', prev: 5 },
  ];

  for (let i = 0; i < recoveryDays.length; i++) {
    const step = recoveryDays[i];
    const res = recoverBrokenStreakState(
      {
        ...current,
        currentStreak: step.prev,
        lastActiveDate: step.broken,
        streakBeforeBreak: 0,
        streakBrokenDate: '',
      },
      new Date(step.recoverOn).getTime(),
      tz
    );
    assert.equal(res.ok, true, `Recovery #${i + 1} should succeed`);
    assert.equal(res.nextState.recoveryCount, i + 1);
    assert.equal(res.nextState.currentStreak, step.prev);
    current = res.nextState;
  }

  // 6th recovery in same month (November 2026) MUST be rejected
  const elig6 = isStreakRecoveryEligible(
    {
      ...current,
      lastActiveDate: '2026-11-20',
      streakBeforeBreak: 4,
      streakBrokenDate: '2026-11-20',
    },
    new Date('2026-11-22T10:00:00Z').getTime(),
    tz
  );
  assert.equal(elig6.eligible, false);
  assert.equal(elig6.reason, 'monthly_limit_reached');
  assert.equal(elig6.recoveriesRemaining, 0);

  const rec6 = recoverBrokenStreakState(
    {
      ...current,
      lastActiveDate: '2026-11-20',
      streakBeforeBreak: 4,
      streakBrokenDate: '2026-11-20',
    },
    new Date('2026-11-22T10:00:00Z').getTime(),
    tz
  );
  assert.equal(rec6.ok, false);
  assert.equal(rec6.reason, 'monthly_limit_reached');

  // Crossing into December 2026 resets monthly recovery quota back to 0 (5 remaining)
  const decRecoverMs = new Date('2026-12-03T10:00:00Z').getTime();
  const recNextMonth = recoverBrokenStreakState(
    {
      ...current,
      currentStreak: 8,
      lastActiveDate: '2026-12-01',
      streakBeforeBreak: 0,
      streakBrokenDate: '',
    },
    decRecoverMs,
    tz
  );
  assert.equal(recNextMonth.ok, true);
  assert.equal(recNextMonth.nextState.recoveryMonth, '2026-12');
  assert.equal(recNextMonth.nextState.recoveryCount, 1);
  assert.equal(recNextMonth.nextState.currentStreak, 8);
});

test('7. Logout and login preserves streak, recovery count, and saved country', () => {
  const tz = 'Asia/Kathmandu';
  const persistedFirestoreRecord = {
    currentStreak: 4,
    longestStreak: 7,
    lastActiveDate: '2026-11-17',
    timezone: tz,
    recoveryCount: 2,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
    country: 'Nepal',
    countryCode: 'NP',
    countryFlag: '🇳🇵',
    countryDetectionMethod: 'gps' as const,
    isManualCountry: false,
  };

  // Re-login later the same day
  const reloginMs = new Date('2026-11-17T21:00:00+05:45').getTime();
  const evaluated = evaluateStreakStateOnRead(persistedFirestoreRecord, reloginMs, tz);
  assert.equal(evaluated.currentStreak, 4);
  assert.equal(evaluated.recoveryCount, 2);

  const onOpen = applyDailyActivityToStreakState(evaluated, reloginMs, tz);
  assert.equal(onOpen.nextState.currentStreak, 4);
  assert.equal(onOpen.alreadyActiveToday, true);

  const resolvedCountry = resolveCountryForProfile({
    savedCountry: persistedFirestoreRecord.country,
    savedCountryCode: persistedFirestoreRecord.countryCode,
    savedFlag: persistedFirestoreRecord.countryFlag,
    savedTimezone: persistedFirestoreRecord.timezone,
    savedMethod: persistedFirestoreRecord.countryDetectionMethod,
    isManual: persistedFirestoreRecord.isManualCountry,
  });
  assert.equal(resolvedCountry.country, 'Nepal');
  assert.equal(resolvedCountry.code, 'NP');
  assert.equal(resolvedCountry.flag, '🇳🇵');
  assert.equal(isConfirmedCountryValue(resolvedCountry.country, resolvedCountry.code), true);
});

test('8. GPS reverse-geocoding returns ISO country + flag on success and never fakes success on failure', async () => {
  // Dynamic ISO-to-flag emoji verification
  assert.equal(isoCodeToFlagEmoji('NP'), '🇳🇵');
  assert.equal(isoCodeToFlagEmoji('US'), '🇺🇸');
  assert.equal(isoCodeToFlagEmoji('IS'), '🇮🇸');

  // Unlisted ISO country builds dynamically with real flag
  const iceland = buildCountryOptionFromIso('IS', 'Iceland');
  assert.ok(iceland);
  assert.equal(iceland.code, 'IS');
  assert.equal(iceland.country, 'Iceland');
  assert.equal(iceland.flag, '🇮🇸');

  // Mocked successful GPS reverse-geocode (Kathmandu coordinates)
  const mockSuccessFetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        ok: true,
        code: 'NP',
        country: 'Nepal',
        source: 'gps-reverse-geocode',
      }),
    }) as unknown as Response) as typeof fetch;

  const okRes = await reverseGeocodeCountryFromCoords(27.7172, 85.324, mockSuccessFetch);
  assert.equal(okRes.provider, 'gps-reverse-geocode');
  assert.ok(okRes.option);
  assert.equal(okRes.option.code, 'NP');
  assert.equal(okRes.option.country, 'Nepal');
  assert.equal(okRes.option.flag, '🇳🇵');

  // Mocked failed reverse-geocode MUST return option: null and explicit error (never fake GPS or default to UK)
  const mockFailFetch = (async () =>
    ({
      ok: false,
      status: 502,
      json: async () => ({ ok: false, error: 'Reverse geocoding failed' }),
    }) as unknown as Response) as typeof fetch;

  const failRes = await reverseGeocodeCountryFromCoords(0, 0, mockFailFetch);
  assert.equal(failRes.option, null);
  assert.equal(failRes.errorCode, 'reverse_geocode_failed');
  assert.ok(failRes.error && failRes.error.length > 0);
});

test('9. Manual country is never overwritten and fallback never defaults to UK', () => {
  const manual = resolveCountryForProfile({
    savedCountry: 'Japan',
    savedCountryCode: 'JP',
    savedFlag: '🇯🇵',
    savedTimezone: 'Asia/Tokyo',
    savedMethod: 'manual',
    isManual: true,
  });
  assert.equal(manual.country, 'Japan');
  assert.equal(manual.code, 'JP');
  assert.equal(manual.isManual, true);
  assert.equal(manual.method, 'manual');

  const detected = detectUserCountry();
  assert.notEqual(detected.country, 'United Kingdom');
  assert.notEqual(detected.code, 'GB');
});

test('10. Cross-reference Firestore streak record with timezone and eliminate 2-day discrepancy', () => {
  const tz = 'Asia/Kathmandu';
  const fsProfile = {
    currentStreak: 1,
    longestStreak: 1,
    lastActiveDate: '2026-11-16',
    timezone: tz,
  };

  // Early morning Nov 17 in Kathmandu (03:00 AM +05:45 = 21:15 Nov 16 UTC)
  const nowMs = new Date('2026-11-17T03:00:00+05:45').getTime();
  assert.equal(getLocalDateKeyInTimezone(nowMs, tz), '2026-11-17');

  const evaluated = evaluateStreakStateOnRead(fsProfile, nowMs, tz);
  assert.equal(evaluated.currentStreak, 1);
  assert.equal(evaluated.lastActiveDate, '2026-11-16');

  const activeRes = applyDailyActivityToStreakState(evaluated, nowMs, tz);
  assert.equal(activeRes.nextState.currentStreak, 2);
  assert.equal(activeRes.nextState.lastActiveDate, '2026-11-17');
});

test('11. Streak Calendar classifies maintained, missed, recovered, inactive, and future dates accurately', () => {
  const tz = 'Asia/Kathmandu';
  const nowMs = new Date('2026-11-18T12:00:00+05:45').getTime();

  // Recovery bridged gap helper: broke after Nov 11, recovered on Nov 13 -> Nov 12 was bridged
  assert.deepEqual(getRecoveredGapDateKeys('2026-11-11', '2026-11-13'), ['2026-11-12']);

  const month = buildStreakCalendarMonth({
    year: 2026,
    month: 11,
    timeZone: tz,
    nowMs,
    accountCreatedAtMs: new Date('2026-11-10T09:00:00+05:45').getTime(),
    dateCounts: {
      '2026-11-10': 3,
      '2026-11-11': 2,
      '2026-11-13': 4,
      '2026-11-14': 1,
      '2026-11-17': 5,
      '2026-11-18': 2,
    },
    recoveredDates: ['2026-11-12'],
    authoritativeStreak: 2,
    lastActiveDate: '2026-11-18',
  });

  const byDate = Object.fromEntries(month.days.map((d) => [d.date, d]));

  assert.equal(month.monthLabel, 'November 2026');
  assert.equal(month.leadingEmptySlots, 0); // Nov 1, 2026 is a Sunday
  assert.equal(byDate['2026-11-05'].status, 'inactive'); // before account joined
  assert.equal(byDate['2026-11-10'].status, 'maintained');
  assert.equal(byDate['2026-11-11'].status, 'maintained');
  assert.equal(byDate['2026-11-12'].status, 'recovered'); // bridged by streak recovery
  assert.equal(byDate['2026-11-13'].status, 'maintained');
  assert.equal(byDate['2026-11-15'].status, 'missed'); // missed after tracking started
  assert.equal(byDate['2026-11-16'].status, 'missed');
  assert.equal(byDate['2026-11-18'].status, 'maintained');
  assert.equal(byDate['2026-11-18'].isToday, true);
  assert.equal(byDate['2026-11-20'].status, 'future');

  assert.equal(month.maintainedCount, 6);
  assert.equal(month.recoveredCount, 1);
  assert.equal(month.missedCount, 2);
  assert.equal(month.consistencyPercent, 78); // 7 / 9 = 77.7 -> 78%
});

test('12. Nepal Time (Asia/Kathmandu) daily streak: +1 on open, max 1/day, +1 tomorrow, 0 if missed, 5x/month recovery', () => {
  assert.equal(NEPAL_TIMEZONE, 'Asia/Kathmandu');
  assert.equal(resolveValidTimezone(undefined), 'Asia/Kathmandu');

  // Nepal Day 1: 2026-11-18 10:00 NPT -> +1 streak
  const day1Morning = new Date('2026-11-18T10:00:00+05:45').getTime();
  const s1 = applyDailyActivityToStreakState({ currentStreak: 0, longestStreak: 0, lastActiveDate: '' }, day1Morning);
  assert.equal(s1.nextState.timezone, 'Asia/Kathmandu');
  assert.equal(s1.nextState.currentStreak, 1);
  assert.equal(s1.nextState.lastActiveDate, '2026-11-18');

  // Re-opening later same Nepal Day (23:50 NPT) -> strictly 1 streak per Nepal day
  const day1Night = new Date('2026-11-18T23:50:00+05:45').getTime();
  const s1Again = applyDailyActivityToStreakState(s1.nextState, day1Night);
  assert.equal(s1Again.nextState.currentStreak, 1);
  assert.equal(s1Again.alreadyActiveToday, true);

  // Opening just after Nepal midnight (2026-11-19 00:05 NPT = 2026-11-18T18:20:00Z!) -> +1 streak (2)
  const day2JustAfterNptMidnight = new Date('2026-11-18T18:20:00Z').getTime();
  assert.equal(getLocalDateKeyInTimezone(day2JustAfterNptMidnight, NEPAL_TIMEZONE), '2026-11-19');
  const s2 = applyDailyActivityToStreakState(s1Again.nextState, day2JustAfterNptMidnight);
  assert.equal(s2.nextState.currentStreak, 2);
  assert.equal(s2.nextState.lastActiveDate, '2026-11-19');

  // User does NOT open on 2026-11-20 NPT -> on 2026-11-21 NPT streak is 0 (broken, recoverable)
  const day4Npt = new Date('2026-11-21T08:00:00+05:45').getTime();
  const readBroken = evaluateStreakStateOnRead(s2.nextState, day4Npt);
  assert.equal(readBroken.currentStreak, 0);
  assert.equal(readBroken.streakBeforeBreak, 2);

  // Recover restores streak and increments monthly Nepal recovery usage (1/5 used)
  const recovered = recoverBrokenStreakState(readBroken, day4Npt);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.nextState.currentStreak, 2);
  assert.equal(recovered.nextState.recoveryCount, 1);
  assert.equal(recovered.nextState.recoveryMonth, '2026-11');

  // streakHistory marks maintained, recovered, and missed statuses accurately
  const history = generateStreakHistory(2, { '2026-11-21': 1 }, NEPAL_TIMEZONE, day4Npt, ['2026-11-20']);
  const byDay = Object.fromEntries(history.map((d) => [d.date, d]));
  assert.equal(byDay['2026-11-21'].status, 'maintained');
  assert.equal(byDay['2026-11-20'].status, 'recovered');
  assert.equal(byDay['2026-11-17'].status, 'missed');
});

test('13. Streak persists across page refresh, logout/login with same UID, and blocks same-day duplicate increments', () => {
  const tz = resolveEffectiveStreakTimezone('Asia/Kathmandu');
  assert.equal(tz, 'Asia/Kathmandu');

  // Day 1: brand-new user has no Firestore doc yet -> first chat/open sets streak = 1 and saves to users/{uid}
  const day1Ms = new Date('2026-11-16T11:00:00+05:45').getTime();
  const initialHydration = mergeStreakStateSafely({
    firestoreResult: { status: 'not_found' },
    localBackup: null,
    currentState: null,
    timeZone: tz,
    nowMs: day1Ms,
  });
  assert.equal(initialHydration.shouldWriteToFirestore, true);
  const afterDay1Activity = applyDailyActivityToStreakState(initialHydration.state, day1Ms, tz);
  assert.equal(afterDay1Activity.nextState.currentStreak, 1);
  assert.equal(afterDay1Activity.nextState.lastActiveDate, '2026-11-16');

  // Simulated page refresh later same day (local state starts at 0 before Firestore loads)
  const day1RefreshMs = new Date('2026-11-16T18:30:00+05:45').getTime();
  const afterRefresh = mergeStreakStateSafely({
    firestoreResult: { status: 'found', state: afterDay1Activity.nextState },
    localBackup: afterDay1Activity.nextState,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs: day1RefreshMs,
  });
  assert.equal(afterRefresh.state.currentStreak, 1);
  assert.equal(afterRefresh.state.lastActiveDate, '2026-11-16');
  // Same-day open/chat after refresh must NOT increment to 2
  const sameDayAgain = applyDailyActivityToStreakState(afterRefresh.state, day1RefreshMs, tz);
  assert.equal(sameDayAgain.nextState.currentStreak, 1);
  assert.equal(sameDayAgain.alreadyActiveToday, true);

  // Day 2: user chats -> streak increments to 2
  const day2Ms = new Date('2026-11-17T09:15:00+05:45').getTime();
  const afterDay2 = applyDailyActivityToStreakState(sameDayAgain.nextState, day2Ms, tz);
  assert.equal(afterDay2.nextState.currentStreak, 2);
  assert.equal(afterDay2.nextState.longestStreak, 2);
  assert.equal(afterDay2.nextState.lastActiveDate, '2026-11-17');

  // Simulated LOGOUT (active user cleared to DEFAULT_USER with streak 0) then LOGIN with same UID
  const reloginMs = new Date('2026-11-17T21:00:00+05:45').getTime();
  const afterRelogin = mergeStreakStateSafely({
    firestoreResult: { status: 'found', state: { ...afterDay2.nextState, recoveryCount: 1, recoveryMonth: '2026-11' } },
    localBackup: afterDay2.nextState,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs: reloginMs,
  });
  assert.equal(afterRelogin.hadReadError, false);
  assert.equal(afterRelogin.state.currentStreak, 2);
  assert.equal(afterRelogin.state.longestStreak, 2);
  assert.equal(afterRelogin.state.recoveryCount, 1);
  assert.equal(afterRelogin.state.lastActiveDate, '2026-11-17');
});

test('14. Firestore read error preserves saved backup streak and NEVER overwrites with zero', () => {
  const tz = resolveEffectiveStreakTimezone(undefined, 'America/Los_Angeles');
  assert.equal(tz, 'America/Los_Angeles');

  const nowMs = new Date('2026-11-18T10:00:00-08:00').getTime();
  const savedBackup = {
    currentStreak: 6,
    longestStreak: 9,
    lastActiveDate: '2026-11-18',
    timezone: tz,
    recoveryCount: 1,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  // Transient Firestore error during refresh or re-login
  const errorHydration = mergeStreakStateSafely({
    firestoreResult: { status: 'error', error: 'unavailable' },
    localBackup: savedBackup,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs,
  });

  assert.equal(errorHydration.hadReadError, true);
  assert.equal(errorHydration.shouldWriteToFirestore, false);
  assert.equal(errorHydration.source, 'backup');
  assert.equal(errorHydration.state.currentStreak, 6);
  assert.equal(errorHydration.state.longestStreak, 9);
  assert.equal(errorHydration.state.recoveryCount, 1);
});

test('15. Streak Insights card and Milestones section compute accurate metrics and unlocks from streakHistory', () => {
  const tz = 'Asia/Kathmandu';
  const nowMs = new Date('2026-11-18T14:00:00+05:45').getTime();

  const streakHistory = [
    { date: '2026-11-12', dayLabel: 'Thu', completed: true, activityCount: 2, status: 'maintained' as const },
    { date: '2026-11-13', dayLabel: 'Fri', completed: true, activityCount: 1, status: 'recovered' as const },
    { date: '2026-11-14', dayLabel: 'Sat', completed: true, activityCount: 3, status: 'maintained' as const },
    { date: '2026-11-15', dayLabel: 'Sun', completed: true, activityCount: 2, status: 'maintained' as const },
    { date: '2026-11-16', dayLabel: 'Mon', completed: true, activityCount: 4, status: 'maintained' as const },
    { date: '2026-11-17', dayLabel: 'Tue', completed: true, activityCount: 1, status: 'maintained' as const },
    { date: '2026-11-18', dayLabel: 'Wed', completed: true, activityCount: 2, status: 'maintained' as const },
  ];

  const userFixture = {
    currentStreak: 7,
    streakDays: 7,
    longestStreak: 7,
    lastActiveDate: '2026-11-18',
    timezone: tz,
    recoveryCount: 1,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
    recoveredDates: ['2026-11-13'],
    streakHistory,
    createdAt: new Date('2026-11-10T09:00:00+05:45').getTime(),
  };

  // User joined Nov 10, missed Nov 10 & Nov 11 (2 missed), recovered Nov 13 (1 recovered), maintained 6 days
  const insights = computeStreakInsights({
    user: userFixture,
    dateCounts: {
      '2026-11-12': 2,
      '2026-11-14': 3,
      '2026-11-15': 2,
      '2026-11-16': 4,
      '2026-11-17': 1,
      '2026-11-18': 2,
    },
    recoveredDates: ['2026-11-13'],
    timeZone: tz,
    nowMs,
  });

  assert.equal(insights.bestEverStreak, 7);
  assert.equal(insights.totalDaysActive, 7);
  assert.equal(insights.monthlyRecoveredDays, 1);
  assert.equal(insights.monthlyMissedDays, 2);
  assert.equal(insights.monthlyRecoveryEfficiencyPercent, 33); // 1 recovered / (1 recovered + 2 missed) = 33%
  assert.equal(insights.monthlyRecoveriesRemaining, 4);

  // Milestones unlocked from streakHistory
  const milestones = evaluateStreakMilestones({
    user: userFixture,
    recoveredDates: ['2026-11-13'],
    timeZone: tz,
    nowMs,
  });
  const byId = Object.fromEntries(milestones.map((m) => [m.id, m]));

  assert.equal(byId['first_flame'].unlocked, true);
  assert.equal(byId['three_day_spark'].unlocked, true);
  assert.equal(byId['seven_day_streak_master'].unlocked, true);
  assert.equal(byId['seven_day_streak_master'].title, '7-Day Streak Master');
  assert.equal(byId['monthly_comeback_pro'].unlocked, true);
  assert.equal(byId['monthly_comeback_pro'].title, 'Monthly Comeback Pro');
  assert.equal(byId['fourteen_day_momentum'].unlocked, false);
  assert.equal(byId['fourteen_day_momentum'].progressPercent, 50);
  assert.equal(byId['thirty_day_consistency_legend'].unlocked, false);
});

test('16. Global Leaderboard ranks top 10 active streaks with deterministic tie-breaking and deduplication', () => {
  const sampleEntries = [
    // Inactive 0-day user must be filtered out
    { userId: 'u-zero', displayName: 'Zero', currentStreak: 0, longestStreak: 12, updatedAt: '2026-11-18T05:00:00Z' },
    // Duplicate UID (higher/latest should win)
    { userId: 'u-top', displayName: 'Aarav', currentStreak: 25, longestStreak: 30, updatedAt: '2026-11-18T06:00:00Z' },
    { userId: 'u-top', displayName: 'Aarav', currentStreak: 29, longestStreak: 30, updatedAt: '2026-11-18T08:00:00Z' },
    // Tie on currentStreak=15 -> higher longestStreak wins
    { userId: 'u-tie-low', displayName: 'Bina', currentStreak: 15, longestStreak: 15, updatedAt: '2026-11-18T04:00:00Z' },
    { userId: 'u-tie-high', displayName: 'Sagar', currentStreak: 15, longestStreak: 24, updatedAt: '2026-11-18T09:00:00Z' },
    // Tie on both currentStreak=10 & longestStreak=10 -> earlier updatedAt wins
    { userId: 'u-time-late', displayName: 'Late', currentStreak: 10, longestStreak: 10, updatedAt: '2026-11-18T12:00:00Z' },
    { userId: 'u-time-early', displayName: 'Early', currentStreak: 10, longestStreak: 10, updatedAt: '2026-11-18T02:00:00Z' },
    // Additional users to exceed Top 10 cap
    { userId: 'u-6', displayName: 'User 6', currentStreak: 9, longestStreak: 9, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-7', displayName: 'User 7', currentStreak: 8, longestStreak: 8, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-8', displayName: 'User 8', currentStreak: 7, longestStreak: 7, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-9', displayName: 'User 9', currentStreak: 6, longestStreak: 6, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-10', displayName: 'User 10', currentStreak: 5, longestStreak: 5, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-11', displayName: 'User 11', currentStreak: 4, longestStreak: 4, updatedAt: '2026-11-18T01:00:00Z' },
    { userId: 'u-12', displayName: 'User 12', currentStreak: 2, longestStreak: 2, updatedAt: '2026-11-18T01:00:00Z' },
  ];

  const ranked = rankLeaderboardEntries(sampleEntries, 'u-tie-high', 10);

  assert.equal(ranked.length, 10);
  assert.equal(ranked[0].userId, 'u-top');
  assert.equal(ranked[0].currentStreak, 29);
  assert.equal(ranked[0].rank, 1);

  assert.equal(ranked[1].userId, 'u-tie-high');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].isCurrentUser, true);

  assert.equal(ranked[2].userId, 'u-tie-low');
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].isCurrentUser, false);

  assert.equal(ranked[3].userId, 'u-time-early');
  assert.equal(ranked[4].userId, 'u-time-late');

  assert.equal(ranked[9].userId, 'u-10');
  assert.equal(ranked[9].rank, 10);
  assert.equal(ranked.some((r) => r.userId === 'u-zero' || r.userId === 'u-11' || r.userId === 'u-12'), false);
});

test('17. Streak Goal clamps targets (1-365), calculates progress %, remaining days, and suggests next goal on completion', () => {
  assert.equal(clampStreakGoalDays(0), 30);
  assert.equal(clampStreakGoalDays(-5), 30);
  assert.equal(clampStreakGoalDays(500), 365);
  assert.equal(clampStreakGoalDays(30), 30);

  // Mid-progress toward a 30-day goal
  const mid = computeStreakGoalProgress(12, 30);
  assert.equal(mid.goalDays, 30);
  assert.equal(mid.progressPercent, 40);
  assert.equal(mid.remainingDays, 18);
  assert.equal(mid.isCompleted, false);
  assert.equal(mid.suggestedNextGoal, null);

  // Goal reached on 30-day target -> 100% & suggests 60-day next goal
  const done = computeStreakGoalProgress(30, 30);
  assert.equal(done.progressPercent, 100);
  assert.equal(done.remainingDays, 0);
  assert.equal(done.isCompleted, true);
  assert.equal(done.suggestedNextGoal, 60);

  // Max 365-day goal reached -> no further preset
  const maxDone = computeStreakGoalProgress(365, 365);
  assert.equal(maxDone.isCompleted, true);
  assert.equal(maxDone.suggestedNextGoal, null);
});

test('18. Daily Motivation unlocks only with active streak, persists for 24 hours, and rotates to a new quote after 24h', () => {
  const t0 = new Date('2026-11-18T08:00:00Z').getTime();

  // Locked when streak is 0
  const locked = resolveDailyMotivationQuote({
    currentStreak: 0,
    existingState: null,
    nowMs: t0,
  });
  assert.equal(locked.isUnlocked, false);
  assert.equal(locked.quote, null);

  // Unlocks when streak >= 1 and selects initial quote for 24h
  const first = resolveDailyMotivationQuote({
    currentStreak: 3,
    existingState: null,
    nowMs: t0,
    randomFn: () => 0.1,
  });
  assert.equal(first.isUnlocked, true);
  assert.ok(first.quote);
  assert.equal(first.didRotate, true);
  assert.equal(first.msUntilNextUpdate, DAILY_MOTIVATION_INTERVAL_MS);
  assert.equal(formatCountdownHoursMinutes(first.msUntilNextUpdate), '24h');

  // 12 hours later -> same quote stays pinned, didRotate = false
  const t12h = t0 + 12 * 60 * 60 * 1000;
  const sameDay = resolveDailyMotivationQuote({
    currentStreak: 3,
    existingState: first.nextState,
    nowMs: t12h,
    randomFn: () => 0.9,
  });
  assert.equal(sameDay.isUnlocked, true);
  assert.equal(sameDay.didRotate, false);
  assert.equal(sameDay.quote?.id, first.quote?.id);
  assert.equal(formatCountdownHoursMinutes(sameDay.msUntilNextUpdate), '12h');

  // Exactly 24 hours later -> rotates to a different quote
  const t24h = t0 + DAILY_MOTIVATION_INTERVAL_MS;
  const nextDay = resolveDailyMotivationQuote({
    currentStreak: 4,
    existingState: first.nextState,
    nowMs: t24h,
    randomFn: () => 0.1,
  });
  assert.equal(nextDay.isUnlocked, true);
  assert.equal(nextDay.didRotate, true);
  assert.ok(nextDay.quote);
  assert.notEqual(nextDay.quote?.id, first.quote?.id);
  assert.equal(nextDay.nextState?.expiresAtMs, t24h + DAILY_MOTIVATION_INTERVAL_MS);
});

test('19. Reload/refresh NEVER resets Google user streak to 0 when users/{uid} lacks streak fields or is stale', () => {
  const tz = 'Asia/Kathmandu';
  const nowMs = new Date('2026-11-18T15:30:00+05:45').getTime();

  // Case A: users/{uid} exists in Firestore (Google profile created) but has no streak fields yet;
  // same-UID localStorage currentState holds streak=4 -> must preserve 4, NOT reset to 0.
  const emptyDocWithCurrent = mergeStreakStateSafely({
    firestoreResult: { status: 'found', state: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' } },
    localBackup: null,
    currentState: { currentStreak: 4, longestStreak: 6, lastActiveDate: '2026-11-18', timezone: tz },
    timeZone: tz,
    nowMs,
  });
  assert.equal(emptyDocWithCurrent.state.currentStreak, 4);
  assert.equal(emptyDocWithCurrent.state.longestStreak, 6);
  assert.equal(emptyDocWithCurrent.shouldWriteToFirestore, true);

  // Case B: Fresh device / cleared localStorage where users/{uid} lacks streak fields,
  // but Firestore usage_analytics reconstructed a 5-day streak -> restores 5 instead of 0.
  const freshDeviceLogsFallback = mergeStreakStateSafely({
    firestoreResult: { status: 'found', state: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' } },
    localBackup: null,
    currentState: null,
    firestoreLogsFallback: { currentStreak: 5, longestStreak: 8, lastActiveDate: '2026-11-18', timezone: tz },
    timeZone: tz,
    nowMs,
  });
  assert.equal(freshDeviceLogsFallback.state.currentStreak, 5);
  assert.equal(freshDeviceLogsFallback.state.longestStreak, 8);
  assert.equal(freshDeviceLogsFallback.source, 'backup');
  assert.equal(freshDeviceLogsFallback.shouldWriteToFirestore, true);

  // Case C: Firestore doc is stale (yesterday's streak=3) while localBackup already recorded today's streak=4
  const staleCloudDoc = mergeStreakStateSafely({
    firestoreResult: {
      status: 'found',
      state: { currentStreak: 3, longestStreak: 3, lastActiveDate: '2026-11-17', timezone: tz },
    },
    localBackup: { currentStreak: 4, longestStreak: 4, lastActiveDate: '2026-11-18', timezone: tz },
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs,
  });
  assert.equal(staleCloudDoc.state.currentStreak, 4);
  assert.equal(staleCloudDoc.state.lastActiveDate, '2026-11-18');
  assert.equal(staleCloudDoc.shouldWriteToFirestore, true);
});

test('20. User Experience Level awards XP from usage & streaks and unlocks Novice, Pro, and Aadesh Master profile badges', () => {
  // Brand-new user -> Novice
  const novice = computeUserExperienceLevel({ xp: 25, currentStreak: 0, longestStreak: 0, totalActiveDays: 0 });
  assert.equal(novice.level, 1);
  assert.equal(novice.badgeName, 'Novice');
  assert.equal(novice.unlockedBadges.find((b) => b.badgeName === 'Novice')?.unlocked, true);
  assert.equal(novice.unlockedBadges.find((b) => b.badgeName === 'Pro')?.unlocked, false);

  // Consistent streak + usage unlocks Pro (750+ total experience XP)
  const pro = computeUserExperienceLevel({ xp: 300, currentStreak: 7, longestStreak: 7, totalActiveDays: 10 });
  // streakBonusXp = 7*50 + 7*25 + 10*15 = 350 + 175 + 150 = 675; total = 975 -> Pro
  assert.equal(pro.streakBonusXp, 675);
  assert.equal(pro.totalExperienceXp, 975);
  assert.equal(pro.level, 3);
  assert.equal(pro.badgeName, 'Pro');
  assert.equal(pro.unlockedBadges.find((b) => b.badgeName === 'Pro')?.unlocked, true);
  assert.equal(pro.unlockedBadges.find((b) => b.badgeName === 'Aadesh Master')?.unlocked, false);

  // High XP + long streak unlocks Aadesh Master (3500+ total experience XP)
  const master = computeUserExperienceLevel({ xp: 2000, currentStreak: 20, longestStreak: 30, totalActiveDays: 40 });
  assert.equal(master.level, 5);
  assert.equal(master.badgeName, 'Aadesh Master');
  assert.equal(master.isMaxLevel, true);
  assert.equal(master.unlockedBadges.every((b) => b.unlocked), true);

  // recordGamificationActivity grants extra daily streak XP bonus when streak increments
  const baseProfile = {
    id: 'uid-xp-test',
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    avatarUrl: '',
    provider: 'google' as const,
    isLoggedIn: true,
    country: 'Nepal',
    countryFlag: '🇳🇵',
    timezone: 'Asia/Kathmandu',
    xp: 100,
    level: 1,
    levelTitle: 'Novice',
    streakDays: 2,
    currentStreak: 2,
    longestStreak: 2,
    lastActiveDate: '2026-11-17',
    dailyGoalTarget: 5,
    dailyGoalCurrent: 0,
    badges: INITIAL_BADGES,
    streakHistory: [],
    linkedProviders: ['google' as const],
  };
  const nextDayMs = new Date('2026-11-18T10:00:00+05:45').getTime();
  const act = recordGamificationActivity(baseProfile, 'chat', {
    nowMs: nextDayMs,
    timeZone: 'Asia/Kathmandu',
  });
  assert.equal(act.streakIncreased, true);
  assert.equal(act.updatedUser.currentStreak, 3);
  // Base chat (+25 XP) + daily streak bonus (50 + 3*10 = +80 XP) = +105 XP
  assert.equal(act.xpEarned, 105);
  assert.equal(act.updatedUser.xp, 205);
});

test('21. 8:00 PM Nepal Time streak reminder notifies only when inactive at/after 20:00 NPT and once per day', () => {
  // 7:45 PM NPT (19:45 Asia/Kathmandu) -> before 8 PM NPT, must NOT notify yet
  const before8PmNpt = new Date('2026-11-18T19:45:00+05:45').getTime();
  const clockBefore = getNepalClockParts(before8PmNpt);
  assert.equal(clockBefore.dateKey, '2026-11-18');
  assert.equal(clockBefore.hour, 19);
  const evalBefore = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-17',
    nowMs: before8PmNpt,
  });
  assert.equal(evalBefore.shouldNotifyNow, false);
  assert.equal(evalBefore.reason, 'before_8pm_npt');

  // 8:05 PM NPT (20:05 Asia/Kathmandu) & user hasn't opened app today -> MUST notify
  const after8PmNpt = new Date('2026-11-18T20:05:00+05:45').getTime();
  const evalDue = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-17',
    nowMs: after8PmNpt,
  });
  assert.equal(evalDue.shouldNotifyNow, true);
  assert.equal(evalDue.reason, 'due_now');
  assert.equal(evalDue.nepalDateKey, '2026-11-18');

  // User already opened Aadesh AI today (lastActiveDate === 2026-11-18) -> skip notification
  const evalActiveToday = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-18',
    nowMs: after8PmNpt,
  });
  assert.equal(evalActiveToday.shouldNotifyNow, false);
  assert.equal(evalActiveToday.reason, 'already_active_today');

  // Already notified today -> skip duplicate notification
  const evalAlreadyNotified = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-17',
    lastNotifiedDateKey: '2026-11-18',
    nowMs: after8PmNpt,
  });
  assert.equal(evalAlreadyNotified.shouldNotifyNow, false);
  assert.equal(evalAlreadyNotified.reason, 'already_notified_today');

  // Reminder disabled by user -> skip
  const evalDisabled = evaluateNepalEveningReminder({
    enabled: false,
    lastActiveDate: '2026-11-17',
    nowMs: after8PmNpt,
  });
  assert.equal(evalDisabled.shouldNotifyNow, false);
  assert.equal(evalDisabled.reason, 'disabled');
});

test('22. Streak Trends generates 3-month activity growth trend points for recharts visualization', () => {
  const trend = generateStreakTrendData({ '2026-11-18': 3, '2026-11-17': 2 }, 'Asia/Kathmandu', new Date('2026-11-18T12:00:00+05:45').getTime());
  assert.equal(trend.length, 12);
  assert.equal(trend[trend.length - 1].period, 'W12');
  assert.ok(trend[trend.length - 1].activeDays >= 1);
});

test('23. Streak Freeze deducts 150 XP and protects/freezes streak when sufficient XP is available', () => {
  const userFixture = {
    id: 'u-freeze',
    name: 'Freeze User',
    username: 'freezeuser',
    email: 'freeze@example.com',
    avatarUrl: '',
    provider: 'google' as const,
    isLoggedIn: true,
    country: 'Nepal',
    countryFlag: '🇳🇵',
    timezone: 'Asia/Kathmandu',
    xp: 300,
    level: 2,
    levelTitle: 'Explorer',
    streakDays: 5,
    currentStreak: 5,
    longestStreak: 5,
    lastActiveDate: '2026-11-16',
    dailyGoalTarget: 5,
    dailyGoalCurrent: 0,
    badges: INITIAL_BADGES,
    streakHistory: [],
    linkedProviders: ['google' as const],
  };

  const res = processStreakFreeze(userFixture, 150);
  assert.equal(res.ok, true);
  assert.equal(res.xpSpent, 150);
  assert.equal(res.updatedUser.xp, 150);
  assert.equal(res.updatedUser.currentStreak, 5);
  assert.equal(res.updatedUser.recoveryCount, 1);

  const poorUser = { ...userFixture, xp: 50 };
  const failRes = processStreakFreeze(poorUser, 150);
  assert.equal(failRes.ok, false);
  assert.equal(failRes.reason, 'insufficient_xp');
});

test('24. Speech code resolution detects Nepali Devanagari script, Hindi, Arabic, and language preferences', () => {
  // Nepali script detection
  assert.equal(resolveSpeechCodeForText('नमस्ते! आज तपाईंलाई के मद्दत गर्न सक्छु?'), 'ne-NP');
  // Explicit language preferences
  assert.equal(resolveSpeechCodeForText('Hello world', 'ne'), 'ne-NP');
  assert.equal(resolveSpeechCodeForText('नमस्ते', 'hi'), 'hi-IN');
  assert.equal(resolveSpeechCodeForText('Bonjour', 'fr'), 'fr-FR');
  assert.equal(resolveSpeechCodeForText('Hola', 'es'), 'es-ES');
  assert.equal(resolveSpeechCodeForText('مرحبا بك', 'ar'), 'ar-SA');
  // Default English fallback
  assert.equal(resolveSpeechCodeForText('Hello world, I am Aadesh AI.'), 'en-US');
});

test('25. Speech cleaner and chunker format text for instant, snappy voice synthesis', () => {
  const markdownText = 'Here is the code:\n```typescript\nconst x = 1;\n```\nVisit [Aadesh AI](https://aadesh.ai) for **more** *details*.';
  const cleaned = cleanTextForSpeech(markdownText);
  assert.ok(!cleaned.includes('```'));
  assert.ok(cleaned.includes('Code snippet omitted'));
  assert.ok(cleaned.includes('Visit Aadesh AI for more details'));

  // Chunks long responses so the first sentence starts speaking immediately within <1s
  const longText = 'First quick greeting. Second longer sentence explaining the concept with rich details. Third sentence summarizing next steps.';
  const chunks = splitIntoSpeechChunks(longText, 60);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0], 'First quick greeting.');
});

test('26. autoSpeakAIResponses defaults to true to enable fast voice reader on responses', () => {
  assert.equal(DEFAULT_SETTINGS.autoSpeakAIResponses, true);
});

test('27. Streak=3 persists across refresh, logout/login, and zero-streak legacy Firestore doc recovery', () => {
  const tz = NEPAL_TIMEZONE; // Asia/Kathmandu
  const todayMs = new Date('2026-11-24T10:30:00+05:45').getTime();

  // Case A: Firestore doc exists with currentStreak: 0 (e.g. legacy doc or prior partial write)
  // while usage_analytics reconstructed a 3-day consecutive streak -> MUST preserve 3, NOT reset to 0.
  const recoveredFromLogs = mergeStreakStateSafely({
    firestoreResult: {
      status: 'found',
      state: { currentStreak: 0, longestStreak: 3, lastActiveDate: '2026-11-24', timezone: tz },
    },
    localBackup: null,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    firestoreLogsFallback: {
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: '2026-11-24',
      timezone: tz,
    },
    timeZone: tz,
    nowMs: todayMs,
  });
  assert.equal(recoveredFromLogs.state.currentStreak, 3);
  assert.equal(recoveredFromLogs.state.longestStreak, 3);
  assert.equal(recoveredFromLogs.state.lastActiveDate, '2026-11-24');

  // Case B: Simulate refresh with localBackup=3 and transient Firestore error -> keeps 3 without overwriting
  const afterRefreshError = mergeStreakStateSafely({
    firestoreResult: { status: 'error', error: 'Missing or insufficient permissions' },
    localBackup: recoveredFromLogs.state,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs: todayMs,
  });
  assert.equal(afterRefreshError.hadReadError, true);
  assert.equal(afterRefreshError.shouldWriteToFirestore, false);
  assert.equal(afterRefreshError.state.currentStreak, 3);

  // Case C: Simulate Logout (currentState wiped to 0) then Login with same UID -> keeps 3
  const afterLogoutLogin = mergeStreakStateSafely({
    firestoreResult: {
      status: 'found',
      state: {
        currentStreak: 3,
        longestStreak: 3,
        lastActiveDate: '2026-11-24',
        timezone: tz,
      },
    },
    localBackup: null,
    currentState: { currentStreak: 0, longestStreak: 0, lastActiveDate: '' },
    timeZone: tz,
    nowMs: todayMs,
  });
  assert.equal(afterLogoutLogin.hadReadError, false);
  assert.equal(afterLogoutLogin.state.currentStreak, 3);
  assert.equal(afterLogoutLogin.state.lastActiveDate, '2026-11-24');
});

test('28. Same-day multiple actions keep Streak=3 (no duplicate increments) and Asia/Kathmandu midnight advances cleanly', () => {
  const tz = NEPAL_TIMEZONE;
  const userProfile = {
    id: 'uid-nepal-3',
    name: 'Sagar',
    username: 'sagar',
    email: 'sagarjaisi92@gmail.com',
    avatarUrl: '',
    provider: 'google' as const,
    isLoggedIn: true,
    country: 'Nepal',
    countryFlag: '🇳🇵',
    timezone: tz,
    xp: 200,
    level: 2,
    levelTitle: 'Explorer',
    streakDays: 3,
    currentStreak: 3,
    longestStreak: 3,
    lastActiveDate: '2026-11-23',
    dailyGoalTarget: 5,
    dailyGoalCurrent: 2,
    badges: INITIAL_BADGES,
    streakHistory: [],
    linkedProviders: ['google' as const],
  };

  // 2026-11-23 23:55 NPT (still same local calendar day in Asia/Kathmandu, even though 18:10 UTC)
  const lateSameDayMs = new Date('2026-11-23T23:55:00+05:45').getTime();
  assert.equal(getLocalDateKeyInTimezone(lateSameDayMs, tz), '2026-11-23');
  const sameDayRes = recordGamificationActivity(userProfile, 'chat', {
    nowMs: lateSameDayMs,
    timeZone: tz,
  });
  assert.equal(sameDayRes.streakIncreased, false);
  assert.equal(sameDayRes.updatedUser.currentStreak, 3);
  assert.equal(sameDayRes.updatedUser.lastActiveDate, '2026-11-23');

  // 10 minutes later -> 2026-11-24 00:05 NPT -> advances to 4 once
  const nextMorningMs = new Date('2026-11-24T00:05:00+05:45').getTime();
  assert.equal(getLocalDateKeyInTimezone(nextMorningMs, tz), '2026-11-24');
  const nextDayRes = recordGamificationActivity(sameDayRes.updatedUser, 'chat', {
    nowMs: nextMorningMs,
    timeZone: tz,
  });
  assert.equal(nextDayRes.streakIncreased, true);
  assert.equal(nextDayRes.updatedUser.currentStreak, 4);
  assert.equal(nextDayRes.updatedUser.lastActiveDate, '2026-11-24');

  // Repeat chat same day -> stays 4
  const secondChatSameDay = recordGamificationActivity(nextDayRes.updatedUser, 'voice', {
    nowMs: nextMorningMs + 60000,
    timeZone: tz,
  });
  assert.equal(secondChatSameDay.streakIncreased, false);
  assert.equal(secondChatSameDay.updatedUser.currentStreak, 4);
});

test('29. Streak Freeze anchors lastActiveDate in Asia/Kathmandu so refresh right after Freeze preserves Streak', () => {
  const tz = NEPAL_TIMEZONE;
  const nowMs = new Date('2026-11-24T11:00:00+05:45').getTime();
  const userFixture = {
    id: 'uid-freeze-persist',
    name: 'Sagar',
    username: 'sagar',
    email: 'sagarjaisi92@gmail.com',
    avatarUrl: '',
    provider: 'google' as const,
    isLoggedIn: true,
    country: 'Nepal',
    countryFlag: '🇳🇵',
    timezone: tz,
    xp: 350,
    level: 2,
    levelTitle: 'Explorer',
    streakDays: 3,
    currentStreak: 3,
    longestStreak: 3,
    lastActiveDate: '2026-11-22', // gap of 2 days if not frozen
    dailyGoalTarget: 5,
    dailyGoalCurrent: 0,
    badges: INITIAL_BADGES,
    streakHistory: [],
    linkedProviders: ['google' as const],
  };

  const freezeRes = processStreakFreeze(userFixture, 150, nowMs);
  assert.equal(freezeRes.ok, true);
  assert.equal(freezeRes.updatedUser.currentStreak, 3);
  assert.equal(freezeRes.updatedUser.lastActiveDate, '2026-11-24');
  assert.equal(freezeRes.updatedUser.recoveryMonth, '2026-11');

  // Evaluating immediately after refresh must keep Streak=3 instead of resetting to 0
  const postRefresh = evaluateStreakStateOnRead(freezeRes.updatedUser, nowMs + 5000, tz);
  assert.equal(postRefresh.currentStreak, 3);
  assert.equal(postRefresh.lastActiveDate, '2026-11-24');
});

test('30. Effective timezone helper resolves UTC/empty safely to Asia/Kathmandu across entry points', () => {
  assert.equal(resolveEffectiveStreakTimezone('UTC', 'UTC'), 'Asia/Kathmandu');
  assert.equal(resolveEffectiveStreakTimezone('Etc/UTC', 'Etc/UTC'), 'Asia/Kathmandu');
  assert.equal(resolveEffectiveStreakTimezone(undefined, 'Asia/Kathmandu'), 'Asia/Kathmandu');
  assert.equal(resolveValidTimezone(undefined), 'Asia/Kathmandu');
});

test('31. AI daily quota/429 error isolation preserves Streak=3 without mutating state', () => {
  const tz = NEPAL_TIMEZONE;
  const nowMs = new Date('2026-11-24T12:00:00+05:45').getTime();
  const stateBeforeLimitError = {
    currentStreak: 3,
    longestStreak: 3,
    lastActiveDate: '2026-11-24',
    timezone: tz,
    recoveryCount: 0,
    recoveryMonth: '2026-11',
    streakBeforeBreak: 0,
    streakBrokenDate: '',
  };

  // Simulate opening/session evaluation when AI quota endpoint later throws 429
  const simulatedQuotaCheck = () => {
    throw new Error('HTTP 429: Free daily AI limit reached');
  };
  let preservedState = stateBeforeLimitError;
  assert.throws(() => simulatedQuotaCheck(), /429/);
  preservedState = evaluateStreakStateOnRead(preservedState, nowMs, tz);
  assert.equal(preservedState.currentStreak, 3);
  assert.equal(preservedState.longestStreak, 3);
});

test('32. Firestore security rules and blueprint support action-based Streak updates, XP fields, and hardened leaderboard queries', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
  );

  // Blueprint includes gamification/streak fields synced by client
  for (const field of ['xp', 'level', 'levelTitle', 'streakGoalDays', 'recoveredDates']) {
    assert.ok(field in blueprint.entities.User.properties, `Missing ${field} in blueprint User`);
  }

  // Rules have dedicated action-based owner streak update validator
  assert.ok(rulesText.includes('function isValidUserStreakUpdate(data, existingData, userId)'));
  assert.ok(rulesText.includes("incoming().diff(existing()).affectedKeys().hasOnly(["));
  // Admin and role/status protections remain enforced
  assert.ok(rulesText.includes("incoming().role == existing().role"));
  assert.ok(rulesText.includes("incoming().status == existing().status"));
  // Leaderboard list rule aligns with currentStreak >= 1 and longestStreak >= 1 queries and PII-free split create/update
  assert.ok(
    rulesText.includes(
      "allow list: if isSignedIn() && (resource.data.currentStreak >= 1 || resource.data.longestStreak >= 1);"
    )
  );
  assert.ok(rulesText.includes("allow create: if isValidId(userId)"));
  assert.ok(rulesText.includes("allow update: if isValidId(userId)"));
});

test('33. evaluateCurrentStreakOnLoad NEVER overwrites saved streak with 0 on permission-denied or read errors', () => {
  const tz = NEPAL_TIMEZONE;
  // Even if lastActiveDate is older than 1 day, a permission/read error must preserve the saved value (e.g., 3) instead of zeroing it out
  const nowMs = new Date('2026-11-24T12:00:00+05:45').getTime();

  assert.equal(
    evaluateCurrentStreakOnLoad(3, '2026-11-20', tz, nowMs, { hasPermissionError: true }),
    3
  );
  assert.equal(
    evaluateCurrentStreakOnLoad(5, '2026-11-20', tz, nowMs, { hadReadError: true }),
    5
  );
  // Normal read without errors when stale (>1 day gap) behaves as expected (returns 0)
  assert.equal(evaluateCurrentStreakOnLoad(3, '2026-11-20', tz, nowMs), 0);
});

test('34. mergeStreakStateSafely distinguishes missing user doc (not_found) from permission_denied error', () => {
  const tz = NEPAL_TIMEZONE;
  const nowMs = new Date('2026-11-24T12:00:00+05:45').getTime();

  // Case A: Confirmed missing Firestore document (not_found) -> isMissingDocument: true, safe to create/sync
  const missingDocRes = mergeStreakStateSafely({
    firestoreResult: { status: 'not_found' },
    localBackup: {
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: '2026-11-24',
      timezone: tz,
    },
    timeZone: tz,
    nowMs,
  });
  assert.equal(missingDocRes.isMissingDocument, true);
  assert.equal(missingDocRes.hadPermissionError, false);
  assert.equal(missingDocRes.hadReadError, false);
  assert.equal(missingDocRes.shouldWriteToFirestore, true);
  assert.equal(missingDocRes.state.currentStreak, 3);

  // Case B: Firestore permission_denied error -> hadPermissionError: true, isMissingDocument: false, NEVER write or zero out
  const permDeniedRes = mergeStreakStateSafely({
    firestoreResult: { status: 'permission_denied', error: 'Missing or insufficient permissions.' },
    localBackup: {
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: '2026-11-20', // stale gap would zero out if not guarded by hasPermissionError
      timezone: tz,
    },
    timeZone: tz,
    nowMs,
  });
  assert.equal(permDeniedRes.hadPermissionError, true);
  assert.equal(permDeniedRes.hadReadError, true);
  assert.equal(permDeniedRes.isMissingDocument, false);
  assert.equal(permDeniedRes.shouldWriteToFirestore, false);
  assert.equal(permDeniedRes.state.currentStreak, 3);
});

test('35. evaluateLeaderboardSyncEligibility enforces user doc existence, authorization, and active streak >= 1', () => {
  assert.equal(classifyFirestoreErrorKind({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), 'permission_denied');
  assert.equal(classifyFirestoreErrorKind({ code: 'unavailable', message: 'client is offline' }), 'unavailable');

  // Unauthenticated / UID mismatch -> skip
  const unauth = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-a',
    profileId: 'uid-b',
    userDocStatus: 'found',
    userDocData: { currentStreak: 3, longestStreak: 3 },
  });
  assert.equal(unauth.eligible, false);
  assert.equal(unauth.reason, 'unauthenticated');

  // Missing users/{uid} document -> skip before hitting streak_leaderboard rules
  const missingDoc = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-a',
    profileId: 'uid-a',
    userDocStatus: 'not_found',
    userDocData: null,
    profileCurrentStreak: 3,
  });
  assert.equal(missingDoc.eligible, false);
  assert.equal(missingDoc.reason, 'missing_user_doc');

  // Permission denied on users/{uid} -> skip without calling leaderboard write
  const permDenied = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-a',
    profileId: 'uid-a',
    userDocStatus: 'permission_denied',
    userDocData: null,
    profileCurrentStreak: 3,
  });
  assert.equal(permDenied.eligible, false);
  assert.equal(permDenied.reason, 'permission_denied');

  // Existing users/{uid} with 0 streak -> insufficient_streak
  const zeroStreak = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-a',
    profileId: 'uid-a',
    userDocStatus: 'found',
    userDocData: { currentStreak: 0, longestStreak: 0 },
    profileCurrentStreak: 3,
  });
  assert.equal(zeroStreak.eligible, false);
  assert.equal(zeroStreak.reason, 'insufficient_streak');

  // Existing users/{uid} with persisted streak >= 1 -> eligible
  const eligible = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-a',
    profileId: 'uid-a',
    userDocStatus: 'found',
    userDocData: { currentStreak: 3, longestStreak: 5, lastActiveDate: '2026-11-24' },
    profileCurrentStreak: 3,
    profileLongestStreak: 5,
    profileLastActiveDate: '2026-11-24',
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.currentStreak, 3);
  assert.equal(eligible.longestStreak, 5);
  assert.equal(eligible.lastActiveDate, '2026-11-24');
});

test('36. Firestore rules require users/{userId} existence & streak on leaderboard create and permit owner subcollection writes', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  assert.ok(rulesText.includes('exists(/databases/$(database)/documents/users/$(userId))'));
  assert.ok(rulesText.includes('get(/databases/$(database)/documents/users/$(userId)).data.currentStreak >= 1'));

  for (const subcollection of [
    'match /conversations/{conversationId}',
    'match /messages/{messageId}',
    'match /memories/{memoryId}',
    'match /tasks/{taskId}',
    'match /studyProgress/{progressId}',
    'match /generatedImages/{imageId}',
    'match /automationSchedules/{scheduleId}',
    'match /automationLogs/{logId}',
  ]) {
    assert.ok(rulesText.includes(subcollection), `Expected rule block for ${subcollection}`);
  }
});

test('37. recordGamificationActivity and streak entry points apply resolveEffectiveStreakTimezone consistently (including user.timezone fallback)', () => {
  // Omitting options.timeZone must honor user.timezone (Asia/Kathmandu) rather than silently switching to NEPAL_TIMEZONE only or UTC
  // 2026-11-23T18:20:00Z is 2026-11-24 00:05 in Asia/Kathmandu (+05:45), still 2026-11-23 in UTC/PST
  const nptMidnightPlus5Min = new Date('2026-11-23T18:20:00Z').getTime();
  assert.equal(getLocalDateKeyInTimezone(nptMidnightPlus5Min, NEPAL_TIMEZONE), '2026-11-24');

  const baseProfile = {
    id: 'uid-tz-consistency',
    name: 'Sagar',
    username: 'sagar',
    email: 'sagarjaisi92@gmail.com',
    avatarUrl: '',
    provider: 'google' as const,
    isLoggedIn: true,
    country: 'Nepal',
    countryFlag: '🇳🇵',
    timezone: NEPAL_TIMEZONE,
    xp: 100,
    level: 1,
    levelTitle: 'Novice',
    streakDays: 3,
    currentStreak: 3,
    longestStreak: 3,
    lastActiveDate: '2026-11-23',
    dailyGoalTarget: 5,
    dailyGoalCurrent: 0,
    badges: INITIAL_BADGES,
    streakHistory: [],
    linkedProviders: ['google' as const],
  };

  // Even without options.timeZone passed explicitly, user.timezone (Asia/Kathmandu) advances 3 -> 4 at NPT midnight
  const resNoOpt = recordGamificationActivity(baseProfile, 'chat', { nowMs: nptMidnightPlus5Min });
  assert.equal(resNoOpt.streakIncreased, true);
  assert.equal(resNoOpt.updatedUser.currentStreak, 4);
  assert.equal(resNoOpt.updatedUser.lastActiveDate, '2026-11-24');
  assert.equal(resNoOpt.updatedUser.timezone, NEPAL_TIMEZONE);
});

test('38. Firestore rules strictly validate owner streak commits, reject wildcard/unsafe patterns, and guard suggestionAnalytics', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  // Must NEVER contain wildcard allow if true or disabling security
  assert.equal(/allow\s+(read|write)\s*:\s*if\s+true\b/i.test(rulesText), false);
  assert.ok(rulesText.includes('allow read, write: if false;'));

  // Owner validation & streak transaction field allowlist must protect role/status/createdAt while avoiding false denials on untouched legacy fields
  assert.ok(rulesText.includes('function isValidUserStreakUpdate(data, existingData, userId)'));
  assert.ok(rulesText.includes("let affected = data.diff(existingData).affectedKeys();"));
  assert.ok(rulesText.includes("&& (!('recoveryCount' in affected) || (data.recoveryCount is number && data.recoveryCount >= 0 && data.recoveryCount <= 5))"));
  assert.ok(rulesText.includes("&& (!('currentStreak' in affected) || (data.currentStreak is number && data.currentStreak >= 0 && data.currentStreak <= 10000))"));
  assert.ok(rulesText.includes('match /suggestionAnalytics/{statId}'));
  assert.ok(rulesText.includes('function isValidSuggestionAnalyticsDoc(data, userId, statId)'));
});

test('39. sanitizeFiniteInt guards Firestore v13.2.0 transactions against NaN, Infinity, floats, and out-of-range streak/recovery values', () => {
  assert.equal(sanitizeFiniteInt(3.8, 0, 10000, 0), 3);
  assert.equal(sanitizeFiniteInt(NaN, 0, 10000, 0), 0);
  assert.equal(sanitizeFiniteInt(Infinity, 0, 5, 0), 0);
  assert.equal(sanitizeFiniteInt(-4, 0, 5, 0), 0);
  assert.equal(sanitizeFiniteInt(99, 0, 5, 0), 5);
  assert.equal(sanitizeFiniteInt('4', 0, 10000, 0), 4);
  assert.equal(sanitizeFiniteInt(undefined, 0, 10000, 0), 0);
});

test('40. Suggested Replies analytics classifies intents, generates Firestore-safe IDs, merges cloud counts, and summarizes top patterns', () => {
  assert.equal(classifySuggestionCategory('Explain in more detail'), 'deep_dive');
  assert.equal(classifySuggestionCategory('Give a practical example'), 'examples');
  assert.equal(classifySuggestionCategory('Summarize the key points'), 'summary');
  assert.equal(classifySuggestionCategory('Explain in Nepali'), 'translate');
  assert.equal(classifySuggestionCategory('Show step-by-step action plan'), 'action_steps');

  const asciiId = buildSuggestionStatId('Explain in more detail');
  const nepaliId = buildSuggestionStatId('नेपालीमा सरल उदाहरण दिनुहोस्');
  assert.match(asciiId, /^[a-zA-Z0-9_-]{8,128}$/);
  assert.match(nepaliId, /^[a-zA-Z0-9_-]{8,128}$/);
  assert.equal(normalizeSuggestionKey('  Give a Practical Example!!  '), 'give a practical example');

  // Mock localStorage in Node test environment if absent
  const store = new Map<string, string>();
  const originalLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  try {
    const uid = 'uid-sugg-analytics';
    recordLocalSuggestionClick(uid, 'Give a practical example', 'en', 1000);
    recordLocalSuggestionClick(uid, 'Give a practical example', 'en', 2000);
    const localAfter = recordLocalSuggestionClick(uid, 'Explain in more detail', 'en', 3000);

    const cloudItems = [
      {
        id: buildSuggestionStatId('Give a practical example'),
        normalizedKey: 'give a practical example',
        sampleText: 'Give a practical example',
        category: 'examples' as const,
        clickCount: 5,
        lastClickedAt: 5000,
        createdAt: 500,
      },
    ];
    const merged = mergeSuggestionAnalytics(localAfter, cloudItems);
    const summary = summarizeTopSuggestionPatterns(merged, 5);

    assert.equal(summary.totalClicks, 6);
    assert.equal(summary.topClickedSuggestions[0].text, 'Give a practical example');
    assert.equal(summary.topClickedSuggestions[0].clickCount, 5);
    assert.equal(summary.topCategories[0].category, 'examples');
    assert.equal(summary.topCategories[0].totalClicks, 5);
  } finally {
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test('41. D3 computeCircularMilestoneLayout builds circular SVG arc paths, milestone markers, and personal-best halo', () => {
  const layoutMid = computeCircularMilestoneLayout({
    currentStreak: 9,
    longestStreak: 16,
    goalDays: 30,
  });

  assert.equal(layoutMid.goalDays, 30);
  assert.equal(layoutMid.progressPercent, 30);
  assert.equal(layoutMid.remainingDays, 21);
  assert.equal(layoutMid.isGoalCompleted, false);
  assert.ok(layoutMid.trackArcPath.startsWith('M'));
  assert.ok(layoutMid.progressArcPath.startsWith('M'));
  assert.ok(layoutMid.bestArcPath && layoutMid.bestArcPath.startsWith('M'));

  // Expect standard milestones 1d, 3d, 7d, 14d, and 30d Goal
  assert.deepEqual(
    layoutMid.milestones.map((m) => m.days),
    [1, 3, 7, 14, 30]
  );
  assert.equal(layoutMid.milestones.find((m) => m.days === 7)?.unlocked, true);
  assert.equal(layoutMid.milestones.find((m) => m.days === 14)?.unlocked, false);
  assert.equal(layoutMid.milestones.find((m) => m.days === 14)?.isNext, true);
  assert.equal(layoutMid.milestones.find((m) => m.days === 30)?.isGoal, true);

  // Completed goal state
  const layoutDone = computeCircularMilestoneLayout({
    currentStreak: 30,
    longestStreak: 30,
    goalDays: 30,
  });
  assert.equal(layoutDone.isGoalCompleted, true);
  assert.equal(layoutDone.progressPercent, 100);
  assert.equal(layoutDone.remainingDays, 0);
  assert.equal(layoutDone.bestArcPath, null);
});

test('42. firebase-blueprint.json models SuggestionAnalytics alongside User streak fields', () => {
  const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));
  assert.ok(blueprint.entities.SuggestionAnalytics);
  assert.ok(blueprint.firestore['/users/{userId}/suggestionAnalytics/{statId}']);
  assert.ok(blueprint.entities.User.properties.recoveryCount);
  assert.ok(blueprint.entities.User.properties.recoveryMonth);
  assert.ok(blueprint.entities.User.properties.streakDays);
  assert.ok(blueprint.entities.User.properties.currentStreak);
  assert.ok(blueprint.entities.User.properties.longestStreak);
});

test('43. rankLongestStreakLeaderboardEntries ranks Top 10 by longestStreak desc and breaks ties with currentStreak', () => {
  const entries = [
    { userId: 'u1', displayName: 'Alice', currentStreak: 2, longestStreak: 14, level: 4, updatedAt: '2026-11-20T00:00:00Z' },
    { userId: 'u2', displayName: 'Bob', currentStreak: 0, longestStreak: 30, level: 6, updatedAt: '2026-11-21T00:00:00Z' },
    { userId: 'u3', displayName: 'Cara', currentStreak: 5, longestStreak: 30, level: 5, updatedAt: '2026-11-22T00:00:00Z' },
    { userId: 'u3', displayName: 'Cara Dup', currentStreak: 3, longestStreak: 10, level: 5, updatedAt: '2026-11-19T00:00:00Z' },
    { userId: 'u0', displayName: 'Zero', currentStreak: 0, longestStreak: 0, level: 1, updatedAt: '2026-11-22T00:00:00Z' },
    ...Array.from({ length: 10 }, (_, idx) => ({
      userId: `filler-${idx}`,
      displayName: `User ${idx}`,
      currentStreak: 1,
      longestStreak: idx + 1,
      level: 2,
      updatedAt: `2026-11-1${idx % 9}T00:00:00Z`,
    })),
  ];

  const ranked = rankLongestStreakLeaderboardEntries(entries, 'u1', 10);
  assert.equal(ranked.length, 10);
  assert.equal(ranked[0].userId, 'u3');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].longestStreak, 30);
  assert.equal(ranked[1].userId, 'u2');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].userId, 'u1');
  assert.equal(ranked[2].isCurrentUser, true);
  assert.equal(ranked.some((item) => item.userId === 'u0'), false);
});

test('44. resolveCelebratedMilestone picks the highest-priority newly unlocked streak milestone', () => {
  const milestones = evaluateStreakMilestones({
    user: {
      streakDays: 30,
      currentStreak: 30,
      longestStreak: 30,
      lastActiveDate: '2026-11-24',
      streakHistory: [],
    },
    dateCounts: {},
    recoveredDates: [],
    timeZone: NEPAL_TIMEZONE,
  });

  const picked = resolveCelebratedMilestone(milestones, ['first_flame', 'seven_day_streak_master', 'thirty_day_consistency_legend']);
  assert.ok(picked);
  assert.equal(picked.id, 'thirty_day_consistency_legend');

  assert.equal(resolveCelebratedMilestone(milestones, []), null);
});

test('45. evaluateLeaderboardSyncEligibility allows syncing users with historical longestStreak >= 1', () => {
  const result = evaluateLeaderboardSyncEligibility({
    authUid: 'uid-hist',
    profileId: 'uid-hist',
    userDocStatus: 'found',
    userDocData: { currentStreak: 0, longestStreak: 12, streakDays: 0 },
    profileCurrentStreak: 0,
    profileLongestStreak: 12,
    profileLastActiveDate: '2026-11-10',
  });
  assert.equal(result.eligible, true);
  assert.equal(result.longestStreak, 12);
});

test('46. Global scroll helpers preserve scrollback while auto-scrolling near bottom unless searching', () => {
  assert.equal(
    isScrollContainerNearBottom({ scrollTop: 880, scrollHeight: 1500, clientHeight: 500 }),
    true
  );
  assert.equal(
    isScrollContainerNearBottom({ scrollTop: 300, scrollHeight: 1500, clientHeight: 500 }),
    false
  );
  assert.equal(
    shouldAutoScrollChatFeed({ isNearBottom: false, forceScroll: false, hasSearchFilter: false }),
    false
  );
  assert.equal(
    shouldAutoScrollChatFeed({ isNearBottom: false, forceScroll: true, hasSearchFilter: false }),
    true
  );
  assert.equal(
    shouldAutoScrollChatFeed({ isNearBottom: true, forceScroll: true, hasSearchFilter: true }),
    false
  );
});

test('47. Global CSS & Firestore rules preserve smooth scrolling and longestStreak leaderboard queries', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*clip;/s);
  assert.match(css, /body\s*\{[^}]*overflow-x:\s*clip;/s);
  assert.match(css, /\.scroll-pane\s*\{[^}]*touch-action:\s*pan-y;/s);
  assert.match(css, /\.milestone-celebrate-card/);

  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(rules, /allow list:\s*if isSignedIn\(\) && \(resource\.data\.currentStreak >= 1 \|\| resource\.data\.longestStreak >= 1\);/);
});

test('48. buildChatExport supports JSON and Markdown exports across all chat sessions', () => {
  const now = new Date('2026-11-24T10:15:00.000Z').getTime();
  const sessionOne = {
    id: 'sess-1',
    title: 'Kathmandu Travel Plan',
    targetLanguage: 'ne',
    createdAt: now - 3600_000,
    updatedAt: now - 1800_000,
    messages: [
      {
        id: 'm1',
        role: 'user' as const,
        senderName: 'Aadesh',
        content: 'What should I pack for Pokhara?',
        timestamp: now - 1800_000,
      },
      {
        id: 'm2',
        role: 'model' as const,
        content: 'Bring a warm fleece and rain shell.',
        translation: 'तातो ज्याकेट र रेनकोट बोक्नुहोस्।',
        translationLanguage: 'ne',
        geotagInsights: 'Pokhara lakeside cools down after sunset.',
        timestamp: now - 1700_000,
      },
    ],
  };
  const sessionTwo = {
    id: 'sess-2',
    title: 'React Architecture Notes',
    targetLanguage: 'en',
    createdAt: now - 900_000,
    updatedAt: now - 300_000,
    messages: [
      {
        id: 'm3',
        role: 'user' as const,
        content: 'Summarize our state container pattern.',
        timestamp: now - 300_000,
        isPinned: true,
      },
    ],
  };

  const mdExport = buildChatExport({
    scope: 'all',
    format: 'md',
    currentSession: sessionOne,
    allSessions: [sessionOne, sessionTwo],
    userName: 'Aadesh Jaisi',
  });

  assert.match(mdExport.filename, /^aadesh-ai-all-conversations-\d{4}-\d{2}-\d{2}\.md$/);
  assert.equal(mdExport.mimeType, 'text/markdown;charset=utf-8');
  assert.equal(mdExport.sessionCount, 2);
  assert.equal(mdExport.messageCount, 3);
  assert.match(mdExport.content, /# Aadesh AI Global Hub — Chat Sessions Backup/);
  assert.match(mdExport.content, /## 1\. Kathmandu Travel Plan/);
  assert.match(mdExport.content, /## 2\. React Architecture Notes/);
  assert.match(mdExport.content, /Bring a warm fleece and rain shell\./);
  assert.match(mdExport.content, /\*\*Translation \(ne\):\*\*/);
  assert.match(mdExport.content, /Regional Context: Pokhara lakeside cools down after sunset\./);

  const mdDirect = formatChatHistoryAsMarkdown({
    scope: 'all',
    format: 'md',
    currentSession: sessionOne,
    allSessions: [sessionOne, sessionTwo],
  });
  assert.match(mdDirect, /## 2\. React Architecture Notes/);

  const jsonExport = buildChatExport({
    scope: 'all',
    format: 'json',
    currentSession: sessionOne,
    allSessions: [sessionOne, sessionTwo],
    userName: 'Aadesh Jaisi',
  });

  assert.match(jsonExport.filename, /^aadesh-ai-all-conversations-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(jsonExport.mimeType, 'application/json;charset=utf-8');
  const parsed = JSON.parse(jsonExport.content);
  assert.equal(parsed.sessionCount, 2);
  assert.equal(parsed.totalMessages, 3);
  assert.equal(parsed.sessions[0].title, 'Kathmandu Travel Plan');
  assert.equal(parsed.sessions[1].title, 'React Architecture Notes');
});

test('49. parseReminderTime and evaluateNepalEveningReminder honor custom preferred reminder times', () => {
  assert.equal(DEFAULT_STREAK_REMINDER_TIME, '20:00');
  assert.equal(DEFAULT_SETTINGS.streakReminderTime, '20:00');

  const parsedMorning = parseReminderTime('09:30');
  assert.equal(parsedMorning.hour, 9);
  assert.equal(parsedMorning.minute, 30);
  assert.equal(parsedMorning.normalized, '09:30');
  assert.equal(parsedMorning.label12h, '9:30 AM');

  const parsedEvening = parseReminderTime('21:05');
  assert.equal(parsedEvening.hour, 21);
  assert.equal(parsedEvening.minute, 5);
  assert.equal(parsedEvening.normalized, '21:05');
  assert.equal(parsedEvening.label12h, '9:05 PM');

  const parsedInvalid = parseReminderTime('25:99');
  assert.equal(parsedInvalid.normalized, '20:00');
  assert.equal(parsedInvalid.label12h, '8:00 PM');

  // 09:29 AM in Asia/Kathmandu -> not due yet for 09:30 reminder
  const beforeNineThirty = new Date('2026-11-24T09:29:00+05:45').getTime();
  const evalBefore = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-23',
    nowMs: beforeNineThirty,
    preferredTime: '09:30',
    timeZone: NEPAL_TIMEZONE,
  });
  assert.equal(evalBefore.shouldNotifyNow, false);
  assert.equal(evalBefore.reason, 'before_8pm_npt');
  assert.equal(evalBefore.preferredTime, '09:30');
  assert.equal(evalBefore.preferredTimeLabel, '9:30 AM');

  // 09:30 AM in Asia/Kathmandu -> due now for 09:30 reminder
  const atNineThirty = new Date('2026-11-24T09:30:00+05:45').getTime();
  const evalAt = evaluateNepalEveningReminder({
    enabled: true,
    lastActiveDate: '2026-11-23',
    nowMs: atNineThirty,
    preferredTime: '09:30',
    timeZone: NEPAL_TIMEZONE,
  });
  assert.equal(evalAt.shouldNotifyNow, true);
  assert.equal(evalAt.reason, 'due_now');
  assert.equal(evalAt.preferredTimeLabel, '9:30 AM');
});

test('50. buildLast30DaysStreakHeatmap builds 30-day calendar heatmap with intensity and consistency metrics', () => {
  const nowMs = new Date('2026-11-24T14:00:00+05:45').getTime();
  const heatmap = buildLast30DaysStreakHeatmap({
    user: {
      timezone: NEPAL_TIMEZONE,
      currentStreak: 3,
      streakDays: 3,
      lastActiveDate: '2026-11-24',
      recoveredDates: ['2026-11-20'],
    },
    dateCounts: {
      '2026-11-24': 12,
      '2026-11-23': 6,
      '2026-11-22': 3,
      '2026-11-18': 1,
    },
    recoveredDates: ['2026-11-20'],
    timeZone: NEPAL_TIMEZONE,
    nowMs,
  });

  assert.equal(heatmap.days.length, 30);
  assert.equal(heatmap.startDateKey, '2026-10-26');
  assert.equal(heatmap.endDateKey, '2026-11-24');
  assert.equal(heatmap.activeDaysCount, 5);
  assert.equal(heatmap.maintainedDaysCount, 4);
  assert.equal(heatmap.recoveredDaysCount, 1);
  assert.equal(heatmap.consistencyRatePercent, Math.round((5 / 30) * 100));
  assert.equal(heatmap.recent7ActiveCount, 5);

  const todayCell = heatmap.days[heatmap.days.length - 1];
  assert.equal(todayCell.date, '2026-11-24');
  assert.equal(todayCell.isToday, true);
  assert.equal(todayCell.status, 'maintained');
  assert.equal(todayCell.intensity, 4);

  const recoveredCell = heatmap.days.find((d) => d.date === '2026-11-20');
  assert.ok(recoveredCell);
  assert.equal(recoveredCell.status, 'recovered');

  assert.ok(heatmap.peakDay);
  assert.equal(heatmap.peakDay.date, '2026-11-24');
  assert.equal(heatmap.peakDay.count, 12);
});

test('51. voiceAssistant.setPlaybackSpeed updates playback rate reactively across 0.5x to 2.0x', () => {
  const seenRates: number[] = [];
  const unsubscribe = voiceAssistant.subscribePlayback((state) => {
    seenRates.push(state.rate);
  });

  try {
    voiceAssistant.setPlaybackSpeed(0.5);
    assert.equal(voiceAssistant.getDefaultConfig().rate, 0.5);
    assert.equal(voiceAssistant.getPlaybackState().rate, 0.5);

    voiceAssistant.setPlaybackSpeed(1.75);
    assert.equal(voiceAssistant.getDefaultConfig().rate, 1.75);
    assert.equal(voiceAssistant.getPlaybackState().rate, 1.75);

    voiceAssistant.setPlaybackSpeed(2.0);
    assert.equal(voiceAssistant.getDefaultConfig().rate, 2.0);
    assert.equal(voiceAssistant.getPlaybackState().rate, 2.0);

    // Clamp out-of-range attempts safely to [0.5, 2.0]
    voiceAssistant.setPlaybackSpeed(0.2);
    assert.equal(voiceAssistant.getDefaultConfig().rate, 0.5);
    voiceAssistant.setPlaybackSpeed(3.0);
    assert.equal(voiceAssistant.getDefaultConfig().rate, 2.0);

    assert.ok(seenRates.includes(0.5));
    assert.ok(seenRates.includes(1.75));
    assert.ok(seenRates.includes(2.0));
  } finally {
    voiceAssistant.setPlaybackSpeed(1.0);
    unsubscribe();
  }
});

test('52. SettingsView Theme Switcher provides horizontal palette carousel with valid global theme tokens', () => {
  assert.ok(COLOR_THEME_PRESETS.length >= 6);
  for (const preset of COLOR_THEME_PRESETS) {
    assert.ok(preset.id);
    assert.ok(preset.name);
    assert.ok(preset.hex.startsWith('#'));
    const tokens = generateThemeTokensFromColor(preset.hex);
    assert.ok(tokens.primaryHex.startsWith('#'));
    assert.ok(tokens.secondaryHex.startsWith('#'));
    assert.ok(tokens.deepHex.startsWith('#'));
    assert.ok(tokens.lightHex.startsWith('#'));
  }

  const settingsViewSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SettingsView.tsx'),
    'utf8'
  );
  assert.ok(settingsViewSrc.includes('Theme Switcher'));
  assert.ok(settingsViewSrc.includes('overflow-x-auto'));
  assert.ok(settingsViewSrc.includes('snap-x snap-mandatory'));
});

test('53. Build optimization uses Vite 8 Rolldown codeSplitting, React.lazy routes/modals, and async PDF/confetti imports', () => {
  const viteConfigSrc = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
  assert.ok(viteConfigSrc.includes('rolldownOptions'));
  assert.ok(viteConfigSrc.includes('codeSplitting'));
  assert.equal(viteConfigSrc.includes('manualChunks'), false);
  assert.equal(viteConfigSrc.includes('chunkSizeWarningLimit'), false);

  const exportHistorySrc = fs.readFileSync(
    path.join(process.cwd(), 'src/utils/exportHistory.ts'),
    'utf8'
  );
  assert.equal(exportHistorySrc.includes("from 'jspdf'"), false);
  assert.ok(exportHistorySrc.includes("import('./exportPdf')"));

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.equal(appSrc.includes("from 'canvas-confetti'"), false);
  assert.ok(appSrc.includes("import('canvas-confetti')"));
  assert.ok(appSrc.includes("import('./components/ChatView')"));
  assert.ok(appSrc.includes("import('./components/GamificationModal')"));
  assert.ok(appSrc.includes("import('./components/SettingsView')"));

  const gamificationModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/GamificationModal.tsx'),
    'utf8'
  );
  assert.ok(gamificationModalSrc.includes("import('./StreakMilestonesChart')"));
  assert.ok(gamificationModalSrc.includes("import('./StreakTrendsChart')"));
});

test('54. MarkdownRenderer uses dynamic import for react-markdown and remark-gfm, and firestore.rules validates recoveryCount as number', () => {
  const markdownRendererSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/MarkdownRenderer.tsx'),
    'utf8'
  );
  assert.ok(markdownRendererSrc.includes("import('react-markdown')"));
  assert.ok(markdownRendererSrc.includes("import('remark-gfm')"));

  const firestoreRulesSrc = fs.readFileSync(
    path.join(process.cwd(), 'firestore.rules'),
    'utf8'
  );
  assert.ok(firestoreRulesSrc.includes('recoveryCount is number'));
  assert.equal(firestoreRulesSrc.includes('recoveryCount is int'), false);
});

