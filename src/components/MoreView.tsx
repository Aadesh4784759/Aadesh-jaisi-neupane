import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Wand2,
  Image as ImageIcon,
  Clock,
  Video,
  Languages,
  FileText,
  Mail,
  Inbox,
  PenTool,
  SpellCheck,
  AlignLeft,
  Sparkles,
  ArrowLeft,
  Upload,
  RefreshCw,
  AlertCircle,
  Send,
  Copy,
  Check,
  LayoutGrid,
  History,
  Brain,
  UserCheck,
  HelpCircle,
  Info,
  Search,
  Trash2,
  Plus,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
  Edit3,
  X,
} from 'lucide-react';
import {
  AIMemoryItem,
  AppSettings,
  ChatSession,
  GeotaggedMedia,
  MemoryCategory,
  UserProfile,
} from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import {
  getAuthHeaders,
  loadMemoriesFromFirestore,
  saveMemoryToFirestore,
  deleteMemoryFromFirestore,
  clearAllMemoriesFromFirestore,
} from '../utils/firebase';
import { getStoredMemories, saveStoredMemories } from '../utils/storage';
import { containsSecretOrCredential, extractMemoryKeywords } from '../utils/powerMemory';
import type { MoreWorkspaceToolId } from './MoreToolWorkspace';
import { MarkdownRenderer } from './MarkdownRenderer';
import { PowerMemorySection } from './PowerMemorySection';

const ImageStudioView = lazy(() =>
  import('./ImageStudioView').then((m) => ({ default: m.ImageStudioView }))
);
const WorldClockView = lazy(() =>
  import('./WorldClockView').then((m) => ({ default: m.WorldClockView }))
);
const InterpreterView = lazy(() =>
  import('./InterpreterView').then((m) => ({ default: m.InterpreterView }))
);
const GeotagGalleryView = lazy(() =>
  import('./GeotagGalleryView').then((m) => ({ default: m.GeotagGalleryView }))
);
const MoreToolWorkspace = lazy(() =>
  import('./MoreToolWorkspace').then((m) => ({ default: m.MoreToolWorkspace }))
);
const CameraScannerModal = lazy(() =>
  import('./CameraScannerModal').then((m) => ({ default: m.CameraScannerModal }))
);
const TermsPrivacyModal = lazy(() =>
  import('./TermsPrivacyModal').then((m) => ({ default: m.TermsPrivacyModal }))
);

export type MorePageToolId =
  | 'conversation-log'
  | 'personal-memory'
  | 'profile-shortcut'
  | 'image-gen'
  | 'gallery'
  | 'world-time'
  | 'video-upload'
  | 'translation'
  | 'help-support'
  | 'about-v2'
  | MoreWorkspaceToolId;

interface MoreViewProps {
  user: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  mediaItems: GeotaggedMedia[];
  sessions?: ChatSession[];
  currentSessionId?: string;
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onAddMedia: (media: GeotaggedMedia) => void;
  onDeleteMedia: (id: string) => void;
  onImageGenerated: (latencyMs: number) => void;
  onRecordTranslationMetric: (langA: string, langB: string, latencyMs: number) => void;
  onSendToChat: (text: string) => void;
  onAttachPhotoToChat: (file: File) => void;
  onAttachVideoToChat: (params: {
    name: string;
    content: string;
    frameBase64?: string;
  }) => void;
  onAskAboutCountry: (countryName: string, city: string, formattedTime: string) => void;
  onOpenScannerToChat: (dataUrl: string, mimeType: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  memories?: AIMemoryItem[];
  onAddMemory?: (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
  }) => { ok: boolean; error?: string };
  onUpdateMemory?: (id: string, patch: { category?: MemoryCategory; content?: string }) => {
    ok: boolean;
    error?: string;
  };
  onToggleMemoryApproved?: (id: string) => void;
  onDeleteMemory?: (id: string) => void;
  onClearAllMemories?: () => Promise<void> | void;
}

type ToolCategoryGroup =
  | 'Workspace & Identity'
  | 'Creative & Media'
  | 'Language & Communication'
  | 'Writing & Productivity'
  | 'Support & Info';

