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
  onLogoClick?: () => void;
  isKeyboardOpen?: boolean;
  isOwner?: boolean;
}

const BASE_NAV_ITEMS: Array<{
  id: BottomNavTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'chat', label: 'Chat', description: 'Multimodal AI Chat', icon: MessageSquare },
  { id: 'analysis', label: 'Analysis', description: 'Deep Solver & Metrics', icon: BarChart3 },
  { id: 'transfer', label: 'Transfer', description: 'Translate & Share', icon: ArrowLeftRight },
  { id: 'voice', label: 'Voice', description: 'Live Voice Studio', icon: Mic },
  { id: 'more', label: 'More', description: 'Apps, Memory & Hub', icon: LayoutGrid },
  { id: 'settings', label: 'Setting', description: 'Control Center', icon: Settings },
];

const OWNER_NAV_ITEM: {
  id: BottomNavTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
} = {
  id: 'admin',
  label: 'Owner',
  description: 'Platform Console',
  icon: ShieldCheck,
};

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  onLogoClick,
  isKeyboardOpen = false,
  isOwner = false,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const navItems = isOwner ? [...BASE_NAV_ITEMS, OWNER_NAV_ITEM] : BASE_NAV_ITEMS;

  if (isKeyboardOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-[max(0.55rem,env(safe-area-inset-bottom))] inset-x-0 z-40 px-2 sm:px-4 pointer-events-none flex justify-center">
      <nav
        aria-label="Primary Bottom Navigation"
        className={`pointer-events-auto w-full ${
          isOwner ? 'max-w-3xl grid-cols-7' : 'max-w-2xl grid-cols-6'
        } glass-nav rounded-[1.75rem] p-1 sm:p-1.5 border border-purple-400/35 shadow-[0_14px_40px_rgba(7,4,18,0.75),0_0_24px_rgba(59,130,246,0.22)] grid gap-0.5 sm:gap-1.5`}
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
              onDoubleClick={item.id === 'chat' ? onLogoClick : undefined}
              aria-current={isActive ? 'page' : undefined}
              title={item.description}
              className={`relative min-h-[48px] sm:min-h-[52px] py-1.5 px-0.5 sm:px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                isActive
                  ? isOwnerItem
                    ? 'text-amber-200'
                    : 'text-white'
                  : isOwnerItem
                  ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-400/10'
                  : 'text-purple-200/75 hover:text-white hover:bg-white/5'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'bottom-nav-active-pill'}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={`absolute inset-0 rounded-2xl ${
                    isOwnerItem
                      ? 'bg-gradient-to-br from-amber-600/85 via-purple-600/80 to-violet-600/70 border border-amber-300/60 shadow-[0_4px_18px_rgba(245,158,11,0.5)]'
                      : 'bg-gradient-to-br from-indigo-600/85 via-purple-600/80 to-sky-500/75 border border-sky-300/45 shadow-[0_4px_18px_rgba(59,130,246,0.45)]'
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
