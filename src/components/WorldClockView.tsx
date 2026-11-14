import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Globe2,
  Search,
  Pin,
  Sun,
  Moon,
  Copy,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import {
  ALL_COUNTRY_CLOCKS,
  CountryClockEntry,
  DEFAULT_PINNED_COUNTRY_CODES,
  WorldRegion,
  formatCountryTime,
} from '../data/worldClocks';

interface WorldClockViewProps {
  onAskAboutCountry?: (country: CountryClockEntry, formattedTime: string) => void;
}

const PINNED_STORAGE_KEY = 'aadesh_world_clock_pinned';
const REGIONS: WorldRegion[] = [
  'All',
  'Asia',
  'Middle East',
  'Europe',
  'Americas',
  'Africa',
  'Oceania',
];

function loadPinnedCodes(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c): c is string => typeof c === 'string');
      }
    }
  } catch {}
  return DEFAULT_PINNED_COUNTRY_CODES;
}

export const WorldClockView: React.FC<WorldClockViewProps> = ({ onAskAboutCountry }) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<WorldRegion>('All');
  const [use24Hour, setUse24Hour] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [pinnedCodes, setPinnedCodes] = useState<string[]>(loadPinnedCodes);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const togglePin = (code: string) => {
    setPinnedCodes((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [code, ...prev];
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const localTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );
  const localFormatted = useMemo(
    () => formatCountryTime(now, localTimeZone, use24Hour),
    [now, localTimeZone, use24Hour]
  );
  const utcFormatted = useMemo(
    () => formatCountryTime(now, 'UTC', use24Hour),
    [now, use24Hour]
  );

  // Merge extra IANA browser timezones when searching so literally any territory/city zone is reachable
  const extraIanaEntries = useMemo<CountryClockEntry[]>(() => {
    try {
      const supportedZones: string[] | undefined = (Intl as any).supportedValuesOf?.('timeZone');
      if (!Array.isArray(supportedZones)) return [];
      const knownZones = new Set(ALL_COUNTRY_CLOCKS.map((c) => c.timeZone));
      return supportedZones
        .filter((tz) => !knownZones.has(tz) && tz.includes('/'))
        .map((tz) => {
          const [area, ...rest] = tz.split('/');
          const cityLabel = rest.join(' / ').replace(/_/g, ' ');
          const mappedRegion: Exclude<WorldRegion, 'All'> =
            area === 'Asia'
              ? 'Asia'
              : area === 'Europe'
              ? 'Europe'
              : area === 'America'
              ? 'Americas'
              : area === 'Africa'
              ? 'Africa'
              : area === 'Australia' || area === 'Pacific'
              ? 'Oceania'
              : 'Europe';
          return {
            code: tz,
            country: cityLabel,
            city: tz,
            region: mappedRegion,
            timeZone: tz,
            flag: '🕒',
          };
        });
    } catch {
      return [];
    }
  }, []);

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const baseList = q
      ? [...ALL_COUNTRY_CLOCKS, ...extraIanaEntries]
      : ALL_COUNTRY_CLOCKS;

    const matching = baseList.filter((entry) => {
      if (pinnedOnly && !pinnedCodes.includes(entry.code)) return false;
      if (selectedRegion !== 'All' && entry.region !== selectedRegion) return false;
      if (!q) return true;

      const offset = formatCountryTime(now, entry.timeZone, use24Hour).utcOffsetLabel.toLowerCase();
      return (
        entry.country.toLowerCase().includes(q) ||
        entry.city.toLowerCase().includes(q) ||
        entry.code.toLowerCase().includes(q) ||
        entry.region.toLowerCase().includes(q) ||
        entry.timeZone.toLowerCase().includes(q) ||
        offset.includes(q)
      );
    });

    return matching.sort((a, b) => {
      const aPinned = pinnedCodes.includes(a.code) ? 0 : 1;
      const bPinned = pinnedCodes.includes(b.code) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return a.country.localeCompare(b.country);
    });
  }, [searchQuery, selectedRegion, pinnedOnly, pinnedCodes, extraIanaEntries, now, use24Hour]);

  const handleCopyTime = (entry: CountryClockEntry, formattedTime: string, dateStr: string, offset: string) => {
    const text = `${entry.flag} ${entry.country} (${entry.city}): ${formattedTime} • ${dateStr} (${offset})`;
    navigator.clipboard.writeText(text);
    setCopiedCode(entry.code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-10 space-y-5">
      {/* Live Hero Summary Banner */}
      <div className="glass-card rounded-3xl p-4 sm:p-6 border border-purple-500/35 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[11px] font-bold text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE GLOBAL TIME • {ALL_COUNTRY_CLOCKS.length} COUNTRIES</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Globe2 className="w-6 h-6 text-purple-400 shrink-0" />
              <span>Real-Time World Clock</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-400">
              Live second-by-second local time, date, day/night status, and UTC offsets across all countries worldwide.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 shrink-0">
            <div className="bg-[#090a0f]/90 border border-purple-500/35 rounded-2xl px-3.5 py-2.5 min-w-[148px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-purple-400" />
                <span>Your Local Time</span>
              </div>
              <div className="text-base sm:text-lg font-black text-white font-mono tabular-nums mt-0.5">
                {localFormatted.timeString}
              </div>
              <div className="text-[10px] text-gray-400 truncate max-w-[165px]">
                {localFormatted.weekday}, {localFormatted.dateString} · {localFormatted.utcOffsetLabel}
              </div>
            </div>

            <div className="bg-[#090a0f]/90 border border-indigo-500/35 rounded-2xl px-3.5 py-2.5 min-w-[148px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                Coordinated Universal (UTC)
              </div>
              <div className="text-base sm:text-lg font-black text-white font-mono tabular-nums mt-0.5">
                {utcFormatted.timeString}
              </div>
              <div className="text-[10px] text-gray-400">
                {utcFormatted.weekday}, {utcFormatted.dateString} · UTC+0
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-white/10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any country, capital, timezone, or UTC offset (e.g. Nepal, Tokyo, UTC+5:45)..."
              aria-label="Search real-time clock across all countries"
              className="w-full bg-[#090a0f]/90 border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-gray-100 placeholder-gray-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear country search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPinnedOnly((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                pinnedOnly
                  ? 'bg-amber-950/60 border-amber-400/60 text-amber-200'
                  : 'bg-[#131520] border-[#232738] text-gray-300 hover:text-white'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>Pinned ({pinnedCodes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setUse24Hour((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold font-mono transition-all cursor-pointer ${
                use24Hour
                  ? 'bg-purple-600/40 border-purple-400 text-white'
                  : 'bg-[#131520] border-[#232738] text-purple-300 hover:text-white'
              }`}
              title="Toggle 12-hour / 24-hour clock format"
            >
              {use24Hour ? '24H' : '12H'}
            </button>
          </div>
        </div>

        {/* Region Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              onClick={() => setSelectedRegion(region)}
              className={`px-3 py-1 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                selectedRegion === region
                  ? 'bg-purple-600/45 border-purple-400 text-white shadow-sm'
                  : 'bg-[#090a0f]/80 border-[#232738] text-gray-400 hover:text-white'
              }`}
            >
              {region}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap pl-2">
            Showing {filteredCountries.length}{' '}
            {filteredCountries.length === 1 ? 'country' : 'countries'}
          </span>
        </div>
      </div>

      {/* Country Clocks Grid */}
      {filteredCountries.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center border border-purple-500/25 space-y-2">
          <Globe2 className="w-8 h-8 text-purple-400 mx-auto" />
          <p className="text-sm font-bold text-white">No countries or timezones matched "{searchQuery}"</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedRegion('All');
              setPinnedOnly(false);
            }}
            className="text-xs text-purple-300 hover:text-white underline cursor-pointer"
          >
            Reset world clock filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredCountries.map((entry) => {
            const info = formatCountryTime(now, entry.timeZone, use24Hour);
            const isPinned = pinnedCodes.includes(entry.code);
            const isCopied = copiedCode === entry.code;

            return (
              <div
                key={entry.code}
                className={`glass-card glass-card-hover rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                  isPinned
                    ? 'border-amber-400/45 shadow-[0_0_18px_rgba(245,158,11,0.12)]'
                    : 'border-purple-500/25'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl leading-none shrink-0" aria-hidden="true">
                      {entry.flag}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{entry.country}</h3>
                      <p className="text-[11px] text-gray-400 truncate">
                        {entry.city} • {entry.region}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      title={info.isDaytime ? 'Daytime' : 'Nighttime'}
                      className={`p-1 rounded-lg border text-[10px] ${
                        info.isDaytime
                          ? 'bg-amber-950/50 border-amber-500/35 text-amber-300'
                          : 'bg-indigo-950/60 border-indigo-500/35 text-indigo-300'
                      }`}
                    >
                      {info.isDaytime ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </span>

                    <button
                      type="button"
                      onClick={() => togglePin(entry.code)}
                      title={isPinned ? 'Unpin country' : 'Pin country to top'}
                      aria-label={isPinned ? `Unpin ${entry.country}` : `Pin ${entry.country}`}
                      className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                        isPinned
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                          : 'bg-[#090a0f]/70 border-white/10 text-gray-400 hover:text-amber-300'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Live Ticking Digital Readout */}
                <div className="flex items-baseline justify-between gap-2 bg-[#090a0f]/80 rounded-xl px-3 py-2.5 border border-white/5">
                  <div>
                    <div className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums tracking-tight">
                      {info.timeString}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {info.weekday}, {info.dateString} ·{' '}
                      <span
                        className={
                          info.relativeDayLabel === 'Tomorrow'
                            ? 'text-emerald-300 font-semibold'
                            : info.relativeDayLabel === 'Yesterday'
                            ? 'text-amber-300 font-semibold'
                            : 'text-gray-300'
                        }
                      >
                        {info.relativeDayLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 rounded-lg bg-purple-950/70 border border-purple-500/35 text-[10px] font-mono font-bold text-purple-200">
                      {info.utcOffsetLabel}
                    </span>
                    <div className="text-[10px] text-gray-400 mt-1 font-medium">
                      {info.relativeDiffLabel}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-gray-500 font-mono truncate">{entry.timeZone}</span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyTime(
                          entry,
                          info.timeString,
                          info.dateString,
                          info.utcOffsetLabel
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-[#131520] hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {onAskAboutCountry && (
                      <button
                        type="button"
                        onClick={() => onAskAboutCountry(entry, `${info.timeString} (${info.utcOffsetLabel})`)}
                        className="px-2 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-800/70 border border-purple-500/40 text-purple-200 flex items-center gap-1 cursor-pointer transition-colors"
                        title={`Ask Aadesh AI about ${entry.country}`}
                      >
                        <Sparkles className="w-3 h-3 text-purple-300" />
                        <span>Ask AI</span>
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