const TOOL_ITEMS: Array<{
  id: MorePageToolId;
  title: string;
  description: string;
  category: ToolCategoryGroup;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  {
    id: 'conversation-log',
    title: 'Conversation Log',
    description: 'Search, resume, or clean up saved AI chat sessions across topics.',
    category: 'Workspace & Identity',
    icon: History,
    accentClass: 'text-sky-300 bg-sky-500/20 border-sky-400/35',
  },
  {
    id: 'personal-memory',
    title: 'Power Memory',
    description: 'Manage persistent AI facts, goals, comedy preferences, and instructions.',
    category: 'Workspace & Identity',
    icon: Brain,
    accentClass: 'text-violet-300 bg-violet-500/20 border-violet-400/35',
  },
  {
    id: 'profile-shortcut',
    title: 'Profile & Country',
    description: 'Inspect your identity card, streak XP, and country detection.',
    category: 'Workspace & Identity',
    icon: UserCheck,
    accentClass: 'text-cyan-300 bg-cyan-500/20 border-cyan-400/35',
  },
  {
    id: 'image-gen',
    title: 'AI Image Generation',
    description: 'Create high-detail artwork and visuals with Gemini.',
    category: 'Creative & Media',
    icon: Wand2,
    accentClass: 'text-fuchsia-300 bg-fuchsia-500/20 border-fuchsia-400/35',
  },
  {
    id: 'gallery',
    title: 'Gallery',
    description: 'Browse geotagged media or attach device photos to chat.',
    category: 'Creative & Media',
    icon: ImageIcon,
    accentClass: 'text-violet-300 bg-violet-500/20 border-violet-400/35',
  },
  {
    id: 'world-time',
    title: 'World Time',
    description: 'Live global clocks across 190+ countries and zones.',
    category: 'Creative & Media',
    icon: Clock,
    accentClass: 'text-amber-300 bg-amber-500/20 border-amber-400/35',
  },
  {
    id: 'video-upload',
    title: 'Video Upload',
    description: 'Upload clips to summarize scenes, generate SRT, or attach.',
    category: 'Creative & Media',
    icon: Video,
    accentClass: 'text-rose-300 bg-rose-500/20 border-rose-400/35',
  },
  {
    id: 'translation',
    title: 'Translation',
    description: 'Live multilingual interpreter with pronunciation playback.',
    category: 'Language & Communication',
    icon: Languages,
    accentClass: 'text-teal-300 bg-teal-500/20 border-teal-400/35',
  },
  {
    id: 'doc-translate',
    title: 'Document Translation',
    description: 'Translate PDF, DOCX, TXT, or Markdown files cleanly.',
    category: 'Language & Communication',
    icon: FileText,
    accentClass: 'text-cyan-300 bg-cyan-500/20 border-cyan-400/35',
  },
  {
    id: 'email-write',
    title: 'Email Writing',
    description: 'Compose complete professional or personal emails fast.',
    category: 'Language & Communication',
    icon: Mail,
    accentClass: 'text-sky-300 bg-sky-500/20 border-sky-400/35',
  },
  {
    id: 'email-assist',
    title: 'Email Assistant',
    description: 'Generate smart replies, thread summaries, and tasks.',
    category: 'Language & Communication',
    icon: Inbox,
    accentClass: 'text-indigo-300 bg-indigo-500/20 border-indigo-400/35',
  },
  {
    id: 'writing-assist',
    title: 'AI Writing Assistant',
    description: 'Draft articles, social posts, proposals, and reports.',
    category: 'Writing & Productivity',
    icon: PenTool,
    accentClass: 'text-purple-300 bg-purple-500/20 border-purple-400/35',
  },
  {
    id: 'grammar',
    title: 'Grammar Correction',
    description: 'Fix grammar, spelling, clarity, and sentence flow.',
    category: 'Writing & Productivity',
    icon: SpellCheck,
    accentClass: 'text-emerald-300 bg-emerald-500/20 border-emerald-400/35',
  },
  {
    id: 'summarizer',
    title: 'Text Summarizer',
    description: 'Condense long articles and notes into clear takeaways.',
    category: 'Writing & Productivity',
    icon: AlignLeft,
    accentClass: 'text-pink-300 bg-pink-500/20 border-pink-400/35',
  },
  {
    id: 'extra-tools',
    title: 'Other Useful AI Tools',
    description: 'Code helper, study tutor, web research, and OCR scanner.',
    category: 'Writing & Productivity',
    icon: Sparkles,
    accentClass: 'text-purple-200 bg-purple-600/25 border-purple-400/40',
  },
  {
    id: 'help-support',
    title: 'Help & Support',
    description: 'Interactive feature guides for Chat, Analysis, Transfer & Voice.',
    category: 'Support & Info',
    icon: HelpCircle,
    accentClass: 'text-blue-300 bg-blue-500/20 border-blue-400/35',
  },
  {
    id: 'about-v2',
    title: 'About Aadesh AI',
    description: 'Architecture details, active model specs, and legal policies.',
    category: 'Support & Info',
    icon: Info,
    accentClass: 'text-indigo-300 bg-indigo-500/20 border-indigo-400/35',
  },
];

