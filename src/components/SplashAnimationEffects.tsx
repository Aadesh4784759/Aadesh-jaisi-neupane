import React from 'react';
import { motion } from 'motion/react';

interface SplashAnimationEffectsProps {
  isLightTheme: boolean;
}

interface OrbitParticle {
  id: string;
  angleDeg: number;
  radiusPx: number;
  sizeClass: string;
  colorClass: string;
}

const ORBIT_PARTICLES: OrbitParticle[] = [
  {
    id: 'orb-1',
    angleDeg: 0,
    radiusPx: 74,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]',
  },
  {
    id: 'orb-2',
    angleDeg: 72,
    radiusPx: 82,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.9)]',
  },
  {
    id: 'orb-3',
    angleDeg: 144,
    radiusPx: 70,
    sizeClass: 'w-1.5 h-1.5',
    colorClass: 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.9)]',
  },
  {
    id: 'orb-4',
    angleDeg: 216,
    radiusPx: 80,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)]',
  },
  {
    id: 'orb-5',
    angleDeg: 288,
    radiusPx: 72,
    sizeClass: 'w-1.5 h-1.5',
    colorClass: 'bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.9)]',
  },
];

const SplashAnimationEffects: React.FC<SplashAnimationEffectsProps> = ({ isLightTheme }) => {
  return (
    <>
      {/* Subtle AI-Inspired Expanding Light Waves */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.7, opacity: 0.55 }}
        animate={{ scale: 1.75, opacity: 0 }}
        transition={{ duration: 2.1, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-indigo-500/35' : 'border-cyan-400/35'
        }`}
      />
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.7, opacity: 0.45 }}
        animate={{ scale: 1.95, opacity: 0 }}
        transition={{ duration: 2.1, delay: 0.75, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-purple-500/30' : 'border-purple-400/30'
        }`}
      />

      {/* Smooth Glowing Light Effect Behind Logo */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.75, opacity: 0 }}
        animate={{ scale: [0.9, 1.08, 1], opacity: [0.35, 0.75, 0.55] }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-blue-500/35 via-purple-500/35 to-cyan-400/35 blur-2xl pointer-events-none"
      />

      {/* Elegant Rotating Particle Orbit */}
      <motion.div
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        className="absolute w-44 h-44 sm:w-48 sm:h-48 pointer-events-none flex items-center justify-center"
      >
        {ORBIT_PARTICLES.map((p) => {
          const rad = (p.angleDeg * Math.PI) / 180;
          const tx = Math.round(Math.cos(rad) * p.radiusPx);
          const ty = Math.round(Math.sin(rad) * p.radiusPx);
          return (
            <span
              key={p.id}
              style={{ transform: `translate(${tx}px, ${ty}px)` }}
              className={`absolute rounded-full ${p.sizeClass} ${p.colorClass}`}
            />
          );
        })}
      </motion.div>
    </>
  );
};

export default SplashAnimationEffects;
