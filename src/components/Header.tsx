import React from 'react';
import { Flame } from 'lucide-react';
import { UserProfile } from '../types';
import { generateThemeTokensFromColor } from '../utils/avatarTheme';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  user: UserProfile;
  onLogoClick: () => void;
  onProfileClick: () => void;
  onStreakClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogoClick,
  onProfileClick,
  onStreakClick,
}) => {
  const avatarTokens = generateThemeTokensFromColor(user.avatarColor);
  const displayName = user.name?.trim() || 'User';
  const actualUsername = (user.username?.trim() || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user').replace(/^@/, '');
  const shortUid = user.id ? user.id.slice(0, 8) : 'guest';
  const flagEmoji = user.countryFlag || '🌐';
  const countryName = user.country || 'Global';
  const streakCount = Math.max(1, user.streakDays || 1);

  return (
    <header className="sticky top-0 z-40 w-full safe-top glass-nav border-b border-purple-400/20 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 shadow-[0_8px_32px_rgba(8,5,20,0.45)] max-w-full shrink-0">
      {/* LEFT: Aadesh AI Logo & Application Name */}
      <button
        type="button"
        onClick={onLogoClick}
        className="flex items-center gap-2.5 min-w-0 shrink cursor-pointer group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-xl pr-1"
        aria-label="Aadesh AI Home"
      >
        <BrandLogo
          size="md"
          className="transition-transform duration-200 group-hover:scale-105 shrink-0"
        />
        <span className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap leading-none">
          Aadesh <span className="text-gradient">AI</span>
        </span>
      </button>

      {/* RIGHT: Separate Daily Streak Counter + Clickable Profile (Flag, Actual Username, User ID, Profile Photo) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
        {/* Daily Streak Counter (Displayed Separately, No Profile Photo Inside) */}
        <button
          type="button"
          onClick={onStreakClick || onProfileClick}
          title={`${streakCount}-Day Streak`}
          aria-label={`Daily streak: ${streakCount} days`}
          className="min-h-[42px] px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-purple-950/60 hover:bg-purple-900/70 border border-amber-400/35 flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-amber-300 shadow-[0_0_16px_rgba(139,92,246,0.2)] transition-all cursor-pointer shrink-0 tabular-nums whitespace-nowrap"
        >
          <span aria-hidden="true">🔥</span>
          <Flame className="w-3.5 h-3.5 text-amber-400 hidden sm:inline shrink-0" />
          <span>{streakCount}</span>
        </button>

        {/* Clickable User Profile Block (Opens Profile Settings) */}
        <button
          type="button"
          onClick={onProfileClick}
          title={`${displayName} (@${actualUsername}) • ${countryName} • UID: ${user.id}`}
          aria-label={`Open profile settings for @${actualUsername}`}
          className="min-h-[42px] flex items-center gap-2 sm:gap-2.5 pl-2.5 pr-1.5 sm:pl-3 sm:pr-2 py-1 rounded-2xl glass-card hover:border-purple-400/70 transition-all cursor-pointer group min-w-0 max-w-[215px] sm:max-w-[310px]"
        >
          {/* Country Flag, Actual Username & Unique User ID */}
          <div className="flex flex-col items-end text-right min-w-0">
            <div className="flex items-center gap-1.5 max-w-full">
              <span
                className="text-sm leading-none shrink-0"
                title={countryName}
                aria-label={countryName}
              >
                {flagEmoji}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-200 transition-colors truncate max-w-[100px] sm:max-w-[165px]">
                @{actualUsername}
              </span>
            </div>
            <span className="text-[10px] font-mono tabular-nums text-purple-300/85 truncate max-w-[125px] sm:max-w-[190px] leading-tight">
              ID: {shortUid}
            </span>
          </div>

          {/* Clickable Profile Photo */}
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full p-[1.5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${avatarTokens.primaryHex}, ${avatarTokens.lightHex})`,
              boxShadow: `0 0 14px rgba(${avatarTokens.primaryRgb}, 0.45)`,
            }}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={actualUsername}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-full bg-[#120e24]"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-black"
                style={{
                  background: `linear-gradient(135deg, ${avatarTokens.deepHex}, #16102b)`,
                }}
              >
                {(actualUsername || displayName).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
