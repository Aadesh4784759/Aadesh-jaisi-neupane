import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  ArrowUpRight,
  Code,
  Globe,
  Camera,
  Radio,
  Cpu,
  BarChart3,
  ShieldAlert,
  Edit3,
  BookOpen,
  History,
  LucideIcon,
} from 'lucide-react';
import { WelcomeCarousel } from './WelcomeCarousel';

interface SuggestionCardItem {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  desc: string;
  prompt: string;
  badge?: string;
}

interface AnimatedWelcomeHeroProps {
  onSelectSuggestion: (text: string) => void;
  recentContext?: string[];
}

const BASE_SUGGESTION_BATCHES: SuggestionCardItem[][] = [
  [
    {
      icon: Code,
      iconColor: 'text-purple-300',
      iconBg: 'bg-purple-500/20 border-purple-400/40',
      title: 'Code & Software Architecture',
      desc: 'Design a scalable clean architecture for a modern full-stack web app with TypeScript',
      prompt: 'Design a scalable clean architecture for a modern full-stack web application with TypeScript',
    },
    {
      icon: Globe,
      iconColor: 'text-emerald-300',
      iconBg: 'bg-emerald-500/20 border-emerald-400/40',
      title: 'Multilingual Translation',
      desc: 'Provide a helpful comparison between Nepali, Hindi, and English phrasing for clear communication',
      prompt: 'Provide a helpful comparison between Nepali, Hindi, and English phrasing for clear communication',
    },
    {
      icon: Camera,
      iconColor: 'text-amber-300',
      iconBg: 'bg-amber-500/20 border-amber-400/40',
      title: 'Scene & Document Vision',
      desc: 'What are the best practices for multimodal AI vision analysis on documents and photos?',
      prompt: 'What are the best practices for multimodal AI vision analysis on documents and architectural photos?',
    },
    {
      icon: Radio,
      iconColor: 'text-cyan-300',
      iconBg: 'bg-cyan-500/20 border-cyan-400/40',
      title: 'Real-Time Voice Conversation',
      desc: 'Start an interactive hands-free voice learning session on algorithmic thinking',
      prompt: 'Start an interactive hands-free voice learning session on algorithmic thinking',
    },
  ],
  [
    {
      icon: Cpu,
      iconColor: 'text-indigo-300',
      iconBg: 'bg-indigo-500/20 border-indigo-400/40',
      title: 'AI Agent Workflows',
      desc: 'Explain how multi-step AI agents plan tasks, use tools, and execute workflows safely',
      prompt: 'Explain how multi-step AI agents plan tasks, use tools, and execute workflows safely',
    },
    {
      icon: BarChart3,
      iconColor: 'text-teal-300',
      iconBg: 'bg-teal-500/20 border-teal-400/40',
      title: 'Business & Data Insights',
      desc: 'How can I analyze user engagement metrics and latency trends effectively in dashboards?',
      prompt: 'How can I analyze user engagement metrics and latency trends effectively in web dashboards?',
    },
    {
      icon: ShieldAlert,
      iconColor: 'text-rose-300',
      iconBg: 'bg-rose-500/20 border-rose-400/40',
      title: 'Cybersecurity & Safety',
      desc: 'What are the key security principles for anomaly monitoring and secure API key handling?',
      prompt: 'What are the key security principles for anomaly monitoring and secure API key handling?',
    },
    {
      icon: Edit3,
      iconColor: 'text-fuchsia-300',
      iconBg: 'bg-fuchsia-500/20 border-fuchsia-400/40',
      title: 'Creative Writing & Prompts',
      desc: 'Help me compose a high-impact prompt for creative storytelling and prompt engineering',
      prompt: 'Help me compose a high-impact prompt for creative storytelling and prompt engineering',
    },
  ],
];

