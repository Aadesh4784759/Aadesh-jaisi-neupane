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

export type CountryDetectionMethod = 'gps' | 'ip' | 'timezone' | 'manual';

export interface ResolvedCountryInfo {
  country: string;
  code: string;
  flag: string;
  timeZone: string;
  method: CountryDetectionMethod;
  isManual: boolean;
}

export function getBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.trim()) {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      return tz;
    }
  } catch {
    // Non-fatal
  }
  return 'UTC';
}

export function isConfirmedCountryValue(country?: string, code?: string): boolean {
  const c = (country || '').trim();
  const iso = (code || '').trim().toUpperCase();
  if (!c && !iso) return false;
  if (c === 'Global' || c === 'Unknown') return false;
  if (iso === 'GL' || iso === 'XX' || iso === 'T1') return false;
  return true;
}

export function detectUserCountry(): { country: string; flag: string; code: string; timeZone: string } {
  const browserTz = getBrowserTimezone();
  try {
    const matchByTz = ALL_COUNTRY_CLOCKS.find((c: CountryClockEntry) => c.timeZone === browserTz);
    if (matchByTz) {
      return {
        country: matchByTz.country,
        flag: matchByTz.flag,
        code: matchByTz.code,
        timeZone: matchByTz.timeZone || browserTz,
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
          timeZone: browserTz !== 'UTC' ? browserTz : matchByCode.timeZone || 'UTC',
        };
      }
    }
  } catch {
    // Non-fatal fallback
  }
  // Never default to UK or any arbitrary country when detection fails; use neutral Global
  return { country: 'Global', flag: '🌐', code: 'GL', timeZone: browserTz };
}

export function resolveCountryForProfile(params: {
  savedCountry?: string;
  savedCountryCode?: string;
  savedFlag?: string;
  savedTimezone?: string;
  savedMethod?: CountryDetectionMethod;
  isManual?: boolean;
}): ResolvedCountryInfo {
  const browserTz = getBrowserTimezone();
  const hasSavedConfirmed = isConfirmedCountryValue(params.savedCountry, params.savedCountryCode);
  const matchedSaved = findCountryOption(params.savedCountryCode, params.savedCountry);

  if (params.isManual || hasSavedConfirmed) {
    const country = matchedSaved?.country || params.savedCountry || 'Global';
    const code = matchedSaved?.code || params.savedCountryCode || (country === 'Global' ? 'GL' : '');
    const flag = params.savedFlag || matchedSaved?.flag || '🌐';
    const timeZone = params.savedTimezone || matchedSaved?.timeZone || browserTz;
    return {
      country,
      code,
      flag,
      timeZone,
      method: params.isManual ? 'manual' : params.savedMethod || (hasSavedConfirmed ? 'ip' : 'timezone'),
      isManual: Boolean(params.isManual),
    };
  }

  const auto = detectUserCountry();
  return {
    country: auto.country,
    code: auto.code,
    flag: auto.flag,
    timeZone: params.savedTimezone || auto.timeZone || browserTz,
    method: 'timezone',
    isManual: false,
  };
}

export async function detectCountryApproxViaIP(): Promise<CountryOption | null> {
  try {
    const res = await fetch('/api/geo/ip-country', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const matched = findCountryOption(data.code, data.country);
    if (!matched) return null;
    if (typeof data.timezone === 'string' && data.timezone.trim()) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: data.timezone }).format(new Date());
        return { ...matched, timeZone: data.timezone };
      } catch {
        // Ignore invalid timezone string from external response
      }
    }
    return matched;
  } catch {
    return null;
  }
}

export function isoCodeToFlagEmoji(isoCode?: string): string {
  const code = (isoCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'GL' || code === 'XX' || code === 'T1') {
    return '🌐';
  }
  try {
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  } catch {
    return '🌐';
  }
}

