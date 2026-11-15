import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { SplashScreenProps } from './SplashScreenAnimated';

const LazySplashScreenAnimated = lazy(() => import('./SplashScreenAnimated'));

const SplashFallbackShell: React.FC<{ isLightTheme: boolean }> = ({ isLightTheme }) => (
  <div
    className={`fixed inset-0 z-[100] min-h-[100dvh] safe-top safe-bottom flex flex-col items-center justify-center px-5 py-8 select-none ${
      isLightTheme
        ? 'bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f8fafc_52%,_#ede9fe_100%)] text-slate-900'
        : 'bg-[radial-gradient(ellipse_at_top,_#1b1442_0%,_#090b14_55%,_#05060b_100%)] text-white'
    }`}
    role="status"
    aria-label="Aadesh AI Global Hub Loading"
  >
    <div className="mb-6 rounded-[28px] shadow-[0_14px_45px_rgba(99,102,241,0.4)]">
      <img
        src="/icon.svg"
        alt="Aadesh AI Global Hub Official Logo"
        loading="eager"
        decoding="async"
        className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 object-contain"
      />
    </div>
    <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">
      Aadesh{' '}
      <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
        AI
      </span>
    </h1>
    <p
      className={`mt-1.5 text-xs sm:text-sm font-extrabold tracking-widest ${
        isLightTheme ? 'text-indigo-700' : 'text-cyan-300'
      }`}
    >
      GLOBAL HUB
    </p>
  </div>
);

export const SplashScreen: React.FC<SplashScreenProps> = ({ isAppReady, theme, onComplete }) => {
  const [shouldRender] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('aadesh_splash_shown_v1');
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!shouldRender) {
      onComplete?.();
    }
  }, [shouldRender, onComplete]);

  if (!shouldRender) {
    return null;
  }

  const isLightTheme =
    theme === 'light' ||
    (theme !== 'dark' &&
      typeof document !== 'undefined' &&
      document.body.classList.contains('light-theme'));

  return (
    <Suspense fallback={<SplashFallbackShell isLightTheme={isLightTheme} />}>
      <LazySplashScreenAnimated
        isAppReady={isAppReady}
        theme={theme}
        onComplete={onComplete}
      />
    </Suspense>
  );
};
