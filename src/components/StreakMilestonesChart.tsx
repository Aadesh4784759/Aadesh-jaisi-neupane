import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useReducedMotion } from 'motion/react';
import { CheckCircle2, Crown, Flag, Flame, Lock, Sparkles, Target } from 'lucide-react';
import { clampStreakGoalDays, StreakMilestoneItem } from '../utils/gamification';

export interface CircularMilestoneNode {
  days: number;
  title: string;
  description: string;
  angleRad: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  unlocked: boolean;
  isNext: boolean;
  isGoal: boolean;
  percentPosition: number;
}

export interface CircularMilestoneLayout {
  currentStreak: number;
  longestStreak: number;
  goalDays: number;
  progressRatio: number;
  progressPercent: number;
  remainingDays: number;
  isGoalCompleted: boolean;
  trackArcPath: string;
  progressArcPath: string;
  bestArcPath: string | null;
  progressTipX: number;
  progressTipY: number;
  milestones: CircularMilestoneNode[];
}

const STANDARD_MILESTONE_CATALOG: Array<{ days: number; title: string; description: string }> = [
  { days: 1, title: 'First Spark', description: 'Started your daily AI learning streak.' },
  { days: 3, title: 'Three-Day Ignition', description: 'Built momentum across 3 consecutive days.' },
  { days: 7, title: 'Weekly Flame', description: 'Completed a full 7-day learning week.' },
  { days: 14, title: 'Fortnight Mastery', description: 'Sustained focus across 14 straight days.' },
  { days: 30, title: 'Monthly Legend', description: 'Joined elite learners with a 30-day streak.' },
  { days: 60, title: 'Diamond Habit', description: 'Two full months of consistent curiosity.' },
  { days: 100, title: 'Century Grandmaster', description: 'Achieved 100 unbroken days of mastery.' },
  { days: 180, title: 'Half-Year Titan', description: 'Sustained discipline for half a year.' },
  { days: 365, title: 'Annual Immortal', description: 'Completed an entire year without missing.' },
];

export const RING_RADIUS = 88;
export const RING_THICKNESS = 14;
export const RING_INNER_RADIUS = RING_RADIUS - RING_THICKNESS / 2;
export const RING_OUTER_RADIUS = RING_RADIUS + RING_THICKNESS / 2;
export const LABEL_RADIUS = RING_OUTER_RADIUS + 18;

/**
 * Pure D3 geometry builder for the circular Streak Milestones chart.
 * Computes D3 linear scale, arc SVG path generators, and milestone node coordinates.
 */
