import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const SplashAnimationEffects = lazy(() => import('./SplashAnimationEffects'));

export interface SplashScreenProps {
  isAppReady?: boolean;
  theme?: 'dark' | 'light';
  onComplete?: () => void;
}

const BRAND_SUBTITLE = 'GLOBAL HUB';
const BRAND_LETTERS = BRAND_SUBTITLE.split('');

const LOADING_MESSAGES = [
  'Initializing Aadesh AI...',
  'Connecting Intelligence...',
  'Preparing Your Global Experience...',
  'Almost Ready...',
];

const SplashScreenAnimated: React.FC<SplashScreenProps> = ({
  isAppReady = true,
  theme,
  onComplete,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isLightTheme =
    theme === 'light' ||
    (theme !== 'dark' &&
      typeof document !== 'undefined' &&
      document.body.classList.contains('light-theme'));

  const [visible, setVisible] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(prefersReducedMotion ? 100 : 0);
  const [minShowcaseDone, setMinShowcaseDone] = useState<boolean>(false);
  const completedRef = useRef(false);
  const readyRef = useRef(isAppReady);
  readyRef.current = isAppReady;

  const dismissSplash = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      sessionStorage.setItem('aadesh_splash_shown_v1', '1');
    } catch {}
    setVisible(false);
    onComplete?.();
  };

  useEffect(() => {
    if (!visible) return;

    try {
      sessionStorage.setItem('aadesh_splash_shown_v1', '1');
    } catch {}

    if (prefersReducedMotion) {
      setProgress(100);
      const reducedTimer = window.setTimeout(dismissSplash, 750);
      return () => window.clearTimeout(reducedTimer);
    }

    const startTime = Date.now();
    // 3-second opening splash screen showcase (3000ms)
    const targetDurationMs = 3000;

    const tickTimer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / targetDurationMs) * 100));
      setProgress(pct);

      if (elapsed >= targetDurationMs) {
        setMinShowcaseDone(true);
        window.clearInterval(tickTimer);
      }
    }, 45);

    return () => {
      window.clearInterval(tickTimer);
    };
  }, [visible, prefersReducedMotion]);

  // Smooth fade-out once the 3-second progress reaches 100%
  useEffect(() => {
    if (!visible || prefersReducedMotion) return;
    if (progress >= 100 && minShowcaseDone) {
      const exitTimer = window.setTimeout(dismissSplash, 180);
      return () => window.clearTimeout(exitTimer);
    }
  }, [progress, minShowcaseDone, visible, prefersReducedMotion]);

  const messageIndex =
    progress < 25 ? 0 : progress < 55 ? 1 : progress < 85 ? 2 : 3;
  const activeMessage = LOADING_MESSAGES[messageIndex];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="aadesh-global-hub-splash"
          initial={{ opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.45, ease: 'easeOut' }}
          onClick={dismissSplash}
          className={`fixed inset-0 z-[100] min-h-[100dvh] safe-top safe-bottom flex flex-col items-center justify-center px-5 py-8 select-none overflow-hidden ${
            isLightTheme
              ? 'bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f8fafc_52%,_#ede9fe_100%)] text-slate-900'
              : 'bg-[radial-gradient(ellipse_at_top,_#1b1442_0%,_#090b14_55%,_#05060b_100%)] text-white'
          }`}
          role="status"
          aria-live="polite"
          aria-label="Aadesh AI Global Hub Loading"
        >
          {/* Subtle Ambient Gradient Glow */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl ${
              isLightTheme
                ? 'bg-gradient-to-tr from-blue-400/25 via-purple-400/25 to-cyan-300/25'
                : 'bg-gradient-to-tr from-blue-600/25 via-purple-600/30 to-cyan-400/20'
            }`}
          />

          {/* Central Logo Stage with 3D-Inspired Entry & Lazy-Loaded Particle/Wave Effects */}
          <div
            className="relative flex items-center justify-center mb-6 sm:mb-7"
            style={{ perspective: '900px' }}
          >
            {!prefersReducedMotion && (
              <Suspense fallback={null}>
                <SplashAnimationEffects isLightTheme={isLightTheme} />
              </Suspense>
            )}

            {/* Existing Uploaded Official App Logo (/icon.svg) — Never Modified or Distorted */}
            <motion.div
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.72, rotateX: 16, rotateY: -14 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }
              }
              transition={{
                duration: prefersReducedMotion ? 0.2 : 0.75,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative z-10 rounded-[28px] shadow-[0_14px_45px_rgba(99,102,241,0.45),0_0_24px_rgba(34,211,238,0.25)]"
            >
              <img
                src="/icon.svg"
                alt="Aadesh AI Global Hub Official Logo"
                loading="eager"
                decoding="async"
                className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 object-contain"
              />
            </motion.div>
          </div>

          {/* Brand Identity Reveal */}
          <div className="text-center relative z-10 flex flex-col items-center">
            <motion.h1
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : 0.45, delay: prefersReducedMotion ? 0 : 0.16 }}
              className={`text-2xl sm:text-3xl md:text-4xl font-black tracking-tight ${
                isLightTheme ? 'text-slate-900' : 'text-white'
              }`}
            >
              Aadesh{' '}
              <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
                AI
              </span>
            </motion.h1>

            {/* "GLOBAL HUB" Letter-by-Letter Reveal */}
            <div
              className="mt-1.5 flex items-center justify-center gap-[0.18em] sm:gap-[0.22em]"
              aria-label="GLOBAL HUB"
            >
              {BRAND_LETTERS.map((char, idx) => (
                <motion.span
                  key={`${char}-${idx}`}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? 0.1 : 0.28,
                    delay: prefersReducedMotion ? 0 : 0.3 + idx * 0.035,
                    ease: 'easeOut',
                  }}
                  className={`text-xs sm:text-sm md:text-base font-extrabold tracking-widest ${
                    char === ' '
                      ? 'w-2'
                      : isLightTheme
                      ? 'text-indigo-700'
                      : 'bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 bg-clip-text text-transparent'
                  }`}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Tagline */}
            <motion.p
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.65 }}
              className={`mt-2 text-xs sm:text-sm font-medium ${
                isLightTheme ? 'text-slate-600' : 'text-purple-100/85'
              }`}
            >
              Your Intelligence. Your World.
            </motion.p>
          </div>

          {/* Glassmorphism Loading Card (0% -> 100% + Rotating Messages) */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: prefersReducedMotion ? 0 : 0.25 }}
            className={`mt-7 w-full max-w-[290px] sm:max-w-[330px] rounded-2xl p-3.5 sm:p-4 backdrop-blur-xl border relative z-10 ${
              isLightTheme
                ? 'bg-white/75 border-indigo-200/80 shadow-[0_12px_32px_rgba(99,102,241,0.12)]'
                : 'bg-[#121422]/75 border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.45)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <AnimatePresence mode="wait">
                <motion.span
                  key={activeMessage}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className={`text-[11px] sm:text-xs font-semibold truncate ${
                    isLightTheme ? 'text-slate-700' : 'text-gray-200'
                  }`}
                >
                  {activeMessage}
                </motion.span>
              </AnimatePresence>
              <span
                className={`text-[11px] sm:text-xs font-mono font-bold shrink-0 ${
                  isLightTheme
                    ? 'text-indigo-600'
                    : 'bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent'
                }`}
              >
                {progress}%
              </span>
            </div>

            {/* Animated Loading Progress Track */}
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className={`w-full h-2 rounded-full overflow-hidden ${
                isLightTheme ? 'bg-slate-200/90' : 'bg-[#080a12] border border-white/10'
              }`}
            >
              <div
                style={{ width: `${progress}%` }}
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 to-cyan-400 shadow-[0_0_16px_rgba(56,189,248,0.65)] transition-[width] duration-75 ease-out"
              />
            </div>
          </motion.div>

          {/* Subtle "Created by Aadesh Jaisi" Attribution */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.85 }}
            className={`mt-5 text-[11px] sm:text-xs font-medium tracking-wide relative z-10 ${
              isLightTheme ? 'text-slate-500' : 'text-gray-400'
            }`}
          >
            Created by{' '}
            <span
              className={
                isLightTheme ? 'text-indigo-700 font-semibold' : 'text-purple-300 font-semibold'
              }
            >
              Aadesh Jaisi
            </span>
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreenAnimated;
