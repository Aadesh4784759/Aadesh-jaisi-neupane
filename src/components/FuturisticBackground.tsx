import React from 'react';

interface FuturisticBackgroundProps {
  theme?: 'dark' | 'light';
}

const PARTICLES = [
  { left: '8%', top: '14%', size: 3, delay: '0s', duration: '9s' },
  { left: '19%', top: '62%', size: 2.5, delay: '1.5s', duration: '11s' },
  { left: '31%', top: '26%', size: 3.5, delay: '2.2s', duration: '10s' },
  { left: '44%', top: '76%', size: 2, delay: '0.8s', duration: '12s' },
  { left: '58%', top: '18%', size: 3, delay: '3.1s', duration: '9.5s' },
  { left: '72%', top: '54%', size: 2.5, delay: '1.2s', duration: '13s' },
  { left: '84%', top: '29%', size: 3.5, delay: '2.7s', duration: '10.5s' },
  { left: '91%', top: '72%', size: 2.5, delay: '0.4s', duration: '11.5s' },
  { left: '14%', top: '84%', size: 2, delay: '2.9s', duration: '12.5s' },
  { left: '66%', top: '86%', size: 3, delay: '1.9s', duration: '10s' },
];

export const FuturisticBackground: React.FC<FuturisticBackgroundProps> = ({ theme = 'dark' }) => {
  const isLight = theme === 'light';

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      aria-hidden="true"
    >
      {/* Base Atmospheric Mesh Gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: isLight
            ? 'radial-gradient(circle at 20% 10%, rgba(167,139,250,0.22), transparent 45%), radial-gradient(circle at 82% 20%, rgba(139,92,246,0.18), transparent 48%), linear-gradient(180deg, #f6f4ff 0%, #ede9fe 55%, #f5f3ff 100%)'
            : 'radial-gradient(circle at 18% 12%, rgba(124,58,237,0.22), transparent 44%), radial-gradient(circle at 85% 22%, rgba(168,85,247,0.18), transparent 46%), radial-gradient(circle at 50% 90%, rgba(109,40,217,0.2), transparent 50%), linear-gradient(180deg, #070510 0%, #0b071a 52%, #070512 100%)',
        }}
      />

      {/* Glowing Ambient Violet / Lavender Orbs */}
      <div
        className="orb w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] -top-24 -left-24 animate-pulse-glow"
        style={{
          backgroundColor: isLight ? 'rgba(139, 92, 246, 0.22)' : 'rgba(139, 92, 246, 0.28)',
        }}
      />
      <div
        className="orb w-[380px] h-[380px] sm:w-[540px] sm:h-[540px] top-[24%] -right-32 animate-float-slow"
        style={{
          backgroundColor: isLight ? 'rgba(192, 132, 252, 0.2)' : 'rgba(167, 139, 250, 0.22)',
        }}
      />
      <div
        className="orb w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] -bottom-20 left-[18%] animate-float-delayed"
        style={{
          backgroundColor: isLight ? 'rgba(129, 140, 248, 0.18)' : 'rgba(109, 40, 217, 0.26)',
        }}
      />

      {/* 3D Liquid Wave Ribbons */}
      <svg
        viewBox="0 0 1440 520"
        preserveAspectRatio="none"
        className="liquid-wave-layer absolute bottom-0 left-0 w-[130%] -left-[15%] h-[42vh] sm:h-[48vh] opacity-55"
      >
        <defs>
          <linearGradient id="liquid-wave-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isLight ? '#c4b5fd' : '#5b21b6'} stopOpacity="0.12" />
            <stop offset="45%" stopColor={isLight ? '#a78bfa' : '#8b5cf6'} stopOpacity="0.34" />
            <stop offset="100%" stopColor={isLight ? '#ddd6fe' : '#c084fc'} stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id="liquid-wave-2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isLight ? '#ddd6fe' : '#4c1d95'} stopOpacity="0.16" />
            <stop offset="55%" stopColor={isLight ? '#8b5cf6' : '#a855f7'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={isLight ? '#c4b5fd' : '#6366f1'} stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path
          d="M0,260 C240,150 480,360 720,250 C960,140 1200,330 1440,220 L1440,520 L0,520 Z"
          fill="url(#liquid-wave-1)"
        />
        <path
          d="M0,330 C300,240 560,410 860,305 C1120,210 1280,365 1440,295 L1440,520 L0,520 Z"
          fill="url(#liquid-wave-2)"
        />
        <path
          d="M0,258 C240,148 480,358 720,248 C960,138 1200,328 1440,218"
          fill="none"
          stroke={isLight ? 'rgba(124,58,237,0.28)' : 'rgba(221,214,254,0.24)'}
          strokeWidth="1.5"
        />
      </svg>

      {/* Top Subtle Liquid Wave Contour */}
      <svg
        viewBox="0 0 1440 280"
        preserveAspectRatio="none"
        className="liquid-wave-layer-reverse absolute top-0 -left-[10%] w-[120%] h-[24vh] opacity-40"
      >
        <path
          d="M0,120 C320,210 620,40 940,130 C1180,198 1340,95 1440,120 L1440,0 L0,0 Z"
          fill={isLight ? 'rgba(167,139,250,0.16)' : 'rgba(139,92,246,0.18)'}
        />
      </svg>

      {/* 3D Floating Translucent Lavender/Violet Bubbles */}
      <div className="bubble-3d w-24 h-24 top-[14%] right-[7%] opacity-45 animate-float-slow hidden sm:block" />
      <div className="bubble-3d w-14 h-14 top-[42%] left-[4%] opacity-35 animate-float-delayed hidden md:block" />
      <div className="bubble-3d w-20 h-20 bottom-[22%] right-[16%] opacity-35 animate-float-slow hidden sm:block" />
      <div className="bubble-3d w-10 h-10 top-[24%] left-[16%] opacity-30 animate-float-delayed" />
      <div className="bubble-3d w-12 h-12 bottom-[30%] left-[9%] opacity-25 animate-float-slow hidden lg:block" />

      {/* Subtle Floating Micro Particles */}
      {PARTICLES.map((p, idx) => (
        <span
          key={idx}
          className="particle-dot"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: p.delay,
            animationDuration: p.duration,
            backgroundColor: isLight ? 'rgba(124, 58, 237, 0.35)' : 'rgba(233, 213, 255, 0.55)',
          }}
        />
      ))}
    </div>
  );
};
