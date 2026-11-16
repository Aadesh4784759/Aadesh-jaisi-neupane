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

const OUTER_PARTICLES: OrbitParticle[] = [
  {
    id: 'orb-1',
    angleDeg: 0,
    radiusPx: 92,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.95)]',
  },
  {
    id: 'orb-2',
    angleDeg: 60,
    radiusPx: 102,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.95)]',
  },
  {
    id: 'orb-3',
    angleDeg: 120,
    radiusPx: 88,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.95)]',
  },
  {
    id: 'orb-4',
    angleDeg: 180,
    radiusPx: 98,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.95)]',
  },
  {
    id: 'orb-5',
    angleDeg: 240,
    radiusPx: 90,
    sizeClass: 'w-1.5 h-1.5',
    colorClass: 'bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.95)]',
  },
  {
    id: 'orb-6',
    angleDeg: 300,
    radiusPx: 96,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.9)]',
  },
];

const SplashAnimationEffects: React.FC<SplashAnimationEffectsProps> = ({ isLightTheme }) => {
  return (
    <>
      {/* Expanding Gaming Pulse Shockwaves */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.72, opacity: 0.65 }}
        animate={{ scale: 2.05, opacity: 0 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-purple-500/35' : 'border-purple-400/45'
        }`}
      />
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.72, opacity: 0.55 }}
        animate={{ scale: 2.25, opacity: 0 }}
        transition={{ duration: 2.2, delay: 0.85, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-blue-500/30' : 'border-blue-400/40'
        }`}
      />

      {/* Glowing Purple + Blue Energy Core Aura */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.8, opacity: 0.2 }}
        animate={{ scale: [0.95, 1.14, 1], opacity: [0.45, 0.82, 0.55] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-gradient-to-tr from-purple-600/40 via-violet-500/35 to-blue-500/40 blur-2xl pointer-events-none"
      />

      {/* 3D Tilted Purple Outer Energy Ring */}
      <motion.div
        aria-hidden="true"
        animate={{ rotateZ: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        style={{ transform: 'rotateX(62deg) rotateY(-18deg)' }}
        className={`absolute w-48 h-48 sm:w-56 sm:h-56 rounded-full border-2 border-dashed pointer-events-none ${
          isLightTheme
            ? 'border-purple-500/50 shadow-[0_0_24px_rgba(147,51,234,0.28)]'
            : 'border-purple-400/60 shadow-[0_0_28px_rgba(168,85,247,0.45)]'
        }`}
      />

      {/* Counter-Rotating Blue HUD Energy Ring */}
      <motion.div
        aria-hidden="true"
        animate={{ rotateZ: -360 }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'linear' }}
        style={{ transform: 'rotateX(-54deg) rotateY(22deg)' }}
        className={`absolute w-40 h-40 sm:w-48 sm:h-48 rounded-full border-[1.5px] pointer-events-none ${
          isLightTheme
            ? 'border-blue-500/45 shadow-[0_0_20px_rgba(59,130,246,0.25)]'
            : 'border-cyan-400/55 shadow-[0_0_24px_rgba(56,189,248,0.4)]'
        }`}
      >
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,1)]" />
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-purple-300 shadow-[0_0_10px_rgba(216,180,254,1)]" />
      </motion.div>

      {/* Gaming HUD Corner Arcs Frame */}
      <motion.div
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-purple-300/20 pointer-events-none"
      >
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
      </motion.div>

      {/* Rotating Neon Particles Constellation */}
      <motion.div
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        className="absolute w-56 h-56 sm:w-64 sm:h-64 pointer-events-none flex items-center justify-center"
      >
        {OUTER_PARTICLES.map((p) => {
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
