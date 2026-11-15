import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';

const WELCOME_MESSAGES = [
  'Your Ideas, Your AI, Your World.',
  'What Can We Create Today?',
  'Let\'s Learn Something New.',
  'Explore. Create. Innovate.',
  'Your Intelligent AI Companion.',
];

interface WelcomeCarouselProps {
  isPaused?: boolean;
}

export const WelcomeCarousel: React.FC<WelcomeCarouselProps> = ({ isPaused = false }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % WELCOME_MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div className="relative text-center py-2 sm:py-4 space-y-2.5 max-w-2xl mx-auto overflow-hidden px-3">
      {/* Subtle theme-variable ambient glow */}
      <div
        className="absolute inset-0 blur-2xl rounded-3xl pointer-events-none opacity-35"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(var(--theme-accent-rgb), 0.32), rgba(var(--theme-accent-sec-rgb), 0.16), transparent 72%)',
        }}
      />

      <div className="relative inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-950/60 border border-purple-500/35 text-purple-200 text-xs font-bold shadow-lg">
        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse shrink-0" />
        <span>Welcome to Aadesh AI</span>
      </div>

      <div className="h-10 sm:h-12 flex items-center justify-center relative">
        <AnimatePresence mode="wait">
          <motion.h2
            key={currentIndex}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              backgroundImage:
                'linear-gradient(120deg, #ffffff 10%, var(--theme-accent-light) 50%, #38bdf8 95%)',
              filter: 'drop-shadow(0 0 18px rgba(var(--theme-accent-rgb), 0.45))',
            }}
            className="text-base sm:text-2xl font-black bg-clip-text text-transparent tracking-tight text-center px-2"
          >
            {WELCOME_MESSAGES[currentIndex]}
          </motion.h2>
        </AnimatePresence>
      </div>
    </div>
  );
};
