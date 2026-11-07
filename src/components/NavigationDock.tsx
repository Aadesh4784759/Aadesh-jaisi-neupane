import React from 'react';
import { MessageSquareText, Languages, MapPin, BarChart3, Settings2 } from 'lucide-react';
import { UI_TRANSLATIONS } from '../data/languages';

interface NavigationDockProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  uiLanguage: string;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeTab,
  onSelectTab,
  uiLanguage,
}) => {
  const t = UI_TRANSLATIONS[uiLanguage] || UI_TRANSLATIONS.en;

  const navItems = [
    { id: 'chat', label: t.chatTab || 'Chat & Vision', icon: MessageSquareText },
    { id: 'interpret', label: t.interpreterTab || 'Interpreter', icon: Languages },
    { id: 'gallery', label: t.galleryTab || 'Geotags', icon: MapPin },
    { id: 'analytics', label: t.analyticsTab || 'Analytics', icon: BarChart3 },
    { id: 'settings', label: t.settingsTab || 'Settings', icon: Settings2 },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-nav rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 border border-purple-500/30 shadow-2xl flex items-center space-x-1 sm:space-x-2 max-w-[95vw]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-purple-900/40 text-purple-300 border border-purple-500/50 shadow-md shadow-purple-900/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-purple-400 animate-pulse' : 'text-gray-400'}`} />
            <span className={`${isActive ? 'inline' : 'hidden md:inline'}`}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