export function computeCircularMilestoneLayout(params: {
  currentStreak: number;
  longestStreak?: number;
  goalDays: number;
  overrideProgressRatio?: number;
  existingMilestones?: StreakMilestoneItem[];
}): CircularMilestoneLayout {
  const safeGoal = clampStreakGoalDays(params.goalDays);
  const safeCurrent = Math.max(0, Math.floor(Number(params.currentStreak) || 0));
  const safeLongest = Math.max(safeCurrent, Math.floor(Number(params.longestStreak) || 0));
  const targetRatio = Math.max(0, Math.min(1, safeCurrent / safeGoal));
  const effectiveRatio =
    typeof params.overrideProgressRatio === 'number'
      ? Math.max(0, Math.min(1, params.overrideProgressRatio))
      : targetRatio;

  const angleScale = d3
    .scaleLinear()
    .domain([0, safeGoal])
    .range([0, Math.PI * 2])
    .clamp(true);

  const trackArcGen = d3
    .arc<void>()
    .innerRadius(RING_INNER_RADIUS)
    .outerRadius(RING_OUTER_RADIUS)
    .startAngle(0)
    .endAngle(Math.PI * 2);

  const progressEndAngle = effectiveRatio * Math.PI * 2;
  const progressArcGen = d3
    .arc<void>()
    .innerRadius(RING_INNER_RADIUS)
    .outerRadius(RING_OUTER_RADIUS)
    .startAngle(0)
    .endAngle(progressEndAngle)
    .cornerRadius(effectiveRatio >= 0.995 ? 0 : RING_THICKNESS / 2);

  const bestRatio = Math.max(0, Math.min(1, safeLongest / safeGoal));
  let bestArcPath: string | null = null;
  if (safeLongest > safeCurrent && bestRatio > targetRatio) {
    const bestArcGen = d3
      .arc<void>()
      .innerRadius(RING_OUTER_RADIUS + 2.5)
      .outerRadius(RING_OUTER_RADIUS + 5)
      .startAngle(0)
      .endAngle(bestRatio * Math.PI * 2)
      .cornerRadius(2);
    bestArcPath = bestArcGen() || null;
  }

  // Filter milestones that fit inside the goal ring cleanly without crowding near day 0
  const candidateCatalog = STANDARD_MILESTONE_CATALOG.filter((m) => {
    if (m.days > safeGoal) return false;
    if (m.days === safeGoal) return true;
    // Skip very dense ultra-early markers on 60+ day goals so labels never overlap
    if (safeGoal >= 90 && m.days < 7) return false;
    if (safeGoal >= 60 && m.days === 1) return false;
    // Keep at least 9% gap from goal marker unless goal is tiny
    const ratio = m.days / safeGoal;
    return ratio <= 0.92;
  });

  const daysMap = new Map<number, { days: number; title: string; description: string; isGoal: boolean }>();
  for (const item of candidateCatalog) {
    daysMap.set(item.days, {
      days: item.days,
      title: item.days === safeGoal ? `${safeGoal}-Day Goal` : item.title,
      description:
        item.days === safeGoal
          ? `Reach your ${safeGoal}-day personal streak target.`
          : item.description,
      isGoal: item.days === safeGoal,
    });
  }
  if (!daysMap.has(safeGoal)) {
    daysMap.set(safeGoal, {
      days: safeGoal,
      title: `${safeGoal}-Day Goal`,
      description: `Complete ${safeGoal} consecutive active days to hit your custom goal.`,
      isGoal: true,
    });
  }

  const sortedNodes = Array.from(daysMap.values()).sort((a, b) => a.days - b.days);
  let foundFirstLocked = false;

  const milestones: CircularMilestoneNode[] = sortedNodes.map((node) => {
    const ratio = Math.max(0, Math.min(1, node.days / safeGoal));
    const angleRad = node.isGoal ? 0 : angleScale(node.days);
    // D3 arcs start at 12-o'clock (0 rad) and sweep clockwise: x = r*sin(theta), y = -r*cos(theta)
    const x = Math.sin(angleRad) * RING_RADIUS;
    const y = -Math.cos(angleRad) * RING_RADIUS;
    const labelX = Math.sin(angleRad) * LABEL_RADIUS;
    const labelY = -Math.cos(angleRad) * LABEL_RADIUS;

    const matchingExisting = params.existingMilestones?.find(
      (m) => m.progressTarget === node.days
    );
    const unlocked = matchingExisting ? matchingExisting.unlocked : safeCurrent >= node.days;
    const isNext = !unlocked && !foundFirstLocked;
    if (isNext) foundFirstLocked = true;

    return {
      days: node.days,
      title: node.title,
      description: node.description,
      angleRad,
      x,
      y,
      labelX,
      labelY,
      unlocked,
      isNext,
      isGoal: node.isGoal,
      percentPosition: Math.round(ratio * 100),
    };
  });

  const tipX = Math.sin(progressEndAngle) * RING_RADIUS;
  const tipY = -Math.cos(progressEndAngle) * RING_RADIUS;

  return {
    currentStreak: safeCurrent,
    longestStreak: safeLongest,
    goalDays: safeGoal,
    progressRatio: targetRatio,
    progressPercent: Math.round(targetRatio * 100),
    remainingDays: Math.max(0, safeGoal - safeCurrent),
    isGoalCompleted: safeCurrent >= safeGoal,
    trackArcPath: trackArcGen() || '',
    progressArcPath: effectiveRatio > 0.002 ? progressArcGen() || '' : '',
    bestArcPath,
    progressTipX: tipX,
    progressTipY: tipY,
    milestones,
  };
}