function buildContextualBatch(recentContext: string[]): SuggestionCardItem[] | null {
  const joined = recentContext.join(' ').trim();
  if (!joined) return null;

  const lower = joined.toLowerCase();
  const cards: SuggestionCardItem[] = [];

  if (/\b(code|react|typescript|javascript|python|api|bug|build|app|sql|firebase)\b/i.test(lower)) {
    cards.push({
      icon: Code,
      iconColor: 'text-cyan-300',
      iconBg: 'bg-cyan-500/20 border-cyan-400/40',
      title: 'Continue Coding Topic',
      desc: 'Generate clean production code tests and edge-case improvements for my recent topic',
      prompt: `Based on our recent discussion ("${recentContext[0]?.slice(0, 60)}"), suggest architectural improvements and edge-case tests.`,
      badge: 'Contextual',
    });
  }
  if (/\b(translate|nepali|hindi|spanish|french|japanese|language|meaning)\b/i.test(lower)) {
    cards.push({
      icon: Globe,
      iconColor: 'text-emerald-300',
      iconBg: 'bg-emerald-500/20 border-emerald-400/40',
      title: 'Deepen Language Practice',
      desc: 'Practice conversational phrases and cultural nuances related to my recent translations',
      prompt: `Give me 5 natural conversational phrases and pronunciation tips continuing from "${recentContext[0]?.slice(0, 60)}".`,
      badge: 'Contextual',
    });
  }
  if (/\b(study|learn|exam|math|science|history|physics|notes|quiz)\b/i.test(lower)) {
    cards.push({
      icon: BookOpen,
      iconColor: 'text-amber-300',
      iconBg: 'bg-amber-500/20 border-amber-400/40',
      title: 'Quick Study Quiz',
      desc: 'Create a 5-question active recall quiz based on what I explored earlier',
      prompt: `Create a 5-question active recall quiz with explanations based on "${recentContext[0]?.slice(0, 60)}".`,
      badge: 'Contextual',
    });
  }

  // Always include a general continuation card referencing their last topic
  const snippet = recentContext[0]?.trim().slice(0, 58) || 'our last session';
  cards.push({
    icon: History,
    iconColor: 'text-purple-300',
    iconBg: 'bg-purple-500/20 border-purple-400/40',
    title: 'Revisit Previous Thread',
    desc: `Summarize key takeaways and next action steps from "${snippet}"`,
    prompt: `Summarize the key takeaways and suggest 3 actionable next steps for: ${snippet}`,
    badge: 'From History',
  });

  // Pad to 4 cards using diverse defaults if needed
  for (const fallback of BASE_SUGGESTION_BATCHES[1]) {
    if (cards.length >= 4) break;
    if (!cards.some((c) => c.title === fallback.title)) {
      cards.push(fallback);
    }
  }

  return cards.slice(0, 4);
}

const SMART_REPLY_PILLS = [
  { label: 'Translate English to Nepali', emoji: '🇳🇵', prompt: 'Translate the following message cleanly into natural Nepali with pronunciation:' },
  { label: 'Explain step by step', emoji: '💡', prompt: 'Explain this concept step by step in simple, clear language:' },
  { label: 'Write & debug code', emoji: '💻', prompt: 'Help me write clean TypeScript code and review edge cases for:' },
  { label: 'Summarize my notes', emoji: '📄', prompt: 'Summarize these key points into concise bullet takeaways:' },
  { label: 'Plan an AI Agent task', emoji: '🤖', prompt: 'Break down this project goal into an actionable step-by-step plan:' },
  { label: 'Practice daily conversation', emoji: '🗣️', prompt: 'Let us practice 5 useful daily conversational phrases in Spanish and Japanese.' },
];

