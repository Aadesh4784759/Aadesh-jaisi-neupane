import React, { lazy, Suspense } from 'react';
import type { SplashScreenProps } from './SplashScreenAnimated';
import { BrandLogo } from './BrandLogo';

const LazySplashScreenAnimated = lazy(() => import('./SplashScreenAnimated'));

const SplashFallbackShell: React.FC<{ isLightTheme: boolean }> = ({ isLightTheme }) => (
  <div
    className={`fixed inset-0 z-[100] min-h-[100dvh] safe-top safe-bottom flex flex-col items-center justify-center px-5 py-8 select-none ${
      isLightTheme
        ? 'bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f5f3ff_50%,_#ede9fe_100%)] text-slate-900'
        : 'bg-[radial-gradient(ellipse_at_top,_#241152_0%,_#0b071c_54%,_#05040d_100%)] text-white'
    }`}
    role="status"
    aria-label="Aadesh AI Live AI Loading"
  >
    <div className="mb-6">
      <BrandLogo size="xl" animated={false} />
    </div>
    <div className="flex items-center gap-2">
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
        Aadesh{' '}
        <span className="bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
          AI
        </span>
      </h1>
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-purple-950/80 border border-purple-400/45 text-purple-200">
        Live AI
      </span>
    </div>
    <p className="mt-2 text-xs font-medium text-purple-200/80">Initializing Aadesh AI...</p>
  </div>
);

export const SplashScreen: React.FC<SplashScreenProps> = ({
  isAppReady,
  aiConnectionState,
  initError,
  theme,
  onRetryInit,
  onComplete,
}) => {
  const isLightTheme =
    theme === 'light' ||
    (theme !== 'dark' &&
      typeof document !== 'undefined' &&
      document.body.classList.contains('light-theme'));

  return (
    <Suspense fallback={<SplashFallbackShell isLightTheme={isLightTheme} />}>
      <LazySplashScreenAnimated
        isAppReady={isAppReady}
        aiConnectionState={aiConnectionState}
        initError={initError}
        theme={theme}
        onRetryInit={onRetryInit}
        onComplete={onComplete}
      />
    </Suspense>
  );
};
