import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  MessageSquare,
  BarChart3,
  ArrowLeftRight,
  Mic,
  LayoutGrid,
  Settings,
  ShieldCheck,
} from 'lucide-react';

export type BottomNavTab =
  | 'chat'
  | 'analysis'
  | 'transfer'
  | 'voice'
  | 'more'
  | 'settings'
  | 'admin';

interface NavigationDockProps {
  activeTab: BottomNavTab | 'admin';
  onSelectTab: (tab: BottomNavTab) => void;
  isKeyboardOpen?: boolean;
  isOwner?: boolean;
}

const BASE_NAV_ITEMS: Array<{
  id: BottomNavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'more', label: 'More', icon: LayoutGrid },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const OWNER_NAV_ITEM: {
  id: BottomNavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} = {
  id: 'admin',
  label: 'Owner',
  icon: ShieldCheck,
};

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  isKeyboardOpen = false,
  isOwner = false,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (isKeyboardOpen) return null;

  const navItems = isOwner ? [...BASE_NAV_ITEMS, OWNER_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] inset-x-0 z-40 px-2 sm:px-3 pointer-events-none flex justify-center">
      <nav
        aria-label="Primary Bottom Navigation"
        className={`pointer-events-auto w-full ${
          isOwner ? 'max-w-2xl grid-cols-7' : 'max-w-xl grid-cols-6'
        } glass-nav rounded-[1.75rem] p-1 sm:p-1.5 border border-purple-400/30 shadow-[0_14px_40px_rgba(7,4,18,0.72),0_0_24px_rgba(139,92,246,0.22)] grid gap-0.5 sm:gap-1`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isOwnerItem = item.id === 'admin';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-h-[48px] py-1.5 px-0.5 sm:px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                isActive
                  ? isOwnerItem
                    ? 'text-amber-200'
                    : 'text-white'
                  : isOwnerItem
                  ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-400/10'
                  : 'text-purple-200/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'bottom-nav-active-pill'}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={`absolute inset-0 rounded-2xl ${
                    isOwnerItem
                      ? 'bg-gradient-to-br from-amber-600/85 via-purple-600/80 to-violet-600/70 border border-amber-300/60 shadow-[0_4px_18px_rgba(245,158,11,0.5)]'
                      : 'bg-gradient-to-br from-purple-600/80 via-violet-600/75 to-fuchsia-600/65 border border-purple-300/45 shadow-[0_4px_18px_rgba(139,92,246,0.45)]'
                  }`}
                  aria-hidden="true"
                />
              )}
              <Icon
                className={`relative z-10 w-[17px] h-[17px] sm:w-[19px] sm:h-[19px] transition-transform duration-200 ${
                  isActive
                    ? isOwnerItem
                      ? 'text-amber-300 scale-105'
                      : 'text-white scale-105'
                    : isOwnerItem
                    ? 'text-amber-400/80'
                    : 'text-purple-300/75'
                }`}
              />
              <span
                className={`relative z-10 text-[9px] xs:text-[9.5px] sm:text-[11px] font-semibold tracking-tight whitespace-nowrap leading-none ${
                  isOwnerItem && !isActive ? 'text-amber-300/80' : ''
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