export function buildCountryOptionFromIso(code?: string, countryName?: string): CountryOption | null {
  const matched = findCountryOption(code, countryName);
  if (matched) return matched;
  const upperCode = (code || '').trim().toUpperCase();
  const cleanName = (countryName || '').trim();
  if (/^[A-Z]{2}$/.test(upperCode) && upperCode !== 'GL' && upperCode !== 'XX' && upperCode !== 'T1') {
    let displayName = cleanName;
    if (!displayName && typeof Intl !== 'undefined' && typeof (Intl as any).DisplayNames === 'function') {
      try {
        displayName = new (Intl as any).DisplayNames(['en'], { type: 'region' }).of(upperCode) || upperCode;
      } catch {
        displayName = upperCode;
      }
    }
    return {
      code: upperCode,
      country: displayName || upperCode,
      flag: isoCodeToFlagEmoji(upperCode),
      timeZone: getBrowserTimezone(),
    };
  }
  return null;
}

export interface GpsCountryDetectionResult {
  option: CountryOption | null;
  source?: 'gps';
  provider?: string;
  errorCode?: 'insecure_context' | 'unsupported' | 'permission_denied' | 'position_unavailable' | 'timeout' | 'reverse_geocode_failed' | 'network_error';
  error?: string;
}

export async function reverseGeocodeCountryFromCoords(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch
): Promise<{ option: CountryOption | null; provider?: string; errorCode?: GpsCountryDetectionResult['errorCode']; error?: string }> {
  try {
    const geoRes = await fetchImpl(
      `/api/geo/reverse-country?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      { cache: 'no-store' }
    );
    if (!geoRes.ok) {
      return {
        option: null,
        errorCode: 'reverse_geocode_failed',
        error: `Reverse geocoding failed (HTTP ${geoRes.status}). Please select your country manually below.`,
      };
    }
    const geoData = await geoRes.json();
    if (!geoData?.ok) {
      return {
        option: null,
        errorCode: 'reverse_geocode_failed',
        error: geoData?.error || 'Could not determine your country from GPS coordinates. Please choose manually.',
      };
    }
    const option = buildCountryOptionFromIso(geoData.code, geoData.country);
    if (!option) {
      return {
        option: null,
        errorCode: 'reverse_geocode_failed',
        error: 'GPS returned an unrecognized country code. Please select your country manually below.',
      };
    }
    return {
      option,
      provider: typeof geoData.source === 'string' ? geoData.source : 'gps-reverse-geocode',
    };
  } catch {
    return {
      option: null,
      errorCode: 'network_error',
      error: 'Network error while resolving GPS country. Check your connection or select your country manually.',
    };
  }
}

export async function detectCountryViaGPSDetailed(): Promise<GpsCountryDetectionResult> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      option: null,
      errorCode: 'insecure_context',
      error: 'GPS detection requires a secure HTTPS connection. Please select your country manually below.',
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      option: null,
      errorCode: 'unsupported',
      error: 'GPS geolocation is not supported in this browser. Please select your country manually below.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const reverseResult = await reverseGeocodeCountryFromCoords(lat, lng);
        if (reverseResult.option) {
          resolve({
            option: reverseResult.option,
            source: 'gps',
            provider: reverseResult.provider,
          });
          return;
        }
        resolve({
          option: null,
          errorCode: reverseResult.errorCode || 'reverse_geocode_failed',
          error:
            reverseResult.error ||
            'Could not determine your country from GPS coordinates. Please select your country manually.',
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            option: null,
            errorCode: 'permission_denied',
            error: 'Location permission denied. Please select your country manually from the list below.',
          });
          return;
        }
        if (err.code === err.TIMEOUT) {
          resolve({
            option: null,
            errorCode: 'timeout',
            error: 'GPS request timed out. Please try again or select your country manually.',
          });
          return;
        }
        resolve({
          option: null,
          errorCode: 'position_unavailable',
          error: 'GPS location is currently unavailable. Please select your country manually.',
        });
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
    );
  });
}

export async function detectCountryViaGPS(): Promise<CountryOption | null> {
  const result = await detectCountryViaGPSDetailed();
  return result.option;
}
