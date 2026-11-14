export interface AvatarColorPreset {
  id: string;
  name: string;
  hex: string;
  tagline: string;
}

export interface DynamicThemeTokens {
  rawHex: string;
  primaryHex: string;
  lightHex: string;
  deepHex: string;
  secondaryHex: string;
  primaryRgb: string;
  secondaryRgb: string;
  lightRgb: string;
}

export const DEFAULT_AVATAR_COLOR = '#8b5cf6';

export const AVATAR_COLOR_PRESETS: AvatarColorPreset[] = [
  { id: 'violet', name: 'Cosmic Violet', hex: '#8b5cf6', tagline: 'Classic Aadesh AI Glow' },
  { id: 'cyan', name: 'Ocean Cyan', hex: '#06b6d4', tagline: 'Electric Aqua & Teal' },
  { id: 'emerald', name: 'Emerald Aurora', hex: '#10b981', tagline: 'Vibrant Forest Mint' },
  { id: 'amber', name: 'Solar Amber', hex: '#f59e0b', tagline: 'Warm Golden Horizon' },
  { id: 'rose', name: 'Crimson Rose', hex: '#f43f5e', tagline: 'Ruby Coral Radiance' },
  { id: 'indigo', name: 'Royal Indigo', hex: '#6366f1', tagline: 'Deep Twilight Blue' },
  { id: 'magenta', name: 'Neon Magenta', hex: '#ec4899', tagline: 'Fuchsia Prism Glow' },
  { id: 'arctic', name: 'Arctic Blue', hex: '#3b82f6', tagline: 'Crisp Cobalt Sky' },
];

function normalizeHex(hex?: string): string {
  if (!hex) return DEFAULT_AVATAR_COLOR;
  const trimmed = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_AVATAR_COLOR;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex).slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hue < 120) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hue < 180) {
    [r1, g1, b1] = [0, c, x];
  } else if (hue < 240) {
    [r1, g1, b1] = [0, x, c];
  } else if (hue < 300) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function generateThemeTokensFromColor(hex?: string): DynamicThemeTokens {
  const rawHex = normalizeHex(hex);
  const [r, g, b] = hexToRgb(rawHex);
  const [h, s, l] = rgbToHsl(r, g, b);

  // Clamp lightness & saturation for balanced dark/light UI legibility
  const clampedS = Math.max(0.45, Math.min(0.95, s));
  const primaryL = Math.max(0.42, Math.min(0.60, l));
  const lightL = Math.min(0.78, primaryL + 0.16);
  const deepL = Math.max(0.22, primaryL - 0.18);
  const secondaryH = (h + 30) % 360;

  const pRgb = hslToRgb(h, clampedS, primaryL);
  const lRgb = hslToRgb(h, Math.min(0.95, clampedS + 0.05), lightL);
  const dRgb = hslToRgb(h, clampedS, deepL);
  const sRgb = hslToRgb(secondaryH, clampedS, primaryL);

  return {
    rawHex,
    primaryHex: rgbToHex(...pRgb),
    lightHex: rgbToHex(...lRgb),
    deepHex: rgbToHex(...dRgb),
    secondaryHex: rgbToHex(...sRgb),
    primaryRgb: pRgb.join(', '),
    secondaryRgb: sRgb.join(', '),
    lightRgb: lRgb.join(', '),
  };
}

export function applyAvatarDynamicTheme(avatarColor?: string, enabled: boolean = true): DynamicThemeTokens {
  const activeHex = enabled ? normalizeHex(avatarColor) : DEFAULT_AVATAR_COLOR;
  const tokens = generateThemeTokensFromColor(activeHex);

  if (typeof document !== 'undefined') {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--theme-accent', tokens.primaryHex);
    rootStyle.setProperty('--theme-accent-light', tokens.lightHex);
    rootStyle.setProperty('--theme-accent-deep', tokens.deepHex);
    rootStyle.setProperty('--theme-accent-secondary', tokens.secondaryHex);
    rootStyle.setProperty('--theme-accent-rgb', tokens.primaryRgb);
    rootStyle.setProperty('--theme-accent-sec-rgb', tokens.secondaryRgb);
    rootStyle.setProperty('--theme-accent-light-rgb', tokens.lightRgb);
    rootStyle.setProperty('--accent-purple', tokens.primaryHex);
    rootStyle.setProperty('--accent-indigo', tokens.secondaryHex);
  }

  return tokens;
}
