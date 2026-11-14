import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Download,
  Share2,
  CheckCircle2,
  ExternalLink,
  Apple,
  Sparkles,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop'>('android');
  const [installedSuccess, setInstalledSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setInstalledSuccess(true);
      setTimeout(() => {
        onClose();
        setInstalledSuccess(false);
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-lg w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <span>Install Aadesh AI Global Hub</span>
              </h3>
              <p className="text-xs text-gray-400">
                Native app experience on Android, iOS, and Desktop
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-white/10 px-4 sm:px-6 bg-[#090a0f]/60 gap-1 pt-2">
          <button
            onClick={() => setActiveTab('android')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span>🤖 Android & Play Store</span>
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'border-purple-400 text-purple-300'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span>🍎 iOS & App Store</span>
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span>💻 Desktop & Web</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Direct 1-Click Install Button if supported */}
          {isInstallable && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/50 via-indigo-900/40 to-purple-950/60 border border-purple-500/50 shadow-lg text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wide">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Instant 1-Click Install Available</span>
              </div>
              <p className="text-xs text-gray-200">
                Install directly to your device home screen with full offline caching and standalone window support.
              </p>
              <button
                type="button"
                onClick={handleInstallClick}
                className="purple-glow-btn text-white font-bold text-xs sm:text-sm py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 mx-auto cursor-pointer shadow-lg hover:scale-105 transition-transform"
              >
                <Download className="w-4 h-4" />
                <span>Install to Device Home Screen</span>
              </button>
            </div>
          )}

          {installedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Aadesh AI Global Hub installed successfully!</span>
            </div>
          )}

          {/* TAB 1: ANDROID & GOOGLE PLAY */}
          {activeTab === 'android' && (
            <div className="space-y-4 text-xs text-gray-300">
              <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>Method 1: Direct Android WebAPK Install (Recommended)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1">
                  <li>Open this app in <strong>Google Chrome</strong> or <strong>Samsung Internet</strong> on Android.</li>
                  <li>Tap the <strong>three dots menu (⋮)</strong> in the upper right.</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.</li>
                  <li>The app will install as a standalone native app icon with fast launch speeds and full screen UI.</li>
                </ol>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Google Play Store Deployment Ready</span>
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono">
                    TWA Compatible
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Aadesh AI Global Hub includes a fully compliant <code className="text-purple-300">manifest.json</code>, service worker (<code className="text-purple-300">sw.js</code>), and high-resolution icons. You can package this web app as a Trusted Web Activity (TWA) using <strong>PWABuilder.com</strong> or Google's <strong>Bubblewrap CLI</strong> to publish directly to the <strong>Google Play Console</strong>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: IOS & APPLE APP STORE */}
          {activeTab === 'ios' && (
            <div className="space-y-4 text-xs text-gray-300">
              <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2.5">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Apple className="w-4 h-4 text-purple-300" />
                  <span>Install on iPhone & iPad (Safari)</span>
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-gray-300 pl-1 leading-relaxed">
                  <li>Open this app in <strong>Safari</strong> on your iPhone or iPad.</li>
                  <li>Tap the <strong>Share</strong> button (box with an upward arrow <Share2 className="w-3.5 h-3.5 inline mx-1 text-purple-400" />) in the bottom toolbar.</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top-right corner.</li>
                  <li>The <strong>Aadesh AI</strong> icon will appear on your home screen and run full-screen without the Safari address bar!</li>
                </ol>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-purple-500/30 space-y-2">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Apple App Store Packaging</span>
                </h4>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  The PWA manifest and assets are pre-configured with Apple web app meta tags. To distribute on the Apple App Store, package with <strong>Capacitor</strong> or <strong>PWABuilder iOS</strong> and sign via Xcode.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: DESKTOP & WEB */}
          {activeTab === 'desktop' && (
            <div className="space-y-4 text-xs text-gray-300">
              <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-[#232738] space-y-2">
                <h4 className="font-bold text-white text-sm">Desktop App Installation</h4>
                <p className="leading-relaxed text-gray-400">
                  On Chrome, Edge, or Brave on Mac, Windows, or Chromebook, look for the <strong>Install</strong> icon (computer screen with a down arrow) on the right side of the URL bar, or click <strong>Install to Device Home Screen</strong> above.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#090a0f] flex items-center justify-between text-xs text-gray-400">
          <span>Aadesh AI Global Hub • Cross-Platform Ready</span>
          <button
            onClick={onClose}
            className="purple-glow-btn text-white font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
