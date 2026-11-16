import React, { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

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
  const prefersReducedMotion = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const gradId = `aadesh-emblem-grad-${uid}`;
  const ringGradId = `aadesh-ring-grad-${uid}`;
  const shouldAnimate = animated && !prefersReducedMotion;

  const sizeClasses = {
    sm: 'w-8 h-8 rounded-xl',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-16 h-16 rounded-2xl',
    xl: 'w-24 h-24 sm:w-28 sm:h-28 rounded-[1.75rem]',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
    xl: 'w-14 h-14 sm:w-16 sm:h-16',
  }[size];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border border-purple-300/50 shadow-[0_0_28px_rgba(139,92,246,0.55),inset_0_1px_0_rgba(255,255,255,0.28)] ${sizeClasses} ${className}`}
      style={{
        background:
          'radial-gradient(circle at 28% 22%, rgba(233,213,255,0.48) 0%, rgba(124,58,237,0.88) 40%, rgba(67,56,202,0.92) 72%, rgba(12,8,30,0.98) 100%)',
      }}
      aria-hidden="true"
    >
      {/* Inner liquid glass sheen */}
      <span
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0) 48%, rgba(56,189,248,0.25) 100%)',
        }}
      />

      {/* Animated holographic sweep */}
      {shouldAnimate && (
        <motion.span
          animate={{ x: ['-130%', '130%'] }}
          transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
          className="absolute inset-y-0 w-1/2 -skew-x-12 pointer-events-none bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
      )}

      {/* Futuristic Geometric Aadesh AI Emblem */}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 ${iconSizes} ${shouldAnimate ? 'drop-shadow-[0_0_12px_rgba(245,243,255,0.78)]' : ''}`}
      >
        <defs>
          <linearGradient id={gradId} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="52%" stopColor="#E9D5FF" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
          <linearGradient id={ringGradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C084FC" />
            <stop offset="50%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#E9D5FF" />
          </linearGradient>
        </defs>

        {/* Rotating Orbital Energy Ring */}
        <motion.g
          style={{ originX: '32px', originY: '32px' }}
          animate={shouldAnimate ? { rotate: 360 } : undefined}
          transition={shouldAnimate ? { duration: 14, repeat: Infinity, ease: 'linear' } : undefined}
        >
          <circle
            cx="32"
            cy="32"
            r="26"
            stroke={`url(#${ringGradId})`}
            strokeOpacity="0.65"
            strokeWidth="1.6"
            strokeDasharray="10 5 3 5"
          />
          <circle cx="58" cy="32" r="2.2" fill="#38BDF8" />
          <circle cx="6" cy="32" r="1.8" fill="#E9D5FF" />
        </motion.g>

        {/* Stylized 'A' Neural Apex */}
        <path
          d="M32 11L49 48H41.8L38 39.2H26L22.2 48H15L32 11Z"
          stroke={`url(#${gradId})`}
          strokeWidth="2.8"
          strokeLinejoin="round"
          fill="rgba(255,255,255,0.12)"
        />

        {/* Pulsing Neural Core Node */}
        <motion.circle
          cx="32"
          cy="27"
          r="3.4"
          fill="#FFFFFF"
          animate={shouldAnimate ? { scale: [1, 1.25, 1], opacity: [0.9, 1, 0.9] } : undefined}
          transition={shouldAnimate ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        />

        {/* Orbital crossbar wave */}
        <path
          d="M21.5 34.8C25.5 31.6 38.5 31.6 42.5 34.8"
          stroke="#E9D5FF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
