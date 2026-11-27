import { DailyStreakDay } from '../types';

export interface StreakShareCardPayload {
  displayName: string;
  countryFlag?: string;
  country?: string;
  currentStreak: number;
  bestEverStreak: number;
  totalDaysActive: number;
  recoveryEfficiencyPercent: number;
  level: number;
  levelTitle: string;
  xp: number;
  unlockedMilestonesCount: number;
  totalMilestonesCount: number;
  globalRank?: number | null;
  streakHistory?: DailyStreakDay[];
  generatedDateLabel?: string;
}

export interface StreakShareResult {
  status: 'shared' | 'downloaded' | 'cancelled' | 'error';
  filename?: string;
  previewDataUrl?: string;
  error?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFlameVector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Outer flame
  const outerGrad = ctx.createLinearGradient(0, -52, 0, 52);
  outerGrad.addColorStop(0, '#fef08a');
  outerGrad.addColorStop(0.42, '#f59e0b');
  outerGrad.addColorStop(1, '#f43f5e');

  ctx.beginPath();
  ctx.moveTo(0, -54);
  ctx.bezierCurveTo(22, -30, 42, -8, 38, 20);
  ctx.bezierCurveTo(35, 42, 18, 54, 0, 54);
  ctx.bezierCurveTo(-18, 54, -36, 42, -38, 20);
  ctx.bezierCurveTo(-41, -6, -24, -22, -16, -34);
  ctx.bezierCurveTo(-15, -20, -8, -14, -6, -18);
  ctx.bezierCurveTo(-9, -32, -5, -45, 0, -54);
  ctx.closePath();
  ctx.fillStyle = outerGrad;
  ctx.shadowColor = 'rgba(251, 191, 36, 0.7)';
  ctx.shadowBlur = 24;
  ctx.fill();

  // Inner bright flame core
  const innerGrad = ctx.createLinearGradient(0, -14, 0, 46);
  innerGrad.addColorStop(0, '#ffffff');
  innerGrad.addColorStop(0.55, '#fde047');
  innerGrad.addColorStop(1, '#fb923c');

  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.bezierCurveTo(13, 2, 20, 14, 18, 29);
  ctx.bezierCurveTo(16, 41, 8, 47, 0, 47);
  ctx.bezierCurveTo(-8, 47, -16, 41, -18, 29);
  ctx.bezierCurveTo(-20, 14, -12, 2, 0, -14);
  ctx.closePath();
  ctx.shadowBlur = 0;
  ctx.fillStyle = innerGrad;
  ctx.fill();

  ctx.restore();
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const clean = text.trim();
  if (!clean) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  let result = clean;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/**
 * Renders a crisp 1080x1080 shareable streak achievement card directly onto an HTML5 Canvas.
 */
export function renderStreakShareCardToCanvas(
  canvas: HTMLCanvasElement,
  data: StreakShareCardPayload
): void {
  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize 2D canvas context');
  }

  const streak = Math.max(0, Math.floor(data.currentStreak || 0));
  const bestStreak = Math.max(streak, Math.floor(data.bestEverStreak || 0));
  const totalActive = Math.max(streak, Math.floor(data.totalDaysActive || 0));
  const efficiency = Math.max(0, Math.min(100, Math.round(data.recoveryEfficiencyPercent || 0)));

  // 1. Deep Obsidian-to-Violet Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#070812');
  bgGrad.addColorStop(0.5, '#130c29');
  bgGrad.addColorStop(1, '#090a14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Ambient Radial Glow Orbs
  const topGlow = ctx.createRadialGradient(220, 180, 10, 220, 180, 440);
  topGlow.addColorStop(0, 'rgba(139, 92, 246, 0.34)');
  topGlow.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, H);

