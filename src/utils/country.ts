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

export function findCountryOption(code?: string, countryName?: string): CountryOption | null {
  const upperCode = (code || '').trim().toUpperCase();
  if (upperCode) {
    const byCode = COUNTRY_OPTIONS.find((c) => c.code.toUpperCase() === upperCode);
    if (byCode) return byCode;
  }
  const cleanName = (countryName || '').trim().toLowerCase();
  if (cleanName) {
    const byExact = COUNTRY_OPTIONS.find((c) => c.country.toLowerCase() === cleanName);
    if (byExact) return byExact;
    const byPartial = COUNTRY_OPTIONS.find(
      (c) =>
        cleanName.includes(c.country.toLowerCase()) ||
        c.country.toLowerCase().includes(cleanName)
    );
    if (byPartial) return byPartial;
  }
  return null;
}

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
  } catch {
    // Non-fatal fallback
  }
  return { country: 'Global', flag: '🌐', code: 'GL' };
}

export async function detectCountryApproxViaIP(): Promise<CountryOption | null> {
  try {
    const res = await fetch('/api/geo/ip-country', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return findCountryOption(data.code, data.country);
  } catch {
    return null;
  }
}

export interface GpsCountryDetectionResult {
  option: CountryOption | null;
  source?: 'gps' | 'ip-approximate' | 'timezone';
  error?: string;
}

export async function detectCountryViaGPSDetailed(): Promise<GpsCountryDetectionResult> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      option: null,
      error: 'GPS detection requires a secure HTTPS connection. Please select your country manually below.',
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    const ipApprox = await detectCountryApproxViaIP();
    if (ipApprox) {
      return { option: ipApprox, source: 'ip-approximate' };
    }
    return {
      option: null,
      error: 'GPS geolocation is not supported in this browser. Please select your country manually.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const geoRes = await fetch(
            `/api/geo/reverse-country?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
            { cache: 'no-store' }
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const matched = findCountryOption(geoData.code, geoData.country);
            if (matched) {
              resolve({ option: matched, source: 'gps' });
              return;
            }
          }
        } catch {
          // Fall through to approximate/timezone match
        }
        const auto = detectUserCountry();
        const found = COUNTRY_OPTIONS.find((c) => c.country === auto.country || c.code === auto.code) || null;
        resolve({
          option: found,
          source: found ? 'timezone' : undefined,
          error: found ? undefined : 'Could not map GPS coordinates to a country. Please choose manually.',
        });
      },
      async (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            option: null,
            error: 'Location permission denied. You can select your country manually from the searchable list below.',
          });
          return;
        }
        const ipApprox = await detectCountryApproxViaIP();
        if (ipApprox) {
          resolve({ option: ipApprox, source: 'ip-approximate' });
          return;
        }
        resolve({
          option: null,
          error:
            err.code === err.TIMEOUT
              ? 'GPS request timed out. Please select your country manually.'
              : 'Location unavailable right now. Please select your country manually.',
        });
      },
      { timeout: 9000, maximumAge: 60000, enableHighAccuracy: false }
    );
  });
}

export async function detectCountryViaGPS(): Promise<CountryOption | null> {
  const result = await detectCountryViaGPSDetailed();
  return result.option;
}
