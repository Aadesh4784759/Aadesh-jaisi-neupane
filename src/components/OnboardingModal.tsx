import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, User, Tag, Calendar, MapPin, Check, Search, Globe } from 'lucide-react';
import { UserProfile } from '../types';
import {
  COUNTRY_OPTIONS,
  detectCountryApproxViaIP,
  detectUserCountry,
} from '../utils/country';
import { BrandLogo } from './BrandLogo';

interface OnboardingModalProps {
  user: UserProfile;
  onComplete: (data: {
    name: string;
    nickname: string;
    age?: number;
    country: string;
    countryFlag: string;
    isManualCountry: boolean;
  }) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ user, onComplete }) => {
  const autoDetected = useMemo(() => detectUserCountry(), []);
  const initialCountry =
    user.country && user.country !== 'Global' ? user.country : autoDetected.country;
  const initialFlag =
    user.country && user.country !== 'Global'
      ? user.countryFlag || autoDetected.flag
      : autoDetected.flag;

  const [fullName, setFullName] = useState(
    user.name && user.name !== 'Member' && user.name !== 'User' ? user.name : ''
  );
  const [nickname, setNickname] = useState(
    user.nickname ||
      (user.name && user.name !== 'Member' && user.name !== 'User'
        ? user.name.split(/\s+/)[0]
        : '')
  );
  const [ageInput, setAgeInput] = useState(user.age ? String(user.age) : '');
  const [country, setCountry] = useState(initialCountry);
  const [countryFlag, setCountryFlag] = useState(initialFlag);
  const [manualOverride, setManualOverride] = useState(Boolean(user.isManualCountry));
  const [countrySearch, setCountrySearch] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) => c.country.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countrySearch]);

  const handleAutoDetect = async () => {
    setDetecting(true);
    try {
      const localMatch = detectUserCountry();
      if (localMatch.country !== 'Global') {
        setCountry(localMatch.country);
        setCountryFlag(localMatch.flag);
        setManualOverride(false);
        return;
      }
      const ipMatch = await detectCountryApproxViaIP();
      if (ipMatch) {
        setCountry(ipMatch.country);
        setCountryFlag(ipMatch.flag);
        setManualOverride(false);
      }
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim();
    if (!cleanName) {
      setError('Please enter your full name to personalize your workspace.');
      return;
    }

    let parsedAge: number | undefined = undefined;
    if (ageInput.trim()) {
      const num = Number(ageInput.trim());
      if (!Number.isFinite(num) || num < 1 || num > 130) {
        setError('Please enter a valid age between 1 and 130, or leave it blank.');
        return;
      }
      parsedAge = Math.floor(num);
    }

    const cleanNick = nickname.trim() || cleanName.split(/\s+/)[0] || cleanName;
    onComplete({
      name: cleanName,
      nickname: cleanNick,
      age: parsedAge,
      country: country || 'Global',
      countryFlag: countryFlag || '🌐',
      isManualCountry: manualOverride,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5 bg-[#05030d]/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-lg v2-neu-card rounded-3xl p-5 sm:p-7 border border-sky-400/35 shadow-[0_24px_64px_rgba(6,3,22,0.85)] space-y-5 my-auto"
      >
        <div className="flex items-center gap-3">
          <BrandLogo size="md" animated={true} />
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-sky-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Welcome to Aadesh AI</span>
            </div>
            <h2 id="onboarding-title" className="text-xl font-black text-white">
              Complete Your Profile Setup
            </h2>
          </div>
        </div>

        <p className="text-xs text-purple-200/80 leading-relaxed">
          Tell us a bit about yourself so Aadesh AI greets you personally and matches your region.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/75 border border-rose-500/45 text-xs text-rose-200 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-purple-200 font-semibold flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-400" />
                <span>Full Name *</span>
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setError(null);
                }}
                placeholder="Your full name"
                required
                className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 focus:border-sky-400 text-white outline-none"
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="text-purple-200 font-semibold flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-400" />
                <span>Nickname (for Greetings)</span>
              </span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g., Alex"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 focus:border-sky-400 text-white outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-purple-200 font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Age (Optional)</span>
              </span>
              <input
                type="number"
                min={1}
                max={130}
                value={ageInput}
                onChange={(e) => {
                  setAgeInput(e.target.value);
                  setError(null);
                }}
                placeholder="Optional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 focus:border-sky-400 text-white outline-none"
              />
            </label>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-purple-200 font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Selected Country</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleAutoDetect()}
                  disabled={detecting}
                  className="text-[11px] text-sky-300 hover:text-white underline cursor-pointer"
                >
                  {detecting ? 'Detecting...' : 'Auto-Detect'}
                </button>
              </div>
              <div className="min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-sky-400/35 text-white flex items-center gap-2 font-semibold">
                <span className="text-base leading-none">{countryFlag}</span>
                <span className="truncate">{country}</span>
                <span className="ml-auto text-[10px] text-sky-300 uppercase">
                  {manualOverride ? 'Manual' : 'Auto'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search country or code (e.g., India, Nepal, US, JP)..."
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl v2-neu-inset border border-purple-400/25 focus:border-sky-400 text-white outline-none"
              />
            </div>

            <select
              value={country}
              onChange={(e) => {
                const chosen = COUNTRY_OPTIONS.find((c) => c.country === e.target.value);
                if (chosen) {
                  setCountry(chosen.country);
                  setCountryFlag(chosen.flag);
                  setManualOverride(true);
                } else {
                  setCountry('Global');
                  setCountryFlag('🌐');
                  setManualOverride(true);
                }
              }}
              size={4}
              aria-label="Choose your country"
              className="w-full px-2 py-1.5 rounded-xl bg-[#140e2a] border border-purple-400/30 focus:border-sky-400 text-white outline-none font-medium cursor-pointer"
            >
              <option value="Global">🌐 Global (International)</option>
              {filteredCountries.map((c) => (
                <option key={c.code} value={c.country}>
                  {c.flag} {c.country} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full min-h-[46px] px-5 py-2.5 rounded-2xl electric-purple-btn text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Save &amp; Enter Aadesh AI</span>
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-purple-200/65">
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>You can change any of these details anytime in Profile Settings.</span>
        </div>
      </motion.div>
    </div>
  );
};