  const centerGlow = ctx.createRadialGradient(W / 2, 410, 20, W / 2, 410, 380);
  centerGlow.addColorStop(0, 'rgba(245, 158, 11, 0.30)');
  centerGlow.addColorStop(0.55, 'rgba(168, 85, 247, 0.14)');
  centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  const bottomGlow = ctx.createRadialGradient(860, 920, 20, 860, 920, 400);
  bottomGlow.addColorStop(0, 'rgba(34, 211, 238, 0.22)');
  bottomGlow.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, 0, W, H);

  // 2. Outer Glass Card Frame
  const frameX = 48;
  const frameY = 48;
  const frameW = W - 96;
  const frameH = H - 96;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 44);
  ctx.fillStyle = 'rgba(11, 13, 24, 0.78)';
  ctx.fill();

  const borderGrad = ctx.createLinearGradient(frameX, frameY, frameX + frameW, frameY + frameH);
  borderGrad.addColorStop(0, 'rgba(168, 85, 247, 0.75)');
  borderGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.7)');
  borderGrad.addColorStop(1, 'rgba(34, 211, 238, 0.65)');
  ctx.lineWidth = 3;
  ctx.strokeStyle = borderGrad;
  ctx.stroke();

  // 3. Top Header Row (Brand + Rank/Level Badge)
  ctx.textBaseline = 'middle';
  ctx.font = '800 32px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('AADESH AI', 96, 124);

  ctx.font = '700 18px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText('ACTIVITY STREAK CARD', 96, 158);

  // Level Pill on Top-Right
  const badgeLabel =
    typeof data.globalRank === 'number' && data.globalRank >= 1
      ? `GLOBAL #${data.globalRank}  ·  LVL ${data.level}`
      : `LEVEL ${data.level}  ·  ${data.levelTitle.toUpperCase()}`;
  ctx.font = '800 19px Inter, system-ui, -apple-system, sans-serif';
  const badgeTextW = ctx.measureText(badgeLabel).width;
  const badgeW = Math.min(430, badgeTextW + 44);
  const badgeX = W - 96 - badgeW;
  const badgeY = 104;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, 54, 27);
  ctx.fillStyle = 'rgba(139, 92, 246, 0.24)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.6)';
  ctx.stroke();

  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText(
    truncateCanvasText(ctx, badgeLabel, badgeW - 28),
    badgeX + badgeW / 2,
    badgeY + 27
  );

  // Subtle Header Divider
  ctx.beginPath();
  ctx.moveTo(96, 198);
  ctx.lineTo(W - 96, 198);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 4. User Identity Subtitle
  const displayNameClean = (data.displayName || 'Aadesh Explorer').trim();
  const flagPrefix = data.countryFlag ? `${data.countryFlag} ` : '';
  ctx.font = '700 30px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#e5e7eb';
  ctx.textAlign = 'center';
  ctx.fillText(
    truncateCanvasText(ctx, `${flagPrefix}${displayNameClean}`, frameW - 120),
    W / 2,
    252
  );

  // 5. Centerpiece Glowing Flame Emblem & Big Streak Count
  const ringCx = W / 2;
  const ringCy = 398;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, 118, 0, Math.PI * 2);
  const ringBg = ctx.createRadialGradient(ringCx, ringCy, 16, ringCx, ringCy, 118);
  ringBg.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
  ringBg.addColorStop(0.7, 'rgba(249, 115, 22, 0.14)');
  ringBg.addColorStop(1, 'rgba(168, 85, 247, 0.06)');
  ctx.fillStyle = ringBg;
  ctx.fill();

  const ringStroke = ctx.createLinearGradient(ringCx - 118, ringCy - 118, ringCx + 118, ringCy + 118);
  ringStroke.addColorStop(0, '#fde047');
  ringStroke.addColorStop(0.5, '#f97316');
  ringStroke.addColorStop(1, '#a855f7');
  ctx.lineWidth = 5;
  ctx.strokeStyle = ringStroke;
  ctx.stroke();
  ctx.restore();

  drawFlameVector(ctx, ringCx, ringCy - 4, 1.35);

  // Giant Streak Numeral
  ctx.font = '900 132px Inter, system-ui, -apple-system, sans-serif';
  const numGrad = ctx.createLinearGradient(W / 2 - 120, 520, W / 2 + 120, 640);
  numGrad.addColorStop(0, '#ffffff');
  numGrad.addColorStop(0.55, '#fde68a');
  numGrad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = numGrad;
  ctx.textAlign = 'center';
  ctx.fillText(`${streak}`, W / 2, 594);

  // Uppercase DAY STREAK label
  ctx.font = '800 28px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(streak === 1 ? 'DAY ACTIVE STREAK' : 'DAY CONSECUTIVE STREAK', W / 2, 668);

  // 6. 3-Column Streak Insights Strip
  const statGap = 22;
  const statAreaW = frameW - 96;
  const statW = (statAreaW - statGap * 2) / 3;
  const statH = 128;
  const statY = 716;
  const statStartX = frameX + 48;

  const statItems = [
    {
      label: 'BEST EVER',
      value: `${bestStreak}d`,
      accent: '#fbbf24',
      border: 'rgba(251, 191, 36, 0.45)',
    },
    {
      label: 'TOTAL ACTIVE',
      value: `${totalActive}d`,
      accent: '#c084fc',
      border: 'rgba(192, 132, 252, 0.45)',
    },
    {
      label: 'RECOVERY EFF.',
      value: `${efficiency}%`,
      accent: '#22d3ee',
      border: 'rgba(34, 211, 238, 0.45)',
    },
  ];

  statItems.forEach((stat, idx) => {
    const sx = statStartX + idx * (statW + statGap);
    drawRoundedRect(ctx, sx, statY, statW, statH, 22);
    ctx.fillStyle = 'rgba(17, 20, 36, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stat.border;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '700 18px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(stat.label, sx + statW / 2, statY + 38);

    ctx.font = '900 44px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = stat.accent;
    ctx.fillText(stat.value, sx + statW / 2, statY + 88);
  });

  // 7. Last 7 Days Activity Dots Strip
  const recent7 = (data.streakHistory || []).slice(-7);
  if (recent7.length > 0) {
    const dotStep = 94;
    const totalDotsW = (recent7.length - 1) * dotStep;
    const dotStartX = W / 2 - totalDotsW / 2;
    const dotY = 900;

    recent7.forEach((day, idx) => {
      const dx = dotStartX + idx * dotStep;
      const isRecovered = day.status === 'recovered';
      const isMaintained = !isRecovered && (day.completed || day.status === 'maintained');

      ctx.beginPath();
      ctx.arc(dx, dotY, 17, 0, Math.PI * 2);
      if (isRecovered) {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#22d3ee';
        ctx.stroke();
      } else if (isMaintained) {
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.stroke();
      }

      ctx.font = '700 15px Inter, system-ui, -apple-system, sans-serif';
      ctx.fillStyle = isMaintained || isRecovered ? '#e5e7eb' : '#6b7280';
      ctx.textAlign = 'center';
      ctx.fillText((day.dayLabel || '').slice(0, 3).toUpperCase(), dx, dotY + 36);
    });
  }

  // 8. Footer Strip
  ctx.beginPath();
  ctx.moveTo(96, 962);
  ctx.lineTo(W - 96, 962);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '700 20px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#d1d5db';
  ctx.fillText(
    `${data.unlockedMilestonesCount}/${data.totalMilestonesCount} Milestones Earned  ·  ${(data.xp || 0).toLocaleString()} XP`,
    96,
    998
  );

  const dateLabel =
    data.generatedDateLabel ||
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  ctx.textAlign = 'right';
  ctx.font = '600 20px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(dateLabel, W - 96, 998);
}