const HELP_GUIDES = [
  {
    title: 'Chat UI & Stop Generation',
    badge: 'Chat',
    body: 'Stream Gemini replies token-by-token, switch conversations effortlessly, attach photos or documents, and press Stop anytime to cancel in-flight generation while keeping partial text.',
  },
  {
    title: 'Deep Analysis & Problem Solver',
    badge: 'Analysis',
    body: 'Switch between Usage Analytics and Deep Problem Solver to analyze complex topics with numbered step-by-step reasoning, summary takeaways, or import your latest Chat session.',
  },
  {
    title: 'Transfer AI Translator & File Share',
    badge: 'Transfer',
    body: 'Auto-detect languages, swap source and target languages, speak phrases aloud via mic, hear pronunciation guides, save translation history, or send encrypted P2P/local files.',
  },
  {
    title: 'Voice Assistant & Voice Reader Toggle',
    badge: 'Voice',
    body: 'Control whether AI replies are read aloud with the instant Voice Reader ON/OFF pill, switch between 4 voice personas, and speak naturally across supported speech locales.',
  },
  {
    title: 'Personal Memory & Offline Mode',
    badge: 'Privacy',
    body: 'Store explicit preferences in Personal Memory so Gemini tailors future replies cleanly. Toggle Offline Local Mode in Setting anytime to pause external API calls.',
  },
];

