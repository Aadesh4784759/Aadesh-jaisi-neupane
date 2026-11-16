import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  MessageSquare,
  BarChart3,
  ArrowLeftRight,
  Mic,
  LayoutGrid,
  Settings,
} from 'lucide-react';

export type BottomNavTab = 'chat' | 'analysis' | 'transfer' | 'voice' | 'more' | 'settings';

interface NavigationDockProps {
  activeTab: BottomNavTab;
  onSelectTab: (tab: BottomNavTab) => void;
  isKeyboardOpen?: boolean;
}

const NAV_ITEMS: Array<{
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

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  isKeyboardOpen = false,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (isKeyboardOpen) return null;

  return (
    <div className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] inset-x-0 z-40 px-2 sm:px-3 pointer-events-none flex justify-center">
      <nav
        aria-label="Primary Bottom Navigation"
        className="pointer-events-auto w-full max-w-xl glass-nav rounded-[1.75rem] p-1 sm:p-1.5 border border-purple-400/30 shadow-[0_14px_40px_rgba(7,4,18,0.72),0_0_24px_rgba(139,92,246,0.22)] grid grid-cols-6 gap-0.5 sm:gap-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-h-[48px] py-1.5 px-0.5 sm:px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                isActive
                  ? 'text-white'
                  : 'text-purple-200/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'bottom-nav-active-pill'}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/80 via-violet-600/75 to-fuchsia-600/65 border border-purple-300/45 shadow-[0_4px_18px_rgba(139,92,246,0.45)]"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={`relative z-10 w-[17px] h-[17px] sm:w-[19px] sm:h-[19px] transition-transform duration-200 ${
                  isActive ? 'text-white scale-105' : 'text-purple-300/75'
                }`}
              />
              <span className="relative z-10 text-[9.5px] xs:text-[10px] sm:text-[11px] font-semibold tracking-tight whitespace-nowrap leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
