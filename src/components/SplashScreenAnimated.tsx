import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { RefreshCw, Sparkles, WifiOff, AlertTriangle } from 'lucide-react';
import { AIConnectionState } from '../types';
import { BrandLogo } from './BrandLogo';

const SplashAnimationEffects = lazy(() => import('./SplashAnimationEffects'));

export interface SplashScreenProps {
  isAppReady?: boolean;
  aiConnectionState?: AIConnectionState;
  initError?: string | null;
  theme?: 'dark' | 'light';
  onRetryInit?: () => void;
  onComplete?: () => void;
}

const LOADING_MESSAGES = {
  initializing: 'Initializing Aadesh AI...',
  connecting: 'Connecting to Google Gemini...',
  welcome: 'Welcome to Aadesh AI',
} as const;

const MIN_SHOWCASE_MS = 1650;
const STALL_RETRY_PROMPT_MS = 7500;

const SplashScreenAnimated: React.FC<SplashScreenProps> = ({
  isAppReady = false,
  aiConnectionState = 'connecting',
  initError = null,
  theme,
  onRetryInit,
  onComplete,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isLightTheme =
    theme === 'light' ||
    (theme !== 'dark' &&
      typeof document !== 'undefined' &&
      document.body.classList.contains('light-theme'));

  const [visible, setVisible] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(prefersReducedMotion ? 50 : 4);
  const [minShowcaseDone, setMinShowcaseDone] = useState<boolean>(Boolean(prefersReducedMotion));
  const [timedOutWaiting, setTimedOutWaiting] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const completedRef = useRef(false);
  const readyRef = useRef(isAppReady);
  readyRef.current = isAppReady;

  const dismissSplash = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setVisible(false);
    onComplete?.();
  };

  // Enforce honest progress ceiling (~88%) while backend/auth initialization is still in flight
  useEffect(() => {
    if (!visible) return;

    if (prefersReducedMotion) {
      setMinShowcaseDone(true);
      setProgress(isAppReady && !initError ? 100 : 88);
      return;
    }

    const startTime = Date.now();

    const tickTimer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= MIN_SHOWCASE_MS) {
        setMinShowcaseDone(true);
      }
      if (elapsed >= STALL_RETRY_PROMPT_MS && !readyRef.current) {
        setTimedOutWaiting(true);
      }

      setProgress((prev) => {
        // Honest progression: never fake 100% until essential init settles
        if (!readyRef.current) {
          const cap = elapsed < 650 ? 42 : 88;
          if (prev >= cap) return prev;
          const step = elapsed < 650 ? 4 : 2;
          return Math.min(cap, prev + step);
        }

        if (elapsed < MIN_SHOWCASE_MS) {
          const timeBoundTarget = Math.min(96, Math.round((elapsed / MIN_SHOWCASE_MS) * 96));
          return Math.max(prev, timeBoundTarget);
        }

        return Math.min(100, prev + 6);
      });
    }, 45);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [visible, prefersReducedMotion, initError]);

  // Move to 100% and dismiss once both real readiness and smooth reveal settle
  useEffect(() => {
    if (!visible) return;
    if (initError) return;

    if (isAppReady && minShowcaseDone && progress >= 100) {
      const exitDelay = prefersReducedMotion ? 320 : 480;
      const exitTimer = window.setTimeout(dismissSplash, exitDelay);
      return () => window.clearTimeout(exitTimer);
    }

    if (isAppReady && minShowcaseDone && prefersReducedMotion) {
      setProgress(100);
    }
  }, [isAppReady, minShowcaseDone, progress, visible, prefersReducedMotion, initError]);

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTimedOutWaiting(false);
    setIsRetrying(true);
    setProgress(48);
    onRetryInit?.();
    window.setTimeout(() => setIsRetrying(false), 900);
  };

  const handleContinueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProgress(100);
    dismissSplash();
  };

  const showFailureState = Boolean(initError) || (timedOutWaiting && !isAppReady);

  let activeMessage: string = LOADING_MESSAGES.initializing;
  if (progress >= 99 && isAppReady && !initError) {
    activeMessage = LOADING_MESSAGES.welcome;
  } else if (progress >= 42) {
    activeMessage = LOADING_MESSAGES.connecting;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="aadesh-ai-gaming-splash"
          initial={{ opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.4, ease: 'easeOut' }}
          onClick={() => {
            if (isAppReady && minShowcaseDone && !showFailureState) {
              dismissSplash();
            }
          }}
          className={`fixed inset-0 z-[100] min-h-[100dvh] safe-top safe-bottom flex flex-col items-center justify-center px-5 py-8 select-none overflow-hidden ${
            isLightTheme
              ? 'bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f5f3ff_50%,_#ede9fe_100%)] text-slate-900'
              : 'bg-[radial-gradient(ellipse_at_top,_#241152_0%,_#0b071c_54%,_#05040d_100%)] text-white'
          }`}
          role="status"
          aria-live="polite"
          aria-label="Aadesh AI Live AI Loading"
        >
          {/* Futuristic Cyber Grid Overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(rgba(167, 139, 250, 0.35) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          />

          {/* Ambient Dual-Tone Neon Glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[360px] h-[360px] sm:w-[460px] sm:h-[460px] rounded-full blur-3xl bg-gradient-to-tr from-purple-600/30 via-violet-500/25 to-blue-500/25"
          />

          {/* Central 3D Gaming Logo Portal Stage */}
          <div
            className="relative flex items-center justify-center mb-7 sm:mb-8"
            style={{ perspective: '1000px' }}
          >
            {!prefersReducedMotion && (
              <Suspense fallback={null}>
                <SplashAnimationEffects isLightTheme={isLightTheme} />
              </Suspense>
            )}

            <motion.div
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.68, rotateX: 22, rotateY: -18 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      scale: 1,
                      rotateX: [0, 4, 0, -4, 0],
                      rotateY: [0, -5, 0, 5, 0],
                    }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0.2 }
                  : {
                      opacity: { duration: 0.55 },
                      scale: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
                      rotateX: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                      rotateY: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                    }
              }
              className="relative z-10"
            >
              <BrandLogo size="xl" animated={true} />
            </motion.div>
          </div>

          {/* Official App Name + Live AI Label */}
          <div className="text-center relative z-10 flex flex-col items-center">
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : 0.45, delay: prefersReducedMotion ? 0 : 0.12 }}
              className="flex flex-wrap items-center justify-center gap-2.5"
            >
              <h1
                className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  isLightTheme ? 'text-slate-900' : 'text-white'
                }`}
              >
                Aadesh{' '}
                <span className="bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                  AI
                </span>
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${
                  isLightTheme
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-purple-950/80 border-purple-400/45 text-purple-200 shadow-[0_0_16px_rgba(139,92,246,0.35)]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-cyan-300" />
                <span>Live AI</span>
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.28 }}
              className={`mt-2 text-xs sm:text-sm font-medium ${
                isLightTheme ? 'text-slate-600' : 'text-purple-200/80'
              }`}
            >
              Powered by Google Gemini
            </motion.p>
          </div>

          {/* Futuristic Glassmorphism HUD Progress Card */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: prefersReducedMotion ? 0 : 0.2 }}
            className={`mt-7 w-full max-w-[310px] sm:max-w-[350px] rounded-2xl p-4 backdrop-blur-xl border relative z-10 ${
              isLightTheme
                ? 'bg-white/85 border-purple-200 shadow-[0_14px_34px_rgba(91,33,182,0.12)]'
                : 'bg-[#120d26]/82 border-purple-400/30 shadow-[0_14px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <AnimatePresence mode="wait">
                <motion.span
                  key={showFailureState ? 'init-error' : activeMessage}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className={`text-xs font-semibold truncate ${
                    showFailureState
                      ? 'text-amber-300'
                      : progress >= 99 && isAppReady
                      ? 'text-emerald-300 font-bold'
                      : isLightTheme
                      ? 'text-slate-700'
                      : 'text-purple-100'
                  }`}
                >
                  {showFailureState ? 'Initialization taking longer than expected' : activeMessage}
                </motion.span>
              </AnimatePresence>

              <span
                className={`text-xs font-mono font-extrabold tabular-nums shrink-0 ${
                  isLightTheme
                    ? 'text-purple-700'
                    : 'bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent'
                }`}
              >
                {progress}%
              </span>
            </div>

            {/* Energy Progress Bar (0% -> 100%) */}
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className={`relative w-full h-2.5 rounded-full overflow-hidden ${
                isLightTheme ? 'bg-purple-100' : 'bg-[#070512] border border-purple-400/20'
              }`}
            >
              <div
                style={{ width: `${progress}%` }}
                className="h-full rounded-full bg-gradient-to-r from-purple-600 via-violet-400 to-cyan-400 shadow-[0_0_16px_rgba(56,189,248,0.7)] transition-[width] duration-75 ease-out"
              />
            </div>

            {/* Real Connection Verification Pill inside HUD */}
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className={isLightTheme ? 'text-slate-500' : 'text-purple-300/75'}>
                Gemini Link
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  aiConnectionState === 'connected'
                    ? 'text-emerald-400'
                    : aiConnectionState === 'offline'
                    ? 'text-rose-400'
                    : aiConnectionState === 'error'
                    ? 'text-amber-400'
                    : 'text-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    aiConnectionState === 'connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : aiConnectionState === 'offline'
                      ? 'bg-rose-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                {aiConnectionState === 'connected'
                  ? 'Verified'
                  : aiConnectionState === 'offline'
                  ? 'Offline'
                  : aiConnectionState === 'error'
                  ? 'Service Issue'
                  : 'Verifying...'}
              </span>
            </div>

            {/* Honest Error / Retry Controls if Initialization Fails or Times Out */}
            {showFailureState && (
              <div className="mt-3 pt-3 border-t border-purple-400/20 space-y-2.5">
                <div className="flex items-start gap-2 text-[11px] text-amber-200/90">
                  {aiConnectionState === 'offline' ? (
                    <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <span>
                    {initError || 'Unable to confirm live Gemini service yet. Retry or enter offline mode.'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryClick}
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl purple-glow-btn text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueClick}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-purple-300/25 text-xs font-semibold text-purple-100 cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Attribution */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.45 }}
            className={`mt-5 text-[11px] sm:text-xs font-medium tracking-wide relative z-10 ${
              isLightTheme ? 'text-slate-500' : 'text-purple-200/65'
            }`}
          >
            Created by{' '}
            <span className={isLightTheme ? 'text-purple-700 font-semibold' : 'text-purple-300 font-semibold'}>
              Aadesh Jaisi
            </span>
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreenAnimated;