export const MoreView: React.FC<MoreViewProps> = ({
  user,
  settings,
  isOnline,
  mediaItems,
  sessions = [],
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onUpdateSettings,
  onAddMedia,
  onDeleteMedia,
  onImageGenerated,
  onRecordTranslationMetric,
  onSendToChat,
  onAttachPhotoToChat,
  onAttachVideoToChat,
  onAskAboutCountry,
  onOpenScannerToChat,
  onOpenSettings,
  onOpenProfile,
  memories: propMemories,
  onAddMemory: propOnAddMemory,
  onUpdateMemory: propOnUpdateMemory,
  onToggleMemoryApproved: propOnToggleMemoryApproved,
  onDeleteMemory: propOnDeleteMemory,
  onClearAllMemories: propOnClearAllMemories,
}) => {
  const [selectedTool, setSelectedTool] = useState<MorePageToolId | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Conversation Log state
  const [logSearch, setLogSearch] = useState('');

  // Power Memory state (synced with lifted App.tsx state when provided)
  const [localMemories, setLocalMemories] = useState<AIMemoryItem[]>(() => getStoredMemories(user.id));
  const memories = propMemories ?? localMemories;

  // Help & Support filter
  const [helpQuery, setHelpQuery] = useState('');

  const isMemoryConsentAgreed = settings.memoryConsent === 'agreed';

  useEffect(() => {
    if (propMemories) return;
    const localMems = getStoredMemories(user.id);
    setLocalMemories(localMems);
    if (user.isLoggedIn && user.id && isMemoryConsentAgreed) {
      let active = true;
      void loadMemoriesFromFirestore(user.id).then((cloudMems) => {
        if (!active || cloudMems.length === 0) return;
        const map = new Map<string, AIMemoryItem>();
        for (const m of localMems) map.set(m.id, m);
        for (const cm of cloudMems) {
          const existing = map.get(cm.id);
          if (!existing || cm.updatedAt >= existing.updatedAt) {
            map.set(cm.id, cm);
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        setLocalMemories(merged);
        saveStoredMemories(merged, user.id);
      });
      return () => {
        active = false;
      };
    }
  }, [user.id, user.isLoggedIn, isMemoryConsentAgreed, propMemories]);

  // Gallery device photo picker
  const galleryFileRef = useRef<HTMLInputElement>(null);

  // Video Upload & Analyzer state
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFileMeta, setVideoFileMeta] = useState<{
    name: string;
    size: number;
    mimeType: string;
    duration?: number;
    dataUrl?: string;
    frameBase64?: string;
  } | null>(null);
  const [videoTask, setVideoTask] = useState<'summarize' | 'transcribe' | 'subtitles' | 'script'>('summarize');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoTargetLang, setVideoTargetLang] = useState(settings.defaultTargetLanguage || 'en');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<{
    summary?: string;
    transcript?: string;
    subtitlesSrt?: string;
    script?: string;
    highlights?: string[];
  } | null>(null);
  const [videoCopied, setVideoCopied] = useState(false);

  const activeMeta = TOOL_ITEMS.find((t) => t.id === selectedTool) || null;

  const fallbackAddMemory = (input: {
    category: MemoryCategory;
    content: string;
    source?: AIMemoryItem['source'];
  }) => {
    if (!isMemoryConsentAgreed) return { ok: false, error: 'Enable Power Memory first.' };
    const text = input.content.trim();
    if (!text) return { ok: false, error: 'Please write a memory before saving.' };
    if (containsSecretOrCredential(text)) {
      return { ok: false, error: 'Blocked: passwords, tokens, and API keys cannot be saved.' };
    }
    const now = Date.now();
    const item: AIMemoryItem = {
      id: `mem-${now}`,
      userId: user.id,
      category: input.category,
      content: text,
      approved: true,
      source: input.source || 'manual',
      keywords: extractMemoryKeywords(text),
      createdAt: now,
      updatedAt: now,
    };
    const next = [item, ...memories];
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn) {
      void saveMemoryToFirestore(user.id, item);
    }
    return { ok: true };
  };

  const fallbackUpdateMemory = (id: string, patch: { category?: MemoryCategory; content?: string }) => {
    if (!isMemoryConsentAgreed) return { ok: false, error: 'Enable Power Memory first.' };
    const cleanText = patch.content?.trim();
    if (patch.content !== undefined && !cleanText) {
      return { ok: false, error: 'Memory text cannot be empty.' };
    }
    if (cleanText && containsSecretOrCredential(cleanText)) {
      return { ok: false, error: 'Blocked: passwords, tokens, and API keys cannot be saved.' };
    }
    const now = Date.now();
    let updatedItem: AIMemoryItem | undefined;
    const next = memories.map((m) => {
      if (m.id !== id) return m;
      updatedItem = {
        ...m,
        ...(patch.category ? { category: patch.category } : {}),
        ...(cleanText ? { content: cleanText, keywords: extractMemoryKeywords(cleanText) } : {}),
        updatedAt: now,
      };
      return updatedItem;
    });
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn && updatedItem) {
      void saveMemoryToFirestore(user.id, updatedItem);
    }
    return { ok: true };
  };

  const fallbackToggleMemoryApproved = (id: string) => {
    if (!isMemoryConsentAgreed) return;
    let updatedItem: AIMemoryItem | undefined;
    const next = memories.map((m) => {
      if (m.id !== id) return m;
      updatedItem = { ...m, approved: !m.approved, updatedAt: Date.now() };
      return updatedItem;
    });
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn && updatedItem) {
      void saveMemoryToFirestore(user.id, updatedItem);
    }
  };

  const fallbackDeleteMemory = (id: string) => {
    const next = memories.filter((m) => m.id !== id);
    setLocalMemories(next);
    saveStoredMemories(next, user.id);
    if (user.isLoggedIn) {
      void deleteMemoryFromFirestore(user.id, id);
    }
  };

  const fallbackClearAllMemories = async () => {
    setLocalMemories([]);
    saveStoredMemories([], user.id);
    if (user.isLoggedIn) {
      await clearAllMemoriesFromFirestore(user.id);
    }
  };

  const handleVideoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);
    setVideoResult(null);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(objectUrl);

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.src = objectUrl;

    tempVideo.onloadeddata = () => {
      const duration = Number.isFinite(tempVideo.duration) ? tempVideo.duration : undefined;
      setVideoFileMeta({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'video/mp4',
        duration,
      });
      try {
        tempVideo.currentTime = Math.min(0.5, (tempVideo.duration || 1) / 2);
      } catch {}
    };

    tempVideo.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(960, tempVideo.videoWidth || 640);
        canvas.height = Math.min(540, tempVideo.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL('image/jpeg', 0.85);
          setVideoFileMeta((prev) => (prev ? { ...prev, frameBase64: frame } : prev));
        }
      } catch {}
    };

    if (file.size <= 14 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result || '');
        setVideoFileMeta((prev) =>
          prev
            ? { ...prev, dataUrl }
            : { name: file.name, size: file.size, mimeType: file.type || 'video/mp4', dataUrl }
        );
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  const handleAnalyzeVideo = async () => {
    if (!videoFileMeta && !videoPrompt.trim()) {
      setVideoError('Upload a video clip or enter a prompt / script instructions first.');
      return;
    }
    if (!isOnline) {
      setVideoError('Video analysis with Gemini requires an internet connection.');
      return;
    }

    setVideoLoading(true);
    setVideoError(null);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const res = await fetch('/api/video', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          task: videoTask,
          prompt:
            videoPrompt.trim() ||
            `Analyze "${videoFileMeta?.name || 'uploaded video'}" and generate ${videoTask}.`,
          videoData: videoFileMeta?.dataUrl || '',
          videoMimeType: videoFileMeta?.mimeType || 'video/mp4',
          targetLanguage: videoTargetLang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Video analysis failed (${res.status})`);
      }
      setVideoResult(data);
    } catch (err: any) {
      setVideoError(err?.message || 'Unable to analyze video right now.');
    } finally {
      setVideoLoading(false);
    }
  };

  const isMoreWorkspaceTool =
    selectedTool === 'doc-translate' ||
    selectedTool === 'email-write' ||
    selectedTool === 'email-assist' ||
    selectedTool === 'writing-assist' ||
    selectedTool === 'grammar' ||
    selectedTool === 'summarizer' ||
    selectedTool === 'extra-tools';

  const filteredSessions = sessions
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .filter((s) => {
      if (!logSearch.trim()) return true;
      const q = logSearch.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    });

  const filteredGuides = HELP_GUIDES.filter((g) => {
    if (!helpQuery.trim()) return true;
    const q = helpQuery.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      g.body.toLowerCase().includes(q) ||
      g.badge.toLowerCase().includes(q)
    );
  });

  const categoryOrder: ToolCategoryGroup[] = [
    'Workspace & Identity',
    'Creative & Media',
    'Language & Communication',
    'Writing & Productivity',
    'Support & Info',
  ];

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {!selectedTool ? (
        <>
          {/* v2.0 Hub Header */}
          <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-sky-400/25 space-y-2 relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
                  <LayoutGrid className="w-4 h-4 text-sky-400" />
                  <span>Aadesh AI Suite</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-white">More AI Tools &amp; Workspace</h1>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-full v2-neu-inset text-purple-200 font-semibold tabular-nums">
                  {sessions.length} Chats
                </span>
                <span className="px-3 py-1 rounded-full v2-neu-inset text-sky-200 font-semibold tabular-nums">
                  {memories.filter((m) => m.approved).length} Memories
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-purple-200/75 max-w-2xl">
              Manage conversation logs, AI memory, profile preferences, creative image &amp; video studios, live world clocks, document translation, writing helpers, and documentation.
            </p>
          </div>

          {categoryOrder.map((groupName) => {
            const items = TOOL_ITEMS.filter((item) => item.category === groupName);
            return (
              <section key={groupName} className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-purple-300/90 px-1">
                  {groupName}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {items.map((tool) => {
                    const ToolIcon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => {
                          if (tool.id === 'profile-shortcut') {
                            if (onOpenProfile) {
                              onOpenProfile();
                            } else {
                              onOpenSettings();
                            }
                            return;
                          }
                          setSelectedTool(tool.id);
                        }}
                        className="v2-neu-card glass-card-hover rounded-2xl p-4 border border-purple-400/20 hover:border-sky-400/55 flex flex-col justify-between gap-3 text-left cursor-pointer min-h-[128px] group transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${tool.accentClass}`}
                          >
                            <ToolIcon className="w-5 h-5" />
                          </span>
                          {tool.id === 'conversation-log' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 tabular-nums">
                              {sessions.length}
                            </span>
                          )}
                          {tool.id === 'personal-memory' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 tabular-nums">
                              {memories.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-white group-hover:text-sky-200 transition-colors">
                            {tool.title}
                          </div>
                          <p className="text-xs text-purple-200/70 leading-relaxed">
                            {tool.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <div className="space-y-4">
          {/* Active Tool Back Bar */}
          <div className="v2-neu-card rounded-2xl px-4 py-3 border border-sky-400/30 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedTool(null)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/35 text-xs font-bold text-purple-100 flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Tools</span>
            </button>
            {activeMeta && (
              <div className="text-right min-w-0">
                <div className="text-sm font-bold text-white truncate">{activeMeta.title}</div>
                <div className="text-[11px] text-purple-200/70 truncate hidden sm:block">
                  {activeMeta.description}
                </div>
              </div>
            )}
          </div>

          {selectedTool === 'conversation-log' && (
            <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-sky-400/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-sky-400" />
                    <span>Conversation Log ({filteredSessions.length})</span>
                  </h2>
                  <p className="text-xs text-purple-200/75">
                    Jump back into any saved thread or remove old chats from your workspace.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search title, category, message..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl v2-neu-inset text-xs text-white placeholder-purple-300/45 outline-none"
                  />
                </div>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="p-8 text-center rounded-2xl v2-neu-inset text-xs text-purple-200/70">
                  No conversations matched your search.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredSessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    const msgCount = session.messages.length;
                    const updatedStr = new Date(session.updatedAt || session.createdAt).toLocaleString();
                    return (
                      <div
                        key={session.id}
                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                          isCurrent
                            ? 'bg-sky-500/10 border-sky-400/50'
                            : 'v2-neu-inset border-white/10 hover:border-purple-400/35'
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
                            <span className="text-sm font-bold text-white truncate max-w-md">
                              {session.title || 'New Conversation'}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                                Active
                              </span>
                            )}
                            {session.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200">
                                {session.category}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-purple-200/65 flex items-center gap-3 tabular-nums">
                            <span>{msgCount} messages</span>
                            <span>Updated {updatedStr}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onSelectSession && (
                            <button
                              type="button"
                              onClick={() => onSelectSession(session.id)}
                              className="electric-purple-btn min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                            >
                              Open in Chat
                            </button>
                          )}
                          {onDeleteSession && sessions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteSession(session.id)}
                              aria-label={`Delete ${session.title}`}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-400/30 text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedTool === 'personal-memory' && (
            <PowerMemorySection
              user={user}
              settings={settings}
              memories={memories}
              onUpdateSettings={onUpdateSettings || (() => {})}
              onAddMemory={propOnAddMemory || fallbackAddMemory}
              onUpdateMemory={propOnUpdateMemory || fallbackUpdateMemory}
              onToggleMemoryApproved={propOnToggleMemoryApproved || fallbackToggleMemoryApproved}
              onDeleteMemory={propOnDeleteMemory || fallbackDeleteMemory}
              onClearAllMemories={propOnClearAllMemories || fallbackClearAllMemories}
            />
          )}

          {selectedTool === 'help-support' && (
            <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-sky-400/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-sky-400" />
                    <span>Help &amp; Quick Start Guide</span>
                  </h2>
                  <p className="text-xs text-purple-200/75">
                    Explore how each tab of Aadesh AI works together seamlessly.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={helpQuery}
                    onChange={(e) => setHelpQuery(e.target.value)}
                    placeholder="Filter guides..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl v2-neu-inset text-xs text-white placeholder-purple-300/45 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGuides.map((guide) => (
                  <div
                    key={guide.title}
                    className="p-4 rounded-2xl v2-neu-inset border border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white">{guide.title}</h3>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                        {guide.badge}
                      </span>
                    </div>
                    <p className="text-xs text-purple-200/80 leading-relaxed">{guide.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedTool === 'about-v2' && (
            <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-indigo-400/30 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-400/35 text-[11px] font-bold text-sky-200">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Aadesh AI</span>
                  </div>
                  <h2 className="text-xl font-black text-white">Multimodal Global Intelligence</h2>
                  <p className="text-xs text-purple-200/75">
                    Created by Aadesh Jaisi · Powered by Google Gemini &amp; Firebase
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTermsOpen(true)}
                  className="electric-purple-btn min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer self-start sm:self-center"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Terms &amp; Privacy</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-4 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                  <div className="text-purple-300/75">Active AI Model</div>
                  <div className="text-sm font-black text-white">
                    {(settings.aiProvider === 'openrouter'
                      ? settings.openRouterModel || settings.aiModel
                      : settings.aiModel) ||
                      (settings.aiProvider === 'groq'
                        ? 'llama-3.3-70b-versatile'
                        : settings.aiProvider === 'openrouter'
                        ? 'openrouter/free'
                        : 'gemini-2.5-flash')}
                  </div>
                </div>
                <div className="p-4 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                  <div className="text-purple-300/75">Response Mode</div>
                  <div className="text-sm font-black text-white capitalize">
                    {settings.aiResponseMode || 'balanced'}
                  </div>
                </div>
                <div className="p-4 rounded-2xl v2-neu-inset border border-white/10 space-y-1">
                  <div className="text-purple-300/75">Primary Workspace</div>
                  <div className="text-sm font-black text-white">
                    6 Core Tabs + Smart Permissions
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTool === 'image-gen' && (
            <Suspense fallback={<div className="p-6 text-xs text-purple-200">Loading Image Studio...</div>}>
              <ImageStudioView
                settings={settings}
                user={user}
                isOnline={isOnline}
                onOpenSettings={onOpenSettings}
                onImageGenerated={(latencyMs) => onImageGenerated(latencyMs ?? 0)}
              />
            </Suspense>
          )}

          {selectedTool === 'world-time' && (
            <Suspense fallback={<div className="p-6 text-xs text-purple-200">Loading World Clock...</div>}>
              <WorldClockView
                onAskAboutCountry={(country, formattedTime) => {
                  onAskAboutCountry(country.country, country.city, formattedTime);
                }}
              />
            </Suspense>
          )}

          {selectedTool === 'translation' && (
            <Suspense fallback={<div className="p-6 text-xs text-purple-200">Loading Interpreter...</div>}>
              <InterpreterView
                settings={settings}
                isOnline={isOnline}
                onRecordTranslationMetric={onRecordTranslationMetric}
              />
            </Suspense>
          )}

          {selectedTool === 'gallery' && (
            <div className="space-y-4">
              <div className="v2-neu-card rounded-2xl p-4 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Attach Photo from Device</div>
                  <p className="text-xs text-purple-200/75">
                    Select a photo from your device to analyze directly in Chat, or explore geotagged media below.
                  </p>
                </div>
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onAttachPhotoToChat(file);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => galleryFileRef.current?.click()}
                  className="electric-purple-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>Attach Photo to Chat</span>
                </button>
              </div>

              <Suspense fallback={<div className="p-6 text-xs text-purple-200">Loading Geotag Gallery...</div>}>
                <GeotagGalleryView
                  mediaItems={mediaItems}
                  onAddMedia={onAddMedia}
                  onDeleteMedia={onDeleteMedia}
                  isOnline={isOnline}
                />
              </Suspense>
            </div>
          )}

          {selectedTool === 'video-upload' && (
            <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoFileSelected}
                className="hidden"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Video className="w-5 h-5 text-rose-300" />
                    <span>Video Upload &amp; AI Analysis</span>
                  </h2>
                  <p className="text-xs text-purple-200/75">
                    Upload a video clip (up to 14 MB for direct Gemini video inspection) or attach its frame and metadata to Chat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => videoFileInputRef.current?.click()}
                  className="electric-purple-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Video File</span>
                </button>
              </div>

              {videoPreviewUrl && videoFileMeta && (
                <div className="p-3.5 rounded-2xl v2-neu-inset border border-purple-400/30 space-y-3">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="w-full max-h-64 rounded-xl bg-black border border-white/10"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-purple-200">
                    <span className="font-mono truncate max-w-xs">{videoFileMeta.name}</span>
                    <span className="tabular-nums text-purple-300">
                      {(videoFileMeta.size / (1024 * 1024)).toFixed(2)} MB
                      {videoFileMeta.duration ? ` · ${videoFileMeta.duration.toFixed(1)}s` : ''}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-purple-200">Analysis Task</label>
                  <select
                    value={videoTask}
                    onChange={(e) => setVideoTask(e.target.value as any)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 text-xs text-white outline-none"
                  >
                    <option value="summarize">Summarize Video &amp; Highlights</option>
                    <option value="transcribe">Transcribe Spoken Audio</option>
                    <option value="subtitles">Generate SRT Subtitles</option>
                    <option value="script">Write Narration / Script</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-purple-200">Output Language</label>
                  <select
                    value={videoTargetLang}
                    onChange={(e) => setVideoTargetLang(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl v2-neu-inset border border-purple-400/30 text-xs text-white outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={3}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Optional: ask specific questions about the video, describe what to extract, or paste a topic for a video script..."
                className="w-full p-3 rounded-2xl v2-neu-inset border border-purple-400/30 focus:border-sky-400 text-sm text-white placeholder-purple-300/45 outline-none"
              />

              {videoError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-400/40 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{videoError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAnalyzeVideo}
                  disabled={videoLoading}
                  className="electric-purple-btn min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {videoLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{videoLoading ? 'Analyzing...' : 'Analyze with Gemini'}</span>
                </button>

                {videoFileMeta && (
                  <button
                    type="button"
                    onClick={() =>
                      onAttachVideoToChat({
                        name: videoFileMeta.name,
                        content: `Uploaded Video: ${videoFileMeta.name} (${(videoFileMeta.size / (1024 * 1024)).toFixed(2)} MB)${videoFileMeta.duration ? `, Duration: ${videoFileMeta.duration.toFixed(1)}s` : ''}`,
                        frameBase64: videoFileMeta.frameBase64,
                      })
                    }
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/40 text-xs font-bold text-purple-100 flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Attach Video Frame to Chat</span>
                  </button>
                )}
              </div>

              {videoResult && (
                <div className="p-4 rounded-2xl v2-neu-inset border border-purple-400/35 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      Video Analysis Result
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const text = [
                          videoResult.summary,
                          videoResult.transcript && `Transcript:\n${videoResult.transcript}`,
                          videoResult.subtitlesSrt && `Subtitles (SRT):\n${videoResult.subtitlesSrt}`,
                          videoResult.script && `Script:\n${videoResult.script}`,
                        ]
                          .filter(Boolean)
                          .join('\n\n');
                        navigator.clipboard.writeText(text);
                        setVideoCopied(true);
                        setTimeout(() => setVideoCopied(false), 1800);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-purple-100 flex items-center gap-1 cursor-pointer"
                    >
                      {videoCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{videoCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  {videoResult.summary && <MarkdownRenderer content={videoResult.summary} />}
                  {videoResult.highlights && videoResult.highlights.length > 0 && (
                    <ul className="list-disc pl-5 text-xs text-purple-100 space-y-1">
                      {videoResult.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {videoResult.transcript && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-purple-300">Transcript</div>
                      <pre className="p-3 rounded-xl bg-black/40 text-xs text-gray-200 whitespace-pre-wrap">
                        {videoResult.transcript}
                      </pre>
                    </div>
                  )}
                  {videoResult.subtitlesSrt && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-purple-300">Subtitles (.srt)</div>
                      <pre className="p-3 rounded-xl bg-black/40 text-xs text-gray-200 whitespace-pre-wrap font-mono">
                        {videoResult.subtitlesSrt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isMoreWorkspaceTool && (
            <div className="v2-neu-card rounded-3xl p-4 sm:p-6 border border-purple-400/30">
              <Suspense fallback={<div className="p-6 text-xs text-purple-200">Loading AI tool workspace...</div>}>
                <MoreToolWorkspace
                  toolId={selectedTool}
                  settings={settings}
                  isOnline={isOnline}
                  onRecordTranslationMetric={onRecordTranslationMetric}
                  onSendToChat={(text) => onSendToChat(text)}
                  onOpenScanner={() => setScannerOpen(true)}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}

      {scannerOpen && (
        <Suspense fallback={null}>
          <CameraScannerModal
            isOpen={scannerOpen}
            mode="scanner"
            onClose={() => setScannerOpen(false)}
            onCapture={(dataUrl, mimeType) => {
              setScannerOpen(false);
              onOpenScannerToChat(dataUrl, mimeType);
            }}
          />
        </Suspense>
      )}

      {isTermsOpen && (
        <Suspense fallback={null}>
          <TermsPrivacyModal
            isOpen={isTermsOpen}
            onClose={() => setIsTermsOpen(false)}
            initialTab="terms"
          />
        </Suspense>
      )}
    </div>
  );
};
