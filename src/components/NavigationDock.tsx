import React from 'react';
import {
  MessageSquareText,
  Radio,
  Languages,
  MapPin,
  History,
  BarChart3,
  Settings2,
  UserCircle2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { UI_TRANSLATIONS } from '../data/languages';

interface NavigationDockProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  uiLanguage: string;
  isOwnerAdmin?: boolean;
  onOpenInstall?: () => void;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  uiLanguage,
  isOwnerAdmin = false,
  onOpenInstall,
}) => {
  const t = UI_TRANSLATIONS[uiLanguage] || UI_TRANSLATIONS.en;

  // 8 Core Navigation Items (+ Owner-only Admin item when verified)
  const navItems = [
    { id: 'chat', label: t.chatTab || 'Chat', icon: MessageSquareText },
    { id: 'voice', label: t.voiceTab || 'Voice', icon: Radio },
    { id: 'interpret', label: t.interpreterTab || 'Translate', icon: Languages },
    { id: 'gallery', label: t.galleryTab || 'Gallery', icon: MapPin },
    { id: 'voiceHistory', label: t.historyTab || 'History', icon: History },
    { id: 'analytics', label: t.analyticsTab || 'Analytics', icon: BarChart3 },
    { id: 'settings', label: t.settingsTab || 'Settings', icon: Settings2 },
    { id: 'profile', label: t.profileTab || 'Profile', icon: UserCircle2 },
  ];

  if (isOwnerAdmin) {
    navItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });
  }

  return (
    <>
      {/* DESKTOP / CHROMEBOOK TOP NAVIGATION BAR */}
      <nav
        aria-label="Primary Desktop Navigation"
        className="hidden lg:flex sticky top-[61px] z-30 w-full glass-nav border-b border-white/10 px-6 py-2 items-center justify-between"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isAdminItem = item.id === 'admin';
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? isAdminItem
                      ? 'bg-amber-950/70 text-amber-200 border border-amber-500/50 shadow-md'
                      : 'bg-purple-900/45 text-purple-200 border border-purple-500/50 shadow-md shadow-purple-900/30'
                    : isAdminItem
                      ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-950/30 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive
                      ? isAdminItem
                        ? 'text-amber-400'
                        : 'text-purple-400'
                      : 'text-gray-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-gray-400 hidden xl:inline">
            Created by <strong className="text-purple-300">Aadesh Jaisi</strong>
          </span>
          {onOpenInstall && (
            <button
              onClick={onOpenInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 transition-all cursor-pointer"
              title="Install Aadesh AI as Progressive Web App"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Install App</span>
            </button>
          )}
        </div>
      </nav>

      {/* MOBILE / TABLET FLOATING BOTTOM DOCK */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 glass-nav rounded-2xl px-1.5 sm:px-2.5 py-1.5 border border-purple-500/35 shadow-2xl flex items-center gap-0.5 sm:gap-1 max-w-[96vw] overflow-x-auto scrollbar-none"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isAdminItem = item.id === 'admin';
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer shrink-0 ${
                isActive
                  ? isAdminItem
                    ? 'bg-amber-950/70 text-amber-200 border border-amber-500/50 shadow-md'
                    : 'bg-purple-900/45 text-purple-200 border border-purple-500/50 shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isActive ? (isAdminItem ? 'text-amber-400' : 'text-purple-400') : 'text-gray-400'
                }`}
              />
              <span className={isActive ? 'inline' : 'hidden sm:inline'}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
