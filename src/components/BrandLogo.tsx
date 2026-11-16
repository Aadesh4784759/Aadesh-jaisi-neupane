import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  animated = true,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-xl',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-16 h-16 rounded-2xl',
    xl: 'w-20 h-20 sm:w-24 sm:h-24 rounded-3xl',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-9 h-9',
    xl: 'w-11 h-11 sm:w-13 sm:h-13',
  }[size];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border border-purple-300/45 shadow-[0_0_28px_rgba(139,92,246,0.5)] ${sizeClasses} ${className}`}
      style={{
        background:
          'radial-gradient(circle at 28% 24%, rgba(233,213,255,0.45) 0%, rgba(139,92,246,0.85) 38%, rgba(76,29,149,0.95) 75%, rgba(15,10,36,0.98) 100%)',
      }}
      aria-hidden="true"
    >
      {/* Inner liquid glass sheen */}
      <span
        className="absolute inset-0 pointer-events-none opacity-65"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 48%, rgba(192,132,252,0.28) 100%)',
        }}
      />

      {/* Futuristic Geometric Aadesh AI Emblem */}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 ${iconSizes} ${animated ? 'drop-shadow-[0_0_12px_rgba(245,243,255,0.7)]' : ''}`}
      >
        <defs>
          <linearGradient id="aadesh-emblem-grad" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#E9D5FF" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        {/* Outer orbital ring */}
        <circle
          cx="32"
          cy="32"
          r="25"
          stroke="url(#aadesh-emblem-grad)"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        {/* Stylized 'A' Neural Apex */}
        <path
          d="M32 11L49 48H41.8L38 39.2H26L22.2 48H15L32 11Z"
          stroke="url(#aadesh-emblem-grad)"
          strokeWidth="2.8"
          strokeLinejoin="round"
          fill="rgba(255,255,255,0.1)"
        />
        {/* Core glowing spark node */}
        <circle cx="32" cy="27.5" r="3.4" fill="#FFFFFF" />
        {/* Orbital crossbar wave */}
        <path
          d="M21.5 34.5C25.5 31.5 38.5 31.5 42.5 34.5"
          stroke="#E9D5FF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