/**
 * Generates a PNG Blob & data URL from the rendered HTML5 Canvas streak share card.
 */
export async function generateStreakShareCardImage(
  data: StreakShareCardPayload
): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas image generation requires a browser environment');
  }
  const canvas = document.createElement('canvas');
  renderStreakShareCardToCanvas(canvas, data);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Failed to export PNG image from Canvas'));
    }, 'image/png');
  });

  const safeStreak = Math.max(0, Math.floor(data.currentStreak || 0));
  return {
    blob,
    dataUrl,
    filename: `aadesh-ai-streak-${safeStreak}d.png`,
  };
}

export function downloadStreakCardBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/**
 * Generates a Canvas streak card PNG and shares it via the native Web Share API
 * when supported by the browser, falling back cleanly to a PNG download otherwise.
 */
export async function shareStreakCardViaBrowser(
  data: StreakShareCardPayload
): Promise<StreakShareResult> {
  try {
    const { blob, dataUrl, filename } = await generateStreakShareCardImage(data);
    const streak = Math.max(0, Math.floor(data.currentStreak || 0));
    const shareTitle = `${streak}-Day Streak on Aadesh AI`;
    const shareText = `I'm on a ${streak}-day active streak on Aadesh AI (Best: ${Math.max(
      streak,
      Math.floor(data.bestEverStreak || 0)
    )} days · Level ${data.level})!`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const imageFile =
        typeof File !== 'undefined' ? new File([blob], filename, { type: 'image/png' }) : null;

      if (
        imageFile &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [imageFile] })
      ) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            files: [imageFile],
          });
          return { status: 'shared', filename, previewDataUrl: dataUrl };
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            return { status: 'cancelled', filename, previewDataUrl: dataUrl };
          }
          // Fall through to PNG download if file share failed
        }
      }
    }

    // Fallback when native file share sheet is unavailable: trigger clean PNG download
    downloadStreakCardBlob(blob, filename);
    return { status: 'downloaded', filename, previewDataUrl: dataUrl };
  } catch (err: any) {
    return {
      status: 'error',
      error: err?.message || 'Unable to generate shareable streak card',
    };
  }
}
