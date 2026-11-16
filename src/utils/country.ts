import { ALL_COUNTRY_CLOCKS, CountryClockEntry } from '../data/worldClocks';

export interface CountryOption {
  code: string;
  country: string;
  flag: string;
  timeZone: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = (() => {
  const seen = new Set<string>();
  const list: CountryOption[] = [];
  for (const entry of ALL_COUNTRY_CLOCKS) {
    if (seen.has(entry.country)) continue;
    seen.add(entry.country);
    list.push({
      code: entry.code,
      country: entry.country,
      flag: entry.flag,
      timeZone: entry.timeZone,
    });
  }
  return list.sort((a, b) => a.country.localeCompare(b.country));
})();

export function detectUserCountry(): { country: string; flag: string; code: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const matchByTz = ALL_COUNTRY_CLOCKS.find((c: CountryClockEntry) => c.timeZone === tz);
    if (matchByTz) {
      return {
        country: matchByTz.country,
        flag: matchByTz.flag,
        code: matchByTz.code,
      };
    }

    const locale = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    const regionPart = locale.split('-')[1]?.toUpperCase();
    if (regionPart) {
      const matchByCode = ALL_COUNTRY_CLOCKS.find((c: CountryClockEntry) => c.code === regionPart);
      if (matchByCode) {
        return {
          country: matchByCode.country,
          flag: matchByCode.flag,
          code: matchByCode.code,
        };
      }
    }
  } catch {}
  return { country: 'Global', flag: '🌐', code: 'GL' };
}

export async function detectCountryViaGPS(): Promise<CountryOption | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (_pos) => {
        const auto = detectUserCountry();
        const found = COUNTRY_OPTIONS.find((c) => c.country === auto.country || c.code === auto.code);
        resolve(found || COUNTRY_OPTIONS[0] || null);
      },
      () => {
        resolve(null);
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}