interface StreakMilestonesChartProps {
  currentStreak: number;
  longestStreak: number;
  goalDays: number;
  milestones?: StreakMilestoneItem[];
  onApplyGoal?: (goalDays: number) => void;
}

export const StreakMilestonesChart: React.FC<StreakMilestonesChartProps> = ({
  currentStreak,
  longestStreak,
  goalDays,
  milestones,
  onApplyGoal,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const safeGoal = clampStreakGoalDays(goalDays);
  const safeCurrent = Math.max(0, Math.floor(Number(currentStreak) || 0));
  const targetRatio = Math.max(0, Math.min(1, safeCurrent / safeGoal));

  const [animatedRatio, setAnimatedRatio] = useState<number>(
    prefersReducedMotion ? targetRatio : 0
  );
  const prevRatioRef = useRef<number>(prefersReducedMotion ? targetRatio : 0);

  // Smooth D3 eased sweep transition when modal opens or streak changes
  useEffect(() => {
    if (prefersReducedMotion) {
      prevRatioRef.current = targetRatio;
      setAnimatedRatio(targetRatio);
      return;
    }

    const startRatio = prevRatioRef.current;
    const interpolator = d3.interpolateNumber(startRatio, targetRatio);
    const duration = 680;
    const ease = d3.easeCubicOut;
    let frameId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startTime) / duration);
      const nextVal = interpolator(ease(elapsed));
      prevRatioRef.current = nextVal;
      setAnimatedRatio(nextVal);
      if (elapsed < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [targetRatio, prefersReducedMotion]);

  const layout = useMemo(
    () =>
      computeCircularMilestoneLayout({
        currentStreak: safeCurrent,
        longestStreak,
        goalDays: safeGoal,
        overrideProgressRatio: animatedRatio,
        existingMilestones: milestones,
      }),
    [safeCurrent, longestStreak, safeGoal, animatedRatio, milestones]
  );

  const defaultSelectedDays = useMemo(() => {
    const nextMarker = layout.milestones.find((m) => m.isNext);
    if (nextMarker) return nextMarker.days;
    const goalMarker = layout.milestones[layout.milestones.length - 1];
    return goalMarker?.days ?? safeGoal;
  }, [layout.milestones, safeGoal]);

  const [selectedDays, setSelectedDays] = useState<number>(defaultSelectedDays);

  useEffect(() => {
    if (!layout.milestones.some((m) => m.days === selectedDays)) {
      setSelectedDays(defaultSelectedDays);
    }
  }, [layout.milestones, selectedDays, defaultSelectedDays]);

  const activeNode =
    layout.milestones.find((m) => m.days === selectedDays) ||
    layout.milestones[layout.milestones.length - 1];

  const daysUntilActive = activeNode ? Math.max(0, activeNode.days - safeCurrent) : 0;

  return (
    <div
      data-testid="d3-streak-milestones-chart"
      className="rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 p-4 sm:p-5 shadow-[0_10px_30px_rgba(6,4,18,0.45)] space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-300 shrink-0" aria-hidden="true" />
          <h5 className="text-xs sm:text-sm font-extrabold text-white">
            Milestone Ring Progress
          </h5>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400 tabular-nums">
          <span>
            Unlocked:{' '}
            <strong className="text-amber-300">
              {layout.milestones.filter((m) => m.unlocked).length}
            </strong>
            /{layout.milestones.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)] gap-5 items-center">
        {/* D3 Circular SVG Ring */}
        <div className="flex flex-col items-center justify-center">
          <svg
            viewBox="-126 -126 252 252"
            className="w-56 h-56 sm:w-60 sm:h-60 overflow-visible select-none"
            role="img"
            aria-label={`D3 circular streak progress: ${layout.currentStreak} of ${layout.goalDays} days (${layout.progressPercent}%), with ${layout.milestones.length} milestone markers`}
          >
            <defs>
              <linearGradient id="d3StreakRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={layout.isGoalCompleted ? '#34d399' : '#a855f7'} />
                <stop offset="52%" stopColor={layout.isGoalCompleted ? '#2dd4bf' : '#f59e0b'} />
                <stop offset="100%" stopColor={layout.isGoalCompleted ? '#22d3ee' : '#f97316'} />
              </linearGradient>
              <filter id="d3StreakGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Subtle background track ring */}
            <path d={layout.trackArcPath} fill="#141727" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

            {/* Personal Best ghost outer ring (when longestStreak exceeds currentStreak) */}
            {layout.bestArcPath && (
              <path
                d={layout.bestArcPath}
                fill="rgba(168,85,247,0.32)"
                aria-hidden="true"
              />
            )}

            {/* Animated D3 progress arc */}
            {layout.progressArcPath && (
              <path
                d={layout.progressArcPath}
                fill="url(#d3StreakRingGrad)"
                filter="url(#d3StreakGlow)"
              />
            )}

            {/* Active progress leading ember dot */}
            {animatedRatio > 0.01 && !layout.isGoalCompleted && (
              <circle
                cx={layout.progressTipX}
                cy={layout.progressTipY}
                r={5}
                fill="#fffbeb"
                stroke="#f59e0b"
                strokeWidth={2}
              />
            )}

            {/* Interactive Milestone Markers placed via D3 angular scale */}
            {layout.milestones.map((node) => {
              const isSelected = activeNode?.days === node.days;
              const markerFill = node.unlocked
                ? layout.isGoalCompleted
                  ? '#34d399'
                  : '#fbbf24'
                : node.isNext
                ? '#c084fc'
                : '#1b1f33';
              const markerStroke = isSelected
                ? '#ffffff'
                : node.unlocked
                ? '#fffbeb'
                : node.isNext
                ? '#e9d5ff'
                : '#4b5563';

              return (
                <g
                  key={`milestone-node-${node.days}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title} (${node.days} days) - ${node.unlocked ? 'Unlocked' : 'Locked'}`}
                  onClick={() => setSelectedDays(node.days)}
                  onMouseEnter={() => setSelectedDays(node.days)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDays(node.days);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  {node.isNext && !prefersReducedMotion && (
                    <circle
                      r={13}
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      strokeOpacity={0.55}
                      className="animate-ping"
                    />
                  )}
                  <circle
                    r={isSelected ? 9.5 : node.isGoal ? 8.5 : 7}
                    fill={markerFill}
                    stroke={markerStroke}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                  />
                  {node.unlocked && (
                    <path
                      d="M-2.6 0.2 L-0.7 2.1 L3.0 -2.0"
                      fill="none"
                      stroke="#090a0f"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <text
                    x={node.labelX - node.x}
                    y={node.labelY - node.y + 3.5}
                    textAnchor="middle"
                    fontSize={isSelected || node.isGoal ? '10.5' : '9.5'}
                    fontWeight={isSelected || node.unlocked ? '700' : '600'}
                    fill={
                      isSelected
                        ? '#ffffff'
                        : node.unlocked
                        ? '#fde68a'
                        : node.isNext
                        ? '#d8b4fe'
                        : '#9ca3af'
                    }
                    className="tabular-nums pointer-events-none"
                  >
                    {node.isGoal ? `${node.days}d★` : `${node.days}d`}
                  </text>
                </g>
              );
            })}

            {/* Center Telemetry Readout */}
            <g textAnchor="middle" className="pointer-events-none">
              <text
                y={-22}
                fontSize="10"
                fontWeight="700"
                fill={layout.isGoalCompleted ? '#6ee7b7' : '#c4b5fd'}
                letterSpacing="0.08em"
              >
                {layout.isGoalCompleted ? 'GOAL COMPLETE' : 'STREAK GOAL'}
              </text>
              <text
                y={10}
                fontSize="32"
                fontWeight="900"
                fill="#ffffff"
                className="tabular-nums"
              >
                {layout.currentStreak}d
              </text>
              <text
                y={29}
                fontSize="11.5"
                fontWeight="700"
                fill={layout.isGoalCompleted ? '#34d399' : '#fcd34d'}
                className="tabular-nums"
              >
                {layout.progressPercent}% of {layout.goalDays}d
              </text>
              <text y={45} fontSize="10" fill="#9ca3af" className="tabular-nums">
                {layout.currentStreak === 0
                  ? 'Chat today to start'
                  : layout.isGoalCompleted
                  ? 'Target reached!'
                  : `${layout.remainingDays}d remaining`}
              </text>
            </g>
          </svg>
        </div>

        {/* Interactive Milestone Detail & Quick Checkpoint Selector */}
        <div className="space-y-3 min-w-0">
          {activeNode && (
            <div
              className={`rounded-xl border p-3.5 transition-colors ${
                activeNode.unlocked
                  ? 'bg-amber-500/10 border-amber-400/40'
                  : activeNode.isNext
                  ? 'bg-purple-500/10 border-purple-400/40'
                  : 'bg-[#101322] border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                      activeNode.unlocked
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                        : activeNode.isNext
                        ? 'bg-purple-500/20 border-purple-400/50 text-purple-300'
                        : 'bg-[#15192d] border-white/10 text-gray-400'
                    }`}
                  >
                    {activeNode.isGoal ? (
                      <Flag className="w-4 h-4" />
                    ) : activeNode.unlocked ? (
                      <Crown className="w-4 h-4" />
                    ) : (
                      <Flame className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-white truncate">
                      {activeNode.title}
                    </div>
                    <div className="text-[11px] text-gray-400 tabular-nums">
                      {activeNode.days}-Day Checkpoint
                    </div>
                  </div>
                </div>

                {activeNode.unlocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/45 text-[10px] font-bold text-emerald-200 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    Achieved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161a2d] border border-white/15 text-[10px] font-bold text-purple-200 tabular-nums shrink-0">
                    <Lock className="w-2.5 h-2.5" />
                    {daysUntilActive}d to go
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                {activeNode.description}
              </p>

              {safeCurrent === 0 && (
                <p className="text-[11px] text-purple-300 mt-1.5 flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Send one message or translation today to ignite Day 1 on the ring.</span>
                </p>
              )}

              {layout.isGoalCompleted && onApplyGoal && (
                <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <span className="text-[11px] font-semibold text-emerald-300">
                    Ready for your next challenge?
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onApplyGoal(
                        safeGoal < 14 ? 14 : safeGoal < 30 ? 30 : safeGoal < 60 ? 60 : Math.min(365, safeGoal + 30)
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-200 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    Stretch Goal
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Checkpoint Selector Buttons */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Select Milestone Marker
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layout.milestones.map((node) => {
                const isSelected = activeNode?.days === node.days;
                return (
                  <button
                    key={`btn-milestone-${node.days}`}
                    type="button"
                    onClick={() => setSelectedDays(node.days)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold tabular-nums flex items-center gap-1.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-purple-600/30 border-purple-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                        : node.unlocked
                        ? 'bg-amber-500/10 border-amber-400/35 text-amber-200 hover:border-amber-400/70'
                        : 'bg-[#101322] border-white/10 text-gray-300 hover:border-purple-400/40 hover:text-white'
                    }`}
                  >
                    {node.unlocked ? (
                      <CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : node.isNext ? (
                      <Flame className="w-3 h-3 text-purple-300 shrink-0" />
                    ) : (
                      <Lock className="w-3 h-3 text-gray-500 shrink-0" />
                    )}
                    <span>{node.isGoal ? `${node.days}d Goal` : `${node.days}d`}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {layout.longestStreak > layout.currentStreak && (
            <div className="text-[11px] text-purple-300/90 flex items-center gap-1.5 tabular-nums">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>
                Outer halo marks your personal record ({layout.longestStreak} days).
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
