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
  driftDuration: number;
}

const OUTER_PARTICLES: OrbitParticle[] = [
  {
    id: 'orb-1',
    angleDeg: 0,
    radiusPx: 92,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.95)]',
    driftDuration: 4.2,
  },
  {
    id: 'orb-2',
    angleDeg: 45,
    radiusPx: 104,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.95)]',
    driftDuration: 5.1,
  },
  {
    id: 'orb-3',
    angleDeg: 90,
    radiusPx: 84,
    sizeClass: 'w-1.5 h-1.5',
    colorClass: 'bg-violet-300 shadow-[0_0_12px_rgba(167,139,250,0.95)]',
    driftDuration: 3.8,
  },
  {
    id: 'orb-4',
    angleDeg: 135,
    radiusPx: 110,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-blue-400 shadow-[0_0_14px_rgba(96,165,250,0.95)]',
    driftDuration: 4.6,
  },
  {
    id: 'orb-5',
    angleDeg: 180,
    radiusPx: 96,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.95)]',
    driftDuration: 5.4,
  },
  {
    id: 'orb-6',
    angleDeg: 225,
    radiusPx: 102,
    sizeClass: 'w-1.5 h-1.5',
    colorClass: 'bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.9)]',
    driftDuration: 4.0,
  },
  {
    id: 'orb-7',
    angleDeg: 270,
    radiusPx: 88,
    sizeClass: 'w-2 h-2',
    colorClass: 'bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.95)]',
    driftDuration: 4.8,
  },
  {
    id: 'orb-8',
    angleDeg: 315,
    radiusPx: 108,
    sizeClass: 'w-2.5 h-2.5',
    colorClass: 'bg-indigo-300 shadow-[0_0_14px_rgba(165,180,252,0.95)]',
    driftDuration: 5.2,
  },
];

const SplashAnimationEffects: React.FC<SplashAnimationEffectsProps> = ({ isLightTheme }) => {
  return (
    <>
      {/* 1. Glowing Central AI Orb (Pulsing Energy Sphere) */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{
          scale: [0.85, 1.08, 0.95],
          opacity: [0.65, 0.95, 0.75],
        }}
        transition={{
          duration: 2.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full pointer-events-none flex items-center justify-center z-0"
      >
        {/* Deep Specular AI Orb Gradient */}
        <div
          className="w-full h-full rounded-full"
          style={{
            background: isLightTheme
              ? 'radial-gradient(circle at 35% 30%, #ffffff 0%, #c4b5fd 28%, #8b5cf6 60%, #6d28d9 88%, #4c1d95 100%)'
              : 'radial-gradient(circle at 35% 30%, #f5f3ff 0%, #a78bfa 25%, #7c3aed 52%, #3b0764 85%, #090514 100%)',
            boxShadow: isLightTheme
              ? 'inset -6px -6px 18px rgba(76,29,149,0.5), inset 6px 6px 14px rgba(255,255,255,0.7), 0 0 45px rgba(139,92,246,0.5)'
              : 'inset -8px -8px 22px rgba(0,0,0,0.8), inset 6px 6px 16px rgba(255,255,255,0.45), 0 0 55px rgba(139,92,246,0.65)',
            opacity: 0.38,
          }}
        />
      </motion.div>

      {/* 2. Expanding Cyber Shockwaves */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.72, opacity: 0.7 }}
        animate={{ scale: 2.15, opacity: 0 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-purple-500/35' : 'border-purple-400/50'
        }`}
      />
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.72, opacity: 0.55 }}
        animate={{ scale: 2.35, opacity: 0 }}
        transition={{ duration: 2.2, delay: 0.85, repeat: Infinity, ease: 'easeOut' }}
        className={`absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full border pointer-events-none ${
          isLightTheme ? 'border-blue-500/30' : 'border-blue-400/40'
        }`}
      />

      {/* 3. Outer Radiant Aura Glow */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.8, opacity: 0.2 }}
        animate={{ scale: [0.95, 1.15, 1], opacity: [0.5, 0.85, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-gradient-to-tr from-purple-600/35 via-violet-500/30 to-cyan-500/35 blur-2xl pointer-events-none"
      />

      {/* 4. 3D Tilted Purple Energy Ring */}
      <motion.div
        aria-hidden="true"
        animate={{ rotateZ: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        style={{ transform: 'rotateX(62deg) rotateY(-18deg)' }}
        className={`absolute w-48 h-48 sm:w-56 sm:h-56 rounded-full border-2 border-dashed pointer-events-none ${
          isLightTheme
            ? 'border-purple-500/50 shadow-[0_0_24px_rgba(147,51,234,0.3)]'
            : 'border-purple-400/60 shadow-[0_0_28px_rgba(168,85,247,0.45)]'
        }`}
      />

      {/* 5. Counter-Rotating Cyan HUD Energy Ring */}
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

      {/* 6. Rotating Neon Particles Constellation */}
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
            <motion.span
              key={p.id}
              style={{ transform: `translate(${tx}px, ${ty}px)` }}
              animate={{
                scale: [0.85, 1.25, 0.85],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: p.driftDuration,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className={`absolute rounded-full ${p.sizeClass} ${p.colorClass}`}
            />
          );
        })}
      </motion.div>
    </>
  );
};

export default SplashAnimationEffects;