export const AnimatedWelcomeHero: React.FC<AnimatedWelcomeHeroProps> = ({
  onSelectSuggestion,
  recentContext = [],
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [batchIndex, setBatchIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  const suggestionBatches = useMemo(() => {
    const contextual = buildContextualBatch(recentContext);
    return contextual ? [contextual, ...BASE_SUGGESTION_BATCHES] : BASE_SUGGESTION_BATCHES;
  }, [recentContext]);

  // Rotate suggestion batch every 5 seconds unless paused or user prefers reduced motion
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;
    const timer = setInterval(() => {
      setBatchIndex((prev) => (prev + 1) % suggestionBatches.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused, prefersReducedMotion, suggestionBatches.length]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const safeBatchIndex = batchIndex % suggestionBatches.length;
  const currentSuggestions = suggestionBatches[safeBatchIndex] || suggestionBatches[0];

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    const endX = e.changedTouches[0]?.clientX;
    if (startX !== null && typeof endX === 'number') {
      const delta = endX - startX;
      if (Math.abs(delta) > 40) {
        if (delta < 0) {
          setBatchIndex((prev) => (prev + 1) % suggestionBatches.length);
        } else {
          setBatchIndex((prev) => (prev - 1 + suggestionBatches.length) % suggestionBatches.length);
        }
      }
    }
    touchStartXRef.current = null;
    resumeTimerRef.current = window.setTimeout(() => setIsPaused(false), 6000);
  };

  const marqueeItems = prefersReducedMotion
    ? SMART_REPLY_PILLS
    : [...SMART_REPLY_PILLS, ...SMART_REPLY_PILLS];

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative text-center py-4 sm:py-7 space-y-5 max-w-3xl mx-auto overflow-hidden px-2"
    >
      {/* Background 3D Floating Spheres (disabled when reduced motion requested) */}
      {!prefersReducedMotion && (
        <>
          <div className="sphere-3d w-16 h-16 absolute -top-2 left-6 opacity-50 animate-float-slow pointer-events-none" />
          <div className="sphere-3d w-24 h-24 absolute -top-4 right-10 opacity-60 animate-float-delayed pointer-events-none" />
          <div className="sphere-3d w-10 h-10 absolute bottom-0 left-1/4 opacity-40 animate-pulse-glow pointer-events-none" />
        </>
      )}

      {/* Top Tag */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-200 text-xs font-bold shadow-lg">
        <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
        <span>Aadesh AI Global Hub • Worldwide Multimodal Intelligence</span>
      </div>

      {/* Main Title + WelcomeCarousel */}
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
          Explore &amp; Learn with <span className="text-gradient">Aadesh AI</span>
        </h1>
        <WelcomeCarousel isPaused={isPaused} />
      </div>

      <p className="text-xs sm:text-sm text-gray-400 max-w-xl mx-auto">
        Multilingual AI, photo &amp; document analysis, voice intelligence, and contextual reasoning across 20+ world languages.
      </p>

      {/* Right-to-Left Flowing Smart Reply Suggestion Strip */}
      <div className="smart-marquee-container relative w-full overflow-hidden py-1 mask-fade">
        <div
          className={`flex items-center gap-2 ${
            prefersReducedMotion ? 'flex-wrap justify-center' : 'smart-marquee-track'
          }`}
        >
          {marqueeItems.map((pill, idx) => (
            <button
              key={`smart-pill-${idx}-${pill.label}`}
              type="button"
              onClick={() => onSelectSuggestion(pill.prompt)}
              className="smart-reply-chip text-xs text-purple-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 shadow-sm"
            >
              <span>{pill.emoji}</span>
              <span className="font-semibold whitespace-nowrap">{pill.label}</span>
              <ArrowUpRight className="w-3 h-3 text-cyan-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Right-to-Left Staggered Animated Suggestion Cards */}
      <div className="space-y-3 pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={safeBatchIndex}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left"
          >
            {currentSuggestions.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={`${safeBatchIndex}-${item.title}`}
                  type="button"
                  onClick={() => onSelectSuggestion(item.prompt)}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 42 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -42 }}
                  transition={{
                    duration: prefersReducedMotion ? 0.15 : 0.42,
                    delay: prefersReducedMotion ? 0 : idx * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="glass-card glass-card-hover p-3.5 sm:p-4 rounded-2xl border text-left group cursor-pointer shadow-xl relative overflow-hidden active:scale-[0.99]"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 min-w-0">
                      <span className={`p-1.5 rounded-xl border shrink-0 ${item.iconBg} ${item.iconColor}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 font-semibold shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-purple-400 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform shrink-0" />
                  </div>
                  <p className="text-[11px] sm:text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                    {item.desc}
                  </p>
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Interactive Batch Indicator Dots */}
        <div className="flex items-center justify-center gap-2 pt-1">
          {suggestionBatches.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setBatchIndex(idx);
                setIsPaused(true);
              }}
              aria-label={`Show suggestion set ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === safeBatchIndex
                  ? 'w-6 bg-gradient-to-r from-purple-400 to-cyan-400'
                  : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
